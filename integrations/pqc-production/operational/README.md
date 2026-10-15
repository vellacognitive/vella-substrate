# Candidate workload qualification

Run with Node 24.20.0 against an isolated installed SDK/MCP application. The harness loads the installed packages, retains the installation lockfile hash and a source-file hash inventory, and never rewrites SDK or verifier source.

```
node integrations/pqc-production/operational/run.mjs --app /absolute/installed/app --output /absolute/evidence/hybrid.json
node integrations/pqc-production/operational/run.mjs --app /absolute/installed/app --soak --output /absolute/evidence/soak.json
node integrations/pqc-production/operational/run.mjs --app /absolute/installed/app --profile classical --output /absolute/evidence/classical.json
node integrations/pqc-production/operational/pressure.mjs /absolute/installed/app
node integrations/pqc-production/operational/crash.mjs /absolute/installed/app
node integrations/pqc-production/operational/proof-sizes.mjs /absolute/installed/app
```

Run these serially on the acceptance machine. `--smoke` shortens durations and disables latency acceptance; it is not an accepted sustained/soak result. The plan defaults to the unchanged owner-approved local workload. Healthy acceptance is six 180-second scenarios; hybrid faults are four 30-second scenarios with 64 recovery calls. Classical comparison uses the same six healthy durations, machine/runtime, payloads, concurrency, timing boundaries and instrumentation. It is diagnostic, with no relative-regression budget or claim that observed differences are caused entirely by cryptography.

The soak is 1800 seconds at concurrency eight and 4096 ASCII content bytes. Its p95/p99 limits remain 250/500 ms. All calls are closed-loop waves with fresh operator approvals, no automatic retries and no queued admission. Client latency excludes approval construction, post-wave disk accounting and post-scenario artifact reconciliation. Throughput includes wave preparation/accounting. Five warmup waves are excluded from the measured calls; recovery calls are counted separately. Quantiles sort samples and select index floor(n*q), clamped to the last sample. Stage percentiles must not be added together.

The private qualification wrapper selects fault dependencies at construction; the distributed reference has no caller-selected fault mode. Signer and authorization-storage failures must stop effects. Receipt-storage failures occur after the handler and must retain the observed outcome. Every expected effect is checked against its file and verified authorization; receipts and file counts reconcile. Temporary fixtures are removed after validation, so this test is not itself a seven-year archival service.

The pressure fixture holds the first eight authorization acknowledgments after their real local writes. Sixteen native MCP requests must produce eight immediate capacity rejections with no effects, then eight successes after the operator releases the held acknowledgments. This deterministic saturation test establishes the admission boundary, not an open-loop rate SLA. The application reference always uses capacity eight.

Server RSS, CPU and event-loop statistics are sampled once per second, including startup/warmup and any recovery. RSS must stay at or below 512 MiB in these samples; this is a measured bound, not an OS-enforced memory quota or a guarantee about unsampled transients. In sustained acceptance, the lifetime event-loop p99 must be at or below 50 ms; per-second tails/maxima are retained for diagnosis. Late-soak RSS is the final five-minute median; its ceiling is the median of the first settled five-minute window (30–330 seconds after the first sample) plus 64 MiB. Samples and aggregate stage distributions are retained alongside the result.

Temporary artifact accounting adds actual report/authorization/receipt file sizes after every settled wave, with a 10 MiB reserve for configuration, key/public history and telemetry. It reserves the maximum permitted next wave before admitting that wave and fails above 8 GiB. The reported `artifactBytes` includes that reserve and represents logical bytes, not physical filesystem allocation. At least 10 GiB of free space is required at startup. These are the selected local engineering test limits; network storage, power-loss testing, replication and remote identity services are outside the measurement.

The native crash fixture terminates only its own reference child after eight authorization files have been durably retained and before their held acknowledgments permit dispatch. All client calls fail, the eight unused proofs remain valid, and no reports or receipts exist. Explicit stale-lock recovery permits restart and one fresh approved call; no interrupted attempt is replayed. This checks process interruption, not hardware power loss or the general proposition that a missing receipt proves no effect. The size fixture records representative authorization/payload/receipt byte counts for both accepted report sizes.

## Smoke result interpretation

`--smoke` is a functional preflight on shared CI runners. Both request latency and event-loop delay are diagnostic in this mode. The 50 ms event-loop limit and all plan latency limits remain enforced in sustained acceptance mode. Smoke continues to enforce valid resource telemetry, the 512 MiB sampled RSS bound, disk bounds, expected outcomes, proof/receipt verification, effect reconciliation and fault recovery.

Reports distinguish `runMode: "functional-smoke"` from `"performance-acceptance"`. A smoke report always has `performanceAcceptancePassed: null`, even when `allPassed` is true. Each scenario exposes `timing.enforced`, the observed timing pass/fail flags, `diagnostics`, and explicit `failureReasons`. These fields prevent a green functional check from being interpreted as performance acceptance. Full acceptance still requires the prescribed machine, runtime, installation and unchanged plan; arbitrary custom plans are not equivalent evidence.

The monitor uses a 10 ms timer resolution. Resource snapshots occur once per second and include startup/warmup; a short smoke scenario can provide only two snapshots. The wrapper now retains histogram sample counts, process IDs and a final exit snapshot. Assessment uses the final lifetime p99 of each process and reports the worst, so a healthy recovery restart cannot hide an earlier delay. Startup/warmup remain included; the lifetime statistic is not a measurement-phase-only percentile. The current remediation does not attribute delays to runner scheduling versus application work, and does not establish an SLA.

## October 15, 2026 investigation

Two macOS/Python 3.14 failures were inspected: repair PR #23 run 38771037341 and dependency PR #21 run 38771734417. Both completed functional checks and failed the event-loop resource condition. The failing scenarios measured 32 and 64 successful calls respectively, no unexpected outcomes, and lifetime event-loop p99 values of 91.684863 and 65.863679 ms. Each had two resource snapshots. Both jobs passed unchanged on rerun; the combined dependency PR #22 then passed all 16 checks without a rerun.

The confirmed defect is a policy mismatch: smoke excluded request-latency acceptance but still enforced event-loop timing, despite being documented as a functional preflight. Shared-runner variability is a hypothesis, not a proven causal diagnosis. Regression tests replay both recorded delay values and verify that acceptance continues to fail them while smoke reports them explicitly. They also verify memory, telemetry, outcome, latency and soak-growth failures remain blocking where applicable.

Next performance investigation: add explicit workload-phase boundaries and validate the telemetry under injected delays. Process identity, histogram counts and final shutdown samples are now retained, with recovery isolation covered by regression tests. Then run the unchanged sustained hybrid plan, 30-minute soak, and classical comparison serially on an identified acceptance machine with Node 24.20.0 and isolated installed packages. Retain CPU/load, memory, stage distributions, source/lock hashes and repeated results. Profile any repeatable delay in that environment before changing application code or accepted limits. A hosted smoke result does not replace these runs.
