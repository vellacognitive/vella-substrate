import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createExecutionGate, createLocalProofSink, actionDigest } from "../../index.js";
const [directory, phase] = process.argv.slice(2);
const key = await readFile(new URL("./test-signing-private.pem", import.meta.url), "utf8");
const pub = await readFile(new URL("./test-signing-public.pem", import.meta.url), "utf8");
const policy = { policyVersion: "crash-v1", defaultScope: "one", evidenceBits: { AUTHN: 1 }, scopes: { one: { intents: { RUN: 1 } } } };
const gate = createExecutionGate({ policy, signingKey: key, publicKey: pub, proofSink: createLocalProofSink({ directory }),
  evidenceProvider: { resolve: () => ({ mask: 1, references: { provider: "crash-fixture" } }) } });
await gate.execute({ intent: "RUN", action: { server: "one", tool: "run", definition_digest: actionDigest({ revision: 1 }), principal: { id: "test" }, resource: { id: "effect", version: "absent" }, arguments: {} },
  precondition: async () => { if (phase === "before") { process.send({ phase }); await new Promise(() => {}); } return true; },
  invoke: async () => { await writeFile(join(directory, "effect.txt"), "effect", { flag: "wx" }); process.send({ phase: "after" }); await new Promise(() => {}); },
});
