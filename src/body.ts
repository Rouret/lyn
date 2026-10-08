import { InvalidJsonError, NoBodyError, UnsupportedMediaTypeError } from "#/error";

const isJsonMediaType = (contentType: string): boolean => {
  const mediaType = contentType.split(";")[0]!.trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
};

export const readJsonBody = async (request: Request): Promise<unknown> => {
  if (!request.body) throw new NoBodyError();

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!isJsonMediaType(contentType))
    throw new UnsupportedMediaTypeError(contentType);

  const rawBody = await request.text();
  if (rawBody.trim() === "") throw new NoBodyError();

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new InvalidJsonError();
  }
};
