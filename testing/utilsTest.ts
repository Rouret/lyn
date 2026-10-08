type HandlesRequests = {
  handle: (request: Request) => Promise<Response> | Response;
};

const TEST_ORIGIN = "http://lyn.test";

const toJsonBody = (body: unknown) =>
  body !== undefined ? JSON.stringify(body) : undefined;

export const createTestClient = (app: HandlesRequests) => {
  const send = async (method: string, path: string, body?: unknown) =>
    app.handle(
      new Request(`${TEST_ORIGIN}${path}`, { method, body: toJsonBody(body) })
    );

  return {
    get: (path: string) => send("GET", path),
    post: (path: string, body?: unknown) => send("POST", path, body),
    put: (path: string, body?: unknown) => send("PUT", path, body),
    delete: (path: string) => send("DELETE", path),
  };
};
