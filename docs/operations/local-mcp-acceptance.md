# Optional local MCP integration acceptance template

This optional template is for an adopter choosing to operate the local stdio MCP reference. It does not describe a Vella Cognitive deployment or define release gates for the public SDK. Copy it into your own integration records if useful; leaving it unfilled is not a repository defect. Other embeddings and adapters have different acceptance needs.

## Deployment inputs

| Input | Required value |
|---|---|
| Adopter operator and incident contact | Adopter-defined |
| Host identifier, OS/version and Node version | Adopter-defined |
| Local filesystem, capacity and protected directory layout | Adopter-defined |
| Process UID, launch/service manager and upstream admission control | Adopter-defined |
| Tools/effects and business consequence boundary | Adopter-defined |
| Typical/peak arrival rate, concurrency, burst duration and payload distribution | Adopter-defined |
| Latency percentile targets and error budget | Adopter-defined |
| Recovery time objective and acceptable evidence/data loss | Adopter-defined |
| Retention duration, backup destination and key custody/rotation owner | Adopter-defined |

Keep private host details and secrets in the adopter's restricted deployment record, not this public repository.

## Suggested evidence for this integration

| Gate | Required evidence | Reference evidence / adopter work |
|---|---|---|
| PROD-01 | Adopter-selected deployment inputs and acceptance targets | Adopter-defined |
| PROD-02 | Exact package integrity/lockfile; repeated sustained/soak, idle-versus-loaded macOS investigation if applicable, realistic bursts/payloads, overload/crash/fault results | Reference/candidate evidence exists; adopter supplies target results |
| PROD-03 | Exercised alerts for proof/receipt failures, unknown outcomes, saturation, disk pressure and key expiry; responder and reconciliation record | Runbook exists; adopter supplies exercise evidence |
| PROD-04 | Capacity estimate, retention policy, isolated backup restore using independent trust, key rotation/revocation and compromise exercise | Synthetic restore passes; adopter assesses actual backup/custody |
| PROD-05 | Actual directory/file permissions, bypass boundaries, resolved dependency assessment and key custody reviewed against deployment threat model | Scoped adapter source review complete; adopter reviews its deployment |
| PROD-06 | Fresh registry verification, exact-version staging, denied/fault calls, rollback rehearsal and rollout/stop owner | Patch qualification complete; adopter verifies selected registry versions and rollout |

Record immutable source/package identities, command versions, start/end times, workload parameters, failures and maximum observations with each run. Preserve failed runs alongside successful reruns. Do not change acceptance thresholds to obtain a pass or replay unknown effects automatically.

Use the [operations runbook](local-mcp.md) and [release procedure](mcp-release.md). Publication, CI success and a scoped source security review do not independently close this record. Acceptance of an adopter's installation requires that adopter's decision against its own targets and evidence. The PROD identifiers are template references, not the substrate's engineering backlog.
