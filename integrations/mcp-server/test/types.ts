import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { createGovernor, createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider, verifyProofV2, type Policy, type ProofProfile, type KeyProvider } from "@vellacognitive/vella-sdk";
import { registerGovernedTool } from "../index.js";
const policy: Policy = { policyVersion: "test", defaultScope: "test", evidenceBits: { AUTHN: 1 }, scopes: { test: { intents: { RUN: 1 } } } };
const governor = createGovernor(policy);
const result = governor.govern({ intent: "RUN", evidenceMask: ["AUTHN"], action: { nested: [1, "😀"] } });
const checked = verifyProofV2(result.proofBundle, "trusted-public-key");
if (checked.ok) checked.authenticated.action_digest?.toUpperCase();
const gate = createExecutionGate({ policy, signingKey: "key", publicKey: "pub", evidenceProvider: createOperatorEvidenceProvider({ loadState: () => ({}) }), proofSink: createLocalProofSink({ directory: "/tmp/proofs" }) });
registerGovernedTool(new McpServer({ name: "test", version: "0.0.0" }), {
  serverId: "test", name: "run", revision: "1", inputSchema: z.object({ id: z.string() }), intent: "RUN", authorityScope: "test", gate,
  resolveAction: args => ({ principal: { id: "test" }, resource: { id: args.id, version: "absent" }, arguments: args }),
  precondition: action => action.resource.version === "absent",
  handler: async (args, context, execution) => ({ content: [{ type: "text", text: args.id + execution.attemptId + context.mcpReq.id }] }),
});
// @ts-expect-error unsupported proof boundary must not typecheck
 governor.govern({ boundary: "anywhere" });

declare const profile: ProofProfile;
declare const keys: KeyProvider;
const profileGovernor = createGovernor(policy, { proofProfile: profile });
const profileGate = createExecutionGate({ policy, proofProfile: profile, keyProvider: keys, governor: profileGovernor,
  evidenceProvider: createOperatorEvidenceProvider({ loadState: () => ({}) }), proofSink: createLocalProofSink({ directory: "/tmp/pq-proofs", proofProfile: profile }) });
registerGovernedTool(new McpServer({ name: "profile-test", version: "0.0.0" }), {
  serverId: "test", name: "profileRun", revision: "1", inputSchema: z.object({ id: z.string() }), intent: "RUN", authorityScope: "test", gate: profileGate,
  resolveAction: args => ({ principal: { id: "test" }, resource: { id: args.id, version: "absent" }, arguments: args }),
  precondition: () => true, handler: args => ({ content: [{ type: "text", text: args.id }] }),
});
