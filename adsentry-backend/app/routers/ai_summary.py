import time as time_module
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.cache import cache_get, cache_set, cache_delete
from app.core.supabase_client import get_supabase_client
from app.services.ai_summary_service import (
    answer_followup_question,
    generate_audit_summary,
    stream_audit_summary,
)
from app.services.audit_report_service import compute_audit_report


router = APIRouter(prefix="/contracts", tags=["ai-summary"])

# AI Summary cache TTL: 10 minutes (Performance 5.2: AI Summary < 4 seconds)
_AI_SUMMARY_TTL = 600


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
def create_ai_summary(contract_id: UUID, response: Response) -> dict[str, str]:
    """
    AI Summary Generation < 4 seconds (Performance 5.2):

    1. Check in-process cache first — return immediately if fresh.
    2. Check DB (audit_reports.ai_summary_text) — skip Groq call if already generated.
    3. Only call Groq when no cached/stored summary exists.
    4. Inject X-Generation-Time-Ms header for UI display.
    """
    t_start = time_module.perf_counter()
    contract_id_str = str(contract_id)

    # Step 1: In-process cache check
    cache_key = f"ai_summary:{contract_id_str}"
    hit, cached_summary = cache_get(cache_key)
    if hit:
        generation_ms = round((time_module.perf_counter() - t_start) * 1000)
        response.headers["X-Generation-Time-Ms"] = str(generation_ms)
        response.headers["X-Cache"] = "HIT"
        return {"summary": cached_summary}

    contract = _fetch_contract(contract_id_str)
    audit_report = compute_audit_report(contract_id_str)

    # Step 2: Check DB for existing summary (skip Groq if already stored)
    existing_text = audit_report.get("ai_summary_text") or ""
    if existing_text.strip():
        cache_set(cache_key, existing_text, ttl=_AI_SUMMARY_TTL)
        generation_ms = round((time_module.perf_counter() - t_start) * 1000)
        response.headers["X-Generation-Time-Ms"] = str(generation_ms)
        response.headers["X-Cache"] = "DB_HIT"
        return {"summary": existing_text}

    # Step 3: Generate via Groq (only if no cached/stored version)
    discrepancies = _fetch_discrepancies(contract_id_str)
    summary = generate_audit_summary(contract, audit_report, discrepancies)

    get_supabase_client().table("audit_reports").update(
        {"ai_summary_text": summary}
    ).eq("id", audit_report["id"]).execute()

    cache_set(cache_key, summary, ttl=_AI_SUMMARY_TTL)

    generation_ms = round((time_module.perf_counter() - t_start) * 1000)
    response.headers["X-Generation-Time-Ms"] = str(generation_ms)
    response.headers["X-Cache"] = "MISS"
    return {"summary": summary}


@router.get("/{contract_id}/ai-summary/stream")
def stream_contract_ai_summary(contract_id: UUID) -> StreamingResponse:
    """
    4.6 PRD: 'Response is streamed into the summary panel and cached for
    inclusion in the exported report.'

    Uses Groq streaming API — text chunks are yielded as they arrive so the
    frontend can render them progressively (like ChatGPT typewriter effect).
    After the stream completes, the full text is cached and saved to the DB.
    """
    contract_id_str = str(contract_id)
    contract = _fetch_contract(contract_id_str)
    audit_report = compute_audit_report(contract_id_str)
    discrepancies = _fetch_discrepancies(contract_id_str)

    def _save_and_stream():
        full_text = ""
        for chunk in stream_audit_summary(contract, audit_report, discrepancies):
            full_text += chunk
            yield chunk
        # After stream completes: cache + persist
        if full_text:
            cache_key = f"ai_summary:{contract_id_str}"
            cache_set(cache_key, full_text, ttl=_AI_SUMMARY_TTL)
            try:
                get_supabase_client().table("audit_reports").update(
                    {"ai_summary_text": full_text}
                ).eq("id", audit_report["id"]).execute()
            except Exception:
                pass  # Non-blocking: caching failure should not break the stream

    return StreamingResponse(
        _save_and_stream(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-store, private",
            "X-Accel-Buffering": "no",  # Disable nginx buffering for streaming
        },
    )


@router.get("/{contract_id}/ai-summary")
def get_ai_summary(contract_id: UUID) -> dict[str, str]:
    contract_id_str = str(contract_id)
    # Verify contract exists
    _ = _fetch_contract(contract_id_str)
    audit_report_resp = (
        get_supabase_client()
        .table("audit_reports")
        .select("*")
        .eq("contract_id", contract_id_str)
        .single()
        .execute()
    )
    if not audit_report_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI summary not found.",
        )
    summary = audit_report_resp.data.get("ai_summary_text", "")
    return {"summary": summary}


@router.post("/{contract_id}/ai-summary/ask")
def ask_ai_summary_question(
    contract_id: UUID,
    payload: FollowupQuestionRequest,
    response: Response,
) -> dict[str, str]:
    t_start = time_module.perf_counter()
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
    generation_ms = round((time_module.perf_counter() - t_start) * 1000)
    response.headers["X-Generation-Time-Ms"] = str(generation_ms)
    return {"answer": answer}
