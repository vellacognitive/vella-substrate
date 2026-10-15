import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {summarizePhases} from './telemetry.mjs';

test('injected stall belongs to measured phase; startup, recovery and final snapshots survive', async () => {
  const directory=await mkdtemp(join(tmpdir(),'vella-phase-test-'));
  const metrics=join(directory,'metrics.jsonl');
  try {
    await promisify(execFile)(process.execPath,['--input-type=module','-e',`
      import fs from 'node:fs';
      import {startTelemetry} from ${JSON.stringify(new URL('./telemetry.mjs',import.meta.url).href)};
      const path=${JSON.stringify(metrics)};
      const meter=startTelemetry(path);
      const pause=ms=>new Promise(r=>setTimeout(r,ms));
      async function phase(name) {
        fs.writeFileSync(path+'.'+process.pid+'.phase',JSON.stringify({phase:name,token:name}));
        process.kill(process.pid,'SIGUSR2');
        for(let i=0;i<100;i++) {
          await pause(5);
          try {if(JSON.parse(fs.readFileSync(path+'.'+process.pid+'.phase.ack')).token===name)return;}catch{}
        }
        throw new Error('phase timeout');
      }
      await pause(50);
      await phase('warmup'); await pause(50);
      await phase('measured'); await pause(40);
      const until=performance.now()+150; while(performance.now()<until){}
      await pause(40);
      await phase('recovery'); await pause(50);
      meter.close(); meter.close();
    `],{timeout:10000});
    const rows=(await readFile(metrics,'utf8')).trim().split('\n').map(JSON.parse);
    const phases=summarizePhases(rows);
    assert.deepEqual(phases.map(s=>s.phase),['startup','warmup','measured','recovery']);
    assert.ok(phases.every(s=>s.complete && s.samples>0));
    assert.ok(phases.find(s=>s.phase==='measured').maxMs>=100,'injected delay recorded in measured phase');
    assert.equal(rows.filter(s=>s.final).length,1,'idempotent final snapshot');
    assert.equal(new Set(rows.map(s=>s.pid)).size,1);
  } finally {await rm(directory,{recursive:true,force:true});}
});
