Lyn is a lightweight HTTP server framework for Bun.

Lyn is:

- Fast
- Type-safe
- Secure with built-in authentication
- Runs everywhere

Lyn isn't here to replace existing frameworks. It was born from the need for a
simple way to build things faster, with the best quality and developer experience.

Most frameworks serve as a foundation for your products. However, I often need
something simpler with authentication and security built-in by default.

That's why Lyn focuses on being the easiest tool for POCs, solopreneurs, and agencies.

Lyn leverages Bun and the best JavaScript libraries for the job.

```ts
new Lyn()
  .get("/", () => {
    return new Response("Hello World");
  })
  .post(
    "/users",
    ({ body }) => {
      return new Response("Hello " + body.name);
    },
    {
      body: z.object({
        name: z.string(),
      }),
    }
  )
  .listen(3000);
```
