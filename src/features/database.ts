import { ConflictError, InvalidValueError, type LynError } from "#/error";
import type { Feature, FeatureDefinition } from "#/features/feature";
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

const resolveDatabaseUrl = <TEnv>(
  config: DatabaseConfig<unknown, TEnv>,
  env: TEnv,
  databaseUrlFromEnv: unknown
): string => {
  const url =
    typeof config.url === "function" ? config.url(env) : config.url ?? databaseUrlFromEnv;
  if (typeof url !== "string" || !url.trim())
    throw new LynDatabaseError(
      "database.url must be a non-empty Postgres connection string"
    );
  return url;
};

const createDatabase = (schema: DatabaseSchema, url: string): Database =>
  drizzle({ client: new SQL(url), schema, casing: "snake_case" });

const POSTGRES_ERRORS: Record<string, () => LynError> = {
  "23505": () => new ConflictError("A record with this value already exists"),
  "23503": () => new ConflictError("This record conflicts with a related record"),
  "23502": () => new InvalidValueError("A required value is missing"),
  "22P02": () => new InvalidValueError("A value has an invalid format"),
};

const findPostgresError = (error: unknown) => {
  if (error instanceof SQL.PostgresError) return error;
  if (error instanceof Error && error.cause instanceof SQL.PostgresError)
    return error.cause;
  return undefined;
};

const mapPostgresError = (error: unknown): LynError | undefined => {
  const sqlState = findPostgresError(error)?.errno;
  return sqlState ? POSTGRES_ERRORS[sqlState]?.() : undefined;
};

const connectionFailureReason = (error: unknown): string => {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof Error ? cause.message : "unknown error";
};

const createDatabaseFeature = (db: Database): Feature => {
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
    mapError: mapPostgresError,
  };
};

export const databaseFeature: FeatureDefinition = ({ database }) => {
  if (!database) return undefined;
  return {
    env: database.url === undefined ? DATABASE_URL_ENV_CONFIG : undefined,
    create: ({ app, own }) =>
      createDatabaseFeature(
        createDatabase(
          database.schema,
          resolveDatabaseUrl(database, app, own.databaseUrl)
        )
      ),
  };
};
