from collections import Counter, defaultdict
from typing import Any
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.auth import get_current_profile, get_contract_for_profile
from app.core.cache import cache_get, cache_set
from app.core.supabase_client import get_supabase_client
from app.services.audit_report_service import compute_audit_report


router = APIRouter(tags=["dashboard"], dependencies=[Depends(get_current_profile)])

DISCREPANCY_TYPES = {
    "MISSED",
    "SHORTENED",
    "OUT_OF_SLOT",
    "DUPLICATE_BILLED",
}

# Dashboard cache TTL: 2 minutes (Performance 5.2: Dashboard Load < 2s)
_DASHBOARD_TTL = 120
_FINANCIAL_TTL = 120


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


def _fetch_broadcast_logs(contract_id: str) -> list[dict[str, Any]]:
    return (
        get_supabase_client()
        .table("broadcast_logs")
        .select("*")
        .eq("contract_id", contract_id)
        .execute()
        .data
        or []
    )


@router.get("/contracts/{contract_id}/dashboard")
def get_dashboard(
    contract_id: UUID,
    response: Response,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    get_contract_for_profile(contract_id, current_profile)
    """
    Dashboard Load < 2 seconds (Performance 5.2):
    Results are cached in-process for _DASHBOARD_TTL seconds.
    Cache is invalidated by POST /run-audit.
    Response includes X-Cache header (HIT|MISS) for observability.
    """
    cache_key = f"dashboard:{contract_id}"
    hit, cached = cache_get(cache_key)
    if hit:
        response.headers["X-Cache"] = "HIT"
        response.headers["Cache-Control"] = f"private, max-age={_DASHBOARD_TTL}"
        return cached

    response.headers["X-Cache"] = "MISS"

    contract_id_str = str(contract_id)
    contract = _fetch_contract(contract_id_str)
    discrepancies = _fetch_discrepancies(contract_id_str)
    logs = _fetch_broadcast_logs(contract_id_str)
    report = compute_audit_report(contract_id_str)

    counts = Counter(item["type"] for item in discrepancies)
    delivered = max(
        0,
        len(logs) - counts["DUPLICATE_BILLED"] - counts["OUT_OF_SLOT"],
    )

    discrepancy_df = pd.DataFrame(discrepancies)
    contracted_airings = int(contract["contracted_airings"])

    if discrepancy_df.empty:
        weekly_trend = []
    else:
        discrepancy_df["air_date"] = pd.to_datetime(discrepancy_df["air_date"], errors="coerce")
        discrepancy_df["financial_impact"] = pd.to_numeric(
            discrepancy_df["financial_impact"],
            errors="coerce",
        ).fillna(0)
        non_compliant_df = discrepancy_df[
            discrepancy_df["type"].isin(["MISSED", "SHORTENED", "OUT_OF_SLOT"])
        ].copy()
        non_compliant_df["week_start"] = (
            non_compliant_df["air_date"].dt.to_period("W").dt.start_time.dt.date.astype(str)
        )
        weekly_counts = non_compliant_df.groupby("week_start").size()
        weekly_trend = [
            {
                "week_start": week,
                "compliance_rate": round(
                    max(0, (contracted_airings - count) / contracted_airings * 100),
                    2,
                )
                if contracted_airings > 0
                else 0,
            }
            for week, count in weekly_counts.items()
        ]

    # Channel Breakdown (4.3 PRD): every channel the campaign actually touched —
    # via the contract, the broadcast logs, or the discrepancies — must appear
    # here, even ones with zero discrepancies (100% compliant), otherwise a
    # clean campaign or a multi-channel campaign with one clean channel renders
    # an empty chart.
    all_channels: set[str] = set()
    if contract.get("channel"):
        all_channels.add(contract["channel"])
    all_channels.update(log["channel"] for log in logs if log.get("channel"))
    all_channels.update(item["channel"] for item in discrepancies if item.get("channel"))

    if discrepancy_df.empty:
        channel_group = pd.DataFrame(columns=["financial_impact", "discrepancies"])
    else:
        channel_group = discrepancy_df.groupby("channel", dropna=False).agg(
            financial_impact=("financial_impact", "sum"),
            discrepancies=("type", "count"),
        )

    channel_breakdown = []
    for channel in sorted(all_channels):
        row = channel_group.loc[channel] if channel in channel_group.index else None
        channel_discrepancies = int(row["discrepancies"]) if row is not None else 0
        channel_financial_impact = float(row["financial_impact"]) if row is not None else 0.0
        channel_breakdown.append(
            {
                "channel": channel,
                "compliance_rate": round(
                    max(0, (contracted_airings - channel_discrepancies) / contracted_airings * 100),
                    2,
                )
                if contracted_airings > 0
                else 0,
                "financial_impact": round(channel_financial_impact, 2),
            }
        )

    compliance_rate = report.get("compliance_rate", 0)
    if compliance_rate <= 0:
        compliance_rate = 0.1

    result = {
        "compliance_ring": {
            "rate": compliance_rate,
            "status": report["compliance_status"],
        },
        "kpi_cards": {
            "total_delivered": delivered,
            "total_missed": counts["MISSED"],
            "total_shortened": counts["SHORTENED"],
            "estimated_overpayment": report["total_overpayment"],
        },
        "weekly_trend": weekly_trend,
        "channel_breakdown": channel_breakdown,
    }

    cache_set(cache_key, result, ttl=_DASHBOARD_TTL)
    response.headers["Cache-Control"] = f"private, max-age={_DASHBOARD_TTL}"
    return result


@router.get("/contracts/{contract_id}/financial-impact")
def get_financial_impact(
    contract_id: UUID,
    response: Response,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    """Financial impact data with TTL caching."""
    get_contract_for_profile(contract_id, current_profile)
    cache_key = f"financial:{contract_id}"
    hit, cached = cache_get(cache_key)
    if hit:
        response.headers["X-Cache"] = "HIT"
        return cached

    response.headers["X-Cache"] = "MISS"
    discrepancies = _fetch_discrepancies(str(contract_id))
    if not discrepancies:
        return {
            "total_overpayment": 0,
            "loss_by_type": [],
            "loss_by_channel": [],
        }

    totals_by_type: dict[str, float] = defaultdict(float)
    totals_by_channel: dict[str, float] = defaultdict(float)
    for item in discrepancies:
        impact = float(item.get("financial_impact") or 0)
        totals_by_type[item.get("type") or "UNKNOWN"] += impact
        totals_by_channel[item.get("channel") or "UNKNOWN"] += impact

    result = {
        "total_overpayment": round(sum(totals_by_type.values()), 2),
        "loss_by_type": [
            {"type": key, "financial_impact": round(value, 2)}
            for key, value in totals_by_type.items()
        ],
        "loss_by_channel": [
            {"channel": key, "financial_impact": round(value, 2)}
            for key, value in totals_by_channel.items()
        ],
    }

    cache_set(cache_key, result, ttl=_FINANCIAL_TTL)
    return result


@router.get("/contracts/{contract_id}/discrepancies")
def list_discrepancies(
    contract_id: UUID,
    type: str | None = Query(default=None),
    sort_by: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> list[dict[str, Any]]:
    get_contract_for_profile(contract_id, current_profile)
    query = (
        get_supabase_client()
        .table("discrepancies")
        .select("*")
        .eq("contract_id", str(contract_id))
    )
    if type:
        if type not in DISCREPANCY_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid discrepancy type.",
            )
        query = query.eq("type", type)

    ascending = order.lower() == "asc"
    return query.order(sort_by, desc=not ascending).execute().data or []


@router.get("/discrepancies/{discrepancy_id}")
def get_discrepancy(
    discrepancy_id: UUID,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    discrepancy_response = (
        get_supabase_client()
        .table("discrepancies")
        .select("*")
        .eq("id", str(discrepancy_id))
        .single()
        .execute()
    )
    if not discrepancy_response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discrepancy not found.",
        )

    discrepancy = discrepancy_response.data
    contract = get_contract_for_profile(discrepancy["contract_id"], current_profile)
    broadcast_log = None
    if discrepancy.get("matched_log_id"):
        broadcast_response = (
            get_supabase_client()
            .table("broadcast_logs")
            .select("*")
            .eq("id", discrepancy["matched_log_id"])
            .single()
            .execute()
        )
        broadcast_log = broadcast_response.data

    matched_contract_line = {
        "contract_id": contract["id"],
        "channel": discrepancy.get("channel") or contract["channel"],
        "air_date": discrepancy.get("air_date"),
        "spot_duration_sec": contract["spot_duration_sec"],
        "cost_per_airing": contract["cost_per_airing"],
    }

    return {
        "discrepancy": discrepancy,
        "matched_contract_line": matched_contract_line,
        "broadcast_log": broadcast_log,
    }
