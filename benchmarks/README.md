# VELLA SDK — Latency Benchmarks

Reproducible benchmarks for the in-process SDK. Provides reference measurements for
[`DEPLOYMENT.md`](../DEPLOYMENT.md), not universal latency guarantees. Historical results retain their original artifact and environment scope.

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
is not required — install the dependencies declared by `sdk/python/pyproject.toml` in the active
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

- **Decision-only** measures the complete call path, including runtime and timer overhead. The harness does not isolate policy evaluation from dispatch or establish which component dominates.
- **With-proof** measures envelope construction, hashing and signing together. Profiling or separately controlled measurements are needed to attribute their individual costs.
- **Tail observations are scoped to the recorded run.** In the May 7 M2 Pro JSON, the Node decision-only sample run observed a maximum of 146,833 ns (about 147 µs). That is an observed sample maximum, not a desktop worst-case bound. The `sample_run_ns` fields retain tails that the median-of-medians summary does not capture.
- Scheduler activity, runtime behavior and competing host work are possible contributors to variability. Elapsed samples alone do not establish the cause or rule out SDK work. Set integration targets using representative measurements; this reference does not supply a universal latency guarantee.

## Reproducibility

The harness provides a repeatable workload and measurement procedure. Elapsed timing varies even on an otherwise idle machine. To compare runs:

1. Record the source/package revision, runtime, hardware and operating conditions alongside the JSON output.
2. Quiesce background work for an idle baseline and use consistent power settings.
3. Repeat measurements and retain all results, including tails and slow runs. Do not assume a fixed percentage of variation or discard failures because a rerun passes.
4. Measure representative competing load separately when evaluating integration performance.

If results differ significantly on similar hardware, file an issue with the JSON output and environment details. Preserve historical reference results under their original scope.
