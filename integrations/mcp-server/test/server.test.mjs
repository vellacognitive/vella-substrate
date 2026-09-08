import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { verifyProofV2 } from "@vellacognitive/vella-sdk";
import { registerGovernedTool } from "../index.js";
import { setup, approve, connect, readState } from "../example/local-harness.mjs";
const META = "com.vellacognitive/governance";
async function fixture(t, id) {
  const directory = await mkdtemp(join(tmpdir(), "vella-mcp-server-"));
  const f = await setup(directory, id);
  let client;
  t.after(async () => { await client?.close(); await rm(directory, { recursive: true, force: true }); });
  return { ...f, directory, async connect() { client = await connect(f.configPath); return client; } };
}

test("real stdio lifecycle, denied raw call, approved consequence, proof and receipt correlation", async t => {
  const f = await fixture(t);
  const client = await f.connect();
  assert.deepEqual((await client.listTools()).tools.map(x => x.name).sort(), ["ExportReport", "exportReport"]);
  const args = { reportId: "one", content: "A real report 😀" };
  const denied = await client.callTool({ name: "exportReport", arguments: args });
  assert.equal(denied.isError, true);
  assert.equal(denied._meta[META].outcome, "not_started");
  assert.equal((await readdir(f.config.reportDirectory)).length, 0);
  await approve(f.config, args);
  const allowed = await client.callTool({ name: "exportReport", arguments: args });
  assert.equal(allowed.isError, undefined);
  const result = allowed._meta[META];
  assert.equal(result.outcome, "reported_success");
  assert.equal(result.authorizationRetained, true);
  assert.equal(result.receiptRetained, true);
  assert.equal(await readFile(join(f.config.reportDirectory, "one.txt"), "utf8"), args.content);
  const bundle = JSON.parse(await readFile(join(f.config.proofDirectory, `${result.attemptId}.authorization.json`), "utf8"));
  const record = verifyProofV2(bundle, f.publicKey).authenticated;
  assert.equal(record.action.arguments.format, "text");
  assert.equal(record.action.arguments.content, args.content);
  assert.equal(record.action.tool, "exportReport");
  assert.equal(record.boundary, "server-handler");
  assert.equal(result.receipt.authorization_hash, bundle.payload_hash);
  const repeated = await client.callTool({ name: "exportReport", arguments: args });
  assert.equal(repeated._meta[META].outcome, "not_started");
  assert.equal(repeated._meta[META].reason, "PRECONDITION_FAILED");
  assert.equal((await readdir(f.config.reportDirectory)).length, 1);
});

test("unknown tool and invalid schema reject before any consequence; valid control still works", async t => {
  const f = await fixture(t); const client = await f.connect();
  const args = { reportId: "safe", content: "content" }; await approve(f.config, args);
  for (const call of [{ name: "unmapped", arguments: args }, { name: "exportReport", arguments: { ...args, reportId: "../escape" } }, { name: "exportReport", arguments: { ...args, evidenceMask: 15 } }]) {
    let rejected = false;
    try { rejected = (await client.callTool(call)).isError === true; }
    catch (error) { assert.ok([-32602, -32601].includes(error.code), String(error)); rejected = true; }
    assert.equal(rejected, true);
  }
  assert.equal((await readdir(f.config.reportDirectory)).length, 0);
  assert.equal((await readdir(f.config.proofDirectory)).length, 0);
  assert.equal((await client.callTool({ name: "exportReport", arguments: args }))._meta[META].outcome, "reported_success");
});

for (const change of ["arguments", "case", "revision", "revoked"]) test(`approval cannot be reused after ${change} change`, async t => {
  const f = await fixture(t); const client = await f.connect();
  const args = { reportId: "safe", content: "approved" };
  await approve(f.config, args, "exportReport", change === "revision" ? "old" : "1");
  if (change === "revoked") { const state = await readState(f.config); state.approval.revoked = true; await writeFile(f.config.evidenceStatePath, JSON.stringify(state)); }
  const result = await client.callTool({ name: change === "case" ? "ExportReport" : "exportReport", arguments: change === "arguments" ? { ...args, content: "unapproved" } : args });
  assert.equal(result._meta[META].outcome, "not_started");
  assert.equal((await readdir(f.config.reportDirectory)).length, 0);
});

test("same-named tools on separate servers cannot reuse approval", async t => {
  const first = await fixture(t, "server-one"), second = await fixture(t, "server-two");
  const args = { reportId: "safe", content: "approved" }; await approve(first.config, args);
  await writeFile(second.config.evidenceStatePath, await readFile(first.config.evidenceStatePath));
  const client = await second.connect();
  assert.equal((await client.callTool({ name: "exportReport", arguments: args }))._meta[META].outcome, "not_started");
  assert.equal((await readdir(second.config.reportDirectory)).length, 0);
});

for (const fault of ["signing", "storage"]) test(`real MCP ${fault} fault preserves ALLOWED while preventing dispatch`, async t => {
  const f = await fixture(t); const args = { reportId: "safe", content: "approved" }; await approve(f.config, args);
  if (fault === "signing") await writeFile(f.config.signingKeyPath, "invalid");
  else { await rm(f.config.proofDirectory, { recursive: true }); await writeFile(f.config.proofDirectory, "not a directory"); }
  const client = await f.connect();
  const result = (await client.callTool({ name: "exportReport", arguments: args }))._meta[META];
  assert.equal(result.decision, "ALLOWED");
  assert.equal(result.eligible, false);
  assert.equal(result.outcome, "not_started");
  assert.equal((await readdir(f.config.reportDirectory)).length, 0);
});

test("pre-cancelled native client call does not dispatch; connection remains usable", async t => {
  const f = await fixture(t); const client = await f.connect();
  const args = { reportId: "safe", content: "approved" }; await approve(f.config, args);
  await assert.rejects(client.callTool({ name: "exportReport", arguments: args }, { signal: AbortSignal.abort() }));
  assert.equal((await readdir(f.config.reportDirectory)).length, 0);
  assert.equal((await client.callTool({ name: "exportReport", arguments: args }))._meta[META].outcome, "reported_success");
});

test("registration is explicit and refuses duplicates without exposing mutable SDK handles", () => {
  const server = new McpServer({ name: "registration-test", version: "0.0.0" });
  const options = { serverId: "one", name: "run", revision: "1", inputSchema: z.object({ id: z.string() }), intent: "RUN", authorityScope: "one",
    gate: { execute() {} }, resolveAction() {}, precondition() {}, handler() {} };
  const registration = registerGovernedTool(server, options);
  assert.equal(registration.update, undefined);
  assert.ok(Object.isFrozen(registration));
  assert.throws(() => registerGovernedTool(server, options), /duplicate/);
  assert.throws(() => registerGovernedTool(server, { ...options, name: "other", revision: "" }), /explicit/);
});

test("resumed input flow and changed schema fail before gate dispatch", async () => {
  let callback, calls = 0;
  const schema = z.object({ id: z.string() });
  const server = { registerTool(name, options, handler) { callback = handler; } };
  registerGovernedTool(server, { serverId: "one", name: "run", revision: "1", inputSchema: schema, intent: "RUN", authorityScope: "one",
    gate: { execute() { calls++; } }, resolveAction() {}, precondition() {}, handler() {} });
  const ctx = { mcpReq: { signal: new AbortController().signal, id: 1, inputResponses: { approval: true } } };
  assert.equal((await callback({ id: "one" }, ctx))._meta[META].reason, "UNSUPPORTED_RESUMED_CALL");
  schema.shape.id = z.number();
  assert.equal((await callback({ id: "one" }, { mcpReq: { signal: ctx.mcpReq.signal, id: 2 } }))._meta[META].reason, "TOOL_DEFINITION_CHANGED");
  assert.equal(calls, 0);
});

async function eventually(check) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error("expected state did not appear");
}
for (const mode of ["cancel", "timeout"]) test(`native MCP ${mode} after dispatch preserves unknown outcome and one consequence`, async t => {
  const f = await fixture(t);
  const args = { reportId: "slow", content: "effect before unavailable result" }; await approve(f.config, args);
  if (mode === "timeout") { f.config.timeoutMs = 200; await writeFile(f.configPath, JSON.stringify(f.config)); }
  const client = await connect(f.configPath, new URL("./slow-server.mjs", import.meta.url).pathname);
  t.after(() => client.close());
  const controller = new AbortController();
  const pending = client.callTool({ name: "exportReport", arguments: args }, { signal: controller.signal });
  // Attach rejection handling immediately; native cancellation may reject before
  // the storage observation below completes.
  const settled = pending.then(value => ({ value }), error => ({ error }));
  await eventually(async () => (await readdir(f.config.reportDirectory)).length === 1);
  if (mode === "cancel") controller.abort();
  const response = await settled;
  if (mode === "cancel") assert.ok(response.error);
  else assert.equal(response.value._meta[META].outcome, "unknown");
  await eventually(async () => (await readdir(f.config.proofDirectory)).some(name => name.endsWith("receipt.json")));
  const file = (await readdir(f.config.proofDirectory)).find(name => name.endsWith("receipt.json"));
  const receipt = JSON.parse(await readFile(join(f.config.proofDirectory, file), "utf8"));
  assert.equal(receipt.outcome, "unknown");
  assert.equal(receipt.eligible, true);
  assert.equal((await readdir(f.config.reportDirectory)).length, 1);
  await client.close();
});

test("concurrent approved calls cannot overwrite or create more than one report", async t => {
  const f = await fixture(t); const client = await f.connect();
  const args = { reportId: "once", content: "single effect" }; await approve(f.config, args);
  const results = await Promise.all(Array.from({ length: 4 }, () => client.callTool({ name: "exportReport", arguments: args })));
  assert.equal(results.filter(r => r._meta[META].outcome === "reported_success").length, 1);
  assert.equal((await readdir(f.config.reportDirectory)).length, 1);
  assert.equal(await readFile(join(f.config.reportDirectory, "once.txt"), "utf8"), args.content);
});

test("one server concurrently executes different reports with exact batch approvals", async t => {
  const { approveBatch } = await import("../example/local-harness.mjs");
  const f = await fixture(t); const client = await f.connect();
  const requests = Array.from({ length: 8 }, (_, i) => ({ reportId: `parallel-${i}`, content: `report ${i}` }));
  await approveBatch(f.config, requests);
  const results = await Promise.all(requests.map(args => client.callTool({ name: "exportReport", arguments: args })));
  for (const [i, result] of results.entries()) {
    assert.equal(result._meta[META].outcome, "reported_success");
    assert.equal(result._meta[META].receiptRetained, true);
    assert.equal(await readFile(join(f.config.reportDirectory, `${requests[i].reportId}.txt`), "utf8"), requests[i].content);
  }
  assert.equal((await readdir(f.config.reportDirectory)).length, 8);
  const changed = await client.callTool({ name: "exportReport", arguments: { ...requests[0], content: "unapproved" } });
  assert.equal(changed._meta[META].outcome, "not_started");
  await assert.rejects(approveBatch(f.config, [requests[0], requests[0]]), /duplicate/);
});
