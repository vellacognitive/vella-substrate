import json
import platform
import statistics
import time

import cryptography
from cryptography.hazmat.backends.openssl.backend import backend
from vella import create_governor
from vella.pqc import (
 SUITE,
 HybridProfile,
 generate_hybrid_keys,
 sign_proof_v3,
 verify_proof_v3,
)

pair=generate_hybrid_keys(SUITE); gov=create_governor(proof_profile=HybridProfile())
result=gov.govern(intent='EXECUTE_CHANGE',evidence_mask=1,proof_signing_key=pair['privateKeys'])
bundle=result['proof_bundle']; record=verify_proof_v3(bundle,pair['publicKeys'],SUITE)['authenticated']
def measure(fn,n=500):
 samples=[]
 for i in range(n+25):
  start=time.perf_counter_ns(); fn(); elapsed=(time.perf_counter_ns()-start)/1e6
  if i>=25:samples.append(elapsed)
 samples.sort()
 return {'samples':n,'p50':samples[int(.5*n)],'p95':samples[int(.95*n)],'p99':samples[int(.99*n)],'max':max(samples),'mean':statistics.mean(samples)}
def verify():
 assert verify_proof_v3(bundle,pair['publicKeys'],SUITE)['ok']
print(json.dumps({'kind':'vella-python-v3-microbench','python':platform.python_version(),'cryptography':cryptography.__version__,'openssl':backend.openssl_version_text(),'units':'ms','keyBehavior':'Every sign imports both private keys; every verify imports both public keys. No cache.','evaluate':measure(lambda:gov.govern(intent='EXECUTE_CHANGE',evidence_mask=1)),'sign':measure(lambda:sign_proof_v3(record,pair['privateKeys'],SUITE)),'verify':measure(verify),'proofBytes':len(json.dumps(bundle,separators=(',',':')).encode()),'scope':'Installed Python provider only; no MCP or storage in these timings'},indent=2))
