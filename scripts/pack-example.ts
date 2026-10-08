import { $ } from "bun";

const EXAMPLE_DIR = "examples/feedback-board";
const TARBALL = "lyn.tgz";

await $`bun pm pack --filename ${EXAMPLE_DIR}/${TARBALL}`;
// Bun reuses the copy it installed from the same tarball path: only remove + add picks up the new one.
await $`bun remove @rouret/lyn`.cwd(EXAMPLE_DIR);
await $`bun add ./${TARBALL}`.cwd(EXAMPLE_DIR);
