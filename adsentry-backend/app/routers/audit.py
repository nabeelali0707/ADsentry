from collections import Counter
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Depends

from app.core.auth import get_current_profile, get_contract_for_profile

from app.core.supabase_client import get_supabase_client
from app.services.audit_report_service import compute_audit_report
from app.services.reconciliation_service import run_reconciliation


router = APIRouter(prefix="/contracts", tags=["audit"], dependencies=[Depends(get_current_profile)])


def _fetch_contract(contract_id: UUID) -> dict[str, Any]:
    # Use helper to ensure contract belongs to the authenticated user's organization
    contract = get_contract_for_profile(contract_id, get_current_profile())
    return contract
    # The get_contract_for_profile call will raise appropriate HTTP errors if not found or unauthorized
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contract not found.",
        )
    return response.data


@router.post("/{contract_id}/run-audit")
def run_audit(contract_id: UUID) -> dict[str, Any]:
    supabase = get_supabase_client()
    contract = _fetch_contract(contract_id)
    logs = (
        supabase.table("broadcast_logs")
        .select("*")
        .eq("contract_id", str(contract_id))
        .execute()
        .data
        or []
    )

    discrepancies_df = run_reconciliation(contract, logs)
    rows = discrepancies_df.to_dict(orient="records")
    for row in rows:
        row["contract_id"] = str(contract_id)

    supabase.table("discrepancies").delete().eq("contract_id", str(contract_id)).execute()
    if rows:
        supabase.table("discrepancies").insert(rows).execute()

    report = compute_audit_report(str(contract_id))
    counts = Counter(row["type"] for row in rows)
    return {
        "contract_id": str(contract_id),
        "total_rows": len(rows),
        "counts_by_type": dict(counts),
        "audit_report": report,
    }
