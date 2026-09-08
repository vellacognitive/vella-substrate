import test from "node:test";
import assert from "node:assert/strict";
import { signCandidate, verifyCandidate } from "../proof-candidates.mjs";

for (const mode of ["jcs", "bytes"]) {
  test(`${mode}: nested arguments, unicode, arrays and numbers survive verified interpretation`, () => {
    const value = { action: { destination: "café/📄", values: [1, 1.5, 4294967295], amount: 7 } };
    const proof = signCandidate(value, mode);
    assert.deepEqual(verifyCandidate(proof), value);
    const changed = structuredClone(proof);
    value.action.amount = 700;
    changed.payload = Buffer.from(JSON.stringify(value)).toString("base64");
    assert.throws(() => verifyCandidate(changed), /signature/);
    assert.throws(() => verifyCandidate({ ...proof, payloadType: mode === "jcs" ? "vella-experiment/bytes" : "vella-experiment/jcs" }), /signature/);
  });
}

test("canonical and exact-byte candidates make different representation promises", () => {
  const left = { z: 1, a: { y: "é", b: 2 } };
  const right = { a: { b: 2, y: "é" }, z: 1 };
  assert.equal(signCandidate(left, "jcs").payload, signCandidate(right, "jcs").payload);
  assert.notEqual(signCandidate(left, "bytes").payload, signCandidate(right, "bytes").payload);
});
