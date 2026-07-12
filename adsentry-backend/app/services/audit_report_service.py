from collections import Counter
from typing import Any

from app.core.supabase_client import get_supabase_client


def _fetch_contract(contract_id: str) -> dict[str, Any]:
    response = (
        get_supabase_client()
        .table("contracts")
        .select("*")
        .eq("id", contract_id)
        .single()
        .execute()
    )
    return response.data


def compute_audit_report(contract_id: str) -> dict:
    supabase = get_supabase_client()
    contract = _fetch_contract(contract_id)
    discrepancies = (
        supabase.table("discrepancies")
        .select("*")
        .eq("contract_id", contract_id)
        .execute()
        .data
        or []
    )

    total_overpayment = round(
        sum(float(item.get("financial_impact") or 0) for item in discrepancies),
        2,
    )
    counts = Counter(item["type"] for item in discrepancies)
    contracted_airings = int(contract["contracted_airings"])
    non_compliant = counts["MISSED"] + counts["SHORTENED"] + counts["OUT_OF_SLOT"]
    compliance_rate = 0 if contracted_airings <= 0 else max(
        0,
        ((contracted_airings - non_compliant) / contracted_airings) * 100,
    )
    compliance_rate = round(compliance_rate, 2)
    threshold = float(contract.get("compliance_threshold_pct") or 97)

    if compliance_rate >= threshold:
        compliance_status = "COMPLIANT"
    elif compliance_rate >= threshold - 10:
        compliance_status = "MINOR_DEVIATION"
    else:
        compliance_status = "MAJOR_BREACH"

    payload = {
        "contract_id": contract_id,
        "total_overpayment": total_overpayment,
        "compliance_rate": compliance_rate,
        "compliance_status": compliance_status,
        "status": "DRAFT",
    }

    existing = (
        supabase.table("audit_reports")
        .select("id")
        .eq("contract_id", contract_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        response = (
            supabase.table("audit_reports")
            .update(payload)
            .eq("contract_id", contract_id)
            .execute()
        )
    else:
        response = supabase.table("audit_reports").insert(payload).execute()

    report = response.data[0] if response.data else payload
    return report
