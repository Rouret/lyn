import { z } from "@rouret/lyn";
import { and, eq, sql } from "@rouret/lyn/db";
import type { App } from "../app";
import { PRIVATE_POST_COLUMNS } from "../db/public-columns";
import { posts, votes } from "../db/schema";
import { httpError, isForeignKeyViolation, isUniqueViolation } from "../errors";

// TODO(lyn): params and query schemas reject Zod 4 string formats
// (z.uuid(), z.email()), so the deprecated z.string().uuid() forms are used.
const postParams = z.object({ id: z.string().uuid() });

export const registerPostRoutes = (app: App) =>
  app
    .get(
      "/posts/:id",
      async ({ db, params }) => {
        const post = await db.query.posts.findFirst({
          columns: PRIVATE_POST_COLUMNS,
          where: eq(posts.id, params.id),
          with: { board: { columns: { slug: true, name: true } } },
        });
        if (!post) throw httpError(404, "POST_NOT_FOUND", "Post not found");
        return post;
      },
      { params: postParams }
    )
    .post(
      "/posts/:id/votes",
      async ({ db, params, body }) => {
        try {
          return await db.transaction(async (tx) => {
            await tx
              .insert(votes)
              .values({ postId: params.id, voterEmail: body.voterEmail });
            const [post] = await tx
              .update(posts)
              .set({ voteCount: sql`${posts.voteCount} + 1` })
              .where(eq(posts.id, params.id))
              .returning({ id: posts.id, voteCount: posts.voteCount });
            return post;
          });
        } catch (error) {
          if (isUniqueViolation(error))
            throw httpError(409, "ALREADY_VOTED", "You already voted for this post");
          if (isForeignKeyViolation(error))
            throw httpError(404, "POST_NOT_FOUND", "Post not found");
          throw error;
        }
      },
      { params: postParams, body: z.object({ voterEmail: z.email() }) }
    )
    .delete(
      "/posts/:id/votes",
      async ({ db, params, query }) => {
        const removed = await db.transaction(async (tx) => {
          const deleted = await tx
            .delete(votes)
            .where(
              and(eq(votes.postId, params.id), eq(votes.voterEmail, query.voterEmail))
            )
            .returning();
          if (deleted.length === 0) return false;
          await tx
            .update(posts)
            .set({ voteCount: sql`${posts.voteCount} - 1` })
            .where(eq(posts.id, params.id));
          return true;
        });
        if (!removed) throw httpError(404, "VOTE_NOT_FOUND", "No vote to remove");
      },
      { params: postParams, query: z.object({ voterEmail: z.string().email() }) }
    );
