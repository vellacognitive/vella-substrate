# Walkthrough

## 1. Install SDKs

```bash
npm install @vellacognitive/vella-sdk
pip install vella-sdk
```

## 2. Generate a local signing key (for your own run)

```bash
openssl ecparam -name prime256v1 -genkey -noout -out /tmp/example-signing.key
openssl ec -in /tmp/example-signing.key -pubout -out /tmp/example-signing.pub
```

## 3. Produce a signed decision

Node:

```bash
node examples/node-quickstart.js
```

Python:

```bash
PYTHONPATH=sdk/python python examples/python-quickstart.py
```

## 4. Verify a bundle with standalone verifiers

```bash
node verify/verify.js examples/allowed-bundle.json examples/example-signing.pub
python verify/verify.py examples/allowed-bundle.json examples/example-signing.pub
bash verify/verify.sh examples/allowed-bundle.json examples/example-signing.pub
```

## 5. Check tamper detection

```bash
node verify/verify.js examples/tampered-bundle.json examples/example-signing.pub
```

Expected result: verification fails because the decision field was modified after signing.
