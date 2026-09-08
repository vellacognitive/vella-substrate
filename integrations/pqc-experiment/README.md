# Post-quantum feasibility experiment

Private, unpublished research code. This does not modify SDK 2.0.0, MCP 1.0.0, existing proof formats, or release tags. Results determine a later production SOW; they are not production acceptance or independent cryptographic review.

The prototype compares ML-DSA-65 and mandatory P-256 + ML-DSA-65 signatures, using Node native crypto and Python cryptography. The hybrid verifier requires both signatures and independently supplied trusted keys and suite. Both signatures cover the same exact payload bytes and a typed, canonical descriptor binding the suite and full SHA-384 public-key fingerprints. The typed-message hash uses SHA-384. Record structure, canonical action/policy digests and execution receipts retain the released SHA-256 rules; this is not a claim of category-3 strength across the entire system. The experimental media type is distinct from all public formats.

`interop.mjs` tests keys and producers from both languages, cross-verification and malformed/downgraded proofs, including correctly signed invalid records. `microbench.mjs` compares signing and verification in both languages; key generation is outside timing but P-256 PEM parsing and ML-DSA seed expansion are included. Private keys are ephemeral and never written to the report.

`prepare-overlay.mjs OUTPUT PROFILE` generates an isolated copy of the released SDK/MCP reference. PROFILE is `baseline`, `ml-dsa-65`, or `p256+ml-dsa-65`. It substitutes only the proof provider and key generation, redirects SDK imports, and adds experiment provenance and proof-size observations. The existing gate, policy, evidence, fsync retention, effect handler and closed-loop operational plan are reused. The overlay manifest records every transformation and file hash. Do not deploy the generated overlay.

Run with Node 24.20+ (actual tested version recorded in evidence), Python with cryptography 47+ and the released SDK dependencies. Set VELLA_VERIFY_PYTHON to the prepared interpreter. MCP's existing locked dependencies must be installed first.

```sh
node integrations/pqc-experiment/interop.mjs /outside/repo/interop.json
node integrations/pqc-experiment/microbench.mjs /outside/repo/microbench.json
node integrations/pqc-experiment/prepare-overlay.mjs /outside/repo/hybrid p256+ml-dsa-65
node /outside/repo/hybrid/mcp/operational/run.mjs --smoke --output /outside/repo/smoke.json
node /outside/repo/hybrid/mcp/operational/run.mjs --output /outside/repo/sustained.json
```

The full operational plan is six 180-second healthy runs (1/4/8 concurrency × 1/4 KB ASCII reports), four 30-second failure phases and recovery. Limits remain p95 <=100 ms at concurrency 1, <=250 ms at 4/8, p99 <=500 ms, zero unexpected failures and zero effects for failed execution prerequisites. Performance runs must be sequential; do not overlap microbenchmarks or competing workload runs. Hosted checks and platform expansion belong to the later production SOW.
