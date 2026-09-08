// Build an isolated copy of the released reference. Production files stay intact.
import {cp,mkdir,writeFile,readFile,readdir,symlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const out=resolve(process.argv[2]),suite=process.argv[3]||'p256+ml-dsa-65';
if(!['baseline','ml-dsa-65','p256+ml-dsa-65'].includes(suite))throw Error('unsupported profile');
await mkdir(out,{recursive:false});await mkdir(join(out,'sdk'));await mkdir(join(out,'mcp'));
for(const file of await readdir(join(root,'sdk/node')))if(/\.(js|cjs)$/.test(file)||file==='package.json')await cp(join(root,'sdk/node',file),join(out,'sdk',file));
for(const file of ['index.js','package.json','example','operational'])await cp(join(root,'integrations/mcp-server',file),join(out,'mcp',file),{recursive:true});
await mkdir(join(out,'mcp/test'));await cp(join(root,'integrations/mcp-server/test/receipt-fault-server.mjs'),join(out,'mcp/test/receipt-fault-server.mjs'));
await symlink(join(root,'integrations/mcp-server/node_modules'),join(out,'mcp/node_modules'),'dir');
const transformations=[];
async function edit(path,from,to){let s=await readFile(path,'utf8');if(!s.includes(from))throw Error(`missing overlay target: ${from}`);await writeFile(path,s.replaceAll(from,to));transformations.push({file:path.slice(out.length+1),from,to});}
const sdk=pathToFileURL(join(out,'sdk/index.js')).href;
async function walk(dir){for(const name of await readdir(dir)){if(name==='node_modules')continue;const p=join(dir,name);if(/\.(mjs|js)$/.test(name)){const s=await readFile(p,'utf8');if(s.includes('"@vellacognitive/vella-sdk"'))await edit(p,'"@vellacognitive/vella-sdk"',JSON.stringify(sdk));}else if(!name.includes('.'))await walk(p);}}
await walk(join(out,'mcp'));
await edit(join(out,'mcp/operational/run.mjs'),'const root = fileURLToPath(new URL("../../../", import.meta.url));',`const root = ${JSON.stringify(root)};`);
await edit(join(out,'mcp/operational/run.mjs'),'acceptanceRun: !smoke',`acceptanceRun: !smoke && ${JSON.stringify(suite)} === 'p256+ml-dsa-65'`);
await edit(join(out,'mcp/operational/run.mjs'),'machine: { cpu:',`experiment: { suite: ${JSON.stringify(suite)}, overlay: ${JSON.stringify(out)} }, machine: { openssl: process.versions.openssl, cpu:`);
await edit(join(out,'mcp/operational/run.mjs'),'let verifiedProofs = 0, verifiedReceipts = 0, effects = 0;','let verifiedProofs = 0, verifiedReceipts = 0, effects = 0; const proofBytes = [];');
await edit(join(out,'mcp/operational/run.mjs'),'const verified = verifyProofV2(bundle, f.publicKey);','proofBytes.push(Buffer.byteLength(JSON.stringify(bundle))); const verified = verifyProofV2(bundle, f.publicKey);');
await edit(join(out,'mcp/operational/run.mjs'),'endToEndMs, stagesMs:','proofBytes: quantiles(proofBytes), endToEndMs, stagesMs:');
if(suite!=='baseline'){
 const prototype=join(here,'proof.cjs'),base=join(root,'sdk/node/proof-v2.cjs');
 await writeFile(join(out,'sdk/proof-v2.cjs'),`// Experiment-only provider substitution; not a v2 wire format.\nconst base=require(${JSON.stringify(base)}),pq=require(${JSON.stringify(prototype)});\nmodule.exports={...base,signV2(record,config){const {suite,keys}=JSON.parse(config);return pq.sign(record,keys,suite);},verifyV2(bundle,config){try {const {suite,keys}=JSON.parse(config);return pq.verify(bundle,keys,suite);}catch(e){return {ok:false,errors:[e.message]};}}};\n`);
 const harness=join(out,'mcp/example/local-harness.mjs');
 await edit(harness,'import { generateKeyPairSync, randomUUID } from "node:crypto";',`import { generateKeyPairSync, randomUUID } from "node:crypto";\nimport pq from ${JSON.stringify(pathToFileURL(prototype).href)};`);
 await edit(harness,'const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });',`const keys=pq.generateKeys(${JSON.stringify(suite)}); const pair={privateKey:JSON.stringify({suite:${JSON.stringify(suite)},keys:keys.privateKeys}),publicKey:JSON.stringify({suite:${JSON.stringify(suite)},keys:keys.publicKeys})};`);
}
const hashes=[];async function hashWalk(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink())continue;const p=join(dir,item.name);if(item.isDirectory())await hashWalk(p);else hashes.push({path:p.slice(out.length+1),sha256:createHash('sha256').update(await readFile(p)).digest('hex')});}}
await hashWalk(out);await writeFile(join(out,'overlay-manifest.json'),JSON.stringify({suite,sourceRoot:root,transformations,files:hashes},null,2)+'\n');
console.log(JSON.stringify({overlay:out,suite,files:hashes.length}));
