# Feasibility results — September 8, 2026

The bounded local experiment passed. This supports a production SOW for post-quantum authorization signatures; it is not production qualification or a whole-system quantum-safety claim.

Tested source: `0f431d421f3875582cb3c2ffe73b6fca43fe35da`. Published SDK/MCP runtime and workflows were unchanged from `d5716f2cd624ae04c1ee0ed0350e00bac01f1d66`. Machine: Apple M3 Ultra, 32 CPUs, macOS Darwin 25.6.0; Node 24.20.0/OpenSSL 3.5.7; Python 3.12.14/cryptography 50.0.1.

- 192 Node/Python interoperability and rejection checks passed, plus nine execution-gate checks.
- Pure ML-DSA-65 and required P-256 + ML-DSA-65 each passed ten local MCP smoke scenarios.
- The hybrid full run completed 65,771 measured calls with zero unexpected failures, using the unchanged accepted plan: six healthy 180-second scenarios, four 30-second failure phases and 64 recovery calls.
- All 7,284 expected-stopped measured calls had no effect. Post-run checks verified 58,741 authorizations, 56,157 receipts and 58,741 report effects, including warmup and recovery.

| ASCII content bytes | Concurrency | p95 ms | p99 ms | Result |
|---:|---:|---:|---:|---|
| 1,024 | 1 | 30.83 | 38.69 | Pass |
| 1,024 | 4 | 75.90 | 84.12 | Pass |
| 1,024 | 8 | 138.98 | 158.20 | Pass |
| 4,096 | 1 | 31.09 | 38.50 | Pass |
| 4,096 | 4 | 76.13 | 83.66 | Pass |
| 4,096 | 8 | 146.69 | 164.53 | Pass |

Limits: p95 <=100 ms at concurrency 1, <=250 ms at concurrency 4/8, p99 <=500 ms. The maximum individual observed call was 1,085.01 ms; these results are not a hard maximum-latency guarantee. Short 30-second baseline scenarios on the same runtime are diagnostic comparisons, not equal-duration acceptance or a causal overhead estimate.

Standalone warm microbenchmarks used 2,000 measured iterations after 100 warmups, including key import/seed expansion. Hybrid signing p95 was approximately 1.3 ms in Node and 10.6 ms in Python. Hybrid serialized records added 4,712 bytes over equivalent v2 records. Python end-to-end MCP calls were not measured.

## Production scope implications

1. Select supported runtimes and crypto dependency versions explicitly. Node 22 native ML-DSA key generation failed; the published minimum runtime/dependency ranges cannot be inherited as PQ compatibility claims.
2. Define key serialization and custody. Default Node ML-DSA PKCS#8 private-key encoding was rejected by Python; native 32-byte seed exchange worked in both directions. SPKI public keys were interoperable.
3. Review and version the proof/provider contract. The experiment binds both signatures to identical typed bytes and a suite/key descriptor, and a trusted hybrid requirement rejects valid PQ-only proofs. This custom composition needs independent review and comparison with relevant standards before production.
4. Decide the complete hash-strength profile. New message/key identifiers use SHA-384; existing action/policy/definition/receipt digests remain SHA-256 for isolation. No uniform ML-DSA category-3 claim is established.
5. Implement the public provider API, all verifier entry points, types/schemas, key rotation/revocation, platform qualification, installed-package checks and migration/rollback. The generated overlay is research scaffolding.
6. Scope archive preservation, external KMS/HSM, remote transport and broader infrastructure separately when required. Existing proofs do not become post-quantum retroactively; receipts remain unsigned observations.

The complete local handoff includes raw operational/microbenchmark results, original operating plan, 161 reconciled source hashes, overlay manifests, eight public interoperability vectors, reproduction instructions, a claim audit and production SOW inputs. No public format or package release was made by this experiment.
