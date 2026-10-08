import { $, Glob } from "bun";
import { devDependencies } from "../package.json";

const WORK_DIR = `${Bun.env.TMPDIR ?? "/tmp"}/lyn-package-check-${crypto.randomUUID()}`;
const CONSUMER_DIR = `${WORK_DIR}/consumer`;
const MIGRATIONS_DIR = "migrations";
const CREATED_STATUS = 201;

const consumerFiles = (tarball: string): Record<string, string> => ({
  "package.json": JSON.stringify({
    name: "lyn-consumer",
    private: true,
    type: "module",
    dependencies: { "@rouret/lyn": `file:${tarball}` },
    devDependencies: {
      "@types/bun": devDependencies["@types/bun"],
      "drizzle-kit": devDependencies["drizzle-kit"],
      typescript: devDependencies.typescript,
    },
  }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      lib: ["ESNext"],
      target: "ESNext",
      module: "Preserve",
      moduleResolution: "bundler",
      verbatimModuleSyntax: true,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["bun"],
    },
  }),
  "lyn.config.ts": `import { defineConfig } from "@rouret/lyn/config";

export default defineConfig({ database: { migrations: "${MIGRATIONS_DIR}" } });
`,
  "src/db/schema.ts": `import { jsonb, pgTable, text, uuid } from "@rouret/lyn/db";

export const notes = pgTable("notes", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  meta: jsonb(),
});
`,
  "src/app.ts": `import { Lyn, z } from "@rouret/lyn";
import * as schema from "./db/schema";

export const app = new Lyn({
  start: { hideLynLogo: true },
  database: { schema, url: "postgres://consumer@127.0.0.1:1/never-connected" },
})
  .get("/notes", ({ db }) => db.select().from(schema.notes))
  .post("/notes", ({ body }) => ({ title: body.title }), {
    body: z.object({ title: z.string() }),
  })
  // @ts-expect-error fails only if Lyn's types resolved: body has no "missing" key
  .put("/notes", ({ body }) => body.missing, { body: z.object({ title: z.string() }) });
`,
  "check.ts": `import { PgJsonb } from "@rouret/lyn/db";
import { app } from "./src/app";

const response = await app.handle(
  new Request("http://localhost/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "hello" }),
  })
);
if (response.status !== ${CREATED_STATUS})
  throw new Error(\`POST /notes answered \${response.status}: \${await response.text()}\`);

const json = { a: 1 };
const driverValue: unknown = PgJsonb.prototype.mapToDriverValue(json);
if (driverValue !== json)
  throw new Error("The JSON patch did not reach the app's drizzle-orm: it is bundled or duplicated");

console.log("handle() and the shared drizzle-orm instance work");
`,
});

const step = (title: string) => console.log(`\n▶ ${title}`);

const packTarball = async () => {
  await $`bun pm pack --destination ${WORK_DIR}`;
  for await (const file of new Glob("*.tgz").scan({ cwd: WORK_DIR, absolute: true }))
    return file;
  throw new Error(`bun pm pack wrote no tarball to ${WORK_DIR}`);
};

try {
  step("Pack");
  const tarball = await packTarball();

  step("publint");
  await $`bun x publint run ${tarball} --strict`;

  step("Are the types wrong?");
  await $`bun x attw ${tarball} --profile esm-only`;

  step("Install in a consumer project");
  for (const [path, content] of Object.entries(consumerFiles(tarball)))
    await Bun.write(`${CONSUMER_DIR}/${path}`, content);
  await $`bun install`.cwd(CONSUMER_DIR);

  step("Type-check the consumer");
  await $`bun x tsc --noEmit`.cwd(CONSUMER_DIR);

  step("Run a request through app.handle()");
  await $`bun run check.ts`.cwd(CONSUMER_DIR).env({ ...Bun.env, NODE_ENV: "development" });

  step("lyn --help");
  await $`bun x lyn --help`.cwd(CONSUMER_DIR);

  step("lyn db generate (lyn.config.ts + drizzle-kit from the consumer)");
  await $`bun x lyn db generate`.cwd(CONSUMER_DIR);
  const migrations = await Array.fromAsync(
    new Glob(`${MIGRATIONS_DIR}/*.sql`).scan(CONSUMER_DIR)
  );
  if (migrations.length === 0)
    throw new Error(`lyn db generate wrote no migration to ${MIGRATIONS_DIR}/`);

  console.log("\n✔ The packed package works for a consumer");
} finally {
  await $`rm -rf ${WORK_DIR}`;
}
