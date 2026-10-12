import { $ } from "bun";
import { buildReleaseNotes, findPreviousTag } from "./release-notes";

const RELEASE_BRANCH = "main";
const REMOTE = "origin";
const EXAMPLE_DIR = "examples/feedback-board";
const INCREMENTS = ["patch", "minor", "major"];
const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const LATEST_DIST_TAG = "latest";
const PRERELEASE_DIST_TAG = "next";
const USAGE = "Usage: bun run release <patch|minor|major|x.y.z> [--dry-run]";

const args = Bun.argv.slice(2);
const dryRun = args.includes("--dry-run");
const increment = args.find((arg) => !arg.startsWith("--"));

if (!increment || !(INCREMENTS.includes(increment) || SEMVER.test(increment))) {
  console.error(USAGE);
  process.exit(1);
}

const step = (title: string) => console.log(`\n▶ ${title}`);

const fail = (message: string): never => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

const failWithRecovery = (message: string, recoveryCommands: string[][]): never =>
  fail(
    `${message}\n  Finish the release by hand:\n${recoveryCommands.map((cmd) => `    ${cmd.join(" ")}`).join("\n")}`
  );

const runInteractive = async (cmd: string[]) => {
  const exitCode = await Bun.spawn({ cmd, stdio: ["inherit", "inherit", "inherit"] }).exited;
  if (exitCode !== 0) throw new Error(`${cmd.join(" ")} exited with ${exitCode}`);
};

const readPackage = async (): Promise<{ name: string; version: string }> =>
  Bun.file("package.json").json();

const isPublished = async (name: string, version: string) => {
  const versions: string[] = JSON.parse(await $`bun info ${name} versions --json`.text());
  return versions.includes(version);
};

step("Preconditions");
const branch = (await $`git branch --show-current`.text()).trim();
if (branch !== RELEASE_BRANCH) fail(`Release from ${RELEASE_BRANCH}, not ${branch}`);
if ((await $`git status --porcelain`.text()).trim()) fail("The working tree is not clean");
await $`git fetch ${REMOTE} ${RELEASE_BRANCH} --tags`;
const local = (await $`git rev-parse HEAD`.text()).trim();
const remote = (await $`git rev-parse ${REMOTE}/${RELEASE_BRANCH}`.text()).trim();
if (local !== remote) fail(`${RELEASE_BRANCH} is not in sync with ${REMOTE}/${RELEASE_BRANCH}`);
console.log(`npm user: ${(await $`bun pm whoami`.text()).trim()}`);
await $`gh auth status`.quiet();
const previousTag = await findPreviousTag();
console.log(`Previous release: ${previousTag ?? "none tagged, notes cover the whole history"}`);

step("Checks");
try {
  await $`bun run test:db`;
  await $`bunx tsc --noEmit`;
  await $`bun run deadcode`;
  await $`bun run check:package`;
  await $`bun run check:example`;
} finally {
  // check:example reinstalls a fresh tarball, which rewrites the example's lockfile.
  await $`git checkout -- ${EXAMPLE_DIR}`;
}

step(`Version ${increment}`);
await $`bun pm version ${increment} --message ${"chore: release %s"}`;
const { name, version } = await readPackage();
const tag = `v${version}`;
const distTag = version.includes("-") ? PRERELEASE_DIST_TAG : LATEST_DIST_TAG;
const packDir = `${Bun.env.TMPDIR ?? "/tmp"}/lyn-release-${crypto.randomUUID()}`;
const notesFile = `${packDir}/notes.md`;

const undoVersion = async () => {
  await $`git tag -d ${tag}`.quiet().nothrow();
  await $`git reset --hard HEAD~1`.quiet();
  await $`rm -rf ${packDir}`;
};

let tarball = "";
try {
  if (await isPublished(name, version)) throw new Error(`${name}@${version} is already on npm`);

  step("Pack");
  tarball = (await $`bun pm pack --destination ${packDir} --quiet`.text()).trim();

  step("Release notes");
  const notes = await buildReleaseNotes(previousTag, tag);
  await Bun.write(notesFile, notes);
  console.log(notes);

  if (dryRun) {
    step(`Dry run: publish on the "${distTag}" dist-tag`);
    await $`bun publish ${tarball} --tag ${distTag} --dry-run`;
  }
} catch (error) {
  await undoVersion();
  fail(`${error instanceof Error ? error.message : String(error)}\n  The version commit and tag were removed.`);
}

if (dryRun) {
  await undoVersion();
  console.log(`\n✔ Dry run of ${tag} done; the version commit and tag were removed.`);
  process.exit(0);
}

const publishArgs = ["bun", "publish", tarball, "--tag", distTag];
const githubReleaseArgs = [
  "gh", "release", "create", tag, tarball,
  "--title", tag,
  "--notes-file", notesFile,
  "--verify-tag",
  ...(distTag === PRERELEASE_DIST_TAG ? ["--prerelease"] : []),
];

step(`Push ${tag}`);
try {
  await $`git push --atomic ${REMOTE} ${RELEASE_BRANCH} ${tag}`;
} catch {
  await undoVersion();
  fail("The push failed; the version commit and tag were removed.");
}

step(`Publish to npm on the "${distTag}" dist-tag`);
try {
  await runInteractive(publishArgs);
} catch {
  failWithRecovery(`${tag} is pushed but not on npm.`, [publishArgs, githubReleaseArgs]);
}

step("GitHub release");
try {
  await $`${githubReleaseArgs}`;
} catch {
  failWithRecovery(`${tag} is on npm but has no GitHub release.`, [githubReleaseArgs]);
}
await $`rm -rf ${packDir}`;

console.log(`\n✔ ${tag} released: npm (${distTag}), git tag and GitHub release with its tarball.`);
