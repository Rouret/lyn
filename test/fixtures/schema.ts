import { pgTable, text, timestamp, uuid } from "#/db";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  displayName: text(),
  createdAt: timestamp().notNull().defaultNow(),
});
