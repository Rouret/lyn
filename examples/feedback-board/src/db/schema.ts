import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  relations,
  text,
  timestamp,
  uuid,
} from "@rouret/lyn/db";

export const POST_STATUSES = [
  "open",
  "planned",
  "in_progress",
  "done",
  "declined",
] as const;

export const postStatus = pgEnum("post_status", POST_STATUSES);

export const boards = pgTable("boards", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardId: uuid()
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    status: postStatus().notNull().default("open"),
    authorEmail: text().notNull(),
    voteCount: integer().notNull().default(0),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [index().on(table.boardId, table.voteCount)]
);

export const votes = pgTable(
  "votes",
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    voterEmail: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.voterEmail] })]
);

export const boardsRelations = relations(boards, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  board: one(boards, { fields: [posts.boardId], references: [boards.id] }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  post: one(posts, { fields: [votes.postId], references: [posts.id] }),
}));
