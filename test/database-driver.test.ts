import { eq, integer, jsonb, json, pgTable, serial, sql, text } from "#lyn/db";
import { Lyn, z } from "#lyn/index";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";

const TEST_DATABASE_URL = Bun.env.TEST_DATABASE_URL;

const loadEvents = pgTable("load_events", {
  id: serial().primaryKey(),
  label: text().notNull(),
  payload: jsonb().$type<{ tags: string[]; nested: { count: number } }>(),
  rawPayload: json().$type<{ ok: boolean }>(),
});

const loadCounters = pgTable("load_counters", {
  id: integer().primaryKey(),
  value: integer().notNull(),
});

const schema = { loadEvents, loadCounters };

const CREATE_TABLES = `
  create table load_events (
    id serial primary key,
    label text not null,
    payload jsonb,
    raw_payload json
  );
  create table load_counters (id integer primary key, value integer not null);
`;

describe.skipIf(!TEST_DATABASE_URL)("Bun SQL driver under load (Postgres)", () => {
  const app = new Lyn({
    ...TEST_LYN_CONFIG,
    database: {
      schema,
      url: TEST_DATABASE_URL ?? "postgres://lyn:lyn@127.0.0.1:1/lyn",
      pool: { max: 10 },
    },
  })
    .post(
      "/events",
      async ({ db, body }) => {
        const [event] = await db.insert(loadEvents).values(body).returning();
        return event;
      },
      {
        body: z.object({
          label: z.string(),
          payload: z.object({ tags: z.array(z.string()), nested: z.object({ count: z.number() }) }),
        }),
      }
    )
    .post("/counters/:id/increment", ({ db, params }) =>
      db.transaction(async (tx) => {
        const [counter] = await tx
          .select()
          .from(loadCounters)
          .where(eq(loadCounters.id, params.id))
          .for("update");
        await tx
          .update(loadCounters)
          .set({ value: counter!.value + 1 })
          .where(eq(loadCounters.id, params.id));
      }),
      { params: z.object({ id: z.number() }) }
    );

  const post = (path: string, body?: object) =>
    app.handle(
      new Request(`http://lyn.test${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      })
    );

  beforeAll(async () => {
    await app.db.execute(sql.raw("drop table if exists load_events, load_counters"));
    await app.db.execute(sql.raw(CREATE_TABLES));
  });

  afterAll(async () => {
    await app.db.execute(sql.raw("drop table if exists load_events, load_counters"));
    await app.stop();
  });

  it("serves 1000 concurrent inserts through a pool of 10", async () => {
    const responses = await Promise.all(
      Array.from({ length: 1000 }, (_, index) =>
        post("/events", {
          label: `event-${index}`,
          payload: { tags: ["load"], nested: { count: index } },
        })
      )
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const [{ total }] = (await app.db.execute(
      sql`select count(distinct label)::int as total from load_events`
    )) as unknown as [{ total: number }];
    expect(total).toBe(1000);
  });

  it("isolates 200 concurrent transactions on the same row", async () => {
    await app.db.insert(loadCounters).values({ id: 1, value: 0 });

    const responses = await Promise.all(
      Array.from({ length: 200 }, () => post("/counters/1/increment"))
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const [counter] = await app.db
      .select()
      .from(loadCounters)
      .where(eq(loadCounters.id, 1));
    expect(counter?.value).toBe(200);
  });

  it("runs concurrent statements inside one transaction", async () => {
    const results = await app.db.transaction((tx) =>
      Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          tx.execute<{ value: number }>(sql`select ${index}::int as value`)
        )
      )
    );

    expect(results.map(([row]) => row?.value)).toEqual(
      Array.from({ length: 50 }, (_, index) => index)
    );
  });

  it("stores json and jsonb as objects, not as encoded strings", async () => {
    const payload = { tags: ["a", "b"], nested: { count: 3 } };
    const [inserted] = await app.db
      .insert(loadEvents)
      .values({ label: "json-check", payload, rawPayload: { ok: true } })
      .returning();

    const [stored] = (await app.db.execute(sql`
      select jsonb_typeof(payload) as payload_type,
             json_typeof(raw_payload) as raw_payload_type,
             payload -> 'nested' ->> 'count' as nested_count
      from load_events where id = ${inserted!.id}
    `)) as unknown as [Record<string, string>];
    const [readBack] = await app.db
      .select()
      .from(loadEvents)
      .where(eq(loadEvents.id, inserted!.id));

    expect(stored).toEqual({
      payload_type: "object",
      raw_payload_type: "object",
      nested_count: "3",
    });
    expect(readBack?.payload).toEqual(payload);
    expect(readBack?.rawPayload).toEqual({ ok: true });
  });
});
