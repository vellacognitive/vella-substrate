// Local component baseline; parameters are fixed in docs/remediation/local-reference.md.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider, actionDigest } from "../sdk/node/index.js";
const key = await readFile(new URL("../sdk/node/test/fixtures/test-signing-private.pem", import.meta.url), "utf8");
const pub = await readFile(new URL("../sdk/node/test/fixtures/test-signing-public.pem", import.meta.url), "utf8");
const policy = { policyVersion: "baseline-v1", defaultScope: "reports", evidenceBits: { AUTHN: 1, AUTHZ: 2, FRESH: 4, APPROVAL: 8 }, scopes: { reports: { intents: { EXPORT: 15 } } } };
const directory = await mkdtemp(join(tmpdir(), "vella-baseline-"));
const expiresAt = Date.now() + 60000;
const providers = new Map();
const actions = Array.from({ length: 40 }, (_, index) => {
  const action = { server: "baseline", tool: "export", definition_digest: actionDigest({ revision: 1 }), principal: { id: "operator" }, resource: { id: `report-${index}`, version: "absent" }, arguments: { content: "x".repeat(1024), index } };
  const state = { session: { id: "session", principalId: "operator", expiresAt, revoked: index % 5 === 0 },
    permissions: [{ id: `permission-${index}`, principalId: "operator", server: "baseline", tool: "export", resourceId: action.resource.id, expiresAt, revoked: false }],
    approval: { id: `approval-${index}`, principalId: "operator", actionDigest: actionDigest(action), policyDigest: actionDigest(policy), expiresAt, revoked: false } };
  providers.set(action.resource.id, createOperatorEvidenceProvider({ loadState: () => state }));
  return action;
});
const sink = createLocalProofSink({ directory });
const failedRetentions = new Set();
const evidenceProvider = { resolve(binding) { if (binding.action.arguments.index % 5 === 1) failedRetentions.add(binding.attemptId); return providers.get(binding.action.resource.id).resolve(binding); } };
const gate = createExecutionGate({ policy, signingKey: key, publicKey: pub, evidenceProvider,
  proofSink: { ...sink, retainAuthorization(input) { if (failedRetentions.has(input.attemptId)) throw new Error("injected baseline retention fault"); return sink.retainAuthorization(input); } } });
try {
  const results = []; let next = 0;
  const start = performance.now();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < actions.length) {
      const action = actions[next++];
      results.push(await gate.execute({ action, intent: "EXPORT", precondition: () => true,
        invoke: async effective => { await writeFile(join(directory, `${effective.resource.id}.txt`), effective.arguments.content, { flag: "wx" }); return { content: [] }; } }));
    }
  }));
  const elapsedMs = performance.now() - start;
  const effects = (await readdir(directory)).filter(name => name.endsWith(".txt")).length;
  assert.equal(effects, 24);
  assert.equal(results.filter(r => r.outcome === "reported_success").length, 24);
  assert.equal(results.filter(r => r.outcome === "not_started").length, 16);
  const stages = {};
  for (const result of results) for (const [stage, duration] of Object.entries(result.timings)) (stages[stage] ??= []).push(duration);
  const distributions = Object.fromEntries(Object.entries(stages).map(([stage, values]) => {
    values.sort((a, b) => a - b);
    return [stage, { samples: values.length, medianMs: values[Math.floor(values.length / 2)], p95Ms: values[Math.ceil(values.length * .95) - 1], maxMs: values.at(-1) }];
  }));
  const report = { kind: "local-component-baseline", node: process.version, platform: process.platform, attempts: 40, concurrency: 4, contentBytes: 1024,
    elapsedMs, effects, prevented: 16, distributions, acceptedPerformanceThreshold: false,
    limitations: ["Component workload, not MCP transport load", "Short local baseline, not sustained load", "No agreed deployment latency/error targets"] };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
