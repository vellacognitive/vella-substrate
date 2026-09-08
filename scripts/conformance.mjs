// One entry point for the local checks; install documented development deps first.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python = process.env.VELLA_VERIFY_PYTHON || "python3";
const environment = { ...process.env, VELLA_VERIFY_PYTHON: python, VELLA_EXPERIMENT_PYTHON: python };
const reportIndex = process.argv.indexOf("--report");
const reportPath = reportIndex < 0 ? null : resolve(process.argv[reportIndex + 1]);
const logFolder = reportPath ? join(dirname(reportPath), "conformance-logs") : null;
if (logFolder) mkdirSync(logFolder, { recursive: true });
const checks = [
  ["node-sdk", "npm", ["test"], "sdk/node"],
  ["python-sdk", python, ["-m", "pytest", "-q"], "sdk/python"],
  ["python-lint", python, ["-m", "ruff", "check", "."], "sdk/python"],
  ["python-types", python, ["-m", "mypy", "--strict", "vella/"], "sdk/python"],
  ["action", process.execPath, ["--test", "integrations/github-action/gate.test.mjs"], "."],
  ["release-tests", process.execPath, ["--test", "scripts/check-release-consistency.test.mjs"], "."],
  ["migration-rollback", process.execPath, ["scripts/check-migration.mjs"], "."],
  ["release-metadata", process.execPath, ["scripts/check-release-consistency.mjs"], "."],
  ["production-proofs", process.execPath, ["--test", "scripts/proof-conformance.test.mjs"], "."],
  ["mcp-experiment", "npm", ["test"], "integrations/mcp-experiment"],
  ["mcp-experiment-demo", "npm", ["run", "demo"], "integrations/mcp-experiment"],
  ["mcp-server", "npm", ["test"], "integrations/mcp-server"],
  ["mcp-types", "npm", ["run", "typecheck"], "integrations/mcp-server"],
  ["mcp-installed-source-demo", "npm", ["run", "demo"], "integrations/mcp-server"],
  ["diff-whitespace", "git", ["diff", "--check"], "."],
];
if (process.argv.includes("--packages")) checks.push(["package-installation", process.execPath, ["scripts/check-package-install.mjs"], "."]);
const results = [];
for (const [name, command, args, directory] of checks) {
  const result = spawnSync(command, args, { cwd: join(root, directory), env: environment, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const output = `${result.stdout || ""}${result.stderr || ""}${result.error || ""}`;
  if (logFolder) writeFileSync(join(logFolder, `${name}.log`), output);
  results.push({ name, passed: result.status === 0, exitCode: result.status });
  console.log(`${result.status === 0 ? "PASS" : "FAIL"} ${name}`);
  if (result.status !== 0) console.log(output.slice(-4000));
}
const legacy = [];
for (const family of ["valid", "tampered"]) for (const file of readdirSync(join(root, "test-vectors", family)).filter(name => name.endsWith(".json"))) {
  for (const [runtime, command, args] of [["node", process.execPath, ["verify/verify.js"]], ["python", python, ["verify/verify.py"]], ["openssl", "bash", ["verify/verify.sh"]]]) {
    const result = spawnSync(command, [...args, `test-vectors/${family}/${file}`, "examples/example-signing.pub"], { cwd: root, encoding: "utf8", env: environment });
    legacy.push({ file: `${family}/${file}`, runtime, expected: family === "valid" ? "accept" : "reject", passed: (result.status === 0) === (family === "valid") });
  }
}
results.push({ name: "legacy-vectors", passed: legacy.every(row => row.passed), cases: legacy.length });
console.log(`${legacy.every(row => row.passed) ? "PASS" : "FAIL"} legacy-vectors (${legacy.length})`);
const git = args => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
const report = { baseCommit: git(["rev-parse", "HEAD"]), branch: git(["branch", "--show-current"]), workingTree: git(["status", "--porcelain"]) ? "uncommitted candidate; not an immutable release" : "clean committed candidate; not a published release", node: process.version,
  python: spawnSync(python, ["--version"], { encoding: "utf8" }).stdout.trim(), generatedAt: new Date().toISOString(), checks: results, legacy,
  allPassed: results.every(row => row.passed) };
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.allPassed ? 0 : 1;
