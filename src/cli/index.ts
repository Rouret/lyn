#!/usr/bin/env bun
import { DB_COMMANDS, runDbCommand, type DbCommand } from "#/cli/db";

const USAGE = `Usage: lyn db <command> [drizzle-kit flags]

Commands:
  db generate   Write the SQL migrations for your schema changes
  db migrate    Apply the pending migrations to DATABASE_URL
  db studio     Open Drizzle Studio on DATABASE_URL`;

const isDbCommand = (command: string | undefined): command is DbCommand =>
  DB_COMMANDS.includes(command as DbCommand);

const run = async ([group, command, ...args]: string[]): Promise<number> => {
  if (group === "--help" || group === "-h") {
    console.log(USAGE);
    return 0;
  }
  if (group !== "db" || !isDbCommand(command)) {
    console.error(USAGE);
    return 1;
  }
  return runDbCommand(command, args, process.cwd());
};

try {
  process.exitCode = await run(Bun.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
