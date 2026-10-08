import { displayPath, loadDatabasePaths, type DatabasePaths } from "#lyn/project-config";
import { EXIT_CODE } from "#lyn/cli/exit-code";
import { parseEnvs } from "#lyn/env";
import { DATABASE_URL_ENV_CONFIG } from "#lyn/features/database";
import { applyMigrations, assertMigrationsExist } from "#lyn/migrations";
import { SQL } from "bun";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const DB_COMMANDS = ["generate", "migrate", "studio"] as const;

export type DbCommand = (typeof DB_COMMANDS)[number];

const readDatabaseUrl = () => parseEnvs(DATABASE_URL_ENV_CONFIG)[0].databaseUrl;

const findDrizzleKitBin = (projectRoot: string): string => {
  for (let dir = projectRoot; ; dir = dirname(dir)) {
    const bin = join(dir, "node_modules", "drizzle-kit", "bin.cjs");
    if (existsSync(bin)) return bin;
    if (dirname(dir) === dir)
      throw new Error(
        "drizzle-kit is not installed: run `bun add -d drizzle-kit` to use `lyn db generate` and `lyn db studio`"
      );
  }
};

const assertSchemaExists = (paths: DatabasePaths) => {
  if (!existsSync(paths.schema))
    throw new Error(
      `No schema at ${displayPath(paths, paths.schema)}: create it, or set database.schema in lyn.config.ts`
    );
};

// The URL is read from the environment by drizzle-kit, so it is never written to disk.
const drizzleKitConfig = ({ schema, migrations }: DatabasePaths) => `export default {
  dialect: "postgresql",
  schema: ${JSON.stringify(schema)},
  out: ${JSON.stringify(migrations)},
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
};
`;

const runDrizzleKit = async (
  command: "generate" | "studio",
  paths: DatabasePaths,
  args: string[]
): Promise<number> => {
  const bin = findDrizzleKitBin(paths.projectRoot);
  assertSchemaExists(paths);

  const configDir = await mkdtemp(join(tmpdir(), "lyn-drizzle-kit-"));
  const configPath = join(configDir, "drizzle.config.ts");
  try {
    await Bun.write(configPath, drizzleKitConfig(paths));
    const child = Bun.spawn(
      [process.execPath, "--bun", bin, command, "--config", configPath, ...args],
      { cwd: paths.projectRoot, stdio: ["inherit", "inherit", "inherit"] }
    );
    return await child.exited;
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
};

const migrateDatabase = async (paths: DatabasePaths): Promise<number> => {
  const url = readDatabaseUrl();
  assertMigrationsExist(paths);

  const client = new SQL(url);
  try {
    await applyMigrations(client, paths.migrations);
  } finally {
    await client.close();
  }
  console.log(`Migrations from ${displayPath(paths, paths.migrations)} applied`);
  return EXIT_CODE.SUCCESS;
};

export const runDbCommand = async (
  command: DbCommand,
  args: string[],
  projectRoot: string
): Promise<number> => {
  const paths = await loadDatabasePaths(projectRoot);
  switch (command) {
    case "generate":
      return runDrizzleKit("generate", paths, args);
    case "migrate":
      return migrateDatabase(paths);
    case "studio":
      readDatabaseUrl();
      return runDrizzleKit("studio", paths, args);
  }
};
