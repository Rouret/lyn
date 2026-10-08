export type Feature = {
  context?: Record<string, unknown>;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onResponse?: (request: Request, response: Response) => Response;
};
