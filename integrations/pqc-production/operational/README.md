# Candidate workload qualification

Run with Node 24.20.0 against an isolated installed SDK/MCP application. The harness loads the installed packages, retains the installation lockfile hash and a source-file hash inventory, and never rewrites SDK or verifier source.

```
node integrations/pqc-production/operational/run.mjs --app /absolute/installed/app --output /absolute/evidence/hybrid.json
node integrations/pqc-production/operational/run.mjs --app /absolute/installed/app --soak --output /absolute/evidence/soak.json
node integrations/pqc-production/operational/run.mjs --app /absolute/installed/app --profile classical --output /absolute/evidence/classical.json
node integrations/pqc-production/operational/pressure.mjs /absolute/installed/app
```

Run these serially on the acceptance machine. `--smoke` shortens durations and disables latency acceptance; it is not an accepted sustained/soak result. The plan defaults to the unchanged owner-approved local workload. Healthy acceptance is six 180-second scenarios; hybrid faults are four 30-second scenarios with 64 recovery calls. Classical comparison uses the same six healthy durations, machine/runtime, payloads, concurrency, timing boundaries and instrumentation. It is diagnostic, with no relative-regression budget or claim that observed differences are caused entirely by cryptography.

The soak is 1800 seconds at concurrency eight and 4096 ASCII content bytes. Its p95/p99 limits remain 250/500 ms. All calls are closed-loop waves with fresh operator approvals, no automatic retries and no queued admission. Client latency excludes approval construction, post-wave disk accounting and post-scenario artifact reconciliation. Throughput includes wave preparation/accounting. Five warmup waves are excluded from the measured calls; recovery calls are counted separately. Quantiles sort samples and select index floor(n*q), clamped to the last sample. Stage percentiles must not be added together.

The private qualification wrapper selects fault dependencies at construction; the distributed reference has no caller-selected fault mode. Signer and authorization-storage failures must stop effects. Receipt-storage failures occur after the handler and must retain the observed outcome. Every expected effect is checked against its file and verified authorization; receipts and file counts reconcile. Temporary fixtures are removed after validation, so this test is not itself a seven-year archival service.

The pressure fixture holds the first eight authorization acknowledgments after their real local writes. Sixteen native MCP requests must produce eight immediate capacity rejections with no effects, then eight successes after the operator releases the held acknowledgments. This deterministic saturation test establishes the admission boundary, not an open-loop rate SLA. The application reference always uses capacity eight.

Server RSS, CPU and event-loop statistics are sampled once per second, including startup/warmup and any recovery. RSS must stay at or below 512 MiB in these samples; this is a measured bound, not an OS-enforced memory quota or a guarantee about unsampled transients. The lifetime event-loop p99 must be at or below 50 ms; per-second tails/maxima are retained for diagnosis. Late-soak RSS is the final five-minute median; its ceiling is the median of the first settled five-minute window (30–330 seconds after the first sample) plus 64 MiB. Samples and aggregate stage distributions are retained alongside the result.

Temporary artifact accounting adds actual report/authorization/receipt file sizes after every settled wave, with a 10 MiB reserve for configuration, key/public history and telemetry. It reserves the maximum permitted next wave before admitting that wave and fails above 8 GiB. The reported `artifactBytes` includes that reserve and represents logical bytes, not physical filesystem allocation. At least 10 GiB of free space is required at startup. These are the selected local engineering test limits; network storage, power-loss testing, replication and remote identity services are outside the measurement.
