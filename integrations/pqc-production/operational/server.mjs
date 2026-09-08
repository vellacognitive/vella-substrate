// Qualification wrapper: dependencies selected by this harness, never MCP input.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';
const [configPath, app, mode, metricsPath, profile] = process.argv.slice(2);
const require = createRequire(join(app, 'package.json'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const histogram = monitorEventLoopDelay({resolution: 10}), lifetime = monitorEventLoopDelay({resolution: 10}); histogram.enable(); lifetime.enable();
const timer = setInterval(() => {
  const sample = {at: Date.now(), rss: process.memoryUsage().rss, cpu: process.cpuUsage(), lifetimeEventLoopP99Ms: lifetime.percentile(99) / 1e6, eventLoopP99Ms: histogram.percentile(99) / 1e6, eventLoopMaxMs: histogram.max / 1e6};
  histogram.reset();
  fs.appendFileSync(metricsPath, JSON.stringify(sample)+'\n', {mode:0o600});
  if (sample.rss > 512*1024*1024) { process.stderr.write('RESOURCE_RSS_LIMIT\n'); process.exit(2); }
}, 1000); timer.unref();
if (profile === 'classical') {
  await import(pathToFileURL(join(dirname(dirname(dirname(require.resolve('@vellacognitive/vella-mcp-server/pqc/operator')))), 'example/report-server.mjs')));
} else {
  const {createLocalHybridReference} = await import(pathToFileURL(join(dirname(dirname(dirname(require.resolve('@vellacognitive/vella-mcp-server/pqc/operator')))), 'example/pqc/reference.mjs')));
  // Match the installed reference's ESM server class; MCP CJS/ESM classes differ.
  const serverPackage = JSON.parse(fs.readFileSync(join(dirname(dirname(require.resolve('@modelcontextprotocol/server'))), 'package.json'), 'utf8'));
  const {serveStdio} = await import(pathToFileURL(join(dirname(dirname(require.resolve('@modelcontextprotocol/server'))), serverPackage.exports['./stdio'].import.default)));
  const failure = () => { throw new Error('injected dependency failure'); };
  const reference = await createLocalHybridReference(config, {
    ...(mode === 'signing' ? {keyProvider: () => ({capture: failure})} : {}),
    ...(mode === 'pressure' ? {proofSink: sink => ({...sink, async retainAuthorization(value) {
      const ack = await sink.retainAuthorization(value);
      if (config.pressureReadyPath) fs.appendFileSync(config.pressureReadyPath, value.attemptId+'\n', {mode:0o600});
      while (!fs.existsSync(config.pressureReleasePath)) await new Promise(resolve => setTimeout(resolve, 10));
      return ack;
    }})} : {}),
    ...(['authorization-storage','receipt-storage'].includes(mode) ? {proofSink: sink => ({...sink, [mode === 'authorization-storage' ? 'retainAuthorization' : 'retainReceipt']: failure})} : {}),
  });
  process.once('exit', () => { try { reference.close(); } catch { /* stale lock remains explicit */ } });
  process.once('SIGTERM', () => process.exit(0));
  serveStdio(reference.createServer, {legacy:'reject'});
}
