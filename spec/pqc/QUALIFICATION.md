# Post-quantum candidate qualification

**SDK 2.1.0 / MCP 1.1.0 — unpublished.** M1 owner contract accepted by Mike Wilson on 2026-09-08. Full healthy/fault acceptance passed. The 30-minute soak and matched classical diagnostic remain in progress.

## Build and measurement boundary

The designated local machine is an Apple M3 Ultra (32 CPUs), macOS arm64. Node 24.20.0 uses OpenSSL 3.5.7; Python 3.12.14 uses cryptography 50.0.1 / OpenSSL 4.0.2 and rfc8785 0.1.4. The measured runtime packages originate at `a8682521743b5f59759f42d8587d487f9241185c`. Subsequent changes add type declarations, qualification checks and documentation/schema metadata; package payload comparison must confirm executable files remain identical. Each raw run retains its actual source inventory and installed lockfile hash. Final handoff includes both measured and final package hashes; they are not relabeled as the same archive.

Client timing includes the complete governed native stdio call through response. Approval preparation, post-wave artifact accounting and post-scenario verification are outside client latency. Throughput includes preparation/accounting. Five warmup waves and fault recovery are separate from measured calls. Local workloads run serially; hosted checks establish functional compatibility rather than a local latency SLA. Detailed resource/timing definitions are in the operational harness README.

## Full local healthy acceptance

| Report bytes | Concurrent calls | Measured calls | p95 ms | p99 ms | Maximum ms | Result |
|---|---:|---:|---:|---:|---:|---|
| 1024 | 1 | 6,149 | 32.21 | 40.27 | 489.34 | Pass |
| 1024 | 4 | 10,616 | 75.99 | 86.30 | 746.77 | Pass |
| 1024 | 8 | 11,392 | 137.88 | 171.05 | 901.98 | Pass |
| 4096 | 1 | 6,064 | 32.78 | 41.54 | 589.25 | Pass |
| 4096 | 4 | 10,376 | 75.65 | 83.35 | 785.92 | Pass |
| 4096 | 8 | 10,888 | 139.39 | 166.53 | 776.86 | Pass |

Each scenario lasted 180 seconds. Required p95: at most 100 ms at concurrency one and 250 ms at concurrency four/eight; p99 at most 500 ms. No hard maximum was agreed. Outliers remain visible and do not become a hard real-time guarantee.

## Dependency failures and recovery

| Fault | Measured calls | Expected stopped calls | Result |
|---|---:|---:|---|
| mixed-evidence | 2,920 | 1,460 | Pass |
| signing | 2,984 | 2,984 | Pass |
| authorization-storage | 2,984 | 2,984 | Pass |
| receipt-storage | 2,568 | 0 | Pass |

Total measured calls: **66,941**. Unexpected failures: **0**. All **64** recovery calls passed. Prerequisite failures caused no effects. Receipt-storage failures preserved the observed execution outcome; the corresponding missing receipts were expected and reconciled.

## Soak, resources and matched classical diagnostic

Soak result pending; no final memory-growth or sustained-soak claim yet.

Matched classical diagnostic pending.

The native pressure fixture accepted eight of sixteen simultaneous attempts and explicitly rejected eight with no effects or waiting queue. Accepted operations completed after held authorization acknowledgments were released. Concurrent key tests stop all eight pending dispatches after either rotation or revocation and recover with fresh active keys. Cancellation during acknowledgment can leave a valid unused authorization; cancellation after possible dispatch produces an unsigned unknown-outcome receipt without replay.

## Installed provider microbenchmarks

| Provider | Evaluation p95 µs | Signing p95 ms | Verification p95 ms |
|---|---:|---:|---:|
| Node | 0.708 | 1.395 | 0.372 |
| Python | 0.708 | 10.006 | 0.895 |

Each operation has 500 measured samples after 25 warmups. Signing imports both private keys on each call; verification imports both public keys. No key cache is assumed. These small evaluation-only records produce 5915-byte proof envelopes; they are not the 1 KB/4 KB MCP workload. The raw evidence retains mean, p50, p95, p99 and maximum. Python numbers establish provider performance, not a Python MCP path.

## Claims and acceptance status

Microsecond policy adjudication remains supported within the measured in-process boundary. Automated, machine-speed governance also remains supported by the passing local full-call measurements, with the actual p95/p99 and outliers disclosed. Hybrid signing and complete governed operations must not be described using the historical approximately 250-microsecond proof figure.

The cryptographic claim is limited to the explicit P-256 + ML-DSA-65 authorization profile and SHA-384 bindings under trusted operator configuration. It is not whole-platform quantum safety, FIPS certification, a seven-year cryptographic guarantee, trusted timestamps, remote-service latency, or protection from a compromised host/operator.

The acceptance ledger records remaining gates and owner handoff. Package publication remains a separate decision.
