#!/usr/bin/env node
/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC
 *
 * Latency benchmark for the Node SDK.
 *
 * Methodology:
 *   - Warmup phase to stabilize JIT and resolve hot paths.
 *   - K independent runs of N samples each. Per-run percentiles, then
 *     median-of-medians across runs as the headline metric.
 *   - GC quiesced between runs (requires --expose-gc; passed via run.sh).
 *   - Ephemeral ECDSA P-256 signing key for the with-proof scenario.
 *   - Timer is process.hrtime.bigint() (nanoseconds, monotonic).
 *
 * Usage:
 *   node --expose-gc benchmarks/bench.js                  # human-readable
 *   node --expose-gc benchmarks/bench.js --json           # JSON only
 *   node --expose-gc benchmarks/bench.js --quick          # smaller N for sanity check
 */

import crypto from "node:crypto";
import os from "node:os";
import { govern } from "../sdk/node/index.js";

const args = new Set(process.argv.slice(2));
const QUICK = args.has("--quick");
const JSON_ONLY = args.has("--json");

const RUNS = 11;
const DECISION_INNER = QUICK ? 10_000 : 100_000;
const PROOF_INNER = QUICK ? 1_000 : 10_000;
const WARMUP_DECISION = QUICK ? 1_000 : 10_000;
const WARMUP_PROOF = QUICK ? 200 : 2_000;

function ephemeralSigningKeyPem() {
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return privateKey.export({ format: "pem", type: "pkcs8" });
}

function quantiles(samples) {
  const sorted = Float64Array.from(samples);
  sorted.sort();
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  return {
    min: sorted[0],
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function runScenario(label, callable, { warmup, inner }) {
  for (let i = 0; i < warmup; i++) callable();

  const p50s = [];
  const p95s = [];
  const p99s = [];
  let firstRunQuantiles = null;

  for (let r = 0; r < RUNS; r++) {
    if (typeof global.gc === "function") global.gc();

    const samples = new Float64Array(inner);
    for (let i = 0; i < inner; i++) {
      const t0 = process.hrtime.bigint();
      callable();
      const t1 = process.hrtime.bigint();
      samples[i] = Number(t1 - t0); // nanoseconds
    }

    const q = quantiles(samples);
    p50s.push(q.p50);
    p95s.push(q.p95);
    p99s.push(q.p99);
    if (r === 0) firstRunQuantiles = q;
  }

  return {
    label,
    runs: RUNS,
    warmup,
    iterations_per_run: inner,
    median_of_medians_ns: {
      p50: median(p50s),
      p95: median(p95s),
      p99: median(p99s),
    },
    sample_run_ns: firstRunQuantiles,
  };
}

function fingerprint() {
  const cpu = os.cpus()[0];
  return {
    cpu_model: cpu?.model ?? "unknown",
    cpu_count: os.cpus().length,
    arch: os.arch(),
    platform: os.platform(),
    release: os.release(),
    node_version: process.version,
    gc_exposed: typeof global.gc === "function",
    quick: QUICK,
    timestamp: new Date().toISOString(),
  };
}

function fmtUs(ns) {
  return (ns / 1000).toFixed(2) + "µs";
}

function main() {
  const fp = fingerprint();
  if (!fp.gc_exposed && !JSON_ONLY) {
    process.stderr.write(
      "warning: GC not exposed. Re-run with `node --expose-gc` for cleaner numbers.\n",
    );
  }

  const signingKey = ephemeralSigningKeyPem();

  const decisionOnly = runScenario(
    "decision-only",
    () => govern({ intent: "EXECUTE_CHANGE", evidenceMask: 1 }),
    { warmup: WARMUP_DECISION, inner: DECISION_INNER },
  );

  const withProof = runScenario(
    "with-proof",
    () => govern({ intent: "EXECUTE_CHANGE", evidenceMask: 1, proof: { signingKey } }),
    { warmup: WARMUP_PROOF, inner: PROOF_INNER },
  );

  const output = {
    runtime: "node",
    fingerprint: fp,
    results: [decisionOnly, withProof],
  };

  if (JSON_ONLY) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log("VELLA Node SDK — latency benchmark");
  console.log("───────────────────────────────────");
  console.log(`CPU      : ${fp.cpu_model} (${fp.cpu_count} threads, ${fp.arch})`);
  console.log(`Platform : ${fp.platform} ${fp.release}`);
  console.log(`Node     : ${fp.node_version}`);
  console.log(`GC       : ${fp.gc_exposed ? "exposed (quiesced between runs)" : "NOT exposed"}`);
  console.log("");
  for (const r of output.results) {
    console.log(
      `[${r.label}]  runs=${r.runs}  N=${r.iterations_per_run}  warmup=${r.warmup}`,
    );
    console.log(
      `  median-of-medians:  p50=${fmtUs(r.median_of_medians_ns.p50)}  p95=${fmtUs(r.median_of_medians_ns.p95)}  p99=${fmtUs(r.median_of_medians_ns.p99)}`,
    );
    console.log(
      `  first run sample :  min=${fmtUs(r.sample_run_ns.min)}  p50=${fmtUs(r.sample_run_ns.p50)}  p99=${fmtUs(r.sample_run_ns.p99)}  max=${fmtUs(r.sample_run_ns.max)}`,
    );
    console.log("");
  }
  console.log("(JSON: re-run with --json)");
}

main();
