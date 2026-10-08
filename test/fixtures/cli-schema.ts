import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const cliNotes = pgTable("cli_notes", {
  id: uuid().primaryKey().defaultRandom(),
  body: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
