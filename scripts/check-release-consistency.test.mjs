import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseVersion = JSON.parse(
  readFileSync(join(repositoryRoot, "sdk/node/package.json"), "utf8"),
).version;
const releaseTag = `v${releaseVersion}`;
const releaseFiles = [
  "CHANGELOG.md",
  "CITATION.cff",
  "scripts/check-release-consistency.mjs",
  "sdk/node/package.json",
  "sdk/node/package-lock.json",
  "sdk/python/pyproject.toml",
  "sdk/python/vella/__init__.py",
];

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function runGit(cwd, ...args) {
  const result = run("git", args, cwd);
  assert.equal(result.status, 0, result.stderr);
}

function gitOutput(cwd, ...args) {
  const result = run("git", args, cwd);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createTaggedRepository(t) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "vella-release-check-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  for (const relativePath of releaseFiles) {
    const destination = join(fixtureRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(repositoryRoot, relativePath), destination);
  }

  const changelogPath = join(fixtureRoot, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8").replace(
    `## [${releaseVersion}] - Unreleased`,
    `## [${releaseVersion}] - 2000-01-01`,
  );
  writeFileSync(changelogPath, changelog, "utf8");

  runGit(fixtureRoot, "init", "--quiet");
  runGit(fixtureRoot, "config", "user.name", "VELLA Release Test");
  runGit(fixtureRoot, "config", "user.email", "release-test@example.invalid");
  runGit(fixtureRoot, "add", ".");
  runGit(fixtureRoot, "commit", "--quiet", "-m", "release fixture");
  runGit(fixtureRoot, "tag", releaseTag);
  return fixtureRoot;
}

function checkRelease(cwd, ...args) {
  return run(process.execPath, ["scripts/check-release-consistency.mjs", ...args], cwd);
}

test("accepts a released stable tag when it identifies HEAD", (t) => {
  const fixtureRoot = createTaggedRepository(t);
  const result = checkRelease(
    fixtureRoot,
    "--tag",
    releaseTag,
    "--require-released",
    "--require-tagged-head",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`${releaseVersion.replaceAll(".", "\\.")} is aligned`));
});

test("rejects a tag that does not identify the checked-out commit", (t) => {
  const fixtureRoot = createTaggedRepository(t);
  writeFileSync(join(fixtureRoot, "post-release.txt"), "different revision\n", "utf8");
  runGit(fixtureRoot, "add", "post-release.txt");
  runGit(fixtureRoot, "commit", "--quiet", "-m", "post-release change");

  const result = checkRelease(
    fixtureRoot,
    "--tag",
    releaseTag,
    "--require-released",
    "--require-tagged-head",
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`tag ${releaseTag} resolves to .* but HEAD is`));
});

test("rejects a moved release tag when HEAD differs from the captured event commit", (t) => {
  const fixtureRoot = createTaggedRepository(t);
  const eventCommit = gitOutput(fixtureRoot, "rev-parse", "HEAD");
  writeFileSync(join(fixtureRoot, "replacement.txt"), "replacement revision\n", "utf8");
  runGit(fixtureRoot, "add", "replacement.txt");
  runGit(fixtureRoot, "commit", "--quiet", "-m", "replacement release revision");
  runGit(fixtureRoot, "tag", "--force", releaseTag);

  const result = checkRelease(
    fixtureRoot,
    "--tag",
    releaseTag,
    "--require-released",
    "--require-tagged-head",
    "--expected-commit",
    eventCommit,
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /release event commit is .* but HEAD is/);
});

test("rejects shell-shaped and noncanonical tags as data", (t) => {
  const fixtureRoot = createTaggedRepository(t);

  const [major, minor, patch] = releaseVersion.split(".");
  for (const tag of [
    `${releaseTag}$(uname)`,
    releaseVersion,
    `v0${major}.${minor}.${patch}`,
  ]) {
    const result = checkRelease(fixtureRoot, "--tag", tag, "--require-released");
    assert.equal(result.status, 1, tag);
    assert.match(result.stderr, /is not a stable release tag/, tag);
  }
});
