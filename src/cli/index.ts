#!/usr/bin/env bun
import { DB_COMMANDS, runDbCommand, type DbCommand } from "#/cli/db";
import { EXIT_CODE } from "#/cli/exit-code";

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
    return EXIT_CODE.SUCCESS;
  }
  if (group !== "db" || !isDbCommand(command)) {
    console.error(USAGE);
    return EXIT_CODE.FAILURE;
  }
  return runDbCommand(command, args, process.cwd());
};

try {
  process.exitCode = await run(Bun.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = EXIT_CODE.FAILURE;
}
