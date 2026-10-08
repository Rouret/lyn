import type { LynCliConfig } from "#/config";
import { join, relative, resolve } from "node:path";

const CONFIG_FILE = "lyn.config.ts";
const DEFAULT_SCHEMA = "src/db/schema.ts";
const DEFAULT_MIGRATIONS = "drizzle";

export type DatabasePaths = {
  projectRoot: string;
  schema: string;
  migrations: string;
};

const importConfig = async (projectRoot: string): Promise<LynCliConfig> => {
  const configPath = join(projectRoot, CONFIG_FILE);
  if (!(await Bun.file(configPath).exists())) return {};

  const { default: config } = await import(configPath);
  if (typeof config !== "object" || config === null)
    throw new Error(
      `${CONFIG_FILE} must export its config: export default defineConfig({ ... })`
    );
  return config;
};

export const loadDatabasePaths = async (
  projectRoot: string
): Promise<DatabasePaths> => {
  const { database } = await importConfig(projectRoot);
  return {
    projectRoot,
    schema: resolve(projectRoot, database?.schema ?? DEFAULT_SCHEMA),
    migrations: resolve(projectRoot, database?.migrations ?? DEFAULT_MIGRATIONS),
  };
};

export const displayPath = ({ projectRoot }: DatabasePaths, path: string) =>
  relative(projectRoot, path) || ".";
