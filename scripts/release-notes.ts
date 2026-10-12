import { $ } from "bun";

const CONVENTIONAL_SUBJECT = /^(?<type>\w+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<summary>.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;
const FIELD_SEPARATOR = "\x1f";
const COMMIT_SEPARATOR = "\x1e";

const BREAKING_SECTION = "Breaking changes";
const SECTION_BY_TYPE: Record<string, string> = { feat: "Features", fix: "Fixes", perf: "Performance" };
const SECTION_ORDER = [BREAKING_SECTION, ...Object.values(SECTION_BY_TYPE)];

type Commit = {
  hash: string;
  type: string;
  scope: string | undefined;
  summary: string;
  breaking: boolean;
};

const parseCommit = (record: string): Commit | undefined => {
  const [hash = "", subject = "", body = ""] = record.split(FIELD_SEPARATOR);
  const groups = CONVENTIONAL_SUBJECT.exec(subject.trim())?.groups;
  if (!groups?.type || !groups.summary) return undefined;
  return {
    hash: hash.trim(),
    type: groups.type,
    scope: groups.scope,
    summary: groups.summary,
    breaking: groups.breaking === "!" || BREAKING_FOOTER.test(body),
  };
};

const sectionOf = (commit: Commit) =>
  commit.breaking ? BREAKING_SECTION : SECTION_BY_TYPE[commit.type];

const formatCommit = ({ hash, scope, summary }: Commit) =>
  `- ${scope ? `**${scope}:** ` : ""}${summary} (${hash})`;

const readCommits = async (range: string) => {
  const log = await $`git log ${range} --format=${`%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${COMMIT_SEPARATOR}`}`.text();
  return log
    .split(COMMIT_SEPARATOR)
    .map(parseCommit)
    .filter((commit) => commit !== undefined);
};

export const findPreviousTag = async () => {
  const describe = await $`git describe --tags --abbrev=0 --match ${"v*"}`.quiet().nothrow();
  return describe.exitCode === 0 ? describe.stdout.toString().trim() : undefined;
};

export const buildReleaseNotes = async (previousTag: string | undefined, tag: string) => {
  const commits = await readCommits(previousTag ? `${previousTag}..HEAD` : "HEAD");
  const sections = SECTION_ORDER.map((title) => ({
    title,
    lines: commits.filter((commit) => sectionOf(commit) === title).map(formatCommit),
  }))
    .filter(({ lines }) => lines.length > 0)
    .map(({ title, lines }) => `## ${title}\n\n${lines.join("\n")}`);

  const repositoryUrl = (await $`gh repo view --json url --jq .url`.text()).trim();
  const changelog = previousTag
    ? `**Full changelog**: ${repositoryUrl}/compare/${previousTag}...${tag}`
    : `**Full changelog**: ${repositoryUrl}/commits/${tag}`;

  return [...sections, changelog].join("\n\n");
};
