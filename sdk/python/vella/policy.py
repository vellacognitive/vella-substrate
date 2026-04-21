"""VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC"""

from __future__ import annotations

from typing import Final

DEFAULT_POLICY: Final[dict[str, object]] = {
    "policyVersion": "min-v1",
    "defaultScope": "sdk_v1_default",
    "evidenceBits": {
        "AUTHN": 1,
        "AUTHZ": 2,
        "FRESHNESS": 4,
        "ATTESTATION": 8,
    },
    "scopes": {
        "sdk_v1_default": {
            "allowUnknownIntents": False,
            "defaultRequiredMask": 1,
            "intents": {
                "EXECUTE_CHANGE": 1,
                "ESCALATE_PRIVILEGE": 1 | 2,
                "DATA_EXPORT": 1 | 2,
            },
        },
    },
}
