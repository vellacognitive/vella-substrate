"""Experimental exact-byte ML-DSA/hybrid proofs. Not a production format."""
import base64
import hashlib
import json
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.mldsa import MLDSA65PrivateKey, MLDSA65PublicKey
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature, encode_dss_signature
from vella import proof_v2 as base

KIND='vella_pqc_feasibility_v1'
TYPE='application/vnd.vella.experimental.authorization.pqc-v1+json'
CONTEXT='application/vnd.vella.experimental.signature-policy.pqc-v1+json'
PROFILES={'ml-dsa-65':['ml-dsa-65'],'p256+ml-dsa-65':['ecdsa-p256-sha256','ml-dsa-65']}
LENGTHS={'ml-dsa-65':3309,'ecdsa-p256-sha256':64}
def exact(x,keys):
    if not isinstance(x,dict) or set(x)!=set(keys): raise ValueError('unexpected fields')
def profile(suite):
    if suite not in PROFILES: raise ValueError('unsupported suite')
    return PROFILES[suite]
def key_id(key):
    return 'sha384:'+hashlib.sha384(key.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)).hexdigest()
def check_key(alg,key,private=False):
    if alg=='ml-dsa-65': valid=isinstance(key,MLDSA65PrivateKey if private else MLDSA65PublicKey)
    else: valid=isinstance(key,ec.EllipticCurvePrivateKey if private else ec.EllipticCurvePublicKey) and isinstance(key.curve,ec.SECP256R1)
    if not valid: raise ValueError('wrong key algorithm')
def message(payload,suite,keys):
    import rfc8785
    return base.pae(TYPE,payload)+base.pae(CONTEXT,rfc8785.dumps({'suite':suite,'keys':keys}))
def sign_bytes(payload,private_keys,suite):
    algs=profile(suite);exact(private_keys,algs)
    if len(payload)>base.MAX_BYTES: raise ValueError('payload limit')
    loaded={}
    for alg in algs:
        value=private_keys[alg]
        if alg=='ml-dsa-65':
            exact(value,['format','value'])
            if value['format']!='raw-seed': raise ValueError('seed format required')
            seed=base._decode64(value['value'],32)
            if len(seed)!=32: raise ValueError('seed length')
            loaded[alg]=MLDSA65PrivateKey.from_seed_bytes(seed)
        else: loaded[alg]=serialization.load_pem_private_key(value.encode(),None)
    for alg,key in loaded.items(): check_key(alg,key,True)
    keys={alg:key_id(key.public_key()) for alg,key in loaded.items()};msg=message(payload,suite,keys);signatures={}
    for alg,key in loaded.items():
        if alg=='ml-dsa-65': sig=key.sign(msg)
        else:
            r,s=decode_dss_signature(key.sign(msg,ec.ECDSA(hashes.SHA256())));sig=r.to_bytes(32,'big')+s.to_bytes(32,'big')
        signatures[alg]=base64.b64encode(sig).decode()
    return {'kind':KIND,'payload_type':TYPE,'suite':suite,'payload':base64.b64encode(payload).decode(),'keys':keys,'signatures':signatures,'payload_hash':'sha384:'+hashlib.sha384(msg).hexdigest()}
def sign(record,keys,suite):
    base.validate_record(record)
    return sign_bytes(json.dumps(record,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode(),keys,suite)
def verify(bundle,public_keys,required_suite):
    try:
        if isinstance(bundle,str):
            if len(bundle.encode())>2*1024*1024: raise ValueError('envelope limit')
            bundle=base.parse_json(bundle)
        exact(bundle,['kind','payload_type','suite','payload','keys','signatures','payload_hash'])
        algs=profile(required_suite)
        if bundle['kind']!=KIND or bundle['payload_type']!=TYPE or bundle['suite']!=required_suite: raise ValueError('required suite or type mismatch')
        exact(public_keys,algs);exact(bundle['keys'],algs);exact(bundle['signatures'],algs)
        payload=base._decode64(bundle['payload'],base.MAX_BYTES);msg=message(payload,required_suite,bundle['keys'])
        if bundle['payload_hash']!='sha384:'+hashlib.sha384(msg).hexdigest(): raise ValueError('typed message hash mismatch')
        for alg in algs:
            key=serialization.load_pem_public_key(public_keys[alg].encode());check_key(alg,key)
            if bundle['keys'][alg]!=key_id(key): raise ValueError('untrusted key identity')
            sig=base._decode64(bundle['signatures'][alg],LENGTHS[alg])
            if len(sig)!=LENGTHS[alg]: raise ValueError('signature length')
            if alg=='ml-dsa-65':key.verify(sig,msg)
            else:key.verify(encode_dss_signature(int.from_bytes(sig[:32],'big'),int.from_bytes(sig[32:],'big')),msg,ec.ECDSA(hashes.SHA256()))
        record=base.validate_record(base.parse_json(payload.decode('utf8')))
        return {'ok':True,'format':KIND,'suite':required_suite,'authenticated':record,'errors':[],'warnings':['Experimental format; SHA-256 action/policy digests retained; no production assurance claim']}
    except Exception as e:
        return {'ok':False,'format':KIND,'errors':[str(e) or 'signature invalid'],'warnings':[]}
def generate_keys(suite):
    private_keys={};public_keys={}
    for alg in profile(suite):
        key=MLDSA65PrivateKey.generate() if alg=='ml-dsa-65' else ec.generate_private_key(ec.SECP256R1())
        private_keys[alg]={'format':'raw-seed','value':base64.b64encode(key.private_bytes_raw()).decode()} if alg=='ml-dsa-65' else key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()).decode()
        public_keys[alg]=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return {'privateKeys':private_keys,'publicKeys':public_keys}
if __name__=='__main__':
    import sys
    request=json.load(sys.stdin);op=request['op']
    if op=='generate': out=generate_keys(request['suite'])
    elif op=='sign': out=sign(request['record'],request['keys'],request['suite'])
    elif op=='sign_bytes':out=sign_bytes(base64.b64decode(request['payload']),request['keys'],request['suite'])
    else:out=verify(request['bundle'],request['keys'],request['suite'])
    json.dump(out,sys.stdout,ensure_ascii=False,allow_nan=False)
