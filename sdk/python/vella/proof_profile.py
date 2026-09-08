"""Application-owned proof providers. Never selected by an untrusted envelope."""
from collections.abc import Mapping
from typing import Any, Protocol

from . import proof_v2


class ProofProfile(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def record_fields(self) -> Mapping[str, Any]: ...
    def assert_json(self, value: object) -> None: ...
    def digest(self, value: Any) -> str: ...
    def sign(self, record: dict[str, Any], signing_key: object) -> dict[str, Any]: ...


class V2Profile:
    id = "v2"
    record_fields: Mapping[str, Any] = {}

    @staticmethod
    def assert_json(value: object) -> None:
        proof_v2.assert_json(value)

    @staticmethod
    def digest(value: Any) -> str:
        return proof_v2.digest(value)

    @staticmethod
    def sign(record: dict[str, Any], signing_key: object) -> dict[str, Any]:
        if not isinstance(signing_key, (str, bytes)):
            raise TypeError("v2 signing key must be PEM")
        return proof_v2.sign_v2(record, signing_key)
