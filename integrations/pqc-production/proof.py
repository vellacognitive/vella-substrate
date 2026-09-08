"""Private review implementation. No released SDK imports this module."""
import base64
import hashlib
import re
import sys

import bounded_json as bounded
import record as record_contract
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

KIND = 'vella_proof_bundle_pq_draft1'
TYPE = 'application/vnd.vella.authorization.pq-draft1+json'
CONTEXT = 'application/vnd.vella.signature-policy.pq-draft1+json'
SUITE = 'p256+ml-dsa-65'
PROFILE = record_contract.PROFILE
ALGORITHMS = ('ecdsa-p256-sha256', 'ml-dsa-65')
LENGTHS = {'ecdsa-p256-sha256': 64, 'ml-dsa-65': 3309}
HASH = re.compile(r'sha384:[a-f0-9]{96}')


def require_runtime():
    import cryptography

    if not (3, 12) <= sys.version_info[:2] <= (3, 14) or cryptography.__version__ != '50.0.1':
        raise RuntimeError('E_PQ_RUNTIME')
    try:
        from cryptography.hazmat.primitives.asymmetric.mldsa import (
            MLDSA65PrivateKey,
            MLDSA65PublicKey,
        )
    except ImportError as error:
        raise RuntimeError('E_PQ_RUNTIME') from error
    return MLDSA65PrivateKey, MLDSA65PublicKey


def exact(value, fields):
    if type(value) is not dict or len(value) != len(fields) or set(value) != set(fields):
        raise ValueError('unexpected fields')


def required(suite):
    if suite != SUITE:
        raise ValueError('explicit hybrid profile required')


def decode(value, maximum):
    if type(value) is not str or len(value) > ((maximum + 2) // 3) * 4:
        raise ValueError('base64 limit')
    data = base64.b64decode(value, validate=True)
    if len(data) > maximum or base64.b64encode(data).decode() != value:
        raise ValueError('invalid base64')
    return data


def pem(value):
    if type(value) is not str or len(value) > 8192 or len(value.encode()) > 8192:
        raise ValueError('key input limit')
    return value.encode()


def check_key(algorithm, key, private=False):
    pq_private, pq_public = require_runtime()
    if algorithm == 'ml-dsa-65':
        valid = isinstance(key, pq_private if private else pq_public)
    else:
        valid = isinstance(key, ec.EllipticCurvePrivateKey if private else ec.EllipticCurvePublicKey) and isinstance(key.curve, ec.SECP256R1)
    if not valid:
        raise ValueError('key algorithm mismatch')


def private_key(algorithm, value):
    pq_private, _ = require_runtime()
    if algorithm == 'ml-dsa-65':
        exact(value, ('format', 'value'))
        if value['format'] != 'raw-seed':
            raise ValueError('ML-DSA raw-seed required')
        seed = decode(value['value'], 32)
        if len(seed) != 32:
            raise ValueError('invalid seed length')
        key = pq_private.from_seed_bytes(seed)
        # Python immutable bytes cannot promise explicit zeroization.
        del seed
    else:
        key = serialization.load_pem_private_key(pem(value), None)
    check_key(algorithm, key, True)
    return key


def hash_bytes(data):
    return 'sha384:' + hashlib.sha384(data).hexdigest()


def key_id(key):
    return hash_bytes(key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo))


def pae(kind, payload):
    return f'DSSEv1 {len(kind.encode())} {kind} {len(payload)} '.encode() + payload


def message(payload, keys):
    descriptor = {'kind': KIND, 'payload_type': TYPE, 'suite': SUITE, 'digest_profile': PROFILE, 'keys': keys}
    return pae(TYPE, payload) + pae(CONTEXT, bounded.canonicalize(descriptor))


def sign(record, private_keys, required_suite):
    required(required_suite)
    record_contract.validate_record(record)
    payload = bounded.canonicalize(record)
    exact(private_keys, ALGORITHMS)
    loaded = {alg: private_key(alg, private_keys[alg]) for alg in ALGORITHMS}
    keys = {alg: key_id(key.public_key()) for alg, key in loaded.items()}
    data, signatures = message(payload, keys), {}
    for alg, key in loaded.items():
        if alg == 'ml-dsa-65':
            signature = key.sign(data)
        else:
            r, s = decode_dss_signature(key.sign(data, ec.ECDSA(hashes.SHA256())))
            signature = r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
        signatures[alg] = base64.b64encode(signature).decode()
    return {'kind': KIND, 'payload_type': TYPE, 'suite': SUITE, 'digest_profile': PROFILE,
                'payload': base64.b64encode(payload).decode(), 'keys': keys, 'signatures': signatures, 'payload_hash': hash_bytes(data)}


def verify(input_value, public_keys, required_suite):
    try:
        required(required_suite)
        value = bounded.parse(input_value, 2 * 1024 * 1024) if type(input_value) is str else input_value
        exact(value, ('kind', 'payload_type', 'suite', 'digest_profile', 'payload', 'keys', 'signatures', 'payload_hash'))
        if (value['kind'], value['payload_type'], value['suite'], value['digest_profile']) != (KIND, TYPE, SUITE, PROFILE):
            raise ValueError('unsupported interpretation')
        for item in (value['keys'], value['signatures'], public_keys):
            exact(item, ALGORITHMS)
        if type(value['payload_hash']) is not str or not HASH.fullmatch(value['payload_hash']):
            raise ValueError('invalid hash')
        for alg in ALGORITHMS:
            if type(value['keys'][alg]) is not str or not HASH.fullmatch(value['keys'][alg]):
                raise ValueError('invalid key identity')
        payload = decode(value['payload'], bounded.MAX_BYTES)
        signatures = {alg: decode(value['signatures'][alg], LENGTHS[alg]) for alg in ALGORITHMS}
        if any(len(signatures[alg]) != LENGTHS[alg] for alg in ALGORITHMS):
            raise ValueError('signature length')
        record = record_contract.validate_record(bounded.parse(payload.decode('utf8')))
        data = message(payload, value['keys'])
        if value['payload_hash'] != hash_bytes(data):
            raise ValueError('hash mismatch')
        require_runtime()
        for alg in ALGORITHMS:
            key = serialization.load_pem_public_key(pem(public_keys[alg]))
            check_key(alg, key)
            if value['keys'][alg] != key_id(key):
                raise ValueError('untrusted key')
            sig = signatures[alg]
            if alg == 'ml-dsa-65':
                key.verify(sig, data)
            else:
                der = encode_dss_signature(int.from_bytes(sig[:32], 'big'), int.from_bytes(sig[32:], 'big'))
                key.verify(der, data, ec.ECDSA(hashes.SHA256()))
        return {'ok': True, 'format': KIND, 'suite': SUITE, 'authenticated': record, 'errors': [],
                    'warnings': ['Review draft; no production or preservation assurance']}
    except Exception as error:  # noqa: BLE001 - verifier rejects any malformed untrusted input
        return {'ok': False, 'format': KIND, 'errors': ['E_PQ_RUNTIME' if str(error).startswith('E_PQ_RUNTIME') or isinstance(error, ImportError) else 'E_PQ_INVALID_PROOF'], 'warnings': []}


def generate_keys(required_suite):
    required(required_suite)
    pq_private, _ = require_runtime()
    private_keys, public_keys = {}, {}
    for alg in ALGORITHMS:
        key = pq_private.generate() if alg == 'ml-dsa-65' else ec.generate_private_key(ec.SECP256R1())
        private_keys[alg] = {'format': 'raw-seed', 'value': base64.b64encode(key.private_bytes_raw()).decode()} if alg == 'ml-dsa-65' else key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
        public_keys[alg] = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return {'privateKeys': private_keys, 'publicKeys': public_keys}
