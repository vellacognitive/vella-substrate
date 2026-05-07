# VELLA SDK — Latency Benchmarks

Reproducible benchmarks for the in-process SDK. Backs the latency claims in
[`DEPLOYMENT.md`](../DEPLOYMENT.md).

The harness measures two scenarios:

- **decision-only** — `govern({intent, evidenceMask})`. Hot path, no proof bundle.
- **with-proof** — `govern({intent, evidenceMask, proof: {signingKey}})`. Includes
  envelope construction, SHA-256 hashing, and ECDSA P-256 signing.

## Methodology

- **Warmup.** Each scenario runs a warmup phase (10K iterations decision-only,
  2K with-proof) before any measurement, so JIT and import caches are stable.
- **Independent runs.** Each scenario then runs 11 independent measurement
  passes. Per-pass percentiles are computed from the full sample distribution;
  the headline metric is the **median of the per-run medians** (resilient to a
  single noisy run).
- **GC quiesced.** Node runs with `--expose-gc` and calls `global.gc()`
  between runs. Python calls `gc.collect()` then `gc.disable()` for the timed
  inner loop, re-enabled afterward.
- **Ephemeral signing key.** A fresh ECDSA P-256 key is generated at startup
  for the with-proof scenario — no fixture coupling.
- **Timer.** `process.hrtime.bigint()` (Node) and `time.perf_counter_ns()`
  (Python). Monotonic, nanosecond resolution. Timer overhead (~50 ns/sample)
  applies equally to all scenarios.
- **Sample sizes.** Decision-only: 100K iterations × 11 runs = 1.1M samples
  per runtime. With-proof: 10K × 11 = 110K samples per runtime.

The harness emits both the median-of-medians and the full quantile breakdown
of run #1 (so you can see what tail latency on a representative pass looks
like, not just a smoothed central tendency).

## Running

```bash
# full run, both runtimes, human-readable
./benchmarks/run.sh

# JSON output for archival or comparison
./benchmarks/run.sh --json > benchmarks/results/my-machine.json

# ~10s sanity check at reduced N
./benchmarks/run.sh --quick
```

Or per-runtime:

```bash
node --expose-gc benchmarks/bench.js
python3 benchmarks/bench.py
```

The Python script adds `sdk/python` to `sys.path` directly, so `pip install`
is not required — only `cryptography` needs to be available in the active
environment.

## Reference results

### Apple M2 Pro · macOS 26.4 · Node 22.21 / Python 3.12.13

Source JSON: [`results/macos-arm64-m2pro.json`](results/macos-arm64-m2pro.json)

| Runtime          | Scenario      | p50    | p95    | p99    |
| ---------------- | ------------- | ------ | ------ | ------ |
| Node 22 / M2 Pro | decision-only | 0.13µs | 0.13µs | 0.17µs |
| Node 22 / M2 Pro | with-proof    | 153µs  | 179µs  | 247µs  |
| Python 3.12 / M2 Pro | decision-only | 0.96µs | 1.04µs | 1.17µs |
| Python 3.12 / M2 Pro | with-proof    | 158µs  | 180µs  | 227µs  |

(All values are median-of-medians across 11 runs.)

### Linux x86_64 · *(pending — submit a PR with your `results/<machine>.json`)*

The harness is intentionally architecture-agnostic. Run it on your hardware
and either commit the JSON to `benchmarks/results/` or paste the table into
an issue. We will keep the reference table here in sync as more numbers come
in.

## Notes on interpretation

- **Decision-only is dominated by function-call overhead** at this scale.
  The actual policy evaluation is a small constant-time check; the measurement
  largely reflects the runtime's own dispatch cost. Node's V8 inlines the hot
  path aggressively, hence the ~130 ns floor.
- **With-proof is dominated by ECDSA signing** (~150 µs is roughly what a
  P-256 sign costs on Apple Silicon). Hashing and envelope serialization are
  comparable noise.
- **The wide p99→max gap on a single run** (visible in the JSON's
  `sample_run_ns` field) is the OS scheduler, not the SDK. The
  median-of-medians strips most of it; if your SLO is tail-bound, plan for
  ~500 µs decision-only worst case on a typical desktop and budget the
  difference against your scheduler's QoS guarantees.

## Reproducibility

The harness is deterministic given an unloaded machine. To compare numbers
between runs:

1. Quiesce background processes (close browsers, dev servers, etc.).
2. Plug into wall power if on a laptop.
3. Run several times — the median-of-medians should settle within a few
   percent across consecutive invocations.

If your numbers diverge significantly from the reference table on similar
hardware, please file an issue with the JSON output attached.
