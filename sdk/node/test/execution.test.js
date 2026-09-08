import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionGate, createGovernor, createLocalProofSink, createOperatorEvidenceProvider, actionDigest, verifyProofV2 } from "../index.js";
const key = await readFile(new URL("./fixtures/test-signing-private.pem", import.meta.url), "utf8");
const pub = await readFile(new URL("./fixtures/test-signing-public.pem", import.meta.url), "utf8");
const policy = { policyVersion: "reports-v1", defaultScope: "reports", evidenceBits: { AUTHN: 1, AUTHZ: 2, FRESH: 4, APPROVAL: 8 }, scopes: { reports: { intents: { EXPORT_REPORT: 15 } } } };
const action = { server: "reports", tool: "exportReport", definition_digest: actionDigest({ revision: 1 }), principal: { id: "operator" }, resource: { id: "report-1", version: "absent" }, arguments: { reportId: "report-1", content: "café 😀", format: "text" } };
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "vella-execution-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = {
    session: { id: "session-1", principalId: "operator", expiresAt: Date.now() + 60000, revoked: false },
    permissions: [{ id: "permission-1", principalId: "operator", server: "reports", tool: "exportReport", resourceId: "report-1", expiresAt: Date.now() + 60000, revoked: false }],
    approval: { id: "approval-1", principalId: "operator", actionDigest: actionDigest(action), policyDigest: actionDigest(policy), expiresAt: Date.now() + 60000, revoked: false },
  };
  const sink = createLocalProofSink({ directory });
  const provider = createOperatorEvidenceProvider({ loadState: () => state });
  const gate = createExecutionGate({ policy, signingKey: key, publicKey: pub, evidenceProvider: provider, proofSink: sink, ...overrides });
  const observed = [];
  const run = options => gate.execute({ action, intent: "EXPORT_REPORT", requestId: "request-1", precondition: () => true,
    invoke: async effective => { observed.push(effective); await writeFile(join(directory, "report.txt"), effective.arguments.content, { flag: "wx" }); return { content: [{ type: "text", text: "exported" }] }; }, ...options });
  return { directory, state, sink, provider, gate, observed, run };
}

test("mandatory gate retains proof before one invocation and links a retained receipt", async t => {
  const f = await fixture(t);
  const result = await f.run({ invoke: async effective => {
    const files = await readdir(f.directory);
    assert.equal(files.filter(x => x.endsWith("authorization.json")).length, 1);
    f.observed.push(effective);
    assert.ok(Object.isFrozen(effective.arguments));
    return { content: [{ type: "text", text: "done" }] };
  } });
  assert.equal(result.outcome, "reported_success");
  assert.equal(result.eligible, true);
  assert.equal(result.authorizationRetained, true);
  assert.equal(result.receiptRetained, true);
  assert.equal(f.observed.length, 1);
  const bundle = JSON.parse(await readFile(join(f.directory, `${result.attemptId}.authorization.json`), "utf8"));
  const record = verifyProofV2(bundle, pub).authenticated;
  assert.deepEqual(record.action, f.observed[0]);
  assert.equal(record.evidence.attempt_id, result.attemptId);
  assert.equal(result.receipt.authorization_hash, bundle.payload_hash);
  assert.equal(result.receipt.authorization_id, record.envelope_id);
  assert.deepEqual(JSON.parse(await readFile(join(f.directory, `${result.attemptId}.receipt.json`), "utf8")), result.receipt);
});

for (const [name, mutate] of [
  ["missing identity", s => { delete s.session; }],
  ["expired identity", s => { s.session.expiresAt = 0; }],
  ["revoked identity", s => { s.session.revoked = true; }],
  ["wrong principal", s => { s.session.principalId = "other"; }],
  ["missing permission", s => { s.permissions = []; }],
  ["expired permission", s => { s.permissions[0].expiresAt = 0; }],
  ["revoked permission", s => { s.permissions[0].revoked = true; }],
  ["wrong server", s => { s.permissions[0].server = "other"; }],
  ["wrong target", s => { s.permissions[0].resourceId = "other"; }],
  ["wrong case tool", s => { s.permissions[0].tool = "ExportReport"; }],
  ["expired approval", s => { s.approval.expiresAt = 0; }],
  ["revoked approval", s => { s.approval.revoked = true; }],
  ["wrong approval principal", s => { s.approval.principalId = "other"; }],
  ["different action", s => { s.approval.actionDigest = actionDigest({ changed: true }); }],
  ["different policy", s => { s.approval.policyDigest = actionDigest({ changed: true }); }],
]) test(`${name} yields zero invocations`, async t => {
  const f = await fixture(t); mutate(f.state);
  const result = await f.run();
  assert.equal(result.eligible, false);
  assert.equal(result.outcome, "not_started");
  assert.equal(f.observed.length, 0);
  assert.equal((await readdir(f.directory)).length, 0);
});

for (const fault of ["evidence", "evaluate", "sign", "storage", "false-ack"]) test(`${fault} fault stops before invocation with distinct policy state`, async t => {
  const f = await fixture(t);
  const governor = createGovernor(policy);
  const gate = createExecutionGate({ policy, signingKey: fault === "sign" ? "invalid" : key, publicKey: pub,
    governor: fault === "evaluate" ? { ...governor, govern: () => ({ decision: "DENIED", reasonCode: "E_EVALUATOR_INTERNAL" }) } : governor,
    evidenceProvider: fault === "evidence" ? { resolve() { throw new Error("fault"); } } : f.provider,
    proofSink: fault === "storage" ? { ...f.sink, retainAuthorization() { throw new Error("fault"); } } : fault === "false-ack" ? { ...f.sink, retainAuthorization: () => ({ durability: "file-and-directory-fsync", payloadHash: "wrong" }) } : f.sink });
  const result = await gate.execute({ action, intent: "EXPORT_REPORT", precondition: () => true, invoke: () => f.observed.push(1) });
  assert.equal(result.outcome, "not_started");
  assert.equal(f.observed.length, 0);
  assert.equal(result.decision, fault === "evidence" ? null : fault === "evaluate" ? "DENIED" : "ALLOWED");
});

test("policy denial, unknown intent, malformed action and stale resource do not invoke", async t => {
  const f = await fixture(t);
  for (const options of [{ intent: "UNKNOWN" }, { action: { ...action, extra: true } }, { precondition: () => false }]) {
    assert.equal((await f.run(options)).outcome, "not_started");
  }
  assert.equal(f.observed.length, 0);
});

test("revocation during retention prevents execution with authorization still retained", async t => {
  const f = await fixture(t);
  const gate = createExecutionGate({ policy, signingKey: key, publicKey: pub, evidenceProvider: f.provider, proofSink: {
    ...f.sink, async retainAuthorization(value) { const ack = await f.sink.retainAuthorization(value); f.state.approval.revoked = true; return ack; },
  } });
  const result = await gate.execute({ action, intent: "EXPORT_REPORT", precondition: () => true, invoke: () => f.observed.push(1) });
  assert.equal(result.authorizationRetained, true);
  assert.equal(result.receiptRetained, true);
  assert.equal(result.outcome, "not_started");
  assert.equal(f.observed.length, 0);
});

test("cancellation before dispatch does not invoke", async t => {
  const f = await fixture(t);
  assert.equal((await f.run({ signal: AbortSignal.abort() })).reason, "CANCELLED_BEFORE_DISPATCH");
  const controller = new AbortController();
  const result = await f.run({ signal: controller.signal, precondition() { controller.abort(); return true; } });
  assert.equal(result.outcome, "not_started");
  assert.equal(f.observed.length, 0);
});

test("cancellation and thrown error after possible dispatch remain unknown without replay", async t => {
  const f = await fixture(t);
  const controller = new AbortController();
  const result = await f.run({ signal: controller.signal, invoke() { f.observed.push(1); controller.abort(); return new Promise(() => {}); } });
  assert.equal(result.outcome, "unknown");
  assert.equal(result.receiptRetained, true);
  assert.equal(f.observed.length, 1);
  const next = await f.run({ invoke() { f.observed.push(1); throw new Error("may have executed"); } });
  assert.equal(next.outcome, "unknown");
  assert.equal(f.observed.length, 2);
});

test("deadline after dispatch returns unknown for a hung handler", async t => {
  // Trigger the registered deadline only once dispatch starts. Real fsync can
  // exceed 150 ms on CI, correctly cancelling before dispatch instead.
  const deadlines = [];
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    const handle = { callback, delay, cleared: false };
    deadlines.push(handle);
    return handle;
  });
  t.mock.method(globalThis, "clearTimeout", handle => { handle.cleared = true; });
  const f = await fixture(t, { timeoutMs: 150 });
  const result = await f.run({ invoke() {
    f.observed.push(1);
    assert.equal(deadlines[0].delay, 150);
    deadlines[0].callback();
    return new Promise(() => {});
  } });
  assert.equal(result.outcome, "unknown");
  assert.equal(result.reason, "CANCELLED_AFTER_DISPATCH");
  assert.equal(result.authorizationRetained, true);
  assert.equal(result.receiptRetained, true);
  assert.equal(f.observed.length, 1);
  assert.equal(deadlines.length, 2);
  assert.ok(deadlines.every(handle => handle.cleared));
});

test("receipt-storage fault preserves observed success and reports missing receipt", async t => {
  const f = await fixture(t);
  const gate = createExecutionGate({ policy, signingKey: key, publicKey: pub, evidenceProvider: f.provider,
    proofSink: { ...f.sink, retainReceipt() { throw new Error("disk full"); } }, observe() { throw new Error("telemetry offline"); } });
  const result = await gate.execute({ action, intent: "EXPORT_REPORT", precondition: () => true, invoke: () => ({ content: [] }) });
  assert.equal(result.outcome, "reported_success");
  assert.equal(result.receiptRetained, false);
  assert.equal(result.authorizationRetained, true);
});

test("sink refuses overwrite and invalid attempt paths", async t => {
  const f = await fixture(t);
  const result = await f.run();
  await assert.rejects(f.sink.retainReceipt({ attemptId: result.attemptId, receipt: result.receipt }), /EEXIST/);
  await assert.rejects(f.sink.retainReceipt({ attemptId: "../escape", receipt: result.receipt }), /invalid/);
});

test("retention cannot mutate the verified authorization and malformed request IDs do not dispatch", async t => {
  const f = await fixture(t);
  const gate = createExecutionGate({ policy, signingKey: key, publicKey: pub, evidenceProvider: f.provider, proofSink: {
    ...f.sink, retainAuthorization({ bundle }) { bundle.payload = "changed"; return Promise.resolve({ payloadHash: bundle.payload_hash, durability: "file-and-directory-fsync" }); },
  } });
  const result = await gate.execute({ action, intent: "EXPORT_REPORT", precondition: () => true, invoke: () => f.observed.push(1) });
  assert.equal(result.reason, "RETENTION_UNAVAILABLE");
  assert.equal(result.outcome, "not_started");
  assert.equal((await f.run({ requestId: () => "not-json" })).outcome, "not_started");
  assert.equal(f.observed.length, 0);
});
