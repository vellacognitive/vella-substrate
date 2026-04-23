# Contributing

Thanks for helping improve VELLA Substrate.

## Scope

This repository includes:

- SDKs: `sdk/node/`, `sdk/python/`
- Verifiers: `verify/`
- Specifications and schemas: `spec/`
- Test vectors: `test-vectors/`

Please keep changes narrow and aligned to the component you are editing.

## Local setup

### Node SDK

```bash
cd sdk/node
npm ci
npm test
```

### Python SDK

```bash
cd sdk/python
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"
pytest
ruff check .
mypy --strict vella/
```

## Verify test vectors

Run all three standalone verifiers against vectors before opening a PR:

```bash
for f in test-vectors/valid/*.json; do
  node verify/verify.js "$f" examples/example-signing.pub
  python verify/verify.py "$f" examples/example-signing.pub
  bash verify/verify.sh "$f" examples/example-signing.pub
done
```

Tampered vectors must fail verification.

## Pull request expectations

- Include a clear summary of behavior change.
- Add or update tests for SDK logic changes.
- Keep generated artifacts and local caches out of commits.
- Update docs when API behavior, schema fields, or workflow expectations change.

## Security reporting

If you find a security issue, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
