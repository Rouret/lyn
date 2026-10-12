import type { EnvConfig, LynEnv } from "#lyn/env";
import type { LynError } from "#lyn/error";
import type { LynConfig } from "#lyn/types";

export type ClientInfo = {
  /** IP of the TCP connection, `undefined` when `handle()` runs without `listen()`. */
  ip: string | undefined;
};

export type Feature = {
  context?: Record<string, unknown>;
  onRequest?: (request: Request, client: ClientInfo) => LynError | undefined;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onResponse?: (request: Request, response: Response) => Response;
  mapError?: (error: unknown) => LynError | undefined;
};

type FeatureEnv = {
  app: LynEnv;
  own: Record<string, unknown>;
};

type FeatureSetup = {
  env?: EnvConfig;
  create: (env: FeatureEnv) => Feature;
};

export type FeatureDefinition = (
  config: LynConfig<any, any>
) => FeatureSetup | undefined;
