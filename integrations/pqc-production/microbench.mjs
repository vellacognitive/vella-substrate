import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(join(resolve(process.argv[2]),'package.json'));
const load=name=>import(pathToFileURL(require.resolve(name)));
const sdk=await load('@vellacognitive/vella-sdk');
const pq=await load('@vellacognitive/vella-sdk/pqc/index.js');
const keys=pq.generateHybridKeys(pq.SUITE),gov=sdk.createGovernor(undefined,{proofProfile:pq.HYBRID_PROFILE});
const proof=gov.govern({intent:'EXECUTE_CHANGE',evidenceMask:1,proof:{signingKey:{sign:r=>pq.signProofV3(r,keys.privateKeys,pq.SUITE)}}}).proofBundle;
const record=pq.verifyProofV3(proof,keys.publicKeys,pq.SUITE).authenticated;
function measure(fn,n=500){const samples=[];for(let i=0;i<n+25;i++){const start=performance.now();fn();if(i>=25)samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {samples:n,p50:samples[Math.floor(.5*n)],p95:samples[Math.floor(.95*n)],p99:samples[Math.floor(.99*n)],max:samples.at(-1),mean:samples.reduce((a,b)=>a+b,0)/n};}
console.log(JSON.stringify({kind:'vella-node-v3-microbench',node:process.version,openssl:process.versions.openssl,units:'ms',keyBehavior:'Every sign imports both private keys; every verify imports both public keys. No cache.',evaluate:measure(()=>gov.govern({intent:'EXECUTE_CHANGE',evidenceMask:1})),sign:measure(()=>pq.signProofV3(record,keys.privateKeys,pq.SUITE)),verify:measure(()=>assert.equal(pq.verifyProofV3(proof,keys.publicKeys,pq.SUITE).ok,true)),proofBytes:Buffer.byteLength(JSON.stringify(proof)),scope:'Installed Node provider only; no MCP or storage in these timings'},null,2));
