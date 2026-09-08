"""Explicit hybrid provider for the actual Python SDK governor."""
from typing import Any

from . import bounded_json, proof, record


class HybridProfile:
    id = proof.KIND
    @property
    def record_fields(self) -> dict[str, Any]:
        return {'digest_profile': proof.PROFILE}
    assert_json = staticmethod(bounded_json.assert_record_json)
    digest = staticmethod(record.digest)

    @staticmethod
    def sign(value: dict[str, Any], private_keys: object) -> dict[str, Any]:
        return proof.sign(value, private_keys, proof.SUITE)
