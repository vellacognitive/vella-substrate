from vella import govern

with open("/tmp/example-signing.key", "r", encoding="utf-8") as handle:
    signing_key = handle.read()

result = govern(
    intent="EXECUTE_CHANGE",
    evidence_mask=1,
    proof_signing_key=signing_key,
)

print(result)
