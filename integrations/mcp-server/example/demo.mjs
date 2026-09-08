import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, approve, connect } from "./local-harness.mjs";
const directory = await mkdtemp(join(tmpdir(), "vella-local-demo-"));
const { config, configPath } = await setup(directory);
let client;
try {
  client = await connect(configPath);
  const args = { reportId: "demo", content: "A governed local report.\n" };
  const denied = await client.callTool({ name: "exportReport", arguments: args });
  const before = (await readdir(config.reportDirectory)).length;
  await approve(config, args);
  const allowed = await client.callTool({ name: "exportReport", arguments: args });
  const content = await readFile(join(config.reportDirectory, "demo.txt"), "utf8");
  console.log(JSON.stringify({ denied: denied._meta["com.vellacognitive/governance"].outcome, filesBeforeApproval: before,
    allowed: allowed._meta["com.vellacognitive/governance"].outcome, filesAfterApproval: (await readdir(config.reportDirectory)).length,
    retainedRecords: (await readdir(config.proofDirectory)).length, reportContent: content }, null, 2));
} finally { await client?.close(); await rm(directory, { recursive: true, force: true }); }
