from vella import govern


def test_execute_change_with_authn_is_allowed() -> None:
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1)
    assert result["decision"] == "ALLOWED"
    assert result["reason_code"] == "POLICY_SATISFIED"


def test_execute_change_without_evidence_is_denied() -> None:
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=0)
    assert result["decision"] == "DENIED"
    assert result["reason_code"] == "E_EVIDENCE_MISSING"


def test_escalate_with_authn_authz_is_allowed() -> None:
    result = govern(intent="ESCALATE_PRIVILEGE", evidence_mask=3)
    assert result["decision"] == "ALLOWED"
    assert result["reason_code"] == "POLICY_SATISFIED"


def test_escalate_with_only_authn_is_denied() -> None:
    result = govern(intent="ESCALATE_PRIVILEGE", evidence_mask=1)
    assert result["decision"] == "DENIED"
    assert result["reason_code"] == "E_EVIDENCE_MISSING"


def test_data_export_with_authn_authz_is_allowed() -> None:
    result = govern(intent="DATA_EXPORT", evidence_mask=3)
    assert result["decision"] == "ALLOWED"
    assert result["reason_code"] == "POLICY_SATISFIED"


def test_unknown_intent_is_denied_fast() -> None:
    result = govern(intent="UNKNOWN_INTENT", evidence_mask=15)
    assert result["decision"] == "DENIED"
    assert result["reason_code"] == "DENY_FAST"


def test_missing_intent_is_denied() -> None:
    result = govern(intent="", evidence_mask=1)
    assert result["decision"] == "DENIED"
    assert result["reason_code"] == "E_INTENT_REQUIRED"


def test_policy_version_mismatch_is_denied() -> None:
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1, policy_version="v99")
    assert result["decision"] == "DENIED"
    assert result["reason_code"] == "E_POLICY_VERSION_MISMATCH"


def test_unknown_authority_scope_is_denied_fast() -> None:
    result = govern(intent="EXECUTE_CHANGE", evidence_mask=1, authority_scope="unknown")
    assert result["decision"] == "DENIED"
    assert result["reason_code"] == "DENY_FAST"


def test_symbolic_evidence_list_is_supported() -> None:
    result = govern(intent="DATA_EXPORT", evidence_mask=["AUTHN", "AUTHZ"])
    assert result["decision"] == "ALLOWED"
    assert result["reason_code"] == "POLICY_SATISFIED"
