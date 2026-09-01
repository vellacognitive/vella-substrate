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
      - uses: actions/checkout@v7

      - name: Establish deployment evidence
        run: ./scripts/verify-deployment-authority.sh

      - name: Check authority with VELLA
        id: vella
        uses: vellacognitive/vella-substrate/integrations/github-action@v1.0.3
        with:
          intent: EXECUTE_CHANGE
          evidence-mask: "1"
          proof-signing-key: ${{ secrets.VELLA_PROOF_SIGNING_KEY }}
          proof-output: artifacts/vella-deploy-proof.json

      - name: Deploy
        run: ./scripts/deploy.sh

      - name: Retain VELLA proof
        if: always() && hashFiles('artifacts/vella-deploy-proof.json') != ''
        uses: actions/upload-artifact@v7
        with:
          name: vella-deploy-proof
          path: artifacts/vella-deploy-proof.json
          if-no-files-found: error
```

For production use, pin the action to a reviewed version tag such as `v1.0.3` or, for the highest assurance, to the full commit SHA for that release. The existing `v1.0.3` GitHub release predates repository release immutability. Release immutability is enabled for future VELLA releases and will lock each new release's tag and assets when it is published. A moving major-version tag, when available, is a convenience channel rather than a high-assurance pin.

The repository also includes a [runnable protected-deployment workflow](../../examples/github-actions-protected-deploy/README.md) that exercises allowed and denied decisions, verifies the signed proof, and keeps the simulated consequence unreachable on denial.

## Inputs

| Input | Required | Meaning |
|---|---:|---|
| `intent` | Yes | Intent recognized by the compiled VELLA policy |
| `evidence-mask` | Yes | Unsigned decimal mask for evidence already established by the workflow |
| `authority-scope` | No | Explicit authority scope; unknown scopes fail closed |
| `policy-version` | No | Expected policy version; mismatches fail closed |
| `proof-signing-key` | No | PEM private key from a GitHub Actions secret |
| `proof-output` | No | Regular-file path inside `GITHUB_WORKSPACE`; symlinked components and targets are rejected; defaults to `vella-proof.json` |

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

When proof signing is requested, a signing or proof-path failure also fails the step and withholds decision outputs. Existing regular proof files may be replaced, but symbolic links, multiply linked files, non-directory parent components, and paths outside the workspace are rejected. On platforms that expose a no-follow file-open flag, the final open also rejects a link swap. These checks protect against hostile checked-out path topology; code already executing concurrently with the same runner authority is outside this boundary. A consequence step should retain the normal success condition and additionally check `steps.<id>.outputs.decision == 'ALLOWED'` when using a custom `if` expression.

For higher-assurance deployment, pin action dependencies, use protected environments, restrict workflow modification, retain the signed proof as an artifact, and verify it independently with the repository's [`verify/`](../../verify/README.md) tooling. GitHub Actions artifacts provide workflow evidence retention, not permanent write-once compliance storage; copy proofs into an approved immutable record system when that property is required.
