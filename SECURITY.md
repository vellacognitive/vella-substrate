# Security Policy

Report vulnerabilities to `agent@vellacognitive.com`.

## Scope

In scope:
- SDK evaluator behavior that could produce incorrect `ALLOWED` or `DENIED` outcomes
- Signing and proof-bundle construction defects
- Verifier defects that could cause false-positive verification, acceptance of forged bundles, or denial-of-service

Out of scope:
- Commercial deployment architecture, hosting, or procurement questions
- Commercial licensing questions (send to `agent@vellacognitive.com` with a non-security subject line)

## Response Commitment

- Acknowledgment within 5 business days
- Coordinated disclosure preferred
- No bug bounty program

## Verifier Bugs (Highest Severity)

Bugs in `verify/` are treated as highest severity because an incorrect verifier undermines downstream audit claims. Include a minimal reproduction bundle and the expected verification outcome in your report.
