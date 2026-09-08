import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const app=resolve(process.argv[2]),require=createRequire(join(app,'package.json'));
const load=name=>import(pathToFileURL(require.resolve(name)));
const {setup,approveBatch}=await load('@vellacognitive/vella-mcp-server/pqc/operator');
const {Client}=await load('@modelcontextprotocol/client');
const {StdioClientTransport}=await load('@modelcontextprotocol/client/stdio');
const root=await mkdtemp(join(tmpdir(),'vella-pressure-')); let client;
try {
 const f=await setup(root); f.config.pressureReleasePath=join(root,'release');
 await writeFile(f.configPath,JSON.stringify(f.config));
 const args=Array.from({length:16},(_,i)=>({reportId:`pressure-${i}`,content:'x'.repeat(4096)}));
 await approveBatch(f.config,args);
 client=new Client({name:'pressure-check',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url)),f.configPath,app,'pressure',join(root,'resources.jsonl'),'hybrid']});
 await client.connect(transport); await client.listTools();
 let rejected=0,release,fail;
 const saturated=new Promise((resolve,reject)=>{release=resolve;fail=reject;});
 const timeout=setTimeout(()=>fail(new Error('pressure did not reject eight calls')),10000);
 const calls=args.map(argumentsValue=>client.callTool({name:'exportReport',arguments:argumentsValue}).then(result=>{
   const g=result._meta['com.vellacognitive/governance'];
   if(g.reason==='CAPACITY_EXCEEDED'){assert.equal(g.eligible,false);assert.equal(g.authorizationRetained,false);if(++rejected===8)release();}
   return g;
 }));
 try {await saturated;} finally {clearTimeout(timeout);}
 assert.equal((await readdir(f.config.reportDirectory)).length,0);
 await writeFile(f.config.pressureReleasePath,'release');
 const results=await Promise.all(calls);
 assert.equal(results.filter(g=>g.outcome==='reported_success').length,8);assert.equal(rejected,8);
 assert.equal((await readdir(f.config.reportDirectory)).length,8);
 assert.equal((await readdir(f.config.proofDirectory)).filter(name=>name.endsWith('.authorization.json')).length,8);
 assert.equal((await readdir(f.config.proofDirectory)).filter(name=>name.endsWith('.receipt.json')).length,8);
 console.log(JSON.stringify({kind:'vella-native-pressure-result',allPassed:true,attempts:16,accepted:8,rejected:8,effects:8,queued:0,scope:'Installed reference through native MCP, with authorization acknowledgments held by a trusted fixture to deterministically saturate capacity'}));
} finally {await client?.close();await rm(root,{recursive:true,force:true});}
