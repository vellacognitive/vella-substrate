// Experimental only. No published verifier accepts this envelope.
'use strict';
const crypto = require('node:crypto');
const base = require('../../sdk/node/proof-v2.cjs');
const {TextDecoder} = require('node:util');
const KIND='vella_pqc_feasibility_v1';
const TYPE='application/vnd.vella.experimental.authorization.pqc-v1+json';
const CONTEXT='application/vnd.vella.experimental.signature-policy.pqc-v1+json';
const PROFILES=Object.freeze({'ml-dsa-65':['ml-dsa-65'],'p256+ml-dsa-65':['ecdsa-p256-sha256','ml-dsa-65']});
const lengths={'ecdsa-p256-sha256':64,'ml-dsa-65':3309};
function exact(x,fields){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==fields.length||fields.some(k=>!Object.hasOwn(x,k)))throw Error('unexpected fields');}
function profile(suite){if(!Object.hasOwn(PROFILES,suite))throw Error('unsupported suite');return PROFILES[suite];}
function decode(s,max){if(typeof s!=='string'||s.length>Math.ceil(max/3)*4)throw Error('base64 limit');const b=Buffer.from(s,'base64');if(b.length>max||b.toString('base64')!==s)throw Error('noncanonical base64');return b;}
function pae(t,b){return Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(t)} ${t} ${b.length} `),b]);}
function keyId(key){return 'sha384:'+crypto.createHash('sha384').update(key.export({format:'der',type:'spki'})).digest('hex');}
function checkKey(alg,key){if(alg==='ml-dsa-65'?key.asymmetricKeyType!=='ml-dsa-65':key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('wrong key algorithm');}
function message(payload,suite,keys){return Buffer.concat([pae(TYPE,payload),pae(CONTEXT,Buffer.from(base.canonicalize({suite,keys})))]);}
function hash(b){return 'sha384:'+crypto.createHash('sha384').update(b).digest('hex');}
function signBytes(payload,privateKeys,suite){
 const algs=profile(suite);exact(privateKeys,algs);if(payload.length>base.MAX_BYTES)throw Error('payload limit');
 const loaded=algs.map(alg=>{const input=privateKeys[alg];let key;if(alg==='ml-dsa-65'){exact(input,['format','value']);if(input.format!=='raw-seed')throw Error('seed format required');const seed=decode(input.value,32);if(seed.length!==32)throw Error('seed length');key=crypto.createPrivateKey({key:seed,format:'raw-seed',asymmetricKeyType:'ml-dsa-65'});}else key=crypto.createPrivateKey(input);checkKey(alg,key);return key;});
 const keys=Object.fromEntries(algs.map((alg,i)=>[alg,keyId(crypto.createPublicKey(loaded[i]))]));
 const msg=message(payload,suite,keys);
 const signatures=Object.fromEntries(algs.map((alg,i)=>[alg,crypto.sign(alg==='ml-dsa-65'?null:'sha256',msg,{key:loaded[i],...(alg==='ml-dsa-65'?{}:{dsaEncoding:'ieee-p1363'})}).toString('base64')]));
 return {kind:KIND,payload_type:TYPE,suite,payload:payload.toString('base64'),keys,signatures,payload_hash:hash(msg)};
}
function sign(record,keys,suite){base.validateRecord(record);return signBytes(Buffer.from(JSON.stringify(record)),keys,suite);}
function verify(input,publicKeys,requiredSuite){
 try {
  if(typeof input==='string'){if(Buffer.byteLength(input)>2*1024*1024)throw Error('envelope limit');input=base.parseJson(input);}
  base.assertJson(input);exact(input,['kind','payload_type','suite','payload','keys','signatures','payload_hash']);
  const algs=profile(requiredSuite);if(input.kind!==KIND||input.payload_type!==TYPE||input.suite!==requiredSuite)throw Error('required suite or type mismatch');
  exact(publicKeys,algs);exact(input.keys,algs);exact(input.signatures,algs);
  const payload=decode(input.payload,base.MAX_BYTES),msg=message(payload,requiredSuite,input.keys);
  if(input.payload_hash!==hash(msg))throw Error('typed message hash mismatch');
  for(const alg of algs){const key=crypto.createPublicKey(publicKeys[alg]);checkKey(alg,key);if(input.keys[alg]!==keyId(key))throw Error('untrusted key identity');const sig=decode(input.signatures[alg],lengths[alg]);if(sig.length!==lengths[alg])throw Error('signature length');if(!crypto.verify(alg==='ml-dsa-65'?null:'sha256',msg,{key,...(alg==='ml-dsa-65'?{}:{dsaEncoding:'ieee-p1363'})},sig))throw Error('signature invalid');}
  const record=base.parseJson(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(payload));base.validateRecord(record);
  return {ok:true,format:KIND,suite:requiredSuite,authenticated:record,errors:[],warnings:['Experimental format; SHA-256 action/policy digests retained; no production assurance claim']};
 }catch(e){return {ok:false,format:KIND,errors:[e.message],warnings:[]};}
}
function generateKeys(suite){const privateKeys={},publicKeys={};for(const alg of profile(suite)){const p=crypto.generateKeyPairSync(alg==='ml-dsa-65'?'ml-dsa-65':'ec',{...(alg==='ml-dsa-65'?{}:{namedCurve:'prime256v1'}),privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});privateKeys[alg]=alg==='ml-dsa-65'?{format:'raw-seed',value:crypto.createPrivateKey(p.privateKey).export({format:'raw-seed'}).toString('base64')}:p.privateKey;publicKeys[alg]=p.publicKey;}return {privateKeys,publicKeys};}
module.exports={KIND,TYPE,PROFILES,sign,signBytes,verify,generateKeys};
