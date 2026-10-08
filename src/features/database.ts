import { ConflictError, InvalidValueError, type LynError } from "#/error";
import type { Feature, FeatureDefinition } from "#/features/feature";
import { internalLogger } from "#/logger";
import { applyMigrations, assertMigrationsExist } from "#/migrations";
import { loadDatabasePaths } from "#/project-config";
import { currentRequestLog } from "#/request-log";
import { SQL } from "bun";
import { sql, type Logger } from "drizzle-orm";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { PgJson, PgJsonb } from "drizzle-orm/pg-core";

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
  /** Connection pool. Defaults: 10 connections, 30 s idle timeout, 10 s connection timeout. */
  pool?: DatabasePoolConfig;
  /**
   * Log every SQL query at info level, with the request id. Parameters are
   * never logged, only their count. Defaults to `false`.
   */
  logQueries?: boolean;
  /**
   * Apply the pending migrations in `listen()`, before serving. Instances
   * starting together wait for each other. Defaults to `false`: run
   * `lyn db migrate` instead when you deploy several instances.
   */
  migrateOnStart?: boolean;
};

export type DatabasePoolConfig = {
  /** Maximum number of open connections. */
  max?: number;
  /** Seconds before an idle connection is closed. `0` keeps it open. */
  idleTimeout?: number;
  /** Seconds to wait when opening a connection. */
  connectionTimeout?: number;
  /** Seconds before a connection is replaced. `0` keeps it forever. */
  maxLifetime?: number;
};

const DEFAULT_POOL: DatabasePoolConfig = {
  max: 10,
  idleTimeout: 30,
  connectionTimeout: 10,
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

const queryLogger: Logger = {
  logQuery: (query, params) =>
    (currentRequestLog() ?? internalLogger).info(
      { query, paramCount: params.length },
      "SQL query"
    ),
};

// Bun SQL JSON-encodes a string bound to a json/jsonb parameter, so Drizzle's
// JSON.stringify would store a JSON string instead of the object.
const passJsonValuesToBunSql = () => {
  PgJson.prototype.mapToDriverValue = (value) => value;
  PgJsonb.prototype.mapToDriverValue = (value) => value;
};

const createDatabase = (
  {
    schema,
    pool,
    logQueries,
  }: Pick<DatabaseConfig<DatabaseSchema, never>, "schema" | "pool" | "logQueries">,
  url: string
): Database => {
  passJsonValuesToBunSql();
  return drizzle({
    client: new SQL(url, { ...DEFAULT_POOL, ...pool }),
    schema,
    casing: "snake_case",
    logger: logQueries ? queryLogger : false,
  });
};

const migrateOnStart = async (db: Database) => {
  const paths = await loadDatabasePaths(process.cwd());
  try {
    assertMigrationsExist(paths);
    await applyMigrations(db.$client, paths.migrations);
  } catch (error) {
    throw new LynDatabaseError(`migrateOnStart failed: ${failureReason(error)}`);
  }
  internalLogger.info("Migrations applied");
};

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

const failureReason = (error: unknown): string => {
  if (!(error instanceof Error)) return "unknown error";
  return error.cause instanceof Error ? error.cause.message : error.message;
};

const createDatabaseFeature = (
  db: Database,
  { migrateOnStart: shouldMigrateOnStart }: { migrateOnStart?: boolean }
): Feature => {
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
          `Cannot connect to the database: ${failureReason(error)}`
        );
      }
      if (shouldMigrateOnStart) await migrateOnStart(db);
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
        createDatabase(database, resolveDatabaseUrl(database, app, own.databaseUrl)),
        database
      ),
  };
};
