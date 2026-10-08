import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SQL } from "bun";

const TEST_DATABASE_URL = Bun.env.TEST_DATABASE_URL;
const REPO_ROOT = resolve(import.meta.dir, "..");
const CLI = join(REPO_ROOT, "src/cli/index.ts");
const SCHEMA_SOURCE = Bun.file(join(REPO_ROOT, "test/fixtures/cli-schema.ts"));
const DRIZZLE_KIT_TIMEOUT_MS = 30_000;

const projects: string[] = [];

const createProject = async (
  files: Record<string, string | Blob>,
  { withNodeModules = true } = {}
) => {
  const root = await mkdtemp(join(tmpdir(), "lyn-cli-test-"));
  projects.push(root);
  if (withNodeModules)
    await symlink(join(REPO_ROOT, "node_modules"), join(root, "node_modules"));
  for (const [path, content] of Object.entries(files))
    await Bun.write(join(root, path), content);
  return root;
};

const runCli = async (
  projectRoot: string,
  args: string[],
  env: Record<string, string> = {}
) => {
  const { DATABASE_URL: _ignored, ...inheritedEnv } = Bun.env;
  const child = Bun.spawn(["bun", CLI, ...args], {
    cwd: projectRoot,
    env: { ...inheritedEnv, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

const sqlFilesIn = async (folder: string) =>
  (await readdir(folder)).filter((file) => file.endsWith(".sql"));

afterEach(async () => {
  for (const project of projects.splice(0))
    await rm(project, { recursive: true, force: true });
});

describe("lyn cli", () => {
  it("prints the usage and fails on an unknown command", async () => {
    const project = await createProject({});

    const { stderr, exitCode } = await runCli(project, ["db", "seed"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage: lyn db <command>");
  });

  it("prints the usage on --help", async () => {
    const project = await createProject({});

    const { stdout, exitCode } = await runCli(project, ["--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("db migrate");
  });
});

describe("lyn db generate", () => {
  it(
    "writes snake_case migrations from src/db/schema.ts into drizzle/",
    async () => {
      const project = await createProject({ "src/db/schema.ts": SCHEMA_SOURCE });

      const { exitCode } = await runCli(project, ["db", "generate"]);

      expect(exitCode).toBe(0);
      const [migration] = await sqlFilesIn(join(project, "drizzle"));
      const sql = await Bun.file(join(project, "drizzle", migration!)).text();
      expect(sql).toContain('CREATE TABLE "cli_notes"');
      expect(sql).toContain('"created_at" timestamp');
    },
    DRIZZLE_KIT_TIMEOUT_MS
  );

  it(
    "uses the paths of lyn.config.ts",
    async () => {
      const project = await createProject({
        "database/tables.ts": SCHEMA_SOURCE,
        "lyn.config.ts": `
          import { defineConfig } from ${JSON.stringify(join(REPO_ROOT, "src/config.ts"))};
          export default defineConfig({
            database: { schema: "./database/tables.ts", migrations: "./migrations" },
          });
        `,
      });

      const { exitCode } = await runCli(project, ["db", "generate"]);

      expect(exitCode).toBe(0);
      expect(await sqlFilesIn(join(project, "migrations"))).toHaveLength(1);
    },
    DRIZZLE_KIT_TIMEOUT_MS
  );

  it("explains where the schema is expected", async () => {
    const project = await createProject({});

    const { stderr, exitCode } = await runCli(project, ["db", "generate"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      "No schema at src/db/schema.ts: create it, or set database.schema in lyn.config.ts"
    );
  });

  it("explains how to install drizzle-kit when it is missing", async () => {
    const project = await createProject(
      { "src/db/schema.ts": SCHEMA_SOURCE },
      { withNodeModules: false }
    );

    const { stderr, exitCode } = await runCli(project, ["db", "generate"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("drizzle-kit is not installed: run `bun add -d drizzle-kit`");
  });
});

describe("lyn db migrate and studio", () => {
  it.each(["migrate", "studio"])("%s requires DATABASE_URL", async (command) => {
    const project = await createProject({ "src/db/schema.ts": SCHEMA_SOURCE });

    const { stderr, exitCode } = await runCli(project, ["db", command]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("DATABASE_URL: missing");
  });

  it("explains that migrations must be generated first", async () => {
    const project = await createProject({});

    const { stderr, exitCode } = await runCli(project, ["db", "migrate"], {
      DATABASE_URL: "postgres://lyn:lyn@127.0.0.1:1/lyn",
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("No migrations in drizzle: run `lyn db generate` first");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("lyn db migrate (Postgres)", () => {
  const sql = new SQL(TEST_DATABASE_URL ?? "");

  const dropMigratedObjects = async () => {
    await sql`drop table if exists cli_notes`;
    await sql`drop schema if exists drizzle cascade`;
  };

  afterAll(async () => {
    await dropMigratedObjects();
    await sql.close();
  });

  it(
    "applies the generated migrations once",
    async () => {
      await dropMigratedObjects();
      const project = await createProject({ "src/db/schema.ts": SCHEMA_SOURCE });
      const env = { DATABASE_URL: TEST_DATABASE_URL! };
      await runCli(project, ["db", "generate"]);

      const first = await runCli(project, ["db", "migrate"], env);
      const second = await runCli(project, ["db", "migrate"], env);

      expect(first.exitCode).toBe(0);
      expect(first.stdout).toContain("Migrations from drizzle applied");
      expect(second.exitCode).toBe(0);
      const [{ count }] = await sql`select count(*)::int as count from cli_notes`;
      expect(count).toBe(0);
    },
    DRIZZLE_KIT_TIMEOUT_MS
  );
});
