import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { actionDigest } from "@vellacognitive/vella-sdk";
import { reportAction, reportPolicy } from "./report-workflow.mjs";

// This harness acts as the operator. Approval is written outside the MCP server;
// the server exposes no approval, identity or evidence-authoring tool.
export async function setup(directory, serverId = "vella-local-reports") {
  const reports = join(directory, "reports"), proofs = join(directory, "proofs");
  await mkdir(reports, { mode: 0o700 }); await mkdir(proofs, { mode: 0o700 });
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const config = { operatorUid: process.getuid(), serverId, reportDirectory: reports, proofDirectory: proofs,
    signingKeyPath: join(directory, "signing.pem"), publicKeyPath: join(directory, "signing.pub"), evidenceStatePath: join(directory, "evidence.json") };
  await writeFile(config.signingKeyPath, pair.privateKey, { mode: 0o600 });
  await writeFile(config.publicKeyPath, pair.publicKey, { mode: 0o600 });
  await writeFile(config.evidenceStatePath, "{}", { mode: 0o600 });
  const configPath = join(directory, "config.json");
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  return { config, configPath, publicKey: pair.publicKey };
}
export async function approve(config, args, name = "exportReport", revision = "1") {
  const principalId = `local-uid:${config.operatorUid}`, expiresAt = Date.now() + 60000;
  const action = reportAction({ serverId: config.serverId, principalId, arguments: args, name, revision });
  const state = { session: { id: "local-session", principalId, expiresAt, revoked: false },
    permissions: [{ id: "permission-1", principalId, server: config.serverId, tool: name, resourceId: action.resource.id, expiresAt, revoked: false }],
    approval: { id: `approval-${args.reportId}`, principalId, actionDigest: actionDigest(action), policyDigest: actionDigest(reportPolicy), expiresAt, revoked: false } };
  await writeFile(config.evidenceStatePath, JSON.stringify(state), { mode: 0o600 });
  return state;
}
export async function connect(configPath, serverPath = fileURLToPath(new URL("./report-server.mjs", import.meta.url))) {
  const client = new Client({ name: "local-reference-client", version: "0.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath, configPath] });
  try { await client.connect(transport); await client.listTools(); }
  catch (error) { await transport.close(); throw error; }
  return client;
}
export async function readState(config) { return JSON.parse(await readFile(config.evidenceStatePath, "utf8")); }

/** Operator-side atomic update; wait for the prior batch to settle before replacement. */
export async function approveBatch(config, requests) {
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 64) throw new TypeError("approve 1..64 exact actions per batch");
  const principalId = `local-uid:${config.operatorUid}`, expiresAt = Date.now() + 60000;
  const actions = requests.map(args => reportAction({ serverId: config.serverId, principalId, arguments: args }));
  if (new Set(actions.map(actionDigest)).size !== actions.length) throw new TypeError("duplicate action approval");
  const state = { session: { id: "local-session", principalId, expiresAt, revoked: false },
    permissions: actions.map((action, i) => ({ id: `permission-${i}`, principalId, server: config.serverId, tool: action.tool, resourceId: action.resource.id, expiresAt, revoked: false })),
    approvals: actions.map(action => ({ id: `approval-${action.arguments.reportId}`, principalId, actionDigest: actionDigest(action), policyDigest: actionDigest(reportPolicy), expiresAt, revoked: false })) };
  const temporary = `${config.evidenceStatePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  await rename(temporary, config.evidenceStatePath);
  return state;
}
