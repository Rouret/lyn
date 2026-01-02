import { TESTING_URL } from "testing/constants";

export const testFetch = {
  get: async (path: string) => {
    const response = await fetch(`${TESTING_URL}${path}`, {
      method: "GET",
    });
    return response;
  },
  post: async (path: string, body?: any) => {
    const response = await fetch(`${TESTING_URL}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return response;
  },
  delete: async (path: string) => {
    const response = await fetch(`${TESTING_URL}${path}`, {
      method: "DELETE",
    });
    return response;
  },
  put: async (path: string, body: any) => {
    const response = await fetch(`${TESTING_URL}${path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return response;
  },
};

export const requestFactory = {
  get: (path: string) => {
    return new Request(`${TESTING_URL}${path}`, {
      method: "GET",
    });
  },
  post: (path: string, body?: any) => {
    return new Request(`${TESTING_URL}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  delete: (path: string) => {
    return new Request(`${TESTING_URL}${path}`, {
      method: "DELETE",
    });
  },
  put: (path: string, body: any) => {
    return new Request(`${TESTING_URL}${path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
};
