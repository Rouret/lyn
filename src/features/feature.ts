import type { EnvConfig, LynEnv } from "#/env";
import type { LynConfig } from "#/types";

export type Feature = {
  context?: Record<string, unknown>;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onResponse?: (request: Request, response: Response) => Response;
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
