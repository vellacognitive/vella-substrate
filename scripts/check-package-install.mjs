import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, copyFileSync, readFileSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python = process.env.VELLA_VERIFY_PYTHON || "python3";
const artifactIndex = process.argv.indexOf("--artifacts");
if (artifactIndex >= 0 && !process.argv[artifactIndex + 1]) throw new Error("--artifacts requires an output directory");
const artifactFolder = artifactIndex < 0 ? null : resolve(process.argv[artifactIndex + 1]);
const folder = mkdtempSync(join(tmpdir(), "vella-package-check-"));
function run(command, args, cwd = folder) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, PYTHONPATH: "", PYTHONHOME: "" }, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command}: ${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  if (artifactFolder) assert.equal(run("git", ["status", "--porcelain"], root).trim(), "", "export artifacts only from an immutable clean candidate");
  const tarballs = [];
  for (const dir of ["sdk/node", "integrations/mcp-server"]) {
    const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", folder], join(root, dir)))[0];
    tarballs.push(join(folder, packed.filename));
    assert.ok(packed.files.some(file => file.path === "index.d.ts"));
  }
  writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "vella-package-consumer", version: "0.0.0", private: true, type: "module" }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs, "--cache", process.env.VELLA_NPM_CACHE || join(folder, "npm-cache")]);
  const consumer = `
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createGovernor, verifyProofV2, createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider } from '@vellacognitive/vella-sdk';
import { registerGovernedTool } from '@vellacognitive/vella-mcp-server';
const keys = generateKeyPairSync('ec', {namedCurve:'prime256v1',privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const result = createGovernor().govern({intent:'EXECUTE_CHANGE',evidenceMask:1,action:{args:{text:'café 😀'}},proof:{signingKey:keys.privateKey}});
assert.equal(verifyProofV2(result.proofBundle,keys.publicKey).ok,true);
for(const value of [registerGovernedTool,createExecutionGate,createLocalProofSink,createOperatorEvidenceProvider]) assert.equal(typeof value,'function');
console.log('Installed Node packages verify v2 and expose the gate and MCP binding');
`;
  writeFileSync(join(folder, "consumer.mjs"), consumer);
  process.stdout.write(run(process.execPath, [join(folder, "consumer.mjs")]));
  process.stdout.write(run(process.execPath, [join(folder, "node_modules/@vellacognitive/vella-mcp-server/example/demo.mjs")]));
  writeFileSync(join(folder, "consumer.ts"), `import { createGovernor, verifyProofV2, type ExecutionGate } from '@vellacognitive/vella-sdk';\nimport { registerGovernedTool } from '@vellacognitive/vella-mcp-server';\nconst result=createGovernor().govern({intent:'RUN',evidenceMask:1});\nconst checked=verifyProofV2(result.proofBundle,'public-key');\nif(checked.ok) checked.authenticated.action_digest?.toUpperCase();\nconst register:typeof registerGovernedTool=registerGovernedTool;\n`);
  writeFileSync(join(folder, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", strict: true, noEmit: true, types: ["node"], typeRoots: [join(root, "integrations/mcp-server/node_modules/@types")] }, files: ["consumer.ts"] }));
  run(join(root, "integrations/mcp-server/node_modules/.bin/tsc"), ["-p", join(folder, "tsconfig.json")]);
  const wheels = join(folder, "wheels"); mkdirSync(wheels);
  const pythonSource = join(folder, "python-source");
  cpSync(join(root, "sdk/python"), pythonSource, { recursive: true, filter: source => !/(?:^|\/)(?:build|dist|__pycache__|\.[^/]+|[^/]+\.egg-info)(?:\/|$)/.test(source.slice(join(root, "sdk/python").length)) });
  run(python, ["-m", "pip", "wheel", "--no-deps", "--no-build-isolation", pythonSource, "-w", wheels]);
  const wheel = join(wheels, readdirSync(wheels).find(name => name.endsWith(".whl")));
  const environment = join(folder, "python-env");
  run(python, ["-m", "venv", environment]);
  const isolatedPython = join(environment, "bin/python");
  run(isolatedPython, ["-m", "pip", "install", "--disable-pip-version-check", wheel]);
  const pyConsumer = `
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import vella
key=ec.generate_private_key(ec.SECP256R1())
private=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
public=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
result=vella.create_governor().govern('EXECUTE_CHANGE',1,action={'args':{'text':'café 😀'}},proof_signing_key=private)
assert vella.verify_proof_v2(result['proof_bundle'],public)['ok']
assert 'python-env' in vella.__file__
assert Path(vella.__file__).with_name('py.typed').exists()
print('Installed Python wheel verifies v2 and includes typing metadata')
`;
  writeFileSync(join(folder, "consumer.py"), pyConsumer);
  process.stdout.write(run(isolatedPython, [join(folder, "consumer.py")]));
  if (artifactFolder) {
    mkdirSync(artifactFolder, { recursive: true });
    const artifacts = [...tarballs, wheel].map(path => {
      const filename = basename(path); copyFileSync(path, join(artifactFolder, filename));
      const bytes = readFileSync(path); return { filename, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
    });
    const manifest = { candidateCommit: run("git", ["rev-parse", "HEAD"], root).trim(), createdAt: new Date().toISOString(), artifacts,
      testedFromTheseArtifacts: true, node: process.version,
      pythonDependencies: JSON.parse(run(isolatedPython, ["-m", "pip", "list", "--format=json", "--disable-pip-version-check"])),
      checks: ["installed Node v2 verification and gate API", "installed MCP report consequence", "installed TypeScript declarations", "installed isolated Python v2 verification and py.typed"],
      publicationPerformed: false };
    writeFileSync(join(artifactFolder, "package-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log("Package installation, installed demonstration and declaration checks passed");
} finally { rmSync(folder, { recursive: true, force: true }); }
