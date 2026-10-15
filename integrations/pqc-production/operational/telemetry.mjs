import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {loadavg, freemem} from 'node:os';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {performance} from 'node:perf_hooks';

// Readers poll this path concurrently. Publish complete JSON by same-directory
// rename so they see either the previous acknowledgement or the complete new one.
export function publishPhaseAcknowledgement(path, request) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(request), {mode: 0o600, flag: 'wx'});
    fs.renameSync(temporary, path);
  } finally { fs.rmSync(temporary, {force: true}); }
}

// Private harness instrumentation, never exposed as an MCP tool or SDK option.
export function startTelemetry(metricsPath) {
  const interval = monitorEventLoopDelay({resolution:10});
  const lifetime = monitorEventLoopDelay({resolution:10});
  const phaseHistogram = monitorEventLoopDelay({resolution:10});
  for (const h of [interval,lifetime,phaseHistogram]) h.enable();
  let phase = 'startup', phaseStartedAt = performance.now(), closed = false;
  function sample({final = false, phaseEnd = false} = {}) {
    const row = {
      at:Date.now(), monotonicMs:performance.now(), pid:process.pid, final,
      phase, phaseEnd, phaseElapsedMs:performance.now()-phaseStartedAt,
      phaseEventLoopSamples:phaseHistogram.count,
      phaseEventLoopP99Ms:phaseHistogram.count ? phaseHistogram.percentile(99)/1e6 : null,
      phaseEventLoopMaxMs:phaseHistogram.count ? phaseHistogram.max/1e6 : null,
      eventLoopSamples:interval.count, lifetimeEventLoopSamples:lifetime.count,
      lifetimeEventLoopP99Ms:lifetime.percentile(99)/1e6,
      eventLoopP99Ms:interval.percentile(99)/1e6, eventLoopMaxMs:interval.max/1e6,
      rss:process.memoryUsage().rss, cpu:process.cpuUsage(), hostLoadAverage:loadavg(), hostFreeMemoryBytes:freemem(),
    };
    interval.reset();
    fs.appendFileSync(metricsPath, JSON.stringify(row)+'\n', {mode:0o600});
    if (!final && row.rss > 512*1024**2) { process.stderr.write('RESOURCE_RSS_LIMIT\n'); process.exit(2); }
  }
  function transition() {
    const controlPath = `${metricsPath}.${process.pid}.phase`;
    const request = JSON.parse(fs.readFileSync(controlPath,'utf8'));
    if (!['warmup','measured','recovery'].includes(request.phase)) throw new Error('invalid telemetry phase');
    sample({phaseEnd:true});
    phase=request.phase; phaseStartedAt=performance.now(); phaseHistogram.reset(); interval.reset();
    publishPhaseAcknowledgement(`${controlPath}.ack`, request);
  }
  const timer=setInterval(()=>sample(),1000); timer.unref();
  process.on('SIGUSR2',transition);
  function close() {
    if (closed) return;
    closed=true; clearInterval(timer); sample({final:true,phaseEnd:true});
    for (const h of [interval,lifetime,phaseHistogram]) h.disable();
    process.removeListener('SIGUSR2',transition);
  }
  process.once('exit',close);
  return {close};
}

export function summarizePhases(resource) {
  const latest=new Map();
  for (const sample of resource) if (sample.phase) latest.set(`${sample.pid}:${sample.phase}`,sample);
  return [...latest.values()].map(s=>({pid:s.pid,phase:s.phase,elapsedMs:s.phaseElapsedMs,samples:s.phaseEventLoopSamples,p99Ms:s.phaseEventLoopP99Ms,maxMs:s.phaseEventLoopMaxMs,complete:Boolean(s.phaseEnd)}));
}
