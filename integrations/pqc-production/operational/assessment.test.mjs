import test from 'node:test';
import assert from 'node:assert/strict';
import {assessScenario} from './assessment.mjs';
const baseline = {smoke: false, soak: false, resource: [{rss: 100 * 1024 ** 2, lifetimeEventLoopP99Ms: 20}], endToEndMs: {p95: 40, p99: 60}, p95Limit: 250, p99Limit: 500, unexpected: []};
test('recorded macOS failures remain timing failures in acceptance, diagnostics in smoke', () => {
  for (const delay of [91.684863, 65.863679]) {
    const input = {...baseline, resource: [{rss: 110608384, lifetimeEventLoopP99Ms: delay}]};
    assert.deepEqual(assessScenario(input).failures, ['event-loop-delay']);
    const smoke = assessScenario({...input, smoke: true});
    assert.equal(smoke.passed, true);
    assert.equal(smoke.timing.enforced, false);
    assert.equal(smoke.timing.eventLoopPassed, false);
    assert.deepEqual(smoke.diagnostics, ['event-loop-delay']);
  }
});
test('latency acceptance limits remain inclusive and enforced', () => {
  assert.equal(assessScenario({...baseline, endToEndMs:{p95:250,p99:500},resource:[{rss:512*1024**2,lifetimeEventLoopP99Ms:50}]}).passed,true);
  assert.deepEqual(assessScenario({...baseline,endToEndMs:{p95:251,p99:501}}).failures,['request-latency']);
});
test('smoke still rejects unexpected outcomes, invalid telemetry and memory excess', () => {
  for (const change of [
    {unexpected:[{outcome:'wrong'}]}, {resource:[]},
    {resource:[{rss:513*1024**2,lifetimeEventLoopP99Ms:20}]},
    {resource:[{rss:NaN,lifetimeEventLoopP99Ms:20}]},
    {resource:[{rss:100,lifetimeEventLoopP99Ms:NaN}]},
  ]) assert.equal(assessScenario({...baseline,...change,smoke:true}).passed,false);
});
test('soak acceptance rejects missing baseline and excess growth', () => {
  assert.equal(assessScenario({...baseline,soak:true}).passed,false);
  assert.equal(assessScenario({...baseline,soak:true,settledRss:100,lateRss:100+64*1024**2}).passed,true);
  assert.equal(assessScenario({...baseline,soak:true,settledRss:100,lateRss:101+64*1024**2}).passed,false);
});
test('healthy recovery cannot hide original process delay; final sample wins per process', () => {
  const resource = [
    {pid:1,rss:100,lifetimeEventLoopP99Ms:70},
    {pid:1,rss:100,lifetimeEventLoopP99Ms:65,final:true},
    {pid:2,rss:100,lifetimeEventLoopP99Ms:10,final:true},
  ];
  const result = assessScenario({...baseline,resource});
  assert.equal(result.timing.eventLoopP99Ms,65);
  assert.equal(result.timing.processCount,2);
  assert.deepEqual(result.failures,['event-loop-delay']);
});
