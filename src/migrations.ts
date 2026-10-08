import { projectRelativePath, type DatabasePaths } from "#lyn/project-config";
import type { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { existsSync, readdirSync } from "node:fs";

export const assertMigrationsExist = (paths: DatabasePaths) => {
  const hasMigrations =
    existsSync(paths.migrations) &&
    readdirSync(paths.migrations).some((file) => file.endsWith(".sql"));
  if (!hasMigrations)
    throw new Error(
      `No migrations in ${projectRelativePath(paths, paths.migrations)}: run \`lyn db generate\` first`
    );
};

// Migrating on the connection that holds the lock keeps working with a pool of one.
export const applyMigrations = async (client: SQL, migrationsFolder: string) => {
  const connection = await client.reserve();
  await connection`select pg_advisory_lock(hashtext('lyn_migrations'))`;
  try {
    await migrate(drizzle({ client: connection, casing: "snake_case" }), {
      migrationsFolder,
    });
  } finally {
    await connection`select pg_advisory_unlock(hashtext('lyn_migrations'))`;
    connection.release();
  }
};
