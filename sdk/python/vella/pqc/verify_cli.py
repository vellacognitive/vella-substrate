"""Historical v3 verification CLI, with explicit historical profile and operator trust."""
import json
import os
import stat
import sys
from typing import Any

from . import bounded_json as bounded
from . import proof


def integer(value: Any) -> bool:
    return type(value) in (int, float) and int(value) == value


def read(path: str, maximum: int, trusted: bool = False) -> Any:
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'r', encoding='utf8', errors='strict') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > maximum or (trusted and (info.st_uid != os.getuid() or info.st_mode & 0o022)):
            raise ValueError('unsafe or oversized file')
        return bounded.parse(stream.read(maximum + 1), maximum)



def main() -> None:
    try:
        if len(sys.argv) != 5 or sys.argv[4] != proof.SUITE:
            raise ValueError('explicit hybrid profile required')
        bundle = read(sys.argv[1], 2 * 1024 * 1024)
        trust = read(sys.argv[2], 1024 * 1024, True)
        bounded.assert_record_json(trust)
        if type(trust) is not dict or set(trust) != {'kind', 'revision', 'activeId', 'history'} or trust['kind'] != 'vella_local_hybrid_keys_v1' or not integer(trust['revision']) or trust['revision'] < 0 or type(trust['history']) is not list or len(trust['history']) > 256:
            raise ValueError('invalid public trust registry')
        entries = [entry for entry in trust['history'] if entry['id'] == sys.argv[3]]
        if len(entries) != 1 or entries[0]['status'] not in ('active', 'retired', 'revoked'):
            raise ValueError('unrecognized historical key')
        entry = entries[0]
        result = proof.verify(bundle, entry['publicKeys'], sys.argv[4])
        if result['ok']:
            evidence = result['authenticated']['evidence']
            if evidence is not None and 'signing_key' in evidence:
                context = evidence['signing_key']
                if type(context) is not dict or set(context) != {'key_set_id', 'key_revision'} or context['key_set_id'] != entry['id'] or not integer(context['key_revision']) or not 1 <= context['key_revision'] <= trust['revision']:
                    raise ValueError('historical trust binding mismatch')
        result.update(keySetId=entry['id'], keyStatus=entry['status'], trustRevision=trust['revision'], trustedForNewExecution=False)
        result['warnings'].append('Reports the supplied trust snapshot; no trusted signing time or pre-compromise assurance')
    except Exception:  # noqa: BLE001 - reject malformed/untrusted input at the CLI boundary
        result = {'ok': False, 'errors': ['E_PQ_VERIFY_INPUT'], 'warnings': [], 'trustedForNewExecution': False}
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result['ok'] else 1)


if __name__ == '__main__':
    main()
