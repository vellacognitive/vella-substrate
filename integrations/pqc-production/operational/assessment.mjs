// Smoke validates behavior on shared runners; acceptance enforces timing budgets.
export function assessScenario({smoke, soak, resource, settledRss, lateRss, endToEndMs, p95Limit, p99Limit, unexpected}) {
  const telemetryValid = resource.length > 0 && resource.every(sample =>
    Number.isFinite(sample.rss) && sample.rss > 0 &&
    Number.isFinite(sample.lifetimeEventLoopP99Ms) && sample.lifetimeEventLoopP99Ms >= 0);
  const rssPassed = telemetryValid && resource.every(sample => sample.rss <= 512 * 1024 ** 2);
  const growthPassed = !soak || smoke || (Number.isFinite(settledRss) && Number.isFinite(lateRss) && lateRss <= settledRss + 64 * 1024 ** 2);
  // A healthy recovery process must not hide the original process's delay.
  const latestByProcess = new Map();
  for (const sample of resource) latestByProcess.set(sample.pid ?? 'legacy', sample);
  const eventLoopP99Ms = Math.max(...[...latestByProcess.values()].map(sample => sample.lifetimeEventLoopP99Ms));
  const eventLoopPassed = telemetryValid && eventLoopP99Ms <= 50;
  const latencyPassed = Number.isFinite(endToEndMs.p95) && Number.isFinite(endToEndMs.p99) && endToEndMs.p95 <= p95Limit && endToEndMs.p99 <= p99Limit;
  const timing = {eventLoopP99Ms, processCount: latestByProcess.size, enforced: !smoke, eventLoopPassed, latencyPassed, eventLoopP99LimitMs: 50};
  const failures = [];
  if (unexpected.length) failures.push('unexpected-outcome');
  if (!telemetryValid) failures.push('missing-or-invalid-resource-telemetry');
  if (!rssPassed) failures.push('rss-limit-or-invalid-sample');
  if (!growthPassed) failures.push('soak-rss-growth');
  if (!smoke && !eventLoopPassed) failures.push('event-loop-delay');
  if (!smoke && !latencyPassed) failures.push('request-latency');
  return {
    timing,
    resourcesPassed: telemetryValid && rssPassed && growthPassed && (smoke || eventLoopPassed),
    failures,
    diagnostics: smoke ? [
      ...(!eventLoopPassed && telemetryValid ? ['event-loop-delay'] : []),
      ...(!latencyPassed ? ['request-latency'] : []),
    ] : [],
    passed: failures.length === 0,
  };
}
