# Local performance qualification — October 15, 2026

All ten sustained hybrid scenarios, the 30-minute hybrid soak, and six sustained classical scenarios passed the existing local-reference acceptance checks. This is evidence for the tested machine and workload, not a production performance guarantee.

## Environment and provenance

- Apple M3 Ultra, 32 logical CPUs, 96 GiB RAM; Darwin 27.0.0, arm64; Node v24.20.0.
- Isolated installed SDK 2.1.0 and MCP adapter 1.1.0 packages; Node archive verified against the official SHA-256 manifest. Tests ran serially on the user workstation, not an exclusively reserved benchmark host.
- Instrumented source snapshot committed as `98ea94b`. Hybrid and soak reports record its pre-commit base; their complete source digest matches the committed classical and hosted runs.
- Source digest: `sha256:8db634bbc104296a70c842ad85ac09244d8579f904f917335e644f954ad59917`.
- Installation lock SHA-256: `10dfc1c79be10f208e192a3cc03c0f2ee43e3e958297a26956ef641b82ed750a`.
- Unchanged plan SHA-256: `f44028507bc3b69b83b277f1aec843c5386a469191261066216a69e56a5fe6ce`.
- Six 180-second healthy scenarios per profile; hybrid adds four 30-second fault scenarios with healthy recovery. Soak is 1,800 seconds at concurrency eight and 4 KiB content. Closed-loop waves, local stdio and filesystem; no workload retries.

## Results

| Run | Measured calls | Unexpected outcomes | Peak server RSS | Result |
|---|---:|---:|---:|---|
| hybrid-sustained | 69,891 | 0 | 219.3 MiB | Pass |
| hybrid-soak | 109,992 | 0 | 242.3 MiB | Pass |
| classical-sustained | 59,748 | 0 | 217.4 MiB | Pass |

| Payload | Concurrency | Hybrid p95 / p99 | Classical p95 / p99 |
|---|---:|---:|---:|
| 1 KiB | 1 | 28.9 / 35.6 ms | 28.0 / 34.7 ms |
| 1 KiB | 4 | 74.2 / 83.8 ms | 76.2 / 86.9 ms |
| 1 KiB | 8 | 133.1 / 150.1 ms | 125.0 / 142.7 ms |
| 4 KiB | 1 | 31.2 / 41.0 ms | 28.5 / 35.4 ms |
| 4 KiB | 4 | 73.8 / 83.6 ms | 73.7 / 84.7 ms |
| 4 KiB | 8 | 135.0 / 152.1 ms | 127.3 / 141.6 ms |

The soak evaluated 109,992 measured calls: p95 140.3 ms, p99 162.9 ms, maximum 876.7 ms. All 110,032 authorizations and 110,032 receipts, including warmup, verified. Settled/late RSS medians were 221.86/242.19 MiB: growth 20.33 MiB against the unchanged 64 MiB limit. Measured-phase event-loop p99 was 20.10 ms against the 50 ms lifetime limit.

The accepted latency limits remain p95 ≤100 ms at concurrency one, p95 ≤250 ms at concurrency four/eight, and p99 ≤500 ms. Individual maxima exceeded 500 ms, including about one second in the classical run. Passing percentile limits does not imply every call meets those limits. One serial run per profile provides no confidence interval or causal estimate of cryptographic overhead.

## Hosted warning investigation

[Hosted run 38784467236](https://github.com/vellacognitive/vella-substrate/actions/runs/38784467236) passed all six qualification jobs without reruns, with five explicit event-loop timing diagnostics across the 60 smoke scenarios. Linux had none in this run. Phase data localized macOS warnings to startup, warmup, measured work and recovery; they are not exclusively startup artifacts.
One macOS/Python 3.13 signing-fault scenario recorded measured-phase p99 of 329.52 ms over 49 histogram samples. Its virtual M1 reported three CPUs and host load around 35; server CPU increased by roughly 123 ms during 1,016 ms of wall time. This is consistent with contention or blocking rather than sustained CPU saturation, but does not prove scheduler contention as the sole cause. The corresponding local sustained workloads did not reproduce the 50 ms lifetime-p99 breach.

## Remediation and claim boundary

The private harness now acknowledges phase transitions before workload timing begins, retains separate phase histograms and sample counts, and captures host load/free memory alongside CPU/RSS. Startup and recovery remain visible and included in lifetime acceptance. An injected 150 ms stall test verifies measured-phase attribution and final snapshot behavior. No distributed SDK/MCP implementation or acceptance threshold was changed.
Functional smoke remains distinct from performance acceptance. The earlier remediation exposes timing warnings while preserving correctness and resource checks. These measurements support a local reference qualification claim only; network storage, remote transport, external IAM, power loss and deployment-specific traffic remain outside scope. Before any customer SLA, repeat qualification on the intended deployment hardware under representative competing load and specify the traffic model, duration, percentile and failure budget.

## Reproduction

Use the commands in [the workload README](../../integrations/pqc-production/operational/README.md) with Node 24.20.0 and isolated installed package builds. Run hybrid sustained, hybrid soak and classical sustained serially with the unchanged plan. Keep operational JSON, per-scenario resource traces, source inventories and installation hashes. The associated evidence bundle contains these local raw reports plus the hosted smoke diagnostics and a SHA-256 manifest.
