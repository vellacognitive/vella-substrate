import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { govern } from "../index.js";
import { createEvaluator } from "../evaluator.js";

const vectors = JSON.parse(readFileSync(new URL("../../../test-vectors/policy-validation.json", import.meta.url)));
const policy = (mask) => ({
  policyVersion: "test-v1", defaultScope: "s", evidenceBits: { AUTHN: 1 },
  scopes: { s: { intents: { READ: mask }, allowUnknownIntents: false } },
});

for (const row of vectors.evidence) {
  test(`shared evidence: ${row.name}`, () => {
    const result = govern({ intent: "EXECUTE_CHANGE", evidenceMask: row.value });
    assert.equal(result.reasonCode, row.reason);
    assert.equal(result.decision, row.reason === "POLICY_SATISFIED" ? "ALLOWED" : "DENIED");
  });
}

for (const row of vectors.invalidPolicies) {
  test(`reject policy: ${row.name}`, () => assert.throws(() => createEvaluator(row.policy)));
}

test("all 32 required bits allow only when present", () => {
  for (let bit = 0; bit < 32; bit++) {
    const mask = 2 ** bit;
    const evaluator = createEvaluator(policy(mask));
    assert.equal(evaluator.evaluate({ intent: "READ", evidence_mask: mask }).decision, "ALLOWED", `bit ${bit}`);
    assert.equal(evaluator.evaluate({ intent: "READ", evidence_mask: 0 }).decision, "DENIED", `bit ${bit}`);
  }
});

test("invalid evidence cannot allow a zero-evidence rule", () => {
  const evaluator = createEvaluator(policy(0));
  for (const value of [-1, 1.5, NaN, Infinity, true, ["AUTHN", "TYPO"], "9".repeat(1000)]) {
    assert.equal(evaluator.evaluate({ intent: "READ", evidence_mask: value }).reason_code, "E_EVIDENCE_INVALID");
  }
  assert.equal(evaluator.evaluate({ intent: "READ" }).decision, "ALLOWED");
});

test("compiled policies are isolated from caller mutation and other instances", () => {
  const source = policy(1);
  const first = createEvaluator(source);
  const second = createEvaluator(policy(3));
  source.scopes.s.intents.READ = 0;
  source.evidenceBits.AUTHN = 0;
  assert.equal(first.evaluate({ intent: "READ", evidence_mask: 0 }).decision, "DENIED");
  assert.equal(first.evaluate({ intent: "READ", evidence_mask: "AUTHN" }).decision, "ALLOWED");
  assert.equal(second.evaluate({ intent: "READ", evidence_mask: 1 }).decision, "DENIED");
});

test("standalone evaluator fails closed on unexpected caller errors", () => {
  const input = { get intent_id() { throw new Error("fixture"); } };
  assert.equal(createEvaluator().evaluate(input).reason_code, "E_EVALUATOR_INTERNAL");
});

test("non-text identifiers cannot enter permissive policies through coercion", () => {
  const permissive = createEvaluator({ policyVersion: "1", defaultScope: "1", evidenceBits: {}, scopes: { "1": { allowUnknownIntents: true, intents: {} } } });
  for (const intent of [true, 1, {}, ["READ"]]) assert.equal(permissive.evaluate({ intent }).reason_code, "E_INTENT_REQUIRED");
  assert.equal(permissive.evaluate({ intent: "READ", authority_scope_id: 1 }).decision, "DENIED");
  assert.equal(permissive.evaluate({ intent: "READ", policy_version: 1 }).reason_code, "E_POLICY_VERSION_MISMATCH");
});
