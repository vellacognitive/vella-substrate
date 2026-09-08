import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm, rename } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir, cpus, platform, release } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { setup, approveBatch, connect } from "../example/local-harness.mjs";
import { verifyProofV2, actionDigest } from "@vellacognitive/vella-sdk";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const options = process.argv.slice(2), smoke = options.includes("--smoke");
const arg = (name, fallback) => { const i = options.indexOf(name); return i < 0 ? fallback : options[i + 1]; };
const output = resolve(arg("--output", "operational-results.json"));
const planPath = resolve(arg("--plan", fileURLToPath(new URL("./plan.json", import.meta.url))));
const planBytes = await readFile(planPath), plan = JSON.parse(planBytes);
const sourceFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root }).toString().split("\0").filter(Boolean).sort();
const files = [];
for (const path of sourceFiles) files.push({ path, sha256: createHash("sha256").update(await readFile(join(root, path))).digest("hex") });
const sourceDigest = actionDigest(files);
const report = { kind: "vella-operational-results-v1", startedAt: new Date().toISOString(), acceptanceRun: !smoke, plan, planSha256: createHash("sha256").update(planBytes).digest("hex"),
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim(), sourceDigest, files,
  machine: { cpu: cpus()[0].model, cpuCount: cpus().length, platform: platform(), release: release(), node: process.version }, scenarios: [], status: "running" };
await mkdir(dirname(output), { recursive: true });
const save = () => writeFile(output, JSON.stringify(report, null, 2) + "\n");
await save();
function quantiles(values) {
  if (!values.length) return { samples: 0 };
  const a = [...values].sort((x,y) => x-y), at = q => a[Math.min(a.length-1, Math.floor(a.length*q))];
  return { samples: a.length, p50: at(.5), p95: at(.95), p99: at(.99), max: a.at(-1), mean: a.reduce((s,x)=>s+x,0)/a.length };
}
const cases = plan.contentBytes.flatMap(bytes => plan.concurrency.map(concurrency => ({ mode: "healthy", bytes, concurrency, seconds: smoke ? 1 : plan.durationSeconds })))
  .concat(plan.faults.map(mode => ({ mode, bytes: 4096, concurrency: plan.faultConcurrency, seconds: smoke ? 1 : plan.faultDurationSeconds })));
for (const scenario of cases) {
  const directory = await mkdtemp(join(tmpdir(), "vella-operational-"));
  const f = await setup(directory); let client, serial = 0, completed = 0, lastProgress = 0;
  const samples = [], expected = [], unexpected = [];
  const signingKey = await readFile(f.config.signingKeyPath);
  f.config.buildHash = sourceDigest; await writeFile(f.configPath, JSON.stringify(f.config));
  try {
    if (scenario.mode === "signing") await writeFile(f.config.signingKeyPath, "invalid signing key");
    if (scenario.mode === "authorization-storage") { await rm(f.config.proofDirectory, { recursive: true }); await writeFile(f.config.proofDirectory, "injected unavailable directory"); }
    client = await connect(f.configPath, scenario.mode === "receipt-storage" ? fileURLToPath(new URL("../test/receipt-fault-server.mjs", import.meta.url)) : undefined);
    async function wave(mode, measured) {
      const requests = Array.from({ length: scenario.concurrency }, () => ({ reportId: `report-${serial++}`, content: "x".repeat(scenario.bytes) }));
      const state = await approveBatch(f.config, requests);
      if (mode === "mixed-evidence") {
        state.approvals.forEach((approval, i) => { if (i % 2 === 0) approval.revoked = true; });
        const path = `${f.config.evidenceStatePath}.fault.tmp`; await writeFile(path, JSON.stringify(state)); await rename(path, f.config.evidenceStatePath);
      }
      await Promise.all(requests.map(async (args, i) => {
        const shouldExecute = ["healthy", "receipt-storage"].includes(mode) || (mode === "mixed-evidence" && i % 2 === 1);
        const started = performance.now(); let result, error;
        try { result = await client.callTool({ name: "exportReport", arguments: args }); } catch (caught) { error = String(caught); }
        const elapsed = performance.now() - started, governance = result?._meta?.["com.vellacognitive/governance"];
        const wantReason = mode === "signing" ? "SIGNING_UNAVAILABLE" : mode === "authorization-storage" ? "RETENTION_UNAVAILABLE" : "EVIDENCE_UNAVAILABLE";
        const correct = !error && (shouldExecute
          ? governance?.outcome === "reported_success" && governance.authorizationRetained && governance.receiptRetained === (mode !== "receipt-storage")
          : governance?.outcome === "not_started" && governance.reason === wantReason && governance.eligible === false && !governance.authorizationRetained);
        if (!correct) unexpected.push({ reportId: args.reportId, mode, error, governance });
        expected.push({ reportId: args.reportId, shouldExecute, receipt: shouldExecute && mode !== "receipt-storage", governance, measured });
        if (measured) { samples.push({ elapsed, timings: governance?.timings ?? {}, shouldExecute }); completed++; }
      }));
    }
    for (let i=0; i < plan.warmupBatches; i++) await wave(scenario.mode, false);
    const started = performance.now();
    do {
      const waveStart = performance.now(); await wave(scenario.mode, true);
      if (scenario.mode !== "healthy") await new Promise(resolve => setTimeout(resolve, Math.max(0, scenario.concurrency / plan.faultCallsPerSecondLimit * 1000 - (performance.now()-waveStart))));
      const elapsedSeconds = (performance.now() - started)/1000;
      if (elapsedSeconds-lastProgress >= 15) { console.log(JSON.stringify({ mode: scenario.mode, bytes: scenario.bytes, concurrency: scenario.concurrency, elapsedSeconds, completed, unexpected: unexpected.length })); lastProgress = elapsedSeconds; }
      if (unexpected.length) break;
    } while (performance.now()-started < scenario.seconds*1000);
    const elapsedMs = performance.now()-started;
    await client.close(); client = null;
    const recoveryStart = expected.length;
    if (scenario.mode !== "healthy") {
      await writeFile(f.config.signingKeyPath, signingKey);
      if (scenario.mode === "authorization-storage") { await rm(f.config.proofDirectory); await mkdir(f.config.proofDirectory, { mode: 0o700 }); }
      client = await connect(f.configPath);
      await wave("healthy", false); await wave("healthy", false); await client.close(); client = null;
    }
    let verifiedProofs = 0, verifiedReceipts = 0, effects = 0;
    for (const attempt of expected) {
      const path = join(f.config.reportDirectory, `${attempt.reportId}.txt`);
      if (!attempt.shouldExecute) { await assert.rejects(readFile(path), { code: "ENOENT" }); continue; }
      assert.equal(await readFile(path, "utf8"), "x".repeat(scenario.bytes)); effects++;
      const result = attempt.governance; assert.ok(result, "missing governance result");
      const bundle = JSON.parse(await readFile(join(f.config.proofDirectory, `${result.attemptId}.authorization.json`), "utf8"));
      const verified = verifyProofV2(bundle, f.publicKey); assert.equal(verified.ok, true); verifiedProofs++;
      assert.equal(verified.authenticated.action.arguments.reportId, attempt.reportId);
      assert.equal(verified.authenticated.action.arguments.content, "x".repeat(scenario.bytes));
      assert.equal(verified.authenticated.build_hash, sourceDigest);
      assert.equal(verified.authenticated.evidence.attempt_id, result.attemptId);
      const receiptPath = join(f.config.proofDirectory, `${result.attemptId}.receipt.json`);
      if (attempt.receipt) { const receipt = JSON.parse(await readFile(receiptPath, "utf8")); assert.deepEqual(receipt, result.receipt); assert.equal(receipt.authorization_hash, bundle.payload_hash); verifiedReceipts++; }
      else await assert.rejects(readFile(receiptPath), { code: "ENOENT" });
    }
    assert.equal((await readdir(f.config.reportDirectory)).length, effects);
    assert.equal((await readdir(f.config.proofDirectory)).length, verifiedProofs+verifiedReceipts);
    const endToEndMs = quantiles(samples.map(s=>s.elapsed));
    const stages = [...new Set(samples.flatMap(s=>Object.keys(s.timings)))];
    const p95Limit = scenario.concurrency === 1 ? plan.thresholds.singleP95Ms : plan.thresholds.concurrentP95Ms;
    const row = { ...scenario, elapsedMs, measuredCalls: samples.length, throughputCallsPerSecond: samples.length/(elapsedMs/1000),
      successCalls: samples.filter(s=>s.shouldExecute).length, expectedStoppedCalls: samples.filter(s=>!s.shouldExecute).length,
      endToEndMs, stagesMs: Object.fromEntries(stages.map(name=>[name, quantiles(samples.map(s=>s.timings[name]).filter(Number.isFinite))])),
      unexpected, effectsIncludingWarmupAndRecovery: effects, verifiedProofs, verifiedReceipts, recoveryCalls: expected.length-recoveryStart,
      passed: unexpected.length === 0 && (smoke || (endToEndMs.p95 <= p95Limit && endToEndMs.p99 <= plan.thresholds.p99Ms)),
      limits: { p95Ms: p95Limit, p99Ms: plan.thresholds.p99Ms } };
    report.scenarios.push(row); await save(); console.log(JSON.stringify({ completed: row.mode, bytes: row.bytes, concurrency: row.concurrency, measuredCalls: row.measuredCalls, passed: row.passed, endToEndMs }));
  } catch (error) {
    report.scenarios.push({ ...scenario, passed: false, error: String(error), unexpected }); await save(); throw error;
  } finally { await client?.close(); await rm(directory, { recursive: true, force: true }); }
}
report.status = "complete"; report.finishedAt = new Date().toISOString(); report.allPassed = report.scenarios.every(s=>s.passed); await save();
process.exitCode = report.allPassed ? 0 : 1;
