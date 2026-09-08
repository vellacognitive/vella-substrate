# Vella latency check — September 8, 2026

**The warm SDK still meets the original intent: an in-process authority decision measured in microseconds. The full governed MCP workflow takes milliseconds. Two qualifications remain: a slower first Node call and longer tails for action-bound signing. This is a measured compatibility check, not final performance acceptance.**

## Same-machine comparison

Compared original commit `7af5a878ed002271f74a0c1d1a0b3071d7e66985` with the current uncommitted SOW candidate on this Apple M3 Ultra (32 CPU cores, arm64, Darwin 25.6.0), using Node 22.22.3 and Python 3.12.14. The measured source matched the pre-commit build snapshot; no production code changed for this check.

These are external wall-clock measurements around the complete SDK call. The API’s `latencyUs` / `latency_us` field stops before signing and must not be used as total governance latency.

| SDK operation | Original median | Current median | Original p95 | Current p95 |
|---|---:|---:|---:|---:|
| Node, warm decision | 0.083 µs | 0.083 µs | 0.084 µs | 0.084 µs |
| Python, warm decision | 0.541 µs | 0.667 µs | 0.667 µs | 0.833 µs |
| Node, decision + minimal proof | 92.0 µs | 72.2 µs | 111.3 µs | 88.0 µs |
| Python, decision + minimal proof | 85.4 µs | 73.0 µs | 104.4 µs | 89.2 µs |

Python decision cost increased about 23%, but the absolute increase is only **0.126 µs**. Node was unchanged at the timer’s observed resolution. The new minimal v2 proof path was faster in this run. Original proofs are v1; current proofs are v2, so this compares the same caller request while acknowledging the changed format and protections.

The repository’s historical references were 1–5 µs warm evaluation, up to roughly 76 µs for a first call, and roughly 250 µs with a proof. They were observations, not contractual limits. Old recorded benchmark hardware was an M2 Pro; the table above reruns both versions on the same M3 Ultra instead of attributing hardware differences to the change.

## Qualifications

- **First Node decision after module loading:** median **71.9 → 104.3 µs**; p95 **88.5 → 117.3 µs**. The current maximum across 21 fresh processes was 213.2 µs. That is a real measured first-call increase of about 32 µs at the median. Python first-call medians were 3.63 → 4.33 µs. These measurements exclude import and process startup.
- **Action-bound proofs have more work than the historical minimal proof.** With 1,024 / 4,096 bytes of ASCII report content, current Node medians were **96.8 / 139.0 µs**, p95 **115.3 / 164.7 µs**, and p99 **273.2 / 341.0 µs**. Python medians were **130.6 / 155.3 µs**, p95 **154.0 / 181.2 µs**, and p99 **168.1 / 199.4 µs**. The approximate 250 µs historical figure is therefore not an all-calls ceiling.
- The hot synthetic signing loop is more favorable than real MCP traffic. Inside the MCP runs, proof preparation/signing alone had medians of **0.44 / 0.57 ms** and verification **0.40 / 0.50 ms**, respectively. Different call shapes, evidence, scheduling and warm-up conditions prevent treating the microbenchmark as a bound for that workload.

## Actual local MCP calls

Measured the official MCP client over stdio against the selected report server. Each successful call wrote the requested report, retained a verifiable authorization before execution, and retained its receipt. A disposable control server used the same MCP SDK, report schema, exclusive file creation and report file synchronization, without the governance stages. It was used only for comparison; the production boundary was unchanged.

| End-to-end operation | Median | p95 | p99 |
|---|---:|---:|---:|
| Control report, 1,024 bytes | 5.55 ms | 6.62 ms | 7.34 ms |
| Governed report, 1,024 bytes | **18.91 ms** | **21.61 ms** | **27.66 ms** |
| Control report, 4,096 bytes | 5.63 ms | 6.58 ms | 7.00 ms |
| Governed report, 4,096 bytes | **19.98 ms** | **38.62 ms** | **56.46 ms** |
| Stopped for missing evidence, 1,024 bytes | 0.35 ms | 0.49 ms | 0.61 ms |

The difference between governed and control medians was approximately **13.35 ms** at 1,024 bytes and **14.35 ms** at 4,096 bytes. These are differences between scenario medians, not per-request paired overhead percentiles.

For the 1,024-byte governed call, median stage times were about **5.38 ms retaining authorization**, **5.21 ms executing and synchronizing the report**, and **5.47 ms retaining the receipt**. These three disk stages dominate the call. Individual stage medians do not add exactly to the end-to-end median; transport, serialization and work outside instrumented stages are also included in the latter.

The larger-payload tail was concentrated in the third pass: that pass’s p95 was 50.05 ms versus 21.84 and 21.61 ms in the preceding passes. Authorization/receipt retention also showed longer waits. This identifies where time accumulated, but does not establish that payload size alone caused the slowdown. The largest governed call observed was 63.52 ms.

All **600 measured governed calls** succeeded, with correct report content, acknowledged authorization and receipt retention. All 660 authorization proofs, including warm-up calls, verified. All **100 measured missing-evidence calls** stopped without creating a report or authorization file. The 600 measured control calls also produced correct reports. This latency workload did not retest injected storage faults; those are covered by the prior functional evidence.

## What this means for the SOW

1. **Keep the embedded SDK as the low-latency adjudication layer.** Its warm performance remains suitable for the original microsecond use case.
2. **Keep the approved server-handler boundary for the local MCP workflow.** Its evidence checks and pre-execution storage remain required. Budget this reference in milliseconds; do not describe the entire governed MCP call as a microsecond operation.
3. **Track the Node first-call increase and signing tails.** For latency-sensitive hosts, evaluate explicit initialization/warm-up before serving actions. If a strict first-call or signing p99 limit is required, profile and optimize against that limit before acceptance.
4. **Define deployment budgets separately for warm decisions, first calls, signing, time until dispatch, and the complete MCP response.** Then run sustained tests at expected concurrency and failure rates. Per-stage timings are available here, but exact time until dispatch was not separately instrumented.

No formal latency target was agreed before this run. **A16 remains open**: this check establishes realistic local baselines and shows the tradeoff, but cannot certify an unspecified deployment budget. No correctness or retention safeguards were relaxed.

## Method and evidence

- Original unchanged harness: 11 passes per version/runtime, each with 100,000 decision samples and 10,000 signed samples; warm-ups of 10,000 and 2,000. Headline values are medians of per-pass percentiles. Signing preflights confirmed real ALLOWED results and nonempty proofs before measurement.
- Supplemental mixed ALLOWED/DENIED inputs: five passes of 50,000 samples, checking returned outcomes. This confirmed the warm result outside the single repeated input. Action-bound signing: five passes of 5,000 samples per runtime/payload, with nonempty proofs required. First-call check: 21 fresh processes per version/runtime.
- MCP: three passes of 100 calls per payload/scenario, ten warm-ups per server process, concurrency one. Scenario order alternated across passes. End-to-end timing covered `client.callTool` through the response. Operator approval preparation and server startup were outside call timing. Startup/connection/list-tools took roughly 163–183 ms across these processes and is recorded separately in the logs.
- The MCP run lasted roughly 21 seconds across all scenarios. It is a short local check, not a sustained-load or concurrent-load qualification. Normal desktop activity was not excluded. File/directory `fsync` acknowledgments do not certify arbitrary hardware power-loss survival.

[Recorded measurements](../../benchmarks/results/2026-09-08-sow-local.json) · [Original SDK benchmark methodology](../../benchmarks/README.md) · [SOW acceptance ledger](acceptance.md)
