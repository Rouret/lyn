import { sql } from "@rouret/lyn/db";
import { $ } from "bun";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { seedDemoBoard } from "../src/seed";

const TEST_DATABASE_URL = Bun.env.TEST_DATABASE_URL;
const WIDGET_ORIGIN = "https://acme.dev";
const PROJECT_ROOT = `${import.meta.dir}/..`;

type Post = { id: string; title: string; status: string; voteCount: number };
type PostPage = { posts: Post[]; page: number; hasMore: boolean };

describe.skipIf(!TEST_DATABASE_URL)("feedback board", () => {
  let app: ReturnType<typeof createApp>;

  const request = (method: string, path: string, body?: object) =>
    app.handle(
      new Request(`http://feedback.test${path}`, {
        method,
        headers: {
          Origin: WIDGET_ORIGIN,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    );

  const json = async <T>(response: Response) => (await response.json()) as T;

  const listPosts = async (query = "") =>
    json<PostPage>(await request("GET", `/boards/acme/posts${query}`));

  const firstPost = async (title: string) => {
    const { posts } = await listPosts("?sort=new");
    return posts.find((post) => post.title === title)!;
  };

  beforeAll(async () => {
    Bun.env.ALLOWED_ORIGINS = WIDGET_ORIGIN;
    app = createApp({ databaseUrl: TEST_DATABASE_URL });
    await app.db.execute(
      sql.raw(`
        drop table if exists votes, posts, boards cascade;
        drop type if exists post_status;
        drop schema if exists drizzle cascade;
      `)
    );
    await $`bun x lyn db migrate`
      .cwd(PROJECT_ROOT)
      .env({ ...Bun.env, DATABASE_URL: TEST_DATABASE_URL });
  });

  beforeEach(async () => {
    await app.db.execute(sql.raw("truncate votes, posts, boards cascade"));
    await seedDemoBoard(app.db);
  });

  afterAll(async () => {
    await app.db.execute(
      sql.raw(`
        drop table if exists votes, posts, boards cascade;
        drop type if exists post_status;
        drop schema if exists drizzle cascade;
      `)
    );
    await app.stop();
    delete Bun.env.ALLOWED_ORIGINS;
  });

  describe("GET /boards/:slug", () => {
    it("returns the board with post counts per status", async () => {
      const response = await request("GET", "/boards/acme");

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        slug: "acme",
        name: "Acme feedback",
        postCounts: { open: 2, planned: 2, in_progress: 1, done: 1, declined: 1 },
      });
    });

    it("returns 404 for an unknown board", async () => {
      const response = await request("GET", "/boards/nope");

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: "BOARD_NOT_FOUND",
        message: 'Board "nope" not found',
      });
    });
  });

  describe("GET /boards/:slug/posts", () => {
    it("sorts by votes by default", async () => {
      const { posts } = await listPosts();

      expect(posts.map((post) => post.voteCount)).toEqual([42, 27, 19, 15, 8, 3, 1]);
    });

    it("filters by status", async () => {
      const { posts } = await listPosts("?status=planned");

      expect(posts.map((post) => post.title)).toEqual([
        "Slack notifications",
        "Two-factor authentication",
      ]);
    });

    it("paginates", async () => {
      for (let index = 0; index < 20; index++) {
        await request("POST", "/boards/acme/posts", {
          title: `Idea number ${index}`,
          authorEmail: "user@example.com",
        });
      }

      const first = await listPosts("?page=1");
      const second = await listPosts("?page=2");

      expect([first.posts.length, first.hasMore]).toEqual([20, true]);
      expect([second.posts.length, second.hasMore]).toEqual([7, false]);
    });

    it.each([
      ["an unknown sort", "?sort=random"],
      ["an unknown status", "?status=maybe"],
      ["a page below 1", "?page=0"],
    ])("rejects %s with 400", async (_, query) => {
      const response = await request("GET", `/boards/acme/posts${query}`);

      expect(response.status).toBe(400);
    });
  });

  describe("POST /boards/:slug/posts", () => {
    it("creates an open post with no votes", async () => {
      const response = await request("POST", "/boards/acme/posts", {
        title: "  Zapier integration  ",
        description: "Connect boards to Zapier",
        authorEmail: "ada@example.com",
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        title: "Zapier integration",
        status: "open",
        voteCount: 0,
      });
    });

    it.each([
      ["a short title", { title: "Hi", authorEmail: "ada@example.com" }],
      ["an invalid email", { title: "Zapier", authorEmail: "ada" }],
    ])("rejects %s with 400", async (_, body) => {
      const response = await request("POST", "/boards/acme/posts", body);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /posts/:id", () => {
    it("returns the post with its board", async () => {
      const { id } = await firstPost("Dark mode");

      const response = await request("GET", `/posts/${id}`);

      expect(await response.json()).toMatchObject({
        title: "Dark mode",
        board: { slug: "acme", name: "Acme feedback" },
      });
    });

    it("returns 400 for an id that is not a UUID", async () => {
      expect((await request("GET", "/posts/42")).status).toBe(400);
    });

    it("returns 404 for an unknown post", async () => {
      const response = await request("GET", `/posts/${crypto.randomUUID()}`);

      expect(response.status).toBe(404);
    });
  });

  describe("votes", () => {
    it("adds a vote and increments the count", async () => {
      const { id } = await firstPost("Public API");

      const response = await request("POST", `/posts/${id}/votes`, {
        voterEmail: "grace@example.com",
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id, voteCount: 9 });
    });

    it("refuses a second vote from the same person with 409", async () => {
      const { id } = await firstPost("Public API");
      await request("POST", `/posts/${id}/votes`, { voterEmail: "grace@example.com" });

      const response = await request("POST", `/posts/${id}/votes`, {
        voterEmail: "grace@example.com",
      });

      expect(response.status).toBe(409);
      expect((await firstPost("Public API")).voteCount).toBe(9);
    });

    it("returns 404 when voting for an unknown post", async () => {
      const response = await request("POST", `/posts/${crypto.randomUUID()}/votes`, {
        voterEmail: "grace@example.com",
      });

      expect(response.status).toBe(404);
    });

    it("counts concurrent votes exactly", async () => {
      const { id } = await firstPost("Custom domains");

      const responses = await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          request("POST", `/posts/${id}/votes`, {
            voterEmail: `concurrent${index}@example.com`,
          })
        )
      );

      expect(responses.every((response) => response.status === 201)).toBe(true);
      expect((await firstPost("Custom domains")).voteCount).toBe(53);
    });

    it("removes a vote and decrements the count", async () => {
      const { id } = await firstPost("Public API");

      const response = await request(
        "DELETE",
        `/posts/${id}/votes?voterEmail=user0@example.com`
      );

      expect(response.status).toBe(204);
      expect((await firstPost("Public API")).voteCount).toBe(7);
    });

    it("returns 404 when there is no vote to remove", async () => {
      const { id } = await firstPost("Public API");

      const response = await request(
        "DELETE",
        `/posts/${id}/votes?voterEmail=nobody@example.com`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("privacy", () => {
    it("never exposes author emails", async () => {
      const created = await (
        await request("POST", "/boards/acme/posts", {
          title: "Zapier integration",
          authorEmail: "ada@example.com",
        })
      ).text();
      const { id } = JSON.parse(created) as Post;
      const bodies = [
        created,
        await (await request("GET", "/boards/acme/posts")).text(),
        await (await request("GET", `/posts/${id}`)).text(),
      ];

      for (const body of bodies) {
        expect(body).not.toContain("authorEmail");
        expect(body).not.toContain("ada@example.com");
      }
    });
  });

  describe("embedding", () => {
    it("allows the widget origin", async () => {
      const response = await request("GET", "/boards/acme");

      expect(response.headers.get("access-control-allow-origin")).toBe(WIDGET_ORIGIN);
    });

    it("sends no CORS header to other origins", async () => {
      const response = await app.handle(
        new Request("http://feedback.test/boards/acme", {
          headers: { Origin: "https://evil.example" },
        })
      );

      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });
});
