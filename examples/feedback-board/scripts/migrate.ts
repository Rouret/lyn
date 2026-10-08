// TODO(lyn): `lyn db migrate` should replace this script, and drizzle-orm
// shouldn't need to be imported directly.
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { createApp } from "../src/app";

export const MIGRATIONS_FOLDER = new URL("../drizzle", import.meta.url).pathname;

if (import.meta.main) {
  const app = createApp();
  await migrate(app.db, { migrationsFolder: MIGRATIONS_FOLDER });
  await app.stop();
  console.log("Migrations applied");
}
