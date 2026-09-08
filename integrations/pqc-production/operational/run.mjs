import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm, rename } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir, cpus, platform, release } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {statfs, stat} from 'node:fs/promises';

const root = fileURLToPath(new URL("../../../", import.meta.url));
const options = process.argv.slice(2), smoke = options.includes("--smoke");
const arg = (name, fallback) => { const i = options.indexOf(name); return i < 0 ? fallback : options[i + 1]; };
const app = resolve(arg('--app', 'installed-app'));
const profile = arg('--profile', 'hybrid'), soak = options.includes('--soak');
if (!['hybrid', 'classical'].includes(profile)) throw new Error('explicit workload profile required');
const require = createRequire(join(app, 'package.json'));
const load = name => import(pathToFileURL(require.resolve(name)));
const {verifyProofV2, actionDigest} = await load('@vellacognitive/vella-sdk');
const {verifyProofV3, SUITE} = await load('@vellacognitive/vella-sdk/pqc/index.js');
const mcpRoot = dirname(dirname(dirname(require.resolve('@vellacognitive/vella-mcp-server/pqc/operator'))));
const {setup, approveBatch} = await import(pathToFileURL(join(mcpRoot, profile === 'hybrid' ? 'example/pqc/operator.mjs' : 'example/local-harness.mjs')));
const {Client} = await load('@modelcontextprotocol/client');
const {StdioClientTransport} = await load('@modelcontextprotocol/client/stdio');
async function connect(configPath, mode, metricsPath) {
  const client = new Client({name:'v3-qualification', version:'1.0.0'}, {versionNegotiation:{mode:{pin:'2026-07-28'}}});
  const transport = new StdioClientTransport({command:process.execPath, args:[fileURLToPath(new URL('./server.mjs',import.meta.url)),configPath,app,mode,metricsPath,profile]});
  try { await client.connect(transport); await client.listTools(); } catch (error) { await transport.close(); throw error; }
  return client;
}
const output = resolve(arg("--output", "operational-results.json"));
const planPath = resolve(arg("--plan", fileURLToPath(new URL("../../mcp-server/operational/plan.json", import.meta.url))));
const planBytes = await readFile(planPath), plan = JSON.parse(planBytes);
const sourceFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root }).toString().split("\0").filter(Boolean).sort();
const files = [];
for (const path of sourceFiles) files.push({ path, sha256: createHash("sha256").update(await readFile(join(root, path))).digest("hex") });
const sourceDigest = actionDigest(files);
const report = { kind: "vella-operational-results-v1", startedAt: new Date().toISOString(), acceptanceRun: !smoke, plan, planSha256: createHash("sha256").update(planBytes).digest("hex"),
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim(), sourceDigest, files, profile, soak, installedApplication: app, installedLockSha256: createHash("sha256").update(await readFile(join(app,"package-lock.json"))).digest("hex"),
  machine: { cpu: cpus()[0].model, cpuCount: cpus().length, platform: platform(), release: release(), node: process.version }, scenarios: [], status: "running" };
await mkdir(dirname(output), { recursive: true });
const save = () => writeFile(output, JSON.stringify(report, null, 2) + "\n");
await save();
function quantiles(values) {
  if (!values.length) return { samples: 0 };
  const a = [...values].sort((x,y) => x-y), at = q => a[Math.min(a.length-1, Math.floor(a.length*q))];
  return { samples: a.length, p50: at(.5), p95: at(.95), p99: at(.99), max: a.at(-1), mean: a.reduce((s,x)=>s+x,0)/a.length };
}
const cases = soak ? [{mode:"healthy", bytes:4096, concurrency:8, seconds:smoke ? 10 : 1800}] : plan.contentBytes.flatMap(bytes => plan.concurrency.map(concurrency => ({ mode: "healthy", bytes, concurrency, seconds: smoke ? 1 : plan.durationSeconds })))
  .concat((profile === "hybrid" ? plan.faults : []).map(mode => ({ mode, bytes: 4096, concurrency: plan.faultConcurrency, seconds: smoke ? 1 : plan.faultDurationSeconds })));
for (const scenario of cases) {
  const directory = await mkdtemp(join(tmpdir(), "vella-operational-"));
  const f = await setup(directory); let client, serial = 0, completed = 0, lastProgress = 0;
  const samples = [], expected = [], unexpected = [];
  const metricsPath = join(directory, 'resource.jsonl');
  const disk = await statfs(directory); assert.ok(disk.bavail*disk.bsize >= 10*1024**3, '10 GiB free required');
  let accountedBytes = 10*1024*1024; // Reserve configuration, key history, trust material and telemetry.
  const boundedBytesPerCall = scenario.bytes + 2*1024*1024 + 4096;
  const ensureSpace = () => assert.ok(accountedBytes + scenario.concurrency*boundedBytesPerCall <= 8*1024**3, '8 GiB temporary artifact cap');
  f.config.buildHash = sourceDigest; await writeFile(f.configPath, JSON.stringify(f.config));
  try {
    client = await connect(f.configPath, scenario.mode, metricsPath);
    async function wave(mode, measured) {
      ensureSpace();
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
      // Account actual bytes after each settled wave, outside per-call timing.
      for (const attempt of expected.slice(-requests.length)) {
        for (const path of [join(f.config.reportDirectory, `${attempt.reportId}.txt`), ...['authorization','receipt'].map(kind => join(f.config.proofDirectory, `${attempt.governance?.attemptId}.${kind}.json`))]) {
          try { accountedBytes += (await stat(path)).size; } catch (error) { if(error.code !== 'ENOENT') throw error; }
        }
      }
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
      client = await connect(f.configPath, "healthy", metricsPath);
      await wave("healthy", false); await wave("healthy", false); await client.close(); client = null;
    }
    let verifiedProofs = 0, verifiedReceipts = 0, effects = 0;
    for (const attempt of expected) {
      const path = join(f.config.reportDirectory, `${attempt.reportId}.txt`);
      if (!attempt.shouldExecute) { await assert.rejects(readFile(path), { code: "ENOENT" }); continue; }
      assert.equal(await readFile(path, "utf8"), "x".repeat(scenario.bytes)); effects++;
      const result = attempt.governance; assert.ok(result, "missing governance result");
      const bundle = JSON.parse(await readFile(join(f.config.proofDirectory, `${result.attemptId}.authorization.json`), "utf8"));
      const verified = profile === "hybrid" ? verifyProofV3(bundle, f.publicKeys, SUITE) : verifyProofV2(bundle, f.publicKey); assert.equal(verified.ok, true); verifiedProofs++;
      assert.equal(verified.authenticated.action.arguments.reportId, attempt.reportId);
      assert.equal(verified.authenticated.action.arguments.content, "x".repeat(scenario.bytes));
      assert.equal(verified.authenticated.build_hash, sourceDigest);
      assert.equal(verified.authenticated.evidence.attempt_id, result.attemptId);
      const receiptPath = join(f.config.proofDirectory, `${result.attemptId}.receipt.json`);
      if (attempt.receipt) { const receipt = JSON.parse(await readFile(receiptPath, "utf8")); assert.deepEqual(receipt, result.receipt); assert.equal(receipt.authorization_hash, bundle.payload_hash); verifiedReceipts++; }
      else await assert.rejects(readFile(receiptPath), { code: "ENOENT" });
    }
    assert.equal((await readdir(f.config.reportDirectory)).length, effects);
    assert.equal((await readdir(f.config.proofDirectory)).filter(name => name.endsWith('.json')).length, verifiedProofs+verifiedReceipts);
    const resource = (await readFile(metricsPath, 'utf8').catch(error => { if(error.code === 'ENOENT') return ''; throw error; })).trim().split('\n').filter(Boolean).map(JSON.parse);
    const rss = quantiles(resource.map(s=>s.rss)), eventLoop = quantiles(resource.map(s=>s.eventLoopP99Ms));
    const firstAt = resource[0]?.at ?? 0, lastAt = resource.at(-1)?.at ?? 0;
    const settledRss = quantiles(resource.filter(s=>s.at >= firstAt+30000 && s.at < firstAt+330000).map(s=>s.rss)).p50;
    const lateRss = quantiles(resource.filter(s=>s.at >= lastAt-300000).map(s=>s.rss)).p50;
    const resourcesPassed = resource.length > 0 && rss.max <= 512*1024**2 && resource.at(-1).lifetimeEventLoopP99Ms <= 50 && (!soak || smoke || lateRss <= settledRss+64*1024**2);
    await writeFile(output+`.${report.scenarios.length}.resources.json`, JSON.stringify(resource));
    const endToEndMs = quantiles(samples.map(s=>s.elapsed));
    const stages = [...new Set(samples.flatMap(s=>Object.keys(s.timings)))];
    const p95Limit = scenario.concurrency === 1 ? plan.thresholds.singleP95Ms : plan.thresholds.concurrentP95Ms;
    const row = { ...scenario, elapsedMs, measuredCalls: samples.length, throughputCallsPerSecond: samples.length/(elapsedMs/1000),
      successCalls: samples.filter(s=>s.shouldExecute).length, expectedStoppedCalls: samples.filter(s=>!s.shouldExecute).length,
      endToEndMs, stagesMs: Object.fromEntries(stages.map(name=>[name, quantiles(samples.map(s=>s.timings[name]).filter(Number.isFinite))])),
      resources: {samples:resource.length,rssBytes:rss,perSecondEventLoopP99Ms:eventLoop,eventLoopP99Ms:resource.at(-1)?.lifetimeEventLoopP99Ms,settledRssMedian:settledRss,lateRssMedian:lateRss,artifactBytes:accountedBytes,passed:resourcesPassed}, unexpected, effectsIncludingWarmupAndRecovery: effects, verifiedProofs, verifiedReceipts, recoveryCalls: expected.length-recoveryStart,
      passed: unexpected.length === 0 && resourcesPassed && (smoke || (endToEndMs.p95 <= p95Limit && endToEndMs.p99 <= plan.thresholds.p99Ms)),
      limits: { p95Ms: p95Limit, p99Ms: plan.thresholds.p99Ms } };
    report.scenarios.push(row); await save(); console.log(JSON.stringify({ completed: row.mode, bytes: row.bytes, concurrency: row.concurrency, measuredCalls: row.measuredCalls, passed: row.passed, endToEndMs }));
  } catch (error) {
    report.scenarios.push({ ...scenario, passed: false, error: String(error), unexpected }); await save(); throw error;
  } finally { await client?.close(); await rm(directory, { recursive: true, force: true }); }
}
report.status = "complete"; report.finishedAt = new Date().toISOString(); report.allPassed = report.scenarios.every(s=>s.passed); await save();
process.exitCode = report.allPassed ? 0 : 1;
