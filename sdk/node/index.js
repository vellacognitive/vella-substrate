/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import { createGovernor } from "./governor.js";
import proofV2 from "./proof-v2.cjs";

const defaultGovernor = createGovernor();
export const govern = defaultGovernor.govern;
export const verifyProofV2 = proofV2.verifyV2;
export const actionDigest = proofV2.digest;
export { createGovernor };
export { createEvaluator } from "./evaluator.js";
export { DEFAULT_POLICY } from "./policy.js";
export { createExecutionGate } from "./execution.js";
export { createLocalProofSink } from "./local-proof-sink.js";
export { createOperatorEvidenceProvider } from "./operator-evidence.js";
