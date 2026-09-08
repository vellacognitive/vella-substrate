import test from "node:test";
import assert from "node:assert/strict";
import { fork, spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

for (const phase of ["before", "after"]) test(`process interruption ${phase} execution leaves a verifiable authorization and no false receipt`, async t => {
  const directory = await mkdtemp(join(tmpdir(), "vella-interruption-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const child = fork(fileURLToPath(new URL("./fixtures/gate-crash-child.mjs", import.meta.url)), [directory, phase], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`checkpoint timeout: ${stderr}`)), 5000);
    child.once("message", message => { clearTimeout(timeout); assert.equal(message.phase, phase); resolve(); });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(`early exit: ${stderr}`)); });
  });
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGKILL"); await exited;
  const files = await readdir(directory);
  const proofs = files.filter(name => name.endsWith(".authorization.json"));
  assert.equal(proofs.length, 1);
  assert.equal(files.filter(name => name.endsWith(".receipt.json")).length, 0);
  assert.equal(files.includes("effect.txt"), phase === "after");
  const verify = spawnSync(process.execPath, [fileURLToPath(new URL("../../../verify/verify.js", import.meta.url)), join(directory, proofs[0]), fileURLToPath(new URL("./fixtures/test-signing-public.pem", import.meta.url))], { encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(await readFile(join(directory, proofs[0]), "utf8")).kind, "vella_proof_bundle_v2");
});
