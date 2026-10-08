import { sql } from "#lyn/db";
import { Lyn, LynDatabaseError } from "#lyn/index";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import * as schema from "test/fixtures/schema";

const TEST_DATABASE_URL = Bun.env.TEST_DATABASE_URL;
const REPO_ROOT = resolve(import.meta.dir, "..");

const createApp = (options: { pool?: { max: number }; migrateOnStart?: boolean } = {}) =>
  new Lyn({
    ...TEST_LYN_CONFIG,
    database: { schema, url: TEST_DATABASE_URL ?? "postgres://lyn:lyn@127.0.0.1:1/lyn", ...options },
  });

describe.skipIf(!TEST_DATABASE_URL)("database pool (Postgres)", () => {
  it("never opens more than pool.max connections", async () => {
    const app = createApp({ pool: { max: 2 } });

    const rows = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.db.execute<{ pid: number }>(
          sql`select pg_backend_pid() as pid, pg_sleep(0.05)`
        )
      )
    );
    await app.stop();

    const connections = new Set(rows.map(([row]) => row?.pid));
    expect(connections.size).toBeLessThanOrEqual(2);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("logQueries (Postgres)", () => {
  const runQueryLogApp = async (logQueries: boolean) => {
    const child = Bun.spawn(["bun", "test/fixtures/query-log-app.ts"], {
      cwd: REPO_ROOT,
      env: {
        ...Bun.env,
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        LOG_QUERIES: String(logQueries),
      },
      stdout: "pipe",
    });
    const output = await new Response(child.stdout).text();
    await child.exited;
    const queryLines = output
      .split("\n")
      .filter((line) => line.includes("SQL query"))
      .map((line) => JSON.parse(line));
    return { output, queryLines };
  };

  it("logs each query with the request id and without its parameters", async () => {
    const { output, queryLines } = await runQueryLogApp(true);

    expect(queryLines).toEqual([
      expect.objectContaining({
        requestId: "query-log-test",
        query: "select $1::text as value",
        paramCount: 1,
      }),
    ]);
    expect(output).not.toContain("secret-param");
  });

  it("logs no query by default", async () => {
    const { queryLines } = await runQueryLogApp(false);

    expect(queryLines).toEqual([]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("migrateOnStart (Postgres)", () => {
  const originalCwd = process.cwd();
  let project: string;

  const dropMigratedObjects = async () => {
    const app = createApp();
    await app.db.execute(sql.raw("drop table if exists migrated_notes"));
    await app.db.execute(sql.raw("drop schema if exists drizzle cascade"));
    await app.stop();
  };

  beforeEach(async () => {
    await dropMigratedObjects();
    project = await mkdtemp(join(tmpdir(), "lyn-migrate-on-start-"));
    process.chdir(project);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(project, { recursive: true, force: true });
  });

  afterAll(dropMigratedObjects);

  const copyFixtureMigrations = (folder = "drizzle") =>
    cp(join(REPO_ROOT, "test/fixtures/migrations"), join(project, folder), {
      recursive: true,
    });

  it("applies the pending migrations before serving", async () => {
    await copyFixtureMigrations();
    const app = createApp({ migrateOnStart: true });

    await app.listen();
    const rows = await app.db.execute(sql`select * from migrated_notes`);
    await app.stop();

    expect(rows).toHaveLength(0);
  });

  it("lets instances starting together migrate once", async () => {
    await copyFixtureMigrations();
    const apps = [createApp({ migrateOnStart: true }), createApp({ migrateOnStart: true })];

    await Promise.all(apps.map((app) => app.listen()));
    const applied = await apps[0]!.db.execute(
      sql`select * from drizzle.__drizzle_migrations`
    );
    await Promise.all(apps.map((app) => app.stop()));

    expect(applied).toHaveLength(1);
  });

  it("reads the migrations folder from lyn.config.ts", async () => {
    await copyFixtureMigrations("sql");
    await Bun.write(
      join(project, "lyn.config.ts"),
      `export default { database: { migrations: "./sql" } };`
    );
    const app = createApp({ migrateOnStart: true });

    await app.listen();
    await app.stop();
  });

  it("refuses to start without migrations", async () => {
    const app = createApp({ migrateOnStart: true });

    const listening = app.listen();

    await expect(listening).rejects.toThrow(
      new LynDatabaseError(
        "migrateOnStart failed: No migrations in drizzle: run `lyn db generate` first"
      )
    );
    await app.stop();
  });
});
