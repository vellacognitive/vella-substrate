import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const app=resolve(process.argv[2]),require=createRequire(join(app,'package.json'));
const load=name=>import(pathToFileURL(require.resolve(name)));
const operator=await load('@vellacognitive/vella-mcp-server/pqc/operator');
const {recoverLocalKeyLock,verifyProofV3,SUITE}=await load('@vellacognitive/vella-sdk/pqc/index.js');
const {Client}=await load('@modelcontextprotocol/client');
const {StdioClientTransport}=await load('@modelcontextprotocol/client/stdio');
const root=await mkdtemp(join(tmpdir(),'vella-crash-')); let client;
async function until(check){const deadline=Date.now()+10000;while(!await check()){if(Date.now()>deadline)throw new Error('crash fixture deadline');await new Promise(resolve=>setTimeout(resolve,10));}}
try {
 const f=await operator.setup(root);f.config.pressureReleasePath=join(root,'never-released');f.config.pressureReadyPath=join(root,'retained-attempts');
 await writeFile(f.configPath,JSON.stringify(f.config));
 const args=Array.from({length:8},(_,i)=>({reportId:`interrupted-${i}`,content:'interruption fixture'}));await operator.approveBatch(f.config,args);
 client=new Client({name:'crash-check',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url)),f.configPath,app,'pressure',join(root,'resources.jsonl'),'hybrid']});
 await client.connect(transport);await client.listTools();
 const pending=Promise.allSettled(args.map(argumentsValue=>client.callTool({name:'exportReport',arguments:argumentsValue})));
 await until(async()=>{try{return (await readFile(f.config.pressureReadyPath,'utf8')).trim().split('\n').length===8;}catch(error){if(error.code==='ENOENT')return false;throw error;}});
 const pid=transport.pid;
 const lock=JSON.parse(await readFile(join(f.config.keyDirectory,'.writer-lock'),'utf8'));
 assert.ok(Number.isInteger(pid)&&pid>0&&pid!==process.pid);assert.equal(lock.pid,pid,'only terminate this fixture writer');
 process.kill(pid,'SIGKILL');
 const outcomes=await pending;assert.ok(outcomes.every(result=>result.status==='rejected'));
 await client.close();client=undefined;
 assert.equal((await readdir(f.config.reportDirectory)).length,0);
 const names=(await readdir(f.config.proofDirectory)).filter(name=>name.endsWith('.authorization.json'));
 for(const name of names){const bundle=JSON.parse(await readFile(join(f.config.proofDirectory,name),'utf8'));assert.equal(verifyProofV3(bundle,f.publicKeys,SUITE).ok,true);}
 assert.equal((await readdir(f.config.proofDirectory)).filter(name=>name.endsWith('.receipt.json')).length,0);
 await until(()=>{try{process.kill(pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}});
 await recoverLocalKeyLock({directory:f.config.keyDirectory,expectedPid:pid,expectedRevision:1,confirmStopped:true});
 client=await operator.connect(f.configPath);
 const recovery={reportId:'fresh-after-recovery',content:'fresh call, no automatic replay'};await operator.approveBatch(f.config,[recovery]);
 const result=await client.callTool({name:'exportReport',arguments:recovery});
 assert.equal(result._meta['com.vellacognitive/governance'].outcome,'reported_success');
 assert.deepEqual(await readdir(f.config.reportDirectory),['fresh-after-recovery.txt']);
 console.log(JSON.stringify({kind:'vella-native-crash-recovery',allPassed:true,interruptedCalls:8,unusedAuthorizations:8,interruptedEffects:0,automaticReplays:0,explicitLockRecovery:true,freshRecoveryCalls:1,scope:'SIGKILL of this fixture server while authorization acknowledgment is held; not hardware power-loss testing'}));
}finally{await client?.close();await rm(root,{recursive:true,force:true});}
