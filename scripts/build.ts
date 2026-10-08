import { $, Glob } from "bun";
import { dependencies, peerDependencies } from "../package.json";

const SOURCE_DIR = "src";
const OUT_DIR = "dist";
const ENTRYPOINTS = ["index.ts", "db.ts", "config.ts", "cli/index.ts"].map(
  (entry) => `${SOURCE_DIR}/${entry}`
);
const INTERNAL_SPECIFIER = /(["'])#lyn\/([^"']+)\1/g;

const externalPackages = [...Object.keys(dependencies), ...Object.keys(peerDependencies)];

const bundle = async () => {
  const result = await Bun.build({
    entrypoints: ENTRYPOINTS,
    root: SOURCE_DIR,
    outdir: OUT_DIR,
    target: "bun",
    external: externalPackages.flatMap((name) => [name, `${name}/*`]),
  });
  if (!result.success) throw new AggregateError(result.logs, "bun build failed");
};

const toDistRoot = (declarationPath: string) => {
  const depth = declarationPath.split("/").length - 1;
  return depth === 0 ? "./" : "../".repeat(depth);
};

// tsc keeps the #lyn/* specifiers, and package.json maps them to src/, which is not shipped.
const rewriteInternalSpecifiers = async () => {
  for await (const path of new Glob("**/*.d.ts").scan(OUT_DIR)) {
    const file = Bun.file(`${OUT_DIR}/${path}`);
    const declarations = await file.text();
    await Bun.write(
      file,
      declarations.replace(
        INTERNAL_SPECIFIER,
        (_, quote, target) => `${quote}${toDistRoot(path)}${target}.js${quote}`
      )
    );
  }
};

await $`rm -rf ${OUT_DIR}`;
await bundle();
await $`bun x tsc -p tsconfig.build.json`;
await rewriteInternalSpecifiers();
