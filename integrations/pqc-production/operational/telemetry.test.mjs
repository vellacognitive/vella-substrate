import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {summarizePhases, publishPhaseAcknowledgement} from './telemetry.mjs';
import fs from 'node:fs';

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


test('phase acknowledgement remains absent or complete during partial writes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vella-phase-atomic-'));
  const path = join(directory, 'phase.ack');
  const write = fs.writeFileSync;
  let previous;
  try {
    t.mock.method(fs, 'writeFileSync', (temporary, bytes, options) => {
      assert.notEqual(temporary, path);
      write(temporary, bytes.slice(0, -3), options);
      if (previous) assert.deepEqual(JSON.parse(fs.readFileSync(path, 'utf8')), previous);
      else assert.equal(fs.existsSync(path), false);
      // Complete the staged file before the real publisher renames it.
      write(temporary, bytes.slice(-3), {flag: 'a'});
    });
    for (const phase of ['warmup', 'measured', 'recovery']) {
      const request = {phase, token: phase};
      publishPhaseAcknowledgement(path, request);
      assert.deepEqual(JSON.parse(fs.readFileSync(path, 'utf8')), request);
      assert.equal(fs.statSync(path).mode & 0o777, 0o600);
      assert.deepEqual(fs.readdirSync(directory), ['phase.ack']);
      previous = request;
    }
  } finally { t.mock.restoreAll(); await rm(directory, {recursive: true, force: true}); }
});

test('failed acknowledgement publication preserves prior token and cleans staging', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vella-phase-failed-'));
  const path = join(directory, 'phase.ack');
  try {
    publishPhaseAcknowledgement(path, {phase: 'warmup', token: 'old'});
    t.mock.method(fs, 'renameSync', () => { throw new Error('injected rename failure'); });
    assert.throws(() => publishPhaseAcknowledgement(path, {phase: 'measured', token: 'new'}), /injected rename failure/);
    assert.equal(JSON.parse(fs.readFileSync(path, 'utf8')).token, 'old');
    assert.deepEqual(fs.readdirSync(directory), ['phase.ack']);
  } finally { t.mock.restoreAll(); await rm(directory, {recursive: true, force: true}); }
});
