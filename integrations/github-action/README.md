# GitHub Actions Authority Gate

This reference adapter places VELLA immediately before a protected workflow consequence. It returns the decision as step outputs and fails the step on `DENIED`, making the next step unreachable under normal GitHub Actions control flow.

## Example

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Establish deployment evidence
        run: ./scripts/verify-deployment-authority.sh

      - name: Check authority with VELLA
        id: vella
        uses: vellacognitive/vella-substrate/integrations/github-action@main
        with:
          intent: EXECUTE_CHANGE
          evidence-mask: "1"
          proof-signing-key: ${{ secrets.VELLA_PROOF_SIGNING_KEY }}
          proof-output: artifacts/vella-deploy-proof.json

      - name: Deploy
        run: ./scripts/deploy.sh

      - name: Retain VELLA proof
        uses: actions/upload-artifact@v4
        with:
          name: vella-deploy-proof
          path: ${{ steps.vella.outputs['proof-path'] }}
```

For production use, pin the action to a reviewed commit SHA or release tag instead of `@main`.

## Inputs

| Input | Required | Meaning |
|---|---:|---|
| `intent` | Yes | Intent recognized by the compiled VELLA policy |
| `evidence-mask` | Yes | Unsigned decimal mask for evidence already established by the workflow |
| `authority-scope` | No | Explicit authority scope; unknown scopes fail closed |
| `policy-version` | No | Expected policy version; mismatches fail closed |
| `proof-signing-key` | No | PEM private key from a GitHub Actions secret |
| `proof-output` | No | Path inside `GITHUB_WORKSPACE`; defaults to `vella-proof.json` |

## Outputs

| Output | Meaning |
|---|---|
| `decision` | `ALLOWED` or `DENIED` |
| `reason-code` | Machine-readable VELLA reason code |
| `latency-us` | In-process evaluation latency |
| `proof-path` | Absolute path to the signed bundle when signing succeeded |

## Security boundary

The action does not establish authentication or authorization evidence for you. The preceding workflow steps must derive the mask from trusted state, and branch protection or environment rules must prevent an untrusted change from rewriting the gate itself.

A denied gate stops this job step. Repository administrators remain responsible for preventing alternate workflows, direct deployments, or other paths that bypass the protected job. Store signing material in GitHub Actions secrets or an approved external secret manager; never commit a private key.

For higher-assurance deployment, pin action dependencies, use protected environments, restrict workflow modification, retain the signed proof as an artifact, and verify it independently with the repository's [`verify/`](../../verify/README.md) tooling.
