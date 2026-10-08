import { defineConfig } from "drizzle-kit";

// TODO(lyn): the `lyn db` CLI should replace this file and drizzle-kit.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
