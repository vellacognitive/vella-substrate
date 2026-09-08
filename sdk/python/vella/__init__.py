"""VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC"""
from .evaluator import create_evaluator
from .governor import Governor, create_governor
from .policy import DEFAULT_POLICY
from .proof_v2 import digest as action_digest
from .proof_v2 import verify_v2 as verify_proof_v2

__version__ = "2.1.0"
_GOVERNOR = create_governor()
govern = _GOVERNOR.govern

__all__ = ["DEFAULT_POLICY", "Governor", "__version__", "action_digest", "create_evaluator", "create_governor", "govern", "verify_proof_v2"]
