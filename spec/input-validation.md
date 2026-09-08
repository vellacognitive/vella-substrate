# Evidence and custom policy validation

This change hardens the existing evaluator contract. It does not change the legacy proof serializer or establish a new public proof format.

## Evidence requests

Both SDK evaluators accept numeric integers from 0 through 4294967295 inclusive; a finite numeric `1.0` is an integer. They also accept trimmed ASCII decimal strings in that range, a known symbolic name, or an array containing only known symbolic names. Symbol lookup trims and uppercases names. Duplicate known symbols in a request are harmless and combine by bitwise OR.

Missing/null evidence and an empty array mean zero evidence. An empty string, negative/fractional/overflowing number, boolean, object, non-finite number, unknown symbol, or partially invalid symbol list yields `DENIED / E_EVIDENCE_INVALID` when evidence validation is reached. Earlier missing-intent, unknown-scope/intent, and version-mismatch checks keep their established precedence. Invalid evidence must also deny a rule whose required mask is zero.

Bit 31 is evaluated as unsigned in both languages. Numeric masks may use bits absent from the optional symbolic vocabulary; declaring a symbolic name is not required to use a numeric bit.

The existing ICD JSON schema describes the normalized numeric request. SDK decimal/symbolic convenience forms must be resolved against the active policy before validating that representation. Complete request/response/proof schema alignment remains part of the proof-contract milestone.

## Policy activation

Custom policies require nonempty string `policyVersion` and `defaultScope`, an `evidenceBits` object (which may be empty), and a `scopes` object containing the declared default scope. Each scope requires an `intents` object. An omitted `allowUnknownIntents` defaults to false and an omitted `defaultRequiredMask` defaults to zero; explicitly supplied values must be boolean and unsigned integer respectively.

Policy masks must be numeric unsigned integers, including integral JSON floats. Strings such as `"AUTHN"` or `"1"`, booleans, invalid widths, and fractional numbers are rejected during compilation. Evidence definitions must name unique nonzero single bits. Numeric-only evidence names are forbidden because they collide with decimal request syntax.

Names in policy declarations must be nonempty strings without surrounding whitespace. Intent and evidence names normalize to uppercase; any resulting collision rejects activation in either insertion order. Scope names remain case-sensitive. The evaluator copies policy rules so later mutation of the caller's input cannot change an existing instance. Invalid policy configuration raises an exception at creation rather than installing a weakened policy.

## Compatibility

Inputs and policies previously accepted through coercion or silent overwrite will now reject. This is an intentional behavioral correction requiring release notes. No tag or package version has been changed by this implementation batch. Callers should resolve policy compilation failures before enabling the protected workflow.

## Identifier and whitespace boundary

Intent, scope and requested policy-version identifiers must be strings when supplied; objects, booleans and numeric IDs are not converted into policy names. A non-text intent yields `E_INTENT_REQUIRED`, a non-text scope denies, and a non-text requested version yields `E_POLICY_VERSION_MISMATCH` when that check is reached.

Both SDKs use the ECMAScript `String.trim` whitespace set for intent/evidence normalization and policy-name edge checks: U+0009–000D, U+0020, U+00A0, U+1680, U+2000–200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. In particular, BOM is trimmed and NEL (U+0085) is not. This removes Python's previously different default whitespace behavior. Policy intent and evidence names are uppercased; use ASCII policy identifiers for interoperability across runtime Unicode-table versions. Unicode action content remains fully supported by v2 proofs.
