// Dedicated integration fixture for an action whose result is unavailable.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider } from "@vellacognitive/vella-sdk";
import { registerGovernedTool } from "../index.js";
import { reportPolicy, reportRegistration } from "../example/report-workflow.mjs";
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
const signingKey = await readFile(config.signingKeyPath, "utf8"), publicKey = await readFile(config.publicKeyPath, "utf8");
serveStdio(() => {
  const server = new McpServer({ name: config.serverId, version: "0.0.0" });
  const gate = createExecutionGate({ policy: reportPolicy, signingKey, publicKey, timeoutMs: config.timeoutMs ?? 5000,
    proofSink: createLocalProofSink({ directory: config.proofDirectory }),
    evidenceProvider: createOperatorEvidenceProvider({ loadState: async () => JSON.parse(await readFile(config.evidenceStatePath, "utf8")) }) });
  registerGovernedTool(server, { ...reportRegistration(config.serverId), gate,
    resolveAction: args => ({ principal: { id: `local-uid:${process.getuid()}` }, resource: { id: `report:${args.reportId}`, version: "absent" }, arguments: args }),
    precondition: () => true,
    handler: async args => { await writeFile(join(config.reportDirectory, `${args.reportId}.txt`), args.content, { flag: "wx" }); return await new Promise(() => {}); },
  });
  return server;
}, { legacy: "reject" });
