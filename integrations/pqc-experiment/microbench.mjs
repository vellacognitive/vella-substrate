import {performance} from 'node:perf_hooks';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cpus} from 'node:os';
import assert from 'node:assert/strict';
import pq from './proof.cjs';
import base from '../../sdk/node/proof-v2.cjs';
import {createGovernor} from '../../sdk/node/governor.js';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),output=resolve(process.argv[2]);
const q=values=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],p99:s[Math.floor(s.length*.99)],max:s.at(-1)};};
const rows=[];
for(const size of [1024,4096]){
 const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1',privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const b=createGovernor().govern({intent:'EXECUTE_CHANGE',evidenceMask:1,action:{args:{text:'x'.repeat(size)}},proof:{signingKey:ec.privateKey}}).proofBundle;
 const record=base.verifyV2(b,ec.publicKey).authenticated;
 for(const suite of ['baseline',...Object.keys(pq.PROFILES)]){
  const keys=suite==='baseline'?ec:pq.generateKeys(suite);const sign=()=>suite==='baseline'?base.signV2(record,keys.privateKey):pq.sign(record,keys.privateKeys,suite);const verify=b=>suite==='baseline'?base.verifyV2(b,keys.publicKey):pq.verify(b,keys.publicKeys,suite);
  for(let i=0;i<100;i++)assert.equal(verify(sign()).ok,true);
  const signing=[],verification=[];let bundle;
  for(let i=0;i<2000;i++){let t=performance.now();bundle=sign();signing.push(performance.now()-t);t=performance.now();const v=verify(bundle);verification.push(performance.now()-t);assert.equal(v.ok,true);}
  rows.push({suite,contentBytes:size,signMs:q(signing),verifyMs:q(verification),envelopeBytes:Buffer.byteLength(JSON.stringify(bundle))});
 }
 const py=spawnSync(process.env.VELLA_VERIFY_PYTHON||'python3',[resolve(here,'microbench.py')],{input:JSON.stringify({record,size}),encoding:'utf8',env:{...process.env,PYTHONPATH:resolve(root,'sdk/python')}});assert.equal(py.status,0,py.stderr);rows.push(...JSON.parse(py.stdout));
}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({kind:'vella-pqc-microbench-v1',time:new Date().toISOString(),node:process.version,openssl:process.versions.openssl,cpu:cpus()[0].model,scope:'Sequential warm microbenchmarks; key generation excluded; P-256 PEM parsing and ML-DSA seed expansion included; not MCP workload acceptance',rows},null,2)+'\n');console.log(JSON.stringify(rows));
