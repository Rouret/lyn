import z from "zod";
import { Lyn } from "../src";

type User = {
  email: string;
  username: string;
};

const fakeUsers: User[] = [
  {
    email: "john@doe.com",
    username: "john_doe",
  },
  {
    email: "jane@doe.com",
    username: "jane_doe",
  },
];

new Lyn()
  .get("/text", () => {
    return "Hello World";
  })
  .get("/json", () => {
    return {
      users: fakeUsers,
    };
  })
  .get(
    "/test",
    ({ query }) => {
      return query;
    },
    {
      query: z.object({
        name: z.string(),
        isAdmin: z.boolean(),
        age: z.number(),
      }),
    }
  )
  .get(
    "/users",
    ({ query }) => {
      return {
        users: fakeUsers.filter((user) =>
          user.username.includes(query.username)
        ),
      };
    },
    {
      query: z.object({
        username: z.string(),
      }),
    }
  )
  .get(
    "/:name",
    ({ params }) => {
      return {
        message: "Hello " + params.name,
      };
    },
    {
      params: z.object({
        name: z.string(),
      }),
    }
  )
  .post("/", ({ set }) => {
    set.status = 201;
    return {
      message: "Hello World",
    };
  })
  .post(
    "/users",
    ({ body, set }) => {
      set.status = 201;
      return {
        message: "Hello " + body.name,
      };
    },
    {
      body: z.object({
        name: z.string(),
      }),
    }
  )
  .listen(3000);
