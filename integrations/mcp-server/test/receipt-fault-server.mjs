// Operational fault fixture only; not included in published package files.
import { readFile, lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider } from "@vellacognitive/vella-sdk";
import { registerGovernedTool } from "../index.js";
import { reportPolicy, reportRegistration } from "../example/report-workflow.mjs";
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
if (config.operatorUid !== process.getuid()) throw new Error("operator UID mismatch");
const signingKey = await readFile(config.signingKeyPath, "utf8"), publicKey = await readFile(config.publicKeyPath, "utf8");
serveStdio(() => {
  const server = new McpServer({ name: config.serverId, version: "0.0.0" });
  const gate = createExecutionGate({ policy: reportPolicy, signingKey, publicKey, buildHash: config.buildHash ?? null,
    proofSink: { ...createLocalProofSink({ directory: config.proofDirectory }), retainReceipt() { throw new Error("injected receipt-storage outage"); } },
    evidenceProvider: createOperatorEvidenceProvider({ loadState: async () => JSON.parse(await readFile(config.evidenceStatePath, "utf8")) }) });
  registerGovernedTool(server, { ...reportRegistration(config.serverId), gate,
    resolveAction: args => ({ principal: { id: `local-uid:${process.getuid()}` }, resource: { id: `report:${args.reportId}`, version: "absent" }, arguments: args }),
    precondition: async action => { try { await lstat(join(config.reportDirectory, `${action.arguments.reportId}.txt`)); return false; } catch (error) { if (error.code === "ENOENT") return true; throw error; } },
    handler: async args => {
      const file = await open(join(config.reportDirectory, `${args.reportId}.txt`), "wx", 0o600);
      try { await file.writeFile(args.content, "utf8"); await file.sync(); } finally { await file.close(); }
      return { content: [{ type: "text", text: `Exported ${args.reportId} as ${args.format}` }] };
    },
  });
  return server;
}, { legacy: "reject" });
