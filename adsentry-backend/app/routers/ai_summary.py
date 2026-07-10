from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.supabase_client import get_supabase_client
from app.services.ai_summary_service import (
    answer_followup_question,
    generate_audit_summary,
)
from app.services.audit_report_service import compute_audit_report


router = APIRouter(prefix="/contracts", tags=["ai-summary"])


class FollowupQuestionRequest(BaseModel):
    question: str


def _fetch_contract(contract_id: str) -> dict[str, Any]:
    response = (
        get_supabase_client()
        .table("contracts")
        .select("*")
        .eq("id", contract_id)
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contract not found.",
        )
    return response.data


def _fetch_discrepancies(contract_id: str) -> list[dict[str, Any]]:
    return (
        get_supabase_client()
        .table("discrepancies")
        .select("*")
        .eq("contract_id", contract_id)
        .execute()
        .data
        or []
    )


@router.post("/{contract_id}/ai-summary")
def create_ai_summary(contract_id: UUID) -> dict[str, str]:
    contract_id_str = str(contract_id)
    contract = _fetch_contract(contract_id_str)
    audit_report = compute_audit_report(contract_id_str)
    discrepancies = _fetch_discrepancies(contract_id_str)
    summary = generate_audit_summary(contract, audit_report, discrepancies)

    get_supabase_client().table("audit_reports").update(
        {"ai_summary_text": summary}
    ).eq("id", audit_report["id"]).execute()

    return {"summary": summary}


@router.post("/{contract_id}/ai-summary/ask")
def ask_ai_summary_question(
    contract_id: UUID,
    payload: FollowupQuestionRequest,
) -> dict[str, str]:
    contract_id_str = str(contract_id)
    contract = _fetch_contract(contract_id_str)
    audit_report = compute_audit_report(contract_id_str)
    discrepancies = _fetch_discrepancies(contract_id_str)
    answer = answer_followup_question(
        contract,
        audit_report,
        discrepancies,
        payload.question,
    )
    return {"answer": answer}
