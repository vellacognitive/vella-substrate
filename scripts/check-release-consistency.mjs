import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function fail(message) {
  process.stderr.write(`release consistency: ${message}\n`);
  process.exitCode = 1;
}

function matchVersion(path, pattern, label) {
  const match = read(path).match(pattern);
  if (!match) {
    fail(`could not read ${label} from ${path}`);
    return null;
  }
  return match[1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gitRevision(revision) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", revision], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
const expectedCommitIndex = args.indexOf("--expected-commit");
const expectedCommit = expectedCommitIndex >= 0 ? args[expectedCommitIndex + 1] : undefined;
const requireReleased = args.includes("--require-released");
const requireTaggedHead = args.includes("--require-tagged-head");
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const stableTagPattern = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
const fullCommitPattern = /^[0-9a-f]{40}$/i;

if (tagIndex >= 0 && !tag) {
  fail("--tag requires a value such as v1.0.3");
}

if (expectedCommitIndex >= 0 && !expectedCommit) {
  fail("--expected-commit requires a full 40-character commit SHA");
}

if (expectedCommit && !fullCommitPattern.test(expectedCommit)) {
  fail("--expected-commit must be a full 40-character commit SHA");
}

if (requireTaggedHead && !tag) {
  fail("--require-tagged-head requires --tag");
}

const tagMatch = tag?.match(stableTagPattern);
if (tag && !tagMatch) {
  fail(`tag ${JSON.stringify(tag)} is not a stable release tag such as v1.0.3`);
}

const nodePackage = JSON.parse(read("sdk/node/package.json"));
const nodeLock = JSON.parse(read("sdk/node/package-lock.json"));
const versions = new Map([
  ["sdk/node/package.json", nodePackage.version],
  ["sdk/node/package-lock.json", nodeLock.version],
  ["sdk/node/package-lock.json root package", nodeLock.packages?.[""]?.version],
  [
    "sdk/python/pyproject.toml",
    matchVersion(
      "sdk/python/pyproject.toml",
      /^version\s*=\s*"([^"]+)"/m,
      "Python project version",
    ),
  ],
  [
    "sdk/python/vella/__init__.py",
    matchVersion(
      "sdk/python/vella/__init__.py",
      /^__version__\s*=\s*"([^"]+)"/m,
      "Python exported version",
    ),
  ],
  [
    "CITATION.cff",
    matchVersion("CITATION.cff", /^version:\s*["']?([^\s"']+)["']?$/m, "citation version"),
  ],
]);

const expectedVersion = nodePackage.version;
for (const [label, version] of versions) {
  if (version !== expectedVersion) {
    fail(`${label} reports ${String(version)}, expected ${expectedVersion}`);
  }
}

if (!stableVersionPattern.test(expectedVersion)) {
  fail(`package version ${expectedVersion} is not a stable semantic version`);
}

if (tagMatch) {
  const tagVersion = tagMatch[1];
  if (tagVersion !== expectedVersion) {
    fail(`tag ${tag} does not match package version ${expectedVersion}`);
  }
}

if (requireTaggedHead && tagMatch) {
  const tagCommit = gitRevision(`refs/tags/${tag}^{commit}`);
  const headCommit = gitRevision("HEAD");
  if (!tagCommit) {
    fail(`tag ${tag} does not resolve to a commit in this checkout`);
  } else if (!headCommit) {
    fail("could not resolve HEAD in this checkout");
  } else if (tagCommit !== headCommit) {
    fail(`tag ${tag} resolves to ${tagCommit}, but HEAD is ${headCommit}`);
  }
}

if (expectedCommit) {
  const expectedCommitResolved = gitRevision(`${expectedCommit}^{commit}`);
  const headCommit = gitRevision("HEAD");
  if (!expectedCommitResolved) {
    fail(`expected commit ${expectedCommit} does not resolve in this checkout`);
  } else if (!headCommit) {
    fail("could not resolve HEAD in this checkout");
  } else if (expectedCommitResolved !== headCommit) {
    fail(`release event commit is ${expectedCommitResolved}, but HEAD is ${headCommit}`);
  }
}

const changelog = read("CHANGELOG.md");
if (!/^## \[Unreleased\]$/m.test(changelog)) {
  fail("CHANGELOG.md must contain a top-level [Unreleased] section");
}

const releaseHeading = new RegExp(
  `^## \\[${escapeRegExp(expectedVersion)}\\] - (Unreleased|\\d{4}-\\d{2}-\\d{2})$`,
  "m",
);
const releaseMatch = changelog.match(releaseHeading);
if (!releaseMatch) {
  fail(`CHANGELOG.md has no release heading for ${expectedVersion}`);
} else if (requireReleased && releaseMatch[1] === "Unreleased") {
  fail(`CHANGELOG.md still marks ${expectedVersion} as Unreleased`);
}

if (process.exitCode) {
  process.exit();
}

process.stdout.write(`release consistency: ${expectedVersion} is aligned across all release surfaces\n`);
