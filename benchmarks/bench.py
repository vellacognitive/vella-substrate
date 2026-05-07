#!/usr/bin/env python3
"""VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC

Latency benchmark for the Python SDK.

Methodology:
    - Warmup phase to stabilize import / interpreter caches.
    - K independent runs of N samples each. Per-run percentiles, then
      median-of-medians across runs as the headline metric.
    - GC disabled during the timed inner loop; gc.collect() between runs.
    - Ephemeral ECDSA P-256 signing key for the with-proof scenario.
    - Timer is time.perf_counter_ns() (nanoseconds, monotonic).

Usage:
    python3 benchmarks/bench.py             # human-readable
    python3 benchmarks/bench.py --json      # JSON only
    python3 benchmarks/bench.py --quick     # smaller N for sanity check
"""

from __future__ import annotations

import argparse
import gc
import json
import platform
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "sdk" / "python"))

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402

from vella import govern  # noqa: E402

RUNS = 11


def ephemeral_signing_key_pem() -> str:
    sk = ec.generate_private_key(ec.SECP256R1())
    return sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def quantiles(samples: list[int]) -> dict[str, float]:
    s = sorted(samples)
    n = len(s)

    def at(q: float) -> float:
        return float(s[min(n - 1, int(n * q))])

    return {
        "min": float(s[0]),
        "p50": at(0.50),
        "p95": at(0.95),
        "p99": at(0.99),
        "max": float(s[-1]),
        "mean": sum(s) / n,
    }


def run_scenario(
    label: str,
    callable_: Callable[[], Any],
    *,
    warmup: int,
    inner: int,
) -> dict[str, Any]:
    for _ in range(warmup):
        callable_()

    p50s: list[float] = []
    p95s: list[float] = []
    p99s: list[float] = []
    first_run: dict[str, float] | None = None

    for r in range(RUNS):
        gc.collect()
        gc.disable()
        try:
            samples = [0] * inner
            perf = time.perf_counter_ns
            for i in range(inner):
                t0 = perf()
                callable_()
                samples[i] = perf() - t0
        finally:
            gc.enable()

        q = quantiles(samples)
        p50s.append(q["p50"])
        p95s.append(q["p95"])
        p99s.append(q["p99"])
        if r == 0:
            first_run = q

    return {
        "label": label,
        "runs": RUNS,
        "warmup": warmup,
        "iterations_per_run": inner,
        "median_of_medians_ns": {
            "p50": statistics.median(p50s),
            "p95": statistics.median(p95s),
            "p99": statistics.median(p99s),
        },
        "sample_run_ns": first_run,
    }


def fingerprint(quick: bool) -> dict[str, Any]:
    return {
        "machine": platform.machine(),
        "processor": platform.processor() or "unknown",
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "python_implementation": platform.python_implementation(),
        "quick": quick,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def fmt_us(ns: float) -> str:
    return f"{ns / 1000:.2f}µs"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="emit JSON only")
    parser.add_argument("--quick", action="store_true", help="reduced N for quick sanity check")
    args = parser.parse_args()

    decision_inner = 10_000 if args.quick else 100_000
    proof_inner = 1_000 if args.quick else 10_000
    warmup_decision = 1_000 if args.quick else 10_000
    warmup_proof = 200 if args.quick else 2_000

    signing_key = ephemeral_signing_key_pem()

    decision_only = run_scenario(
        "decision-only",
        lambda: govern(intent="EXECUTE_CHANGE", evidence_mask=1),
        warmup=warmup_decision,
        inner=decision_inner,
    )
    with_proof = run_scenario(
        "with-proof",
        lambda: govern(
            intent="EXECUTE_CHANGE", evidence_mask=1, proof_signing_key=signing_key
        ),
        warmup=warmup_proof,
        inner=proof_inner,
    )

    output = {
        "runtime": "python",
        "fingerprint": fingerprint(args.quick),
        "results": [decision_only, with_proof],
    }

    if args.json:
        print(json.dumps(output, indent=2))
        return

    fp = output["fingerprint"]
    print("VELLA Python SDK — latency benchmark")
    print("─────────────────────────────────────")
    print(f"Processor : {fp['processor']}")
    print(f"Platform  : {fp['platform']}")
    print(f"Python    : {fp['python_implementation']} {fp['python_version']}")
    print("")
    for r in output["results"]:
        print(
            f"[{r['label']}]  runs={r['runs']}  N={r['iterations_per_run']}  warmup={r['warmup']}"
        )
        mom = r["median_of_medians_ns"]
        sr = r["sample_run_ns"]
        print(
            f"  median-of-medians:  p50={fmt_us(mom['p50'])}  p95={fmt_us(mom['p95'])}  p99={fmt_us(mom['p99'])}"
        )
        print(
            f"  first run sample :  min={fmt_us(sr['min'])}  p50={fmt_us(sr['p50'])}  p99={fmt_us(sr['p99'])}  max={fmt_us(sr['max'])}"
        )
        print("")
    print("(JSON: re-run with --json)")


if __name__ == "__main__":
    main()
