import { z } from "@rouret/lyn";
import { and, count, desc, eq } from "@rouret/lyn/db";
import type { App, Db } from "../app";
import { PRIVATE_POST_COLUMNS, PUBLIC_POST_COLUMNS } from "../db/public-columns";
import { boards, POST_STATUSES, posts } from "../db/schema";
import { httpError } from "../errors";

const PAGE_SIZE = 20;

const SORTS = ["top", "new"] as const;
type Sort = (typeof SORTS)[number];
type PostStatus = (typeof POST_STATUSES)[number];

const findBoardOrThrow = async (db: Db, slug: string) => {
  const board = await db.query.boards.findFirst({ where: eq(boards.slug, slug) });
  if (!board) throw httpError(404, "BOARD_NOT_FOUND", `Board "${slug}" not found`);
  return board;
};

// TODO(lyn): query schemas don't accept z.enum() or .default(), so
// `sort` and `status` are plain strings checked by hand.
const oneOf = <T extends string>(
  allowed: readonly T[],
  value: string | undefined,
  field: string
): T | undefined => {
  if (value === undefined || (allowed as readonly string[]).includes(value))
    return value as T | undefined;
  throw httpError(400, "VALIDATION", `${field} must be one of: ${allowed.join(", ")}`);
};

const countPostsByStatus = async (db: Db, boardId: string) => {
  const rows = await db
    .select({ status: posts.status, count: count() })
    .from(posts)
    .where(eq(posts.boardId, boardId))
    .groupBy(posts.status);

  return Object.fromEntries(
    POST_STATUSES.map((status) => [
      status,
      rows.find((row) => row.status === status)?.count ?? 0,
    ])
  ) as Record<PostStatus, number>;
};

const boardParams = z.object({ slug: z.string() });

export const registerBoardRoutes = (app: App) =>
  app
    .get(
      "/boards/:slug",
      async ({ db, params }) => {
        const board = await findBoardOrThrow(db, params.slug);
        return { ...board, postCounts: await countPostsByStatus(db, board.id) };
      },
      { params: boardParams }
    )
    .get(
      "/boards/:slug/posts",
      async ({ db, params, query }) => {
        const board = await findBoardOrThrow(db, params.slug);
        const sort: Sort = oneOf(SORTS, query.sort, "sort") ?? "top";
        const status = oneOf(POST_STATUSES, query.status, "status");
        const page = query.page ?? 1;

        const rows = await db.query.posts.findMany({
          columns: PRIVATE_POST_COLUMNS,
          where: and(
            eq(posts.boardId, board.id),
            status ? eq(posts.status, status) : undefined
          ),
          orderBy:
            sort === "top"
              ? [desc(posts.voteCount), desc(posts.createdAt)]
              : [desc(posts.createdAt)],
          limit: PAGE_SIZE + 1,
          offset: (page - 1) * PAGE_SIZE,
        });

        return {
          posts: rows.slice(0, PAGE_SIZE),
          page,
          hasMore: rows.length > PAGE_SIZE,
        };
      },
      {
        params: boardParams,
        query: z.object({
          sort: z.string().optional(),
          status: z.string().optional(),
          page: z.number().int().positive().optional(),
        }),
      }
    )
    .post(
      "/boards/:slug/posts",
      async ({ db, params, body }) => {
        const board = await findBoardOrThrow(db, params.slug);
        const [post] = await db
          .insert(posts)
          .values({ ...body, boardId: board.id })
          .returning(PUBLIC_POST_COLUMNS);
        return post;
      },
      {
        params: boardParams,
        body: z.object({
          title: z.string().trim().min(3).max(120),
          description: z.string().trim().max(2000).optional(),
          authorEmail: z.email(),
        }),
      }
    );
