from datetime import date, datetime, time
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.supabase_client import get_supabase_client
from app.models.schemas import BroadcastLogUploadResponse, ContractUploadResponse
from app.services.storage_service import upload_file


router = APIRouter()

CONTRACT_COLUMNS = [
    "brand_name",
    "campaign_name",
    "channel",
    "start_date",
    "end_date",
    "contracted_airings",
    "spot_duration_sec",
    "cost_per_airing",
    "total_contract_value",
]

BROADCAST_LOG_COLUMNS = [
    "channel",
    "air_date",
    "air_time",
    "spot_duration_sec",
    "ad_identifier",
]

CSV_MIME_TYPES = {"text/csv", "application/csv", "application/vnd.ms-excel"}
XLSX_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _validate_columns(df: pd.DataFrame, required_columns: list[str]) -> None:
    missing_columns = [column for column in required_columns if column not in df.columns]
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"missing_unmapped_columns": missing_columns},
        )


def _json_safe(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    if hasattr(value, "item"):
        return _json_safe(value.item())
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _clean_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: _json_safe(value) for key, value in record.items()}


def _read_upload_dataframe(file: UploadFile, file_bytes: bytes, allow_xlsx: bool) -> pd.DataFrame:
    suffix = Path(file.filename or "").suffix.lower()
    content_type = file.content_type or ""

    if suffix == ".csv" or content_type in CSV_MIME_TYPES:
        return pd.read_csv(BytesIO(file_bytes))

    if allow_xlsx and (suffix == ".xlsx" or content_type in XLSX_MIME_TYPES):
        return pd.read_excel(BytesIO(file_bytes))

    allowed = "CSV or XLSX" if allow_xlsx else "CSV"
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"missing_unmapped_columns": [f"Unsupported file type. Upload {allowed}."]},
    )


def _storage_path(prefix: str, filename: str | None) -> str:
    safe_name = Path(filename or "upload").name
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"{prefix}/{timestamp}-{uuid4()}-{safe_name}"


@router.post(
    "/contracts/upload",
    response_model=ContractUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_contract(
    organization_id: UUID = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    file_bytes = await file.read()
    df = _read_upload_dataframe(file, file_bytes, allow_xlsx=True)
    _validate_columns(df, CONTRACT_COLUMNS)

    if df.empty:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"missing_unmapped_columns": ["At least one contract row is required."]},
        )

    parsed_row = _clean_record(df.loc[0, CONTRACT_COLUMNS].to_dict())
    raw_upload_path = upload_file(
        "contracts",
        _storage_path(str(organization_id), file.filename),
        file_bytes,
    )

    contract_payload = {
        **parsed_row,
        "organization_id": str(organization_id),
        "status": "DRAFT",
        "raw_upload_path": raw_upload_path,
    }

    response = (
        get_supabase_client()
        .table("contracts")
        .insert(contract_payload)
        .execute()
    )
    created_contract = response.data[0] if response.data else None
    if not created_contract:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Contract could not be created.",
        )

    return {"contract": created_contract, "parsed_row": parsed_row}


@router.post(
    "/contracts/{contract_id}/broadcast-logs/upload",
    response_model=BroadcastLogUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_broadcast_logs(
    contract_id: UUID,
    file: UploadFile = File(...),
) -> dict[str, int]:
    file_bytes = await file.read()
    df = _read_upload_dataframe(file, file_bytes, allow_xlsx=False)
    _validate_columns(df, BROADCAST_LOG_COLUMNS)

    if df.empty:
        return {"inserted_count": 0}

    raw_upload_path = upload_file(
        "broadcast-logs",
        _storage_path(str(contract_id), file.filename),
        file_bytes,
    )

    records = []
    for row in df[BROADCAST_LOG_COLUMNS].to_dict(orient="records"):
        cleaned_row = _clean_record(row)
        records.append(
            {
                **cleaned_row,
                "contract_id": str(contract_id),
                "raw_upload_path": raw_upload_path,
            }
        )

    response = (
        get_supabase_client()
        .table("broadcast_logs")
        .insert(records)
        .execute()
    )

    return {"inserted_count": len(response.data or records)}
