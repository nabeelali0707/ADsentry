"""
Session management & Audit Trail router.

Endpoints:
  DELETE /contracts/{contract_id}/session
    — Session-Scoped File Handling (Security 5.1): removes all uploaded/exported
      files from Supabase Storage for the given contract_id.

  GET /contracts/{contract_id}/audit-trail
    — Audit Trail (Security 5.1): returns all field corrections made to the
      contract, ordered by most recent first.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_profile, get_contract_for_profile
from app.core.session_cleanup import cleanup_session_files
from app.core.supabase_client import get_supabase_client


router = APIRouter(prefix="/contracts", tags=["session"], dependencies=[Depends(get_current_profile)])


@router.delete("/{contract_id}/session")
def delete_session(
    contract_id: UUID,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    """
    Remove all raw uploaded and exported files for this contract from Supabase
    Storage. Does NOT delete database records — only the binary blobs.
    """
    get_contract_for_profile(contract_id, current_profile)
    result = cleanup_session_files(str(contract_id))
    return result


@router.get("/{contract_id}/audit-trail")
def get_audit_trail(
    contract_id: UUID,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    """
    Return a chronological log of every field correction recorded for this
    contract. Each entry shows field_name, original_value → corrected_value,
    corrected_by (user id), and created_at timestamp.
    """
    get_contract_for_profile(contract_id, current_profile)
    supabase = get_supabase_client()

    corrections_resp = (
        supabase.table("contract_field_corrections")
        .select("*")
        .eq("contract_id", str(contract_id))
        .order("created_at", desc=True)
        .execute()
    )

    corrections = corrections_resp.data or []

    return {
        "contract_id": str(contract_id),
        "total_corrections": len(corrections),
        "corrections": corrections,
    }
