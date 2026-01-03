export const createTestClient = (app: { url: string }) => {
  return {
    get: (path: string) => fetch(`${app.url}${path}`, { method: "GET" }),
    post: (path: string, body?: any) =>
      fetch(`${app.url}${path}`, {
        method: "POST",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    delete: (path: string) => fetch(`${app.url}${path}`, { method: "DELETE" }),
    put: (path: string, body?: any) =>
      fetch(`${app.url}${path}`, {
        method: "PUT",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
  };
};

export const requestFactory = {
  get: (path: string) => {
    return new Request(`http://localhost${path}`, {
      method: "GET",
    });
  },
  post: (path: string, body?: any) => {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  delete: (path: string) => {
    return new Request(`http://localhost${path}`, {
      method: "DELETE",
    });
  },
  put: (path: string, body: any) => {
    return new Request(`http://localhost${path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
};
