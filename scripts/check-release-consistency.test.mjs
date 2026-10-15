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
const mcpVersion = JSON.parse(readFileSync(join(repositoryRoot, "integrations/mcp-server/package.json"), "utf8")).version;
const mcpTag = `mcp-v${mcpVersion}`;
const releaseTag = `v${releaseVersion}`;
const releaseFiles = [
  "integrations/mcp-server/package.json",
  "integrations/mcp-server/CHANGELOG.md",
  "integrations/mcp-server/package-lock.json",
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

  const mcpNotes = join(fixtureRoot, "integrations/mcp-server/CHANGELOG.md");
  writeFileSync(mcpNotes, readFileSync(mcpNotes, "utf8").replace(new RegExp(`(## \\[${mcpVersion.replaceAll(".", "\\.")}\\] - )[^\\n]+`), "$1Unreleased"));

  runGit(fixtureRoot, "init", "--quiet");
  runGit(fixtureRoot, "config", "user.name", "VELLA Release Test");
  runGit(fixtureRoot, "config", "user.email", "release-test@example.invalid");
  runGit(fixtureRoot, "add", ".");
  runGit(fixtureRoot, "commit", "--quiet", "-m", "release fixture");
  runGit(fixtureRoot, "tag", releaseTag);
  runGit(fixtureRoot, "tag", mcpTag);
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


test("rejects an unbounded MCP compatibility claim", t => {
  const fixtureRoot = createTaggedRepository(t);
  const path = join(fixtureRoot, "integrations/mcp-server/package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.peerDependencies["@vellacognitive/vella-sdk"] = "*";
  writeFileSync(path, JSON.stringify(pkg));
  const result = checkRelease(fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MCP peer and locked local SDK must exactly match/);
});

test("rejects mismatched MCP package versions", t => {
  const fixtureRoot = createTaggedRepository(t);
  const path = join(fixtureRoot, "integrations/mcp-server/package-lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8"));
  lock.version = "999.0.0";
  writeFileSync(path, JSON.stringify(lock));
  const result = checkRelease(fixtureRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MCP package and lockfile/);
});


test("refuses release publication when the MCP package is private", (t) => {
  const fixtureRoot = createTaggedRepository(t);
  const path = join(fixtureRoot, "integrations/mcp-server/package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.private = true;
  writeFileSync(path, JSON.stringify(pkg));
  const result = checkRelease(fixtureRoot, "--require-released");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must permit public publication/);
});

test("MCP candidate tag is versioned independently and cannot publish unreleased notes", t => {
  const root = createTaggedRepository(t);
  assert.equal(checkRelease(root, '--tag', mcpTag, '--require-tagged-head').status, 0);
  const blocked = checkRelease(root, '--tag', mcpTag, '--require-released', '--require-tagged-head');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /MCP CHANGELOG.md still marks .* as Unreleased/);
  const path = join(root, 'integrations/mcp-server/CHANGELOG.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace(`## [${mcpVersion}] - Unreleased`, `## [${mcpVersion}] - 2000-01-01`));
  runGit(root, 'add', '.');
  runGit(root, 'commit', '--quiet', '-m', 'release MCP fixture');
  // Old tag must not validate the new release checkout.
  assert.equal(checkRelease(root, '--tag', mcpTag, '--require-released', '--require-tagged-head').status, 1);
  runGit(root, 'tag', '--force', mcpTag);
  const released = checkRelease(root, '--tag', mcpTag, '--require-released', '--require-tagged-head');
  assert.equal(released.status, 0, released.stderr);
  const mismatch = checkRelease(root, '--tag', 'mcp-v999.0.0');
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /does not match package version/);
});

test("publish workflow routes MCP only through explicit MCP-tag dispatch", t => {
  const workflow = readFileSync(join(repositoryRoot, '.github/workflows/publish.yml'), 'utf8');
  const script = workflow.split('      - name: Validate release tag\n')[1].split('        run: |\n')[1].split('\n      - uses:')[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'vella-release-routing-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const output = join(dir, 'output');
  for (const [tag, event, registry, component] of [
    [mcpTag, 'workflow_dispatch', 'mcp', 'mcp'],
    [releaseTag, 'release', '', 'sdk'],
    [releaseTag, 'workflow_dispatch', 'both', 'sdk'],
    [releaseTag, 'workflow_dispatch', 'npm', 'sdk'],
    [releaseTag, 'workflow_dispatch', 'pypi', 'sdk'],
    [mcpTag, 'release', '', null],
    [mcpTag, 'workflow_dispatch', 'both', null],
    [mcpTag, 'workflow_dispatch', 'npm', null],
    [mcpTag, 'workflow_dispatch', 'pypi', null],
    [releaseTag, 'workflow_dispatch', 'mcp', null],
    [`${mcpTag}$(uname)`, 'workflow_dispatch', 'mcp', null],
    ['mcp-v01.1.1', 'workflow_dispatch', 'mcp', null],
  ]) {
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-e', '-c', script], {encoding:'utf8', env:{...process.env, RELEASE_TAG:tag, RELEASE_EVENT:event, RELEASE_TARGET:registry, GITHUB_OUTPUT:output}});
    assert.equal(result.status, component ? 0 : 1, `${tag}/${event}/${registry}: ${result.stderr}`);
    if (component) assert.match(readFileSync(output, 'utf8'), new RegExp(`^component=${component}$`, 'm'));
  }
});
