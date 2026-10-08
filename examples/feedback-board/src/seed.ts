import type { Db } from "./app";
import { boards, posts, votes } from "./db/schema";

const IDEAS = [
  { title: "Dark mode", status: "done", voters: 42 },
  { title: "Export to CSV", status: "in_progress", voters: 27 },
  { title: "Slack notifications", status: "planned", voters: 19 },
  { title: "Two-factor authentication", status: "planned", voters: 15 },
  { title: "Public API", status: "open", voters: 8 },
  { title: "Custom domains", status: "open", voters: 3 },
  { title: "Blockchain integration", status: "declined", voters: 1 },
] as const;

export const seedDemoBoard = async (db: Db) => {
  const [board] = await db
    .insert(boards)
    .values({ slug: "acme", name: "Acme feedback" })
    .returning();

  for (const idea of IDEAS) {
    const [post] = await db
      .insert(posts)
      .values({
        boardId: board!.id,
        title: idea.title,
        status: idea.status,
        authorEmail: "founder@acme.dev",
        voteCount: idea.voters,
      })
      .returning();
    await db.insert(votes).values(
      Array.from({ length: idea.voters }, (_, index) => ({
        postId: post!.id,
        voterEmail: `user${index}@example.com`,
      }))
    );
  }

  return board!;
};
