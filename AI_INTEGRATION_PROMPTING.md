# Using AI Coding Agents to Integrate VELLA

This document is a resource for engineers who happen to use AI coding agents — Claude Code, Codex, Cursor, or equivalent — to integrate VELLA into their applications. It covers prompt patterns that produce clean integrations, vocabulary that keeps generated code consistent with the substrate, and explicit notes on when AI assistance is the wrong tool for the work.

AI assistance can help implement an integration once the authority requirements are already understood. It should not be used to decide what is authorized.

This is **one resource among several**. The Interface Control Document at [`spec/icd.md`](./spec/icd.md), the policy reference at [`policy/POLICY_MATRIX.md`](./policy/POLICY_MATRIX.md), the verification tools at [`verify/`](./verify/), and the runnable examples at [`examples/`](./examples/) remain the substrate's authoritative documentation regardless of what tooling you use to integrate. If you don't use AI coding agents, none of this document is required reading.

---

## When this document is useful

AI assistance is well-suited to integration work where the substrate's vocabulary is well-defined and the task is mechanical. Examples:

- Adding a gate around an existing function whose authorization requirements are clear
- Generating boilerplate for evidence collection from an existing authentication system
- Writing test cases for a function that already has a gate in place
- Adding a verification step to a CI pipeline using the published verifiers
- Drafting a deny-event handler that produces useful errors

In these cases, AI assistance reduces routine work and produces output that's easy to review.

## When this document is not useful

Some integration work is better done by hand. AI assistance is a poor fit when:

- You're authoring a policy for a new domain and the authority requirements need careful reasoning. The policy is the contract; understanding it is part of the deliverable.
- The integration sits in a safety-critical or high-stakes path. Line-level review by a human is the deliverable, not an output to be generated and approved.
- You're still learning the substrate's model. Shortcutting that learning produces fragile integrations that break under maintenance.
- The work is novel enough that no template applies. Forcing a template onto novel work produces output that looks right and isn't.

If you're in any of these cases, the rest of this document won't help, and the substrate's primary documentation is where to start.

---

## Vocabulary

Paste this table into your AI agent's context at the start of a session. Generated code, comments, and documentation will use the substrate's vocabulary correctly, which makes integrations easier to review and easier to maintain.

| Use this term | Avoid in VELLA contexts |
|---|---|
| Authority gate | Permission check |
| Intent | Action type |
| Evidence | Credentials, claims |
| Proof bundle | Audit log |
| DENIED decision | Rejection, error |
| Pre-execution adjudication | Post-hoc check |
| Policy | Rule, ACL |
| Adapter | Plugin, middleware |

VELLA's vocabulary is precise on purpose. A "permission check" suggests something that runs alongside an action; an "authority gate" is something an action passes through. A "credential" is something a user holds; "evidence" is something presented to the gate at decision time. The terms shape how integrators think about what the substrate does.

---

## Patterns

Each pattern below covers one common integration task. The prompt template is meant to be adapted — replace the bracketed parts with details from your codebase.

### 1. Adding a VELLA gate to an existing function

When you have a function that performs an authorized action and you want VELLA to decide whether the action proceeds.

```
I have a function in [language] called [function_name] in [file_path] 
that performs [action_description]. Add a VELLA gate before the action 
runs. The intent is [INTENT_NAME]. The required evidence is [evidence 
description: e.g., "AUTHN only" or "AUTHN and AUTHZ"]. On a DENIED 
decision, the function should [behavior: e.g., "raise an exception" 
or "return null and log"]. Use the canonical govern() call shape from 
the README. Do not modify the action itself.
```

After the agent finishes: confirm the gate runs before the action, not after. Confirm the DENIED branch is reachable in tests. Confirm the proof bundle is captured if your application persists them.

### 2. Authoring a custom policy

When you need to define a new intent with its own evidence requirements.

Use this pattern only after a human has already determined the intent boundary and the evidence requirements. The agent may help draft structure; it should not decide authority scope. Read [`spec/icd.md`](./spec/icd.md) and [`policy/POLICY_MATRIX.md`](./policy/POLICY_MATRIX.md) before prompting — the agent's draft is faster to evaluate when you already know what the policy should say.

```
Draft a VELLA policy that defines a new intent named [INTENT_NAME] 
with the following evidence requirements: [list requirements]. Follow 
the policy structure used in policy/POLICY_MATRIX.md. The default 
on missing evidence must be DENIED. Do not include intents other 
than the one specified.
```

After the agent finishes: review the policy line by line. Confirm the evidence mask matches your intent. Confirm there's no implicit ALLOW path. If the policy will be activated in production, the activation step should not be done by the agent.

### 3. Wiring existing evidence to the VELLA engine

When you have an authentication or authorization system in place and you want to translate its outputs into the evidence VELLA expects.

```
My application has [auth system: e.g., "OAuth bearer tokens validated 
by Auth0", "session cookies validated against Redis", "mTLS client 
certs"]. I need to translate the output of that system into VELLA's 
evidence format for the [INTENT_NAME] intent. The required evidence 
mask is [mask]. Write a function that takes [the auth system's output] 
and returns the evidence object. Reference spec/icd.md for the 
evidence format.
```

After the agent finishes: confirm the evidence mask in the generated code matches the policy's requirement. Confirm the function fails closed when the auth system returns an error or empty result. Add a test case for the missing-evidence path.

### 4. Building verification into a CI pipeline

When you want CI to fail if a deployment artifact's proof bundle doesn't verify against the published public key.

```
Add a step to my [CI system: e.g., "GitHub Actions workflow", "GitLab 
CI pipeline", "Jenkins job"] that runs verify/verify.sh against 
[bundle path] using [public key path]. The step should fail the 
pipeline if verification fails. The verifier output should be 
captured for the build log.
```

After the agent finishes: confirm the step's failure mode is "fail loud" (pipeline halts), not "warn and continue." Confirm the verifier is invoked from a pinned commit or release rather than from a moving reference. Confirm the public key path is correct for your environment.

### 5. Generating a test suite for VELLA-gated functions

When you have a function with a gate in place and you want test coverage for both ALLOWED and DENIED paths.

```
Write tests in [test framework: e.g., "pytest", "jest"] for the 
function [function_name] in [file_path]. Cover: (1) the ALLOWED path 
where evidence is sufficient and the action runs, (2) the DENIED 
path where evidence is missing and the action does not run, (3) the 
DENIED path where the intent is not registered in the policy. Verify 
that the proof bundle is generated in the ALLOWED case and contains 
envelope_id, intent, and decision (consult spec/schemas/proof.json 
for the current authoritative field list).
```

After the agent finishes: run the tests. Confirm all three paths are exercised. Confirm the DENIED tests assert the action did not run, not just that an exception was raised. Inspect the generated proof bundle assertions for accuracy.

### 6. Writing a deny-event handler response when something is blocked

When VELLA returns DENIED, your application needs to do something useful — log the event, return a meaningful error to the caller, optionally escalate.

```
Write a handler in [language] that runs when VELLA returns DENIED 
for the [INTENT_NAME] intent. The handler should: (1) log the event 
with the envelope_id, reason_code, and timestamp, (2) return [error 
shape: e.g., "an HTTP 403 with a reason field", "a structured 
exception"], (3) [optional: trigger any escalation flow]. The handler 
should not retry the action automatically. The handler should not 
modify the proof bundle.
```

After the agent finishes: confirm the handler logs the envelope_id (this is the audit trail's anchor). Confirm the error returned to the caller is informative without leaking authority context to unauthorized callers. Confirm there's no automatic retry loop.

---

## Things to handle yourself, not delegate

Some work shouldn't be done by an AI agent regardless of how well prompts are constructed. Each item below has a structural reason.

- **Generating signing keys.** Cryptographic key material should not be produced by a process that retains conversation history.
- **Choosing the integration boundary.** Where the gate sits in the application is part of the security design. An AI agent can help wire the call once the boundary is chosen; it should not choose the boundary for you.
- **Editing production policy after activation.** A live policy is the substrate's commitment to behavior; changes belong in version-controlled review, not in chat.
- **Modifying the verification harness.** The harness is the substrate's normative reference for what verification means. Changes affect every downstream verifier.
- **Approving deployment artifacts.** Approval is itself the authority moment; delegating it defeats the purpose of having a substrate.
- **Reasoning about authority scope for a new domain.** The reasoning is the deliverable. Generating policy without doing the reasoning produces policy that looks right and isn't.
- **Bypassing DENIED responses for convenience.** If a gate is denying frequently, the policy or the evidence wiring is wrong. Bypassing produces a system where the substrate is decorative.

This list is not exhaustive. The general principle: when your understanding of the integration is itself the deliverable, do the work yourself.

---

## Anti-patterns

The prompts that look reasonable and produce bad output, paired with versions that produce better output.

**Vague placement**

❌ *"Add VELLA wherever it makes sense in this codebase."*

✅ *"Add a VELLA gate before the function `process_export` in `src/exports.js`. The intent is `DATA_EXPORT`. The required evidence is AUTHN and AUTHZ."*

The agent can't reason about your authority requirements. Naming the function, the intent, and the evidence requirement produces a single, reviewable change.

**Open-ended adaptation**

❌ *"Make this codebase work with VELLA."*

✅ *"Add a VELLA gate to the function `[name]`. Do not modify any other function. Show me the diff before applying."*

Open-ended prompts produce sprawling changes that are hard to review and often touch code that didn't need to change. Scope the change explicitly.

**Combined policy and integration**

❌ *"Govern the data export flow with VELLA, including authoring the policy."*

✅ Two prompts: first, *"Draft a VELLA policy for an intent named `DATA_EXPORT` with evidence requirements AUTHN and AUTHZ."* Then, after reviewing the policy, *"Add a VELLA gate using the `DATA_EXPORT` intent before the function `process_export`."*

Coupling policy authoring with integration produces output where you can't easily review one without re-reviewing the other. Separating them makes each step independently reviewable.

**Asking the agent to decide what's authorized**

❌ *"Decide what evidence the `process_export` function should require and add the gate."*

✅ *"The `process_export` function requires AUTHN and AUTHZ evidence. Add a gate enforcing that requirement."*

Authority decisions are not implementation details. The agent does not know your application's threat model. Tell it what the requirement is; let it implement.

---

## Verification prompts

Use these after generating integration code to confirm the work is correct. They invoke the substrate's own primitives rather than relying on the agent's claim that something works.

**Verifying a generated proof bundle**

```
Run verify/verify.js against the proof bundle this code produces 
when called with [test inputs]. Show me the verifier's output. If 
it does not return VERIFIED, identify which field caused the failure.
```

**Confirming a policy compiles**

```
Load the policy at [policy path] and confirm it compiles without 
error. Then call govern() with the following test inputs and show 
me the decision and reason_code for each: [list of test inputs 
spanning ALLOWED and DENIED cases].
```

**Confirming evidence wiring**

```
Trace the path from [auth system output] through the evidence 
translation function to the govern() call. Show me what the evidence 
object looks like at each step. Confirm the final mask matches the 
policy's requirement for the [INTENT_NAME] intent.
```

These prompts produce verifiable output rather than reassurance. If the agent's response is "looks correct" rather than "the verifier returned VERIFIED with the following output," the verification didn't happen — re-prompt with more explicit instructions.

---

## Minimum review checklist

Before merging AI-generated integration code, confirm:

- the gate runs before the action, not after
- the action itself is unchanged
- the DENIED path is exercised in tests and asserts the action did not run
- the evidence wiring matches the policy's requirement for the intent
- verification succeeds using the published verifier in [`verify/`](./verify/)
- no convenience bypass (silent retry, fall-through to ALLOWED, swallowed exception) was introduced

If any item fails, the integration is not ready to merge regardless of how well the rest reads.

---

## Going further

The substrate's authoritative documentation is where to go for everything this document does not cover.

- [`README.md`](./README.md) — install, quick example, repository layout
- [`spec/icd.md`](./spec/icd.md) — the Interface Control Document, normative reference for the SDK interface
- [`spec/threat-model.md`](./spec/threat-model.md) — what VELLA protects against and what it does not
- [`spec/reason-codes.md`](./spec/reason-codes.md) — enumeration of decision reason codes
- [`policy/POLICY_MATRIX.md`](./policy/POLICY_MATRIX.md) — reference taxonomy of governance domains
- [`verify/`](./verify/) — standalone proof-bundle verifiers
- [`examples/`](./examples/) — runnable integration examples
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — when to use the SDK versus other components

For commercial licensing, integration services, or deployment support: `agent@vellacognitive.com`.
