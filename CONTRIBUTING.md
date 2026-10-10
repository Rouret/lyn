# Contributing to Lyn

This page is for people working **on** Lyn. To build an app **with** Lyn,
read the [documentation](https://rouret.github.io/lyn/).

Architecture, conventions and commit rules live in [CLAUDE.md](CLAUDE.md)
(also read by AI agents as `AGENTS.md`). This page covers the day-to-day
workflow.

## Setup

Requires Bun `>= 1.3.6`. Use Bun for everything: no node, npm, npx, pnpm or
yarn.

```bash
bun install
```

## Sandbox

`testing/local.ts` is a small app wired to the local sources, with hot
reload, on port 3000:

```bash
NODE_ENV=development bun run dev
```

## Checks

Run all of them before proposing a change:

| Check | Command |
| --- | --- |
| Tests | `bun run test` |
| Types | `bunx tsc --noEmit` |
| Dead code | `bun run deadcode` |
| Docs build | `bun run docs:build` |
| Packed package | `bun run check:package` |

CI (`.github/workflows/ci.yml`) runs all of them except the docs build
(`docs.yml` does it), with Postgres, on every push to `main` and pull
request. `check:package` needs network access: it installs the packed
tarball in a temporary project.

`bun run test` sets `NODE_ENV=lyn-test`, which silences Lyn's internal
logs. Tests must still pass with any `NODE_ENV`.

To run one file:

```bash
NODE_ENV=lyn-test bun test test/validation.test.ts
```

### Database tests

The database suite runs against a throwaway Postgres in Docker
(`postgres-test` in `docker-compose.yml`, port `54329`, data in memory):

```bash
bun run test:db
```

Without `TEST_DATABASE_URL`, those tests are skipped.

### Writing tests

- Never start a server: build the app and call it through
  `createTestClient(app)` from `testing/utilsTest.ts`, or `app.handle()`.
- Restore every `Bun.env` value you change, and remove variables with
  `delete Bun.env.X`.
- Every behaviour change ships with a test.

## Documentation

The user documentation is the VitePress site in `docs/`, deployed to GitHub
Pages by `.github/workflows/docs.yml` on every push to `main`.

```bash
bun run docs:dev
```

- `docs/` is for **users** of Lyn only. Repository internals (sandbox,
  test helpers, `lyn-test`, Docker) belong here or in CLAUDE.md.
- One folder per sidebar category: `guide/`, `essentials/`,
  `configuration/`, `integrations/`, `guides/`, `reference/`. A new page
  goes in its folder and in the sidebar of `docs/.vitepress/config.ts`.
- A change to public behaviour updates the matching page, its
  "Not supported yet" box and `reference/api.md` in the same commit.
- Write for someone who has never seen the code: short sentences, one idea
  per paragraph, an example before the details.
- Examples import from `@rouret/lyn` and `@rouret/lyn/db`, never from `src/`.
- `bun run docs:build` fails on dead links.

## Example project

`examples/feedback-board` installs Lyn the way a user would: from the
packed tarball, not from `src/`. After a change to Lyn, run
`bun run check:example` from the root: it packs Lyn, installs it in the
example, then runs the example's `typecheck` and `test` (its own Postgres
on port 5434, migrated with `lyn db migrate`). `bun run pack:example`
only does the install, to use the build by hand. Bun keeps
the copy it already installed from the same tarball path, so the script
removes and re-adds the package; the example's `bun.lock` changes with
every new tarball.

## Releases

There is no release automation. Only the maintainer publishes, by hand,
once `bun run check:package` and `bun run check:example` pass.

## Commits

Conventional Commits, in English, directly on `main`. Details in
[CLAUDE.md](CLAUDE.md#git-and-commits).
