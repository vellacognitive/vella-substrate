import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(join(resolve(process.argv[2]),'package.json'));
const {setup,approveBatch,connect}=await import(pathToFileURL(require.resolve('@vellacognitive/vella-mcp-server/pqc/operator')));
const root=await mkdtemp(join(tmpdir(),'vella-proof-sizes-'));let client;
try{
 const f=await setup(root);client=await connect(f.configPath);const rows=[];
 for(const bytes of [1024,4096]){
  const args={reportId:`size-${bytes}`,content:'x'.repeat(bytes)};await approveBatch(f.config,[args]);
  const response=await client.callTool({name:'exportReport',arguments:args});const g=response._meta['com.vellacognitive/governance'];assert.equal(g.outcome,'reported_success');
  const path=join(f.config.proofDirectory,`${g.attemptId}.authorization.json`);const bundle=JSON.parse(await readFile(path,'utf8'));
  rows.push({reportBytes:bytes,authorizationBytes:(await stat(path)).size,decodedPayloadBytes:Buffer.from(bundle.payload,'base64').length,receiptBytes:(await stat(join(f.config.proofDirectory,`${g.attemptId}.receipt.json`))).size});
 }
 console.log(JSON.stringify({kind:'vella-reference-proof-sizes',allPassed:true,rows,scope:'Representative installed local-reference calls; identifier lengths affect exact sizes'},null,2));
}finally{await client?.close();await rm(root,{recursive:true,force:true});}
