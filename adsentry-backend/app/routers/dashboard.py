from collections import Counter, defaultdict
from typing import Any
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, status

from app.core.supabase_client import get_supabase_client
from app.services.audit_report_service import compute_audit_report


router = APIRouter(tags=["dashboard"])

DISCREPANCY_TYPES = {
    "MISSED",
    "SHORTENED",
    "OUT_OF_SLOT",
    "DUPLICATE_BILLED",
}


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
def get_dashboard(contract_id: UUID) -> dict[str, Any]:
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
    if discrepancy_df.empty:
        weekly_trend = []
        channel_breakdown = []
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
                    max(0, (int(contract["contracted_airings"]) - count) / int(contract["contracted_airings"]) * 100),
                    2,
                )
                if int(contract["contracted_airings"]) > 0
                else 0,
            }
            for week, count in weekly_counts.items()
        ]
        channel_group = discrepancy_df.groupby("channel", dropna=False).agg(
            financial_impact=("financial_impact", "sum"),
            discrepancies=('type','count'),
        )
        channel_breakdown = [
            {
                "channel": channel,
                "compliance_rate": round(
                    max(
                        0,
                        (
                            int(contract["contracted_airings"]) - int(row["discrepancies"])
                        )
                        / int(contract["contracted_airings"])
                        * 100,
                    ),
                    2,
                )
                if int(contract["contracted_airings"]) > 0
                else 0,
                "financial_impact": round(float(row["financial_impact"]), 2),
            }
            for channel, row in channel_group.iterrows()
        ]

    compliance_rate = report.get("compliance_rate", 0)
    if compliance_rate <= 0:
        compliance_rate = 0.1

    return {
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


@router.get("/contracts/{contract_id}/financial-impact")
def get_financial_impact(contract_id: UUID) -> dict[str, Any]:
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

    return {
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


@router.get("/contracts/{contract_id}/discrepancies")
def list_discrepancies(
    contract_id: UUID,
    type: str | None = Query(default=None),
    sort_by: str = Query(default="created_at"),
    order: str = Query(default="desc"),
) -> list[dict[str, Any]]:
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
def get_discrepancy(discrepancy_id: UUID) -> dict[str, Any]:
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
    contract = _fetch_contract(discrepancy["contract_id"])
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
