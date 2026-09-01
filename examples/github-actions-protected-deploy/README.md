# Protected deployment example

The repository's runnable [Example Protected Deployment](../../.github/workflows/example-protected-deploy.yml) workflow places VELLA immediately before a simulated deployment consequence.

Run it from the GitHub Actions page with one of two evidence states:

- `satisfied`: VELLA returns `ALLOWED`, the proof verifies independently, and the simulated deployment writes a receipt.
- `missing`: VELLA returns `DENIED`, the gate fails closed, and the simulated deployment does not run.

Both paths retain the signed decision and its demonstration public key as a workflow artifact. The signing identity is generated only for the demonstration and must not be reused in production.

## Production adaptation

In a consuming repository, the protected sequence has this shape:

```yaml
- name: Establish trusted deployment evidence
  id: evidence
  run: ./scripts/verify-deployment-authority.sh

- name: Check deployment authority with VELLA
  id: vella
  uses: vellacognitive/vella-substrate/integrations/github-action@v1.0.3
  with:
    intent: EXECUTE_CHANGE
    evidence-mask: ${{ steps.evidence.outputs.mask }}
    proof-signing-key: ${{ secrets.VELLA_PROOF_SIGNING_KEY }}
    proof-output: artifacts/vella-deploy-proof.json

- name: Deploy
  if: success() && steps.vella.outputs.decision == 'ALLOWED'
  run: ./scripts/deploy.sh
```

The evidence-producing step must derive its result from trusted state rather than an operator-controlled workflow input. Protect the workflow and deployment environment against unauthorized modification, retain the proof, and pin the VELLA action to a reviewed release tag or commit SHA.
