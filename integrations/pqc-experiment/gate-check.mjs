import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import pq from './proof.cjs';
const overlay=resolve(process.argv[2]),output=resolve(process.argv[3]);
const {createGovernor,createExecutionGate,createLocalProofSink}=await import(pathToFileURL(join(overlay,'sdk/index.js')));
const {reportAction,reportPolicy}=await import(pathToFileURL(join(overlay,'mcp/example/report-workflow.mjs')));
const suite='p256+ml-dsa-65',keys=pq.generateKeys(suite),privateConfig=JSON.stringify({suite,keys:keys.privateKeys}),publicConfig=JSON.stringify({suite,keys:keys.publicKeys});
const directory=await mkdtemp(join(tmpdir(),'vella-pqc-gate-'));let effects=0;const results=[];
try{
 for(const fault of ['healthy','remove-pq','remove-classical','corrupt-pq','corrupt-classical','valid-pq-only','wrong-trusted-key','missing-pq-private','missing-classical-private']){
  const folder=join(directory,fault);await mkdir(folder,{mode:0o700});
  const original=createGovernor(reportPolicy);
  const governor={...original,govern(input){const r=original.govern(input);if(!r.proofBundle)return r;
    if(fault==='remove-pq')delete r.proofBundle.signatures['ml-dsa-65'];
    if(fault==='remove-classical')delete r.proofBundle.signatures['ecdsa-p256-sha256'];
    if(fault.startsWith('corrupt-')){const alg=fault==='corrupt-pq'?'ml-dsa-65':'ecdsa-p256-sha256';const b=Buffer.from(r.proofBundle.signatures[alg],'base64');b[0]^=1;r.proofBundle.signatures[alg]=b.toString('base64');}
    if(fault==='valid-pq-only'){const record=JSON.parse(Buffer.from(r.proofBundle.payload,'base64'));r.proofBundle=pq.sign(record,{'ml-dsa-65':keys.privateKeys['ml-dsa-65']},'ml-dsa-65');}return r;
  }};
  const broken=structuredClone(keys.privateKeys);if(fault==='missing-pq-private')delete broken['ml-dsa-65'];if(fault==='missing-classical-private')delete broken['ecdsa-p256-sha256'];
  const gate=createExecutionGate({policy:reportPolicy,governor,signingKey:fault.startsWith('missing-')?JSON.stringify({suite,keys:broken}):privateConfig,publicKey:fault==='wrong-trusted-key'?JSON.stringify({suite,keys:pq.generateKeys(suite).publicKeys}):publicConfig,evidenceProvider:{resolve:async()=>({mask:15,references:{source:'test-operator'}})},proofSink:createLocalProofSink({directory:folder})});
  const before=effects;const result=await gate.execute({intent:'EXPORT_REPORT',action:reportAction({serverId:'test-server',principalId:'test-operator',arguments:{reportId:fault,content:'test'}}),precondition:async()=>true,invoke:async()=>{effects++;return {content:[{type:'text',text:'done'}]};}});
  const allowed=fault==='healthy';assert.equal(effects-before,allowed?1:0);assert.equal(result.outcome,allowed?'reported_success':'not_started');assert.equal(result.authorizationRetained,allowed);if(!allowed)assert.equal(result.reason,'SIGNING_UNAVAILABLE');
  results.push({fault,outcome:result.outcome,effects:effects-before,passed:true});
 }
}finally{await rm(directory,{recursive:true,force:true});}
writeFileSync(output,JSON.stringify({checks:results.length,allPassed:true,results},null,2)+'\n');console.log(`${results.length} gate enforcement checks passed`);
