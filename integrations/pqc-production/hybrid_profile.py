"""Explicit draft provider for the actual Python SDK governor."""
import bounded_json
import proof
import record


class HybridProfile:
    id = proof.KIND
    @property
    def record_fields(self):
        return {'digest_profile': proof.PROFILE}
    assert_json = staticmethod(bounded_json.assert_record_json)
    digest = staticmethod(record.digest)

    @staticmethod
    def sign(value, private_keys):
        return proof.sign(value, private_keys, proof.SUITE)
