import { readFile, lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider } from "@vellacognitive/vella-sdk";
import { registerGovernedTool } from "../index.js";
import { reportPolicy, reportRegistration } from "./report-workflow.mjs";

// Launch configuration and evidence state are owned by the local operator.
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
if (typeof process.getuid !== "function" || config.operatorUid !== process.getuid()) throw new Error("local operator UID mismatch");
const principalId = `local-uid:${process.getuid()}`;
const signingKey = await readFile(config.signingKeyPath, "utf8");
const publicKey = await readFile(config.publicKeyPath, "utf8");
const sink = createLocalProofSink({ directory: config.proofDirectory });
const evidenceProvider = createOperatorEvidenceProvider({ loadState: async () => JSON.parse(await readFile(config.evidenceStatePath, "utf8")) });
serveStdio(() => {
  const server = new McpServer({ name: config.serverId, version: "0.0.0" });
  const gate = createExecutionGate({ policy: reportPolicy, signingKey, publicKey, evidenceProvider, proofSink: sink, timeoutMs: config.timeoutMs ?? 30000 });
  for (const name of ["exportReport", "ExportReport"]) {
    registerGovernedTool(server, { ...reportRegistration(config.serverId, name), gate,
      resolveAction: args => ({ principal: { id: principalId }, resource: { id: `report:${args.reportId}`, version: "absent" }, arguments: args }),
      precondition: async action => {
        try { await lstat(join(config.reportDirectory, `${action.arguments.reportId}.txt`)); return false; }
        catch (error) { if (error.code === "ENOENT") return true; throw error; }
      },
      handler: async args => {
        // Exclusive creation atomically enforces the signed "absent" resource
        // precondition. A failure after opening remains an unknown outcome.
        const file = await open(join(config.reportDirectory, `${args.reportId}.txt`), "wx", 0o600);
        try { await file.writeFile(args.content, "utf8"); await file.sync(); } finally { await file.close(); }
        return { content: [{ type: "text", text: `Exported ${args.reportId} as ${args.format}` }] };
      },
    });
  }
  return server;
}, { legacy: "reject" });
