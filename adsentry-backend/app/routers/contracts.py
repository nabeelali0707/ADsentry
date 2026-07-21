from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Depends

from app.core.supabase_client import get_supabase_client
from app.core.auth import get_current_profile, require_role, get_contract_for_profile
from app.models.schemas import ContractDetailResponse, ContractUpdate


router = APIRouter(prefix="/contracts", tags=["contracts"], dependencies=[Depends(get_current_profile)])

EDITABLE_FIELDS = {
    "channel",
    "start_date",
    "end_date",
    "contracted_airings",
    "spot_duration_sec",
    "cost_per_airing",
    # Discrepancy Detection Accuracy (5.2): configurable duration tolerance
    "duration_tolerance_pct",
}


def _get_contract(contract_id: UUID) -> dict[str, Any]:
    response = (
        get_supabase_client()
        .table("contracts")
        .select("*")
        .eq("id", str(contract_id))
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contract not found.",
        )

    return response.data


def _serialize_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _values_equal(left: Any, right: Any) -> bool:
    return _serialize_value(left) == _serialize_value(right)


def _campaign_summary(contract: dict[str, Any]) -> dict[str, Any]:
    return {
        "total_contract_value": contract["total_contract_value"],
        "campaign_window": {
            "start_date": contract["start_date"],
            "end_date": contract["end_date"],
        },
        "contracted_spots": contract["contracted_airings"],
    }


@router.get("/{contract_id}", response_model=ContractDetailResponse)
def get_contract(contract_id: UUID, current_profile: dict = Depends(get_current_profile)) -> dict[str, Any]:
    contract = get_contract_for_profile(contract_id, current_profile)
    return {
        "contract": contract,
        "campaign_summary": _campaign_summary(contract),
    }


@router.patch("/{contract_id}", response_model=ContractDetailResponse)
def update_contract(contract_id: UUID, payload: ContractUpdate, current_profile: dict = Depends(get_current_profile)) -> dict[str, Any]:
    contract = get_contract_for_profile(contract_id, current_profile)

    if contract.get("status") != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only DRAFT contracts can be edited.",
        )

    update_data = payload.model_dump(
        exclude_unset=True,
        exclude={"corrected_by"},
    )
    update_data = {
        field: _serialize_value(value)
        for field, value in update_data.items()
        if field in EDITABLE_FIELDS
    }

    changed_fields = {
        field: value
        for field, value in update_data.items()
        if not _values_equal(contract.get(field), value)
    }

    if not changed_fields:
        return {
            "contract": contract,
            "campaign_summary": _campaign_summary(contract),
        }

    updated_response = (
        get_supabase_client()
        .table("contracts")
        .update(changed_fields)
        .eq("id", str(contract_id))
        .execute()
    )
    updated_contract = updated_response.data[0] if updated_response.data else None
    if not updated_contract:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Contract could not be updated.",
        )

    correction_rows = [
        {
            "contract_id": str(contract_id),
            "field_name": field,
            "original_value": _serialize_value(contract.get(field)),
            "corrected_value": _serialize_value(value),
            "corrected_by": str(payload.corrected_by) if payload.corrected_by else None,
        }
        for field, value in changed_fields.items()
    ]

    get_supabase_client().table("contract_field_corrections").insert(correction_rows).execute()

    return {
        "contract": updated_contract,
        "campaign_summary": _campaign_summary(updated_contract),
    }


@router.post("/{contract_id}/confirm", response_model=ContractDetailResponse)
def confirm_contract(contract_id: UUID, current_profile: dict = Depends(require_role("BRAND", "AGENCY"))) -> dict[str, Any]:
    contract = get_contract_for_profile(contract_id, current_profile)

    if contract.get("status") == "CONFIRMED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contract is already confirmed.",
        )

    updated_response = (
        get_supabase_client()
        .table("contracts")
        .update({"status": "CONFIRMED"})
        .eq("id", str(contract_id))
        .execute()
    )
    updated_contract = updated_response.data[0] if updated_response.data else None
    if not updated_contract:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Contract could not be confirmed.",
        )

    return {
        "contract": updated_contract,
        "campaign_summary": _campaign_summary(updated_contract),
    }
