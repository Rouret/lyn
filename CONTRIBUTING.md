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

Only the maintainer releases, from a clean `main` in sync with `origin`,
logged in to npm (`bun pm whoami`) and GitHub (`gh auth status`):

```sh
bun run release patch --dry-run   # everything except push and publish
bun run release patch             # or minor, major, x.y.z, x.y.z-beta.1
```

The script runs every check (`test:db`, `tsc`, `deadcode`,
`check:package`, `check:example`), creates the `chore: release x.y.z`
commit and the `vx.y.z` tag, checks the version is not on npm yet, packs
once, then pushes, publishes that tarball and creates the GitHub release
with the same file attached.

- A version with a `-` (`1.2.0-beta.1`) goes to the `next` dist-tag and
  is marked as a pre-release on GitHub; the others go to `latest`.
- Release notes come from the Conventional Commits since the previous
  `v*` tag: breaking changes, features, fixes and performance. Other types
  are left out, so write `feat` and `fix` summaries for users.
- Before the push, any failure removes the version commit and tag. After
  it, the script prints the commands that finish the release by hand.

## Commits

Conventional Commits, in English, directly on `main`. Details in
[CLAUDE.md](CLAUDE.md#git-and-commits).
