import { z } from "zod/v4";
import { describeGovernedTool } from "../index.js";
export const reportSchema = z.object({ reportId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), content: z.string().max(4096), format: z.literal("text").default("text") }).strict();
export const reportPolicy = { policyVersion: "local-report-v1", defaultScope: "reports", evidenceBits: { AUTHN: 1, AUTHZ: 2, FRESHNESS: 4, APPROVAL: 8 }, scopes: { reports: { allowUnknownIntents: false, intents: { EXPORT_REPORT: 15 } } } };
export function reportRegistration(serverId, name = "exportReport", revision = "1") {
  return { serverId, name, revision, inputSchema: reportSchema, intent: "EXPORT_REPORT", authorityScope: "reports" };
}
export function reportAction({ serverId, principalId, arguments: args, name = "exportReport", revision = "1" }) {
  const parsed = reportSchema.parse(args);
  return { server: serverId, tool: name, definition_digest: describeGovernedTool(reportRegistration(serverId, name, revision)).definitionDigest,
    principal: { id: principalId }, resource: { id: `report:${parsed.reportId}`, version: "absent" }, arguments: parsed };
}
