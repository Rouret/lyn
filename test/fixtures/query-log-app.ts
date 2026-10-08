import { sql } from "#lyn/db";
import { Lyn } from "#lyn/index";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import * as schema from "test/fixtures/schema";

const app = new Lyn({
  ...TEST_LYN_CONFIG,
  database: {
    schema,
    url: Bun.env.TEST_DATABASE_URL!,
    logQueries: Bun.env.LOG_QUERIES === "true",
  },
}).get("/", ({ db }) => db.execute(sql`select ${"secret-param"}::text as value`));

await app.handle(
  new Request("http://lyn.test/", { headers: { "X-Request-Id": "query-log-test" } })
);
await app.stop();
