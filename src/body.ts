import {
  InvalidJsonError,
  NoBodyError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from "#lyn/error";

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const isJsonMediaType = (contentType: string): boolean => {
  const mediaType = contentType.split(";")[0]!.trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
};

export const resolveMaxBodyBytes = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_MAX_BODY_BYTES;
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("server.maxBodyBytes must be a positive integer");
  return value;
};

const declaredLengthExceeds = (declared: string, maxBytes: number): boolean => {
  if (!/^\d+$/.test(declared)) return true;
  return Number(declared) > maxBytes;
};

const readBoundedText = async (request: Request, maxBytes: number): Promise<string> => {
  const declared = request.headers.get("content-length");
  if (declared !== null && declaredLengthExceeds(declared, maxBytes))
    throw new PayloadTooLargeError();

  const reader = request.body?.getReader();
  if (!reader) throw new NoBodyError();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
};

const parseJson = (rawBody: string): unknown => {
  try {
    return JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof SyntaxError) throw new InvalidJsonError();
    throw error;
  }
};

export const readJsonBody = async (
  request: Request,
  maxBytes: number
): Promise<unknown> => {
  if (!request.body) throw new NoBodyError();

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!isJsonMediaType(contentType))
    throw new UnsupportedMediaTypeError(contentType);

  const rawBody = await readBoundedText(request, maxBytes);
  if (rawBody.trim() === "") throw new NoBodyError();
  return parseJson(rawBody);
};
