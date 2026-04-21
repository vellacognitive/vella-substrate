import test from "node:test";
import assert from "node:assert/strict";
import { govern } from "../index.js";

test("EXECUTE_CHANGE with AUTHN is ALLOWED", () => {
  const result = govern({ intent: "EXECUTE_CHANGE", evidenceMask: 1 });
  assert.equal(result.decision, "ALLOWED");
  assert.equal(result.reasonCode, "POLICY_SATISFIED");
});

test("EXECUTE_CHANGE without evidence is DENIED", () => {
  const result = govern({ intent: "EXECUTE_CHANGE", evidenceMask: 0 });
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, "E_EVIDENCE_MISSING");
});

test("ESCALATE_PRIVILEGE with AUTHN|AUTHZ is ALLOWED", () => {
  const result = govern({ intent: "ESCALATE_PRIVILEGE", evidenceMask: 3 });
  assert.equal(result.decision, "ALLOWED");
  assert.equal(result.reasonCode, "POLICY_SATISFIED");
});

test("ESCALATE_PRIVILEGE with only AUTHN is DENIED", () => {
  const result = govern({ intent: "ESCALATE_PRIVILEGE", evidenceMask: 1 });
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, "E_EVIDENCE_MISSING");
});

test("DATA_EXPORT with AUTHN|AUTHZ is ALLOWED", () => {
  const result = govern({ intent: "DATA_EXPORT", evidenceMask: 3 });
  assert.equal(result.decision, "ALLOWED");
  assert.equal(result.reasonCode, "POLICY_SATISFIED");
});

test("unknown intent is DENIED fast", () => {
  const result = govern({ intent: "UNKNOWN_INTENT", evidenceMask: 15 });
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, "DENY_FAST");
});

test("missing intent is DENIED", () => {
  const result = govern({ intent: "", evidenceMask: 1 });
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, "E_INTENT_REQUIRED");
});

test("policy version mismatch is DENIED", () => {
  const result = govern({ intent: "ESCALATE_PRIVILEGE", evidenceMask: 3, policyVersion: "v99" });
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, "E_POLICY_VERSION_MISMATCH");
});

test("unknown authority scope is DENIED fast", () => {
  const result = govern({ intent: "ESCALATE_PRIVILEGE", evidenceMask: 3, authorityScope: "nonexistent" });
  assert.equal(result.decision, "DENIED");
  assert.equal(result.reasonCode, "DENY_FAST");
});

test("evidence mask can be provided as symbol list", () => {
  const result = govern({ intent: "DATA_EXPORT", evidenceMask: ["AUTHN", "AUTHZ"] });
  assert.equal(result.decision, "ALLOWED");
  assert.equal(result.reasonCode, "POLICY_SATISFIED");
});
