import type { Feature } from "#/features/feature";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";

export type DatabaseSchema = Record<string, unknown>;

export type Database<TSchema extends DatabaseSchema = DatabaseSchema> =
  BunSQLDatabase<TSchema> & { $client: SQL };

export type DatabaseConfig<TSchema, TEnv> = {
  /**
   * Your Drizzle tables and relations, usually
   * `import * as schema from "./db/schema"`. Types `ctx.db` and `app.db`.
   */
  schema: TSchema;
  /**
   * Postgres connection string, or a function receiving the parsed `app.env`.
   * Defaults to the `DATABASE_URL` environment variable.
   */
  url?: string | ((env: TEnv) => string);
};

export const NO_DATABASE_MESSAGE =
  "No database configured: pass `database: { schema }` to new Lyn() to use app.db";

type DatabaseNotConfigured = { readonly [Key in typeof NO_DATABASE_MESSAGE]: never };

export type DatabaseOf<TSchema> = [TSchema] extends [DatabaseSchema]
  ? Database<TSchema>
  : DatabaseNotConfigured;

export type DatabaseContext<TSchema> = [TSchema] extends [DatabaseSchema]
  ? { db: Database<TSchema> }
  : {};

export class LynDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LynDatabaseError";
  }
}

export const DATABASE_URL_ENV_CONFIG = {
  databaseUrl: { name: "DATABASE_URL", type: "string" },
} as const;

export const needsDatabaseUrlFromEnv = (config: { url?: unknown } | undefined) =>
  config !== undefined && config.url === undefined;

export const resolveDatabaseUrl = <TEnv>(
  config: DatabaseConfig<unknown, TEnv>,
  env: TEnv,
  databaseUrlFromEnv: string | undefined
): string => {
  const url =
    typeof config.url === "function" ? config.url(env) : config.url ?? databaseUrlFromEnv;
  if (!url?.trim())
    throw new LynDatabaseError(
      "database.url must be a non-empty Postgres connection string"
    );
  return url;
};

export const createDatabase = (schema: DatabaseSchema, url: string): Database =>
  drizzle({ client: new SQL(url), schema, casing: "snake_case" });

const connectionFailureReason = (error: unknown): string => {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof Error ? cause.message : "unknown error";
};

export const createDatabaseFeature = (db: Database): Feature => {
  let isClosed = false;

  return {
    context: { db },
    onStart: async () => {
      if (isClosed)
        throw new LynDatabaseError(
          "The database connection was closed by stop(): create a new Lyn instance to connect again"
        );
      try {
        await db.execute(sql`select 1`);
      } catch (error) {
        throw new LynDatabaseError(
          `Cannot connect to the database: ${connectionFailureReason(error)}`
        );
      }
    },
    onStop: async () => {
      isClosed = true;
      await db.$client.close();
    },
  };
};
