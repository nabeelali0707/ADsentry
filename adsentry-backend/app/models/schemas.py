from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, field_validator


class ContractCreate(BaseModel):
    organization_id: UUID
    brand_name: str
    campaign_name: str
    channel: str
    start_date: date
    end_date: date
    contracted_airings: int
    spot_duration_sec: int
    cost_per_airing: Decimal
    total_contract_value: Decimal
    status: str = "DRAFT"
    raw_upload_path: str | None = None


class ContractOut(ContractCreate):
    id: UUID
    created_by: UUID | None = None
    time_window_tolerance_minutes: int | None = None
    compliance_threshold_pct: Decimal | None = None
    # Discrepancy Detection Accuracy (5.2): configurable duration tolerance
    duration_tolerance_pct: Decimal | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BroadcastLogOut(BaseModel):
    id: UUID
    contract_id: UUID
    channel: str
    air_date: date
    air_time: time
    spot_duration_sec: int
    ad_identifier: str | None = None
    raw_upload_path: str | None = None
    created_at: datetime | None = None


class ColumnValidationError(BaseModel):
    detail: dict[str, list[str]]


class ContractUploadResponse(BaseModel):
    contract: ContractOut
    parsed_row: dict[str, Any]


class BroadcastLogUploadResponse(BaseModel):
    inserted_count: int


class ContractUpdate(BaseModel):
    channel: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    contracted_airings: int | None = None
    spot_duration_sec: int | None = None
    cost_per_airing: Decimal | None = None
    # Discrepancy Detection Accuracy (5.2): allows UI slider to persist tolerance
    duration_tolerance_pct: Decimal | None = None
    corrected_by: UUID | None = None

    @field_validator("duration_tolerance_pct")
    @classmethod
    def validate_duration_tolerance(cls, v: Decimal | None) -> Decimal | None:
        if v is not None:
            if v < Decimal("0.70") or v > Decimal("0.99"):
                raise ValueError("duration_tolerance_pct must be between 0.70 and 0.99")
        return v


class CampaignSummary(BaseModel):
    total_contract_value: Decimal
    campaign_window: dict[str, date]
    contracted_spots: int


class ContractDetailResponse(BaseModel):
    contract: dict[str, Any]
    campaign_summary: CampaignSummary


# ─── Independent Audio Verification (Dejavu fingerprinting PoC) ───

class FingerprintSourceRequest(BaseModel):
    youtube_url: str
    title: str


class FingerprintSourceResponse(BaseModel):
    status: str
    title: str
    duration_seconds: float


class VerifyClipResponse(BaseModel):
    found: bool
    matched_title: str | None = None
    timestamp_seconds: float | None = None
    timestamp_formatted: str | None = None
    confidence: float | None = None
    reason: str | None = None
