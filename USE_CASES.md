# Use-Case Registry

This registry makes the consequence boundary explicit: what is being proposed, what VELLA evaluates, and what the calling system must make unreachable on `DENIED`.

## Ready with the default policy

The public `min-v1` policy recognizes three intents. Evidence masks below use the default definitions in [`sdk/node/policy.js`](sdk/node/policy.js) and [`sdk/python/vella/policy.py`](sdk/python/vella/policy.py).

| Consequence boundary | Intent | Required default evidence | Deny-path obligation | Example integration |
|---|---|---|---|---|
| Production deploy, release, configuration commit, or other controlled change | `EXECUTE_CHANGE` | `AUTHN` (`1`) | Do not run the deploy, release, or mutation step | [GitHub Actions gate](integrations/github-action/README.md) |
| Privilege or role escalation | `ESCALATE_PRIVILEGE` | `AUTHN + AUTHZ` (`3`) | Do not grant the role, token, or elevated session | SDK call at the privilege boundary |
| Data export or disclosure | `DATA_EXPORT` | `AUTHN + AUTHZ` (`3`) | Do not create, transmit, or publish the export | SDK call before export generation or transfer |

The evidence mask is an assertion by the calling application. VELLA evaluates that assertion against policy; it does not independently authenticate the principal or validate the underlying authorization record.

## Candidate custom-policy use cases

These are concrete consequence boundaries for application-supplied policy. They are not additional built-in `min-v1` intents.

| Use case | Candidate intent | Evidence that may be required | Deny path |
|---|---|---|---|
| Agent deletes a repository, branch, database, or cloud resource | `DELETE_RESOURCE` | Authentication, authorization, freshness, human approval | Do not invoke the destructive tool |
| Agent publishes externally | `PUBLISH_EXTERNAL` | Authentication, publication scope, content approval | Do not send or publish content |
| Agent moves money or releases payment | `RELEASE_PAYMENT` | Authentication, authorization, amount-bound approval, freshness | Do not submit the transaction |
| Agent changes firewall, IAM, or production policy | `CHANGE_SECURITY_POLICY` | Authentication, authorization, change ticket, attestation | Do not apply the policy mutation |
| Agent invokes a high-impact MCP tool | `INVOKE_HIGH_IMPACT_TOOL` | Principal identity, tool scope, argument hash, approval | Do not dispatch the MCP request |
| Multi-agent delegation crosses a scope boundary | `DELEGATE_AUTHORITY` | Delegator authority, bounded scope, freshness | Do not issue or honor the delegation |

Python applications can use the stable custom-policy evaluator described in [`sdk/python/README.md`](sdk/python/README.md#custom-policy-evaluators). Custom intent design must preserve the same rule: the caller owns enforcement and must make the proposed consequence unreachable after a denial.

## Register a public use case

A useful registry entry should include:

- the exact consequential action;
- where the VELLA call sits relative to the side effect;
- the intent and authority scope;
- the source of each asserted evidence bit;
- the behavior on `DENIED`, malformed output, and signing failure;
- how proof bundles are retained and independently verified; and
- whether the implementation is public, private, experimental, or production.

Open a GitHub issue or pull request with that information. Do not include confidential policy, customer, credential, or deployment data.
