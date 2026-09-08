import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectFixture, clientGate } from "../client.mjs";
import { actionFor, createFixtureGate } from "../fixture-gate.mjs";
import { digest, verifyCandidate } from "../proof-candidates.mjs";

const args = { reportId: "report", content: "Report café" };
async function fixture(t, config = {}) {
  const directory = await mkdtemp(join(tmpdir(), "vella-mcp-"));
  let client;
  t.after(async () => { await client?.close(); await rm(directory, { recursive: true, force: true }); });
  client = await connectFixture({ directory, ...config });
  assert.equal((await client.listTools()).tools.length, 2);
  return { directory, client };
}
async function noReport(directory) {
  assert.equal((await readdir(directory)).filter(name => name.endsWith(".txt")).length, 0);
}

for (const boundary of ["server", "client"]) {
  for (const fault of ["deny", "evidence", "evaluate", "sign", "store"]) {
    test(`${boundary}: ${fault} prevents a real report export`, async (t) => {
      const config = { evidenceMask: fault === "deny" ? 1 : 3, fault, serverGate: boundary === "server" };
      const { directory, client } = await fixture(t, config);
      const result = boundary === "server"
        ? JSON.parse((await client.callTool({ name: "exportReport", arguments: args })).content[0].text)
        : await clientGate({ ...config, directory }, client)("exportReport", args);
      assert.equal(result.eligible, false);
      assert.equal(result.outcome, "not_started");
      if (["sign", "store"].includes(fault)) assert.equal(result.decision, "ALLOWED");
      await noReport(directory);
    });
  }
  test(`${boundary}: allowed export binds the effective defaulted arguments`, async (t) => {
    const { directory, client } = await fixture(t, { serverGate: boundary === "server" });
    const result = boundary === "server"
      ? JSON.parse((await client.callTool({ name: "exportReport", arguments: args })).content[0].text)
      : await clientGate({ directory }, client)("exportReport", args);
    assert.equal(result.outcome, "reported_success");
    assert.equal(await readFile(join(directory, "report.txt"), "utf8"), args.content);
    const proofs = (await readdir(directory)).filter(name => name.endsWith(".proof.json"));
    assert.equal(proofs.length, 1);
    const proof = verifyCandidate(JSON.parse(await readFile(join(directory, proofs[0]), "utf8")));
    assert.deepEqual(proof.action, actionFor("exportReport", args));
    assert.equal(proof.action.arguments.format, "text");
    assert.equal(proof.requestId, result.requestId);
  });
}

test("a raw client cannot bypass a server-handler denial", async (t) => {
  const { directory, client } = await fixture(t, { evidenceMask: 0 });
  assert.equal((await client.callTool({ name: "exportReport", arguments: args })).isError, true);
  await noReport(directory);
});

test("bypassing a client-only wrapper reaches an unguarded server", async (t) => {
  const { directory, client } = await fixture(t, { serverGate: false });
  const result = await clientGate({ directory, evidenceMask: 0 }, client)("exportReport", args);
  assert.equal(result.eligible, false);
  await noReport(directory);
  await client.callTool({ name: "exportReport", arguments: args });
  assert.equal(await readFile(join(directory, "report.txt"), "utf8"), args.content);
});

test("case-distinct tool names map to distinct policy rules", async (t) => {
  const { directory, client } = await fixture(t, { evidenceMask: 1 });
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["ExportReport", "exportReport"]);
  assert.equal((await client.callTool({ name: "exportReport", arguments: args })).isError, true);
  assert.equal((await client.callTool({ name: "ExportReport", arguments: args })).isError, false);
  assert.equal(await readFile(join(directory, "report.txt"), "utf8"), args.content);
});

test("schema failures and unknown tools cause no side effect", async (t) => {
  const { directory, client } = await fixture(t);
  for (const request of [
    { name: "exportReport", arguments: { ...args, reportId: "../escape" } },
    { name: "exportReport", arguments: { ...args, evidenceMask: 3 } },
    { name: "unmapped", arguments: args },
  ]) {
    try { assert.equal((await client.callTool(request)).isError, true); }
    catch (error) {
      assert.equal(error.name, "ProtocolError");
      assert.equal(error.code, -32602);
    }
  }
  await noReport(directory);
  assert.equal((await client.callTool({ name: "exportReport", arguments: args })).isError, false);
});

test("action-bound approval rejects changed content", async (t) => {
  const { directory, client } = await fixture(t, { approvedDigest: digest(actionFor("exportReport", args)) });
  assert.equal((await client.callTool({ name: "exportReport", arguments: { ...args, content: "changed" } })).isError, true);
  await noReport(directory);
});

test("client pre-dispatch cancellation and wrong server identity are blocked", async (t) => {
  const { directory, client } = await fixture(t, { serverGate: false });
  const call = clientGate({ directory }, client);
  const controller = new AbortController();
  controller.abort();
  assert.equal((await call("exportReport", args, { signal: controller.signal })).reason, "CANCELLED");
  assert.equal((await call("exportReport", args, { configuredServer: "other-server" })).reason, "INVALID_ACTION");
  await noReport(directory);
});

test("a lost result after invocation remains an unknown outcome", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "vella-mcp-unknown-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let invocations = 0;
  const result = await createFixtureGate({ directory, boundary: "client-dispatch" })("exportReport", args, async () => {
    invocations += 1;
    throw new Error("result lost after possible effect");
  });
  assert.equal(invocations, 1);
  assert.equal(result.outcome, "unknown");
});
