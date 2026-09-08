import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { signCandidate, verifyCandidate } from "../proof-candidates.mjs";

function python(request) {
  return spawnSync(process.env.VELLA_EXPERIMENT_PYTHON || "python3", [fileURLToPath(new URL("../proof_candidates.py", import.meta.url))], {
    input: JSON.stringify(request), encoding: "utf8", timeout: 10000,
  });
}
const values = [
  { intent: "EXPORT", action: { destination: "café/📄", amount: 7 } },
  { action: { arguments: [1, 1.0, 1.5, 4294967295, Number.MAX_SAFE_INTEGER] } },
  { z: false, a: { "😀": "supplementary", "\ue000": "bmp", empty: null } },
];

for (const mode of ["jcs", "bytes"]) {
  test(`${mode}: a Python integral float verifies in Node`, () => {
    const signed = python({ operation: "sign", mode, value: { integral: 1 }, integralFloat: true });
    assert.equal(signed.status, 0, signed.stderr);
    const record = JSON.parse(signed.stdout);
    assert.deepEqual(verifyCandidate(record), { integral: 1 });
    assert.equal(Buffer.from(record.payload, "base64").toString("utf8"), mode === "jcs" ? '{"integral":1}' : '{"integral":1.0}');
  });
  for (const [index, value] of values.entries()) {
    test(`${mode}: Node/Python producers and verifiers agree on fixture ${index + 1}`, () => {
      const nodeRecord = signCandidate(value, mode);
      const signed = python({ operation: "sign", mode, value });
      assert.equal(signed.status, 0, signed.error?.message || signed.stderr);
      const pythonRecord = JSON.parse(signed.stdout);
      if (mode === "jcs") assert.equal(nodeRecord.payload, pythonRecord.payload);
      for (const record of [nodeRecord, pythonRecord]) {
        assert.deepEqual(verifyCandidate(record), value);
        const verified = python({ operation: "verify", record });
        assert.equal(verified.status, 0, verified.stderr);
        assert.deepEqual(JSON.parse(verified.stdout), value);
        const altered = { ...record, payload: Buffer.from(JSON.stringify({ changed: true })).toString("base64") };
        assert.throws(() => verifyCandidate(altered));
        assert.notEqual(python({ operation: "verify", record: altered }).status, 0);
      }
    });
  }
}
