import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import pq from './proof.cjs';
import base from '../../sdk/node/proof-v2.cjs';
import {createGovernor} from '../../sdk/node/governor.js';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const python=process.env.VELLA_VERIFY_PYTHON||'python3';
const output=resolve(process.argv[2]||'interop.json');
const cases=[];
function py(request){const r=spawnSync(python,[resolve(here,'proof.py')],{input:JSON.stringify(request),encoding:'utf8',env:{...process.env,PYTHONPATH:resolve(root,'sdk/python')},maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1',privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const legacy=createGovernor().govern({intent:'EXECUTE_CHANGE',evidenceMask:1,action:{args:{text:'café 😀',numbers:[1,-0,1.25,1e-7],nested:{a:true}}},proof:{signingKey:ec.privateKey}}).proofBundle;
const record=base.verifyV2(legacy,ec.publicKey).authenticated;
function check(name,bundle,keys,suite,want){
 for(const verifier of ['Node','Python']){const result=verifier==='Node'?pq.verify(bundle,keys,suite):py({op:'verify',bundle,keys,suite});assert.equal(result.ok,want,`${name}/${verifier}: ${JSON.stringify(result)}`);if(want)assert.deepEqual(result.authenticated,record);else assert.equal(Object.hasOwn(result,'authenticated'),false);cases.push({name,verifier,passed:true,accepted:want});}
}
for(const suite of Object.keys(pq.PROFILES)){
 for(const origin of ['Node','Python']){
  const {privateKeys,publicKeys}=origin==='Node'?pq.generateKeys(suite):py({op:'generate',suite});
  for(const producer of ['Node','Python']){
   const b=producer==='Node'?pq.sign(record,privateKeys,suite):py({op:'sign',record,keys:privateKeys,suite});
   check(`${suite}/${origin} keys/${producer} producer`,b,publicKeys,suite,true);
   assert.equal(base.verifyV2(b,ec.publicKey).ok,false,'v2 must not silently accept experiment');
  }
  const b=pq.sign(record,privateKeys,suite),mutate=(name,fn)=>{const c=structuredClone(b);fn(c);check(`${suite}/${origin}/${name}`,c,publicKeys,suite,false);};
  mutate('changed payload',c=>{const r={...record,decision:'DENIED',reason_code:'DENY_FAST'};c.payload=Buffer.from(JSON.stringify(r)).toString('base64');});
  mutate('changed type',c=>c.payload_type+='x');
  mutate('unknown field',c=>c.extra=true);
  mutate('missing signature',c=>delete c.signatures['ml-dsa-65']);
  mutate('bad PQ signature',c=>{const s=Buffer.from(c.signatures['ml-dsa-65'],'base64');s[0]^=1;c.signatures['ml-dsa-65']=s.toString('base64');});
  mutate('short PQ signature',c=>c.signatures['ml-dsa-65']='AA==');
  mutate('wrong key identity',c=>c.keys['ml-dsa-65']='sha384:'+'0'.repeat(96));
  mutate('noncanonical base64',c=>c.payload+='\n');
  mutate('wrong digest',c=>c.payload_hash='sha384:'+'0'.repeat(96));
  check(`${suite}/${origin}/wrong trusted key`,b,pq.generateKeys(suite).publicKeys,suite,false);
  check(`${suite}/${origin}/legacy proof`,legacy,publicKeys,suite,false);
  check(`${suite}/${origin}/duplicate envelope key`,JSON.stringify(b).replace('{','{"suite":"wrong",'),publicKeys,suite,false);
  if(suite.startsWith('p256')){
   mutate('bad classical signature',c=>c.signatures['ecdsa-p256-sha256']=Buffer.alloc(64).toString('base64'));
   mutate('strip classical signature',c=>delete c.signatures['ecdsa-p256-sha256']);
   const pqOnly=pq.sign(record,{'ml-dsa-65':privateKeys['ml-dsa-65']},'ml-dsa-65');check('hybrid rejects valid PQ-only proof',pqOnly,publicKeys,suite,false);
   mutate('downgrade suite',c=>c.suite='ml-dsa-65');
  }
  const text=JSON.stringify(record);
  for(const [name,payload] of [
   ['duplicate payload key',text.replace('{','{"decision":"DENIED",')],
   ['escaped duplicate payload key',text.replace('{','{"decisi\\u006fn":"DENIED",')],
   ['trailing payload bytes',text+' true'],
   ['UTF8 BOM', '\ufeff'+text],
   ['invalid UTF8',Buffer.concat([Buffer.from(text),Buffer.from([0xff])])],
   ['wrong action digest',JSON.stringify({...record,action_digest:'sha256:'+'0'.repeat(64)})],
   ['unpaired surrogate',text.replace('café 😀','\\ud800')],
   ['excess nesting',JSON.stringify({...record,evidence:Array.from({length:35}).reduce(a=>({x:a}),{})})]
  ]){const signed=pq.signBytes(Buffer.isBuffer(payload)?payload:Buffer.from(payload),privateKeys,suite);check(`${suite}/${origin}/signed ${name}`,signed,publicKeys,suite,false);}
 }
}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({kind:'vella-pqc-interop-v1',time:new Date().toISOString(),node:process.version,openssl:process.versions.openssl,python,checks:cases.length,allPassed:true,cases},null,2)+'\n');
console.log(`${cases.length} Node/Python interoperability and rejection checks passed`);
