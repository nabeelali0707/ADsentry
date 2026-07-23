from collections import Counter
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Depends, Request

from app.core.auth import get_current_profile, get_contract_for_profile
from app.core.cache import cache_delete_prefix
from app.core.supabase_client import get_supabase_client
from app.services.audit_report_service import compute_audit_report
from app.services.reconciliation_service import run_reconciliation


router = APIRouter(prefix="/contracts", tags=["audit"], dependencies=[Depends(get_current_profile)])


@router.post("/{contract_id}/run-audit")
def run_audit(
    contract_id: UUID,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    """
    Run the reconciliation engine against uploaded broadcast logs.

    Performance 5.2: After generating discrepancies, invalidates the dashboard
    and financial-impact TTL cache keys so the next GET returns fresh data.
    """
    contract = get_contract_for_profile(contract_id, current_profile)
    supabase = get_supabase_client()

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

    # Dashboard Cache Invalidation (Performance 5.2): clear stale cached results
    cache_delete_prefix(f"dashboard:{contract_id}")
    cache_delete_prefix(f"financial:{contract_id}")
    cache_delete_prefix(f"ai_summary:{contract_id}")

    counts = Counter(row["type"] for row in rows)
    return {
        "contract_id": str(contract_id),
        "total_rows": len(rows),
        "counts_by_type": dict(counts),
        "audit_report": report,
    }
