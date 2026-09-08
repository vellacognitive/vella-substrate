import sys,json,time
import cryptography
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from vella import proof_v2 as base
import proof as pq
r=json.load(sys.stdin);record=r['record'];rows=[]
def q(values):
    s=sorted(values);return {'n':len(s),'p50':s[int(len(s)*.5)],'p95':s[int(len(s)*.95)],'p99':s[int(len(s)*.99)],'max':s[-1]}
for suite in ['baseline',*pq.PROFILES]:
    if suite=='baseline':
        k=ec.generate_private_key(ec.SECP256R1());private=k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption());public=k.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
        sign=lambda:base.sign_v2(record,private);verify=lambda b:base.verify_v2(b,public)
    else:
        keys=pq.generate_keys(suite);sign=lambda:pq.sign(record,keys['privateKeys'],suite);verify=lambda b:pq.verify(b,keys['publicKeys'],suite)
    for _ in range(100):assert verify(sign())['ok']
    signing=[];verification=[]
    for _ in range(2000):
        t=time.perf_counter_ns();bundle=sign();signing.append((time.perf_counter_ns()-t)/1e6)
        t=time.perf_counter_ns();v=verify(bundle);verification.append((time.perf_counter_ns()-t)/1e6);assert v['ok']
    rows.append({'runtime':'Python','python':sys.version.split()[0],'cryptography':cryptography.__version__,'suite':suite,'contentBytes':r['size'],'signMs':q(signing),'verifyMs':q(verification),'envelopeBytes':len(json.dumps(bundle,separators=(',',':')).encode())})
json.dump(rows,sys.stdout)
