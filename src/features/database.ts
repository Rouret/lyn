import { ConflictError, InvalidValueError, type LynError } from "#lyn/error";
import type { Feature, FeatureDefinition } from "#lyn/features/feature";
import { internalLogger } from "#lyn/logger";
import { applyMigrations, assertMigrationsExist } from "#lyn/migrations";
import { loadDatabasePaths } from "#lyn/project-config";
import { currentRequestLog } from "#lyn/request-log";
import { resolveRequestTimeoutMs } from "#lyn/request";
import { SQL } from "bun";
import { sql, type Logger } from "drizzle-orm";
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
  /**
   * Postgres cancels a query that runs longer, in milliseconds. Defaults to
   * `server.requestTimeoutMs`, so no query outlives its request. `0`
   * disables it. Migrations are never cancelled.
   */
  statementTimeoutMs?: number;
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

const JSON_COLUMN_TYPES = new Set(["PgJson", "PgJsonb"]);

const passJsonValue = (value: unknown) => value;

// Bun SQL JSON-encodes a string bound to a json/jsonb parameter, so Drizzle's
// JSON.stringify would store a JSON string instead of the object. The bypass
// is set on the schema's columns, not on the shared prototype.
const passJsonValuesToBunSql = (schema: DatabaseSchema) => {
  const seen = new WeakSet<object>();
  const visit = (value: unknown) => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (
      "columnType" in value &&
      "mapToDriverValue" in value &&
      JSON_COLUMN_TYPES.has(String(value.columnType))
    ) {
      value.mapToDriverValue = passJsonValue;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(schema);
};

const resolveStatementTimeoutMs = (
  value: number | undefined,
  requestTimeoutMs: number | undefined
): number => {
  if (value === undefined) return resolveRequestTimeoutMs(requestTimeoutMs);
  if (!Number.isInteger(value) || value < 0)
    throw new LynDatabaseError("database.statementTimeoutMs must be a non-negative integer");
  return value;
};

const createDatabase = (
  {
    schema,
    pool,
    logQueries,
  }: Pick<DatabaseConfig<DatabaseSchema, never>, "schema" | "pool" | "logQueries">,
  url: string,
  statementTimeoutMs: number
): Database => {
  passJsonValuesToBunSql(schema);
  return drizzle({
    client: new SQL(url, {
      ...DEFAULT_POOL,
      ...pool,
      connection: { statement_timeout: statementTimeoutMs },
    }),
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

const POSTGRES_ERROR_CODE = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
  INVALID_TEXT_REPRESENTATION: "22P02",
} as const;

const POSTGRES_ERRORS: Record<string, () => LynError> = {
  [POSTGRES_ERROR_CODE.UNIQUE_VIOLATION]: () =>
    new ConflictError("A record with this value already exists"),
  [POSTGRES_ERROR_CODE.FOREIGN_KEY_VIOLATION]: () =>
    new ConflictError("This record conflicts with a related record"),
  [POSTGRES_ERROR_CODE.NOT_NULL_VIOLATION]: () =>
    new InvalidValueError("A required value is missing"),
  [POSTGRES_ERROR_CODE.INVALID_TEXT_REPRESENTATION]: () =>
    new InvalidValueError("A value has an invalid format"),
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

export const databaseFeature: FeatureDefinition = ({ database, server }) => {
  if (!database) return undefined;
  const statementTimeoutMs = resolveStatementTimeoutMs(
    database.statementTimeoutMs,
    server?.requestTimeoutMs
  );
  return {
    env: database.url === undefined ? DATABASE_URL_ENV_CONFIG : undefined,
    create: ({ app, own }) =>
      createDatabaseFeature(
        createDatabase(
          database,
          resolveDatabaseUrl(database, app, own.databaseUrl),
          statementTimeoutMs
        ),
        database
      ),
  };
};
