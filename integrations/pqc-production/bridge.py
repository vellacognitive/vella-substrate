"""Private test bridge, never a distributed verification command."""
import json
import sys

import bounded_json
import proof
import record


def run(request):
    op = request['op']
    if op == 'govern':
        from hybrid_profile import HybridProfile
        from vella import create_governor

        governor = create_governor(request['policy'], proof_profile=HybridProfile())
        result = governor.govern(**request['input'], proof_signing_key=request['keys'])
        return {'result': result, 'policyDigest': governor.policy_digest, 'profileId': governor.proof_profile_id}
    if op == 'generate':
        return proof.generate_keys(request['suite'])
    if op == 'sign':
        return proof.sign(request['record'], request['keys'], request['suite'])
    if op == 'verify':
        return proof.verify(request['bundle'], request['keys'], request.get('suite'))
    if op == 'digest':
        try:
            value = bounded_json.parse(request['text']) if 'text' in request else request['value']
            return {'ok': True, 'digest': record.digest(value)}
        except (ValueError, TypeError, OverflowError, RecursionError):
            return {'ok': False}
    raise ValueError('unsupported test operation')


if __name__ == '__main__':
    requests = json.load(sys.stdin)
    json.dump([run(request) for request in requests], sys.stdout, ensure_ascii=False, allow_nan=False)
