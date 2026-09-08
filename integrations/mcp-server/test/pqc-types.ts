import {createGovernor, createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider} from '@vellacognitive/vella-sdk';
import {HYBRID_PROFILE, SUITE, generateHybridKeys, signProofV3, verifyProofV3, openLocalKeyStore} from '@vellacognitive/vella-sdk/pqc/index.js';
const store = await openLocalKeyStore({directory: '/operator/keys'});
const governor = createGovernor(undefined, {proofProfile: HYBRID_PROFILE});
const session = store.capture();
const governed = governor.govern({intent: 'EXECUTE_CHANGE', evidenceMask: 1, proof: {signingKey: session.signingKey}});
const pair = generateHybridKeys(SUITE);
const checked = verifyProofV3(governed.proofBundle, pair.publicKeys, SUITE);
if (checked.ok) signProofV3(checked.authenticated, pair.privateKeys, SUITE);
createExecutionGate({proofProfile: HYBRID_PROFILE, keyProvider: store,
  proofSink: createLocalProofSink({directory: '/operator/proofs', proofProfile: HYBRID_PROFILE}),
  evidenceProvider: createOperatorEvidenceProvider({loadState: () => ({})})});
// @ts-expect-error The single-signature downgrade is not a supported suite.
generateHybridKeys('ml-dsa-65');
store.close();
