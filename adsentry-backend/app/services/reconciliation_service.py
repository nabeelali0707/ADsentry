import logging
import time as time_module
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

DISCREPANCY_COLUMNS = [
    "type",
    "expected_value",
    "actual_value",
    "financial_impact",
    "air_date",
    "channel",
    "matched_log_id",
]


def _expected_schedule(contract: dict[str, Any]) -> pd.DataFrame:
    contracted_airings = int(contract["contracted_airings"])
    start_date = pd.to_datetime(contract["start_date"]).normalize()
    end_date = pd.to_datetime(contract["end_date"]).normalize()
    campaign_days = pd.date_range(start_date, end_date, freq="D")

    if contracted_airings <= 0 or campaign_days.empty:
        return pd.DataFrame(
            columns=[
                "expected_slot_id",
                "channel",
                "air_date",
                "expected_datetime",
                "spot_duration_sec",
                "cost_per_airing",
            ]
        )

    day_indexes = np.arange(contracted_airings) % len(campaign_days)
    air_dates = campaign_days[day_indexes]

    expected = pd.DataFrame(
        {
            "expected_slot_id": np.arange(contracted_airings),
            "channel": contract["channel"],
            "air_date": air_dates,
            "expected_datetime": air_dates,
            "spot_duration_sec": int(contract["spot_duration_sec"]),
            "cost_per_airing": float(Decimal(str(contract["cost_per_airing"]))),
        }
    )
    expected["slot_sequence"] = expected.groupby(["channel", "air_date"]).cumcount()
    return expected


def _prepare_logs(broadcast_logs: list[dict]) -> pd.DataFrame:
    logs = pd.DataFrame(broadcast_logs)
    if logs.empty:
        return pd.DataFrame(
            columns=[
                "id",
                "channel",
                "air_date",
                "air_time",
                "actual_datetime",
                "spot_duration_sec",
                "slot_sequence",
            ]
        )

    logs = logs.copy()
    logs["air_date"] = pd.to_datetime(logs["air_date"]).dt.normalize()
    logs["air_time"] = logs["air_time"].astype(str)
    logs["actual_datetime"] = pd.to_datetime(
        logs["air_date"].dt.strftime("%Y-%m-%d") + " " + logs["air_time"],
        errors="coerce",
    )
    logs["spot_duration_sec"] = pd.to_numeric(logs["spot_duration_sec"], errors="coerce").fillna(0)
    logs = logs.sort_values(["channel", "air_date", "actual_datetime", "id"], na_position="last")
    logs["slot_sequence"] = logs.groupby(["channel", "air_date"]).cumcount()
    return logs


def _empty_result() -> pd.DataFrame:
    return pd.DataFrame(columns=DISCREPANCY_COLUMNS)


def run_reconciliation(
    contract: dict,
    broadcast_logs: list[dict],
    duration_tolerance_pct: float | None = None,
) -> pd.DataFrame:
    """
    Discrepancy Detection Accuracy ≥ 95% (Performance 5.2):

    Parameters
    ----------
    contract : dict
        Contract record from the database.
    broadcast_logs : list[dict]
        All broadcast log rows for the contract.
    duration_tolerance_pct : float, optional
        Fraction of contracted duration that must be delivered before a spot is
        flagged as SHORTENED.  Default comes from the contract field
        ``duration_tolerance_pct`` (if set), otherwise falls back to 0.90 (90%).
        Valid range: 0.70 – 0.99.  Configurable via the Contract Review UI.

    Notes
    -----
    All four discrepancy detection passes use fully vectorised Pandas
    merge/groupby operations — no Python-level row loops — which keeps
    processing under 5 seconds for logs with up to 10,000 rows.
    """
    t_start = time_module.perf_counter()

    expected = _expected_schedule(contract)
    logs = _prepare_logs(broadcast_logs)

    if expected.empty and logs.empty:
        return _empty_result()

    tolerance_minutes = int(contract.get("time_window_tolerance_minutes") or 15)
    contracted_duration = int(contract["spot_duration_sec"])
    cost_per_airing = float(Decimal(str(contract["cost_per_airing"])))

    # Resolve duration_tolerance_pct (Discrepancy Detection Accuracy — 5.2)
    if duration_tolerance_pct is None:
        # Check contract record for a saved value, else default to 0.90
        raw = contract.get("duration_tolerance_pct")
        try:
            duration_tolerance_pct = float(raw) if raw is not None else 0.90
        except (TypeError, ValueError):
            duration_tolerance_pct = 0.90
    # Clamp to valid range
    duration_tolerance_pct = max(0.70, min(0.99, duration_tolerance_pct))

    # ── Slot Matching (vectorised) ─────────────────────────────────────────
    matched = expected.merge(
        logs,
        on=["channel", "air_date", "slot_sequence"],
        how="left",
        suffixes=("_expected", "_actual"),
    )
    matched["time_delta_minutes"] = (
        (matched["actual_datetime"] - matched["expected_datetime"]).abs().dt.total_seconds() / 60
    )
    matched["within_window"] = matched["time_delta_minutes"].le(tolerance_minutes)
    matched["has_log"] = matched["id"].notna()

    # ── MISSED ────────────────────────────────────────────────────────────
    missed = matched.loc[~matched["has_log"]].copy()
    missed_rows = pd.DataFrame(
        {
            "type": "MISSED",
            "expected_value": missed["expected_datetime"].dt.strftime("%Y-%m-%d %H:%M:%S"),
            "actual_value": None,
            "financial_impact": cost_per_airing,
            "air_date": missed["air_date"].dt.strftime("%Y-%m-%d"),
            "channel": missed["channel"],
            "matched_log_id": None,
        }
    )

    # ── OUT_OF_SLOT ───────────────────────────────────────────────────────
    out_of_slot = matched.loc[matched["has_log"] & ~matched["within_window"]].copy()
    out_of_slot_rows = pd.DataFrame(
        {
            "type": "OUT_OF_SLOT",
            "expected_value": out_of_slot["expected_datetime"].dt.strftime("%Y-%m-%d %H:%M:%S"),
            "actual_value": out_of_slot["actual_datetime"].dt.strftime("%Y-%m-%d %H:%M:%S"),
            "financial_impact": cost_per_airing,
            "air_date": out_of_slot["air_date"].dt.strftime("%Y-%m-%d"),
            "channel": out_of_slot["channel"],
            "matched_log_id": out_of_slot["id"],
        }
    )

    # ── SHORTENED (uses configurable duration_tolerance_pct) ──────────────
    threshold_seconds = contracted_duration * duration_tolerance_pct
    shortened = matched.loc[
        matched["has_log"]
        & matched["within_window"]
        & (matched["spot_duration_sec_actual"] < threshold_seconds)
    ].copy()
    missing_seconds = contracted_duration - shortened["spot_duration_sec_actual"]
    shortened_rows = pd.DataFrame(
        {
            "type": "SHORTENED",
            "expected_value": contracted_duration,
            "actual_value": shortened["spot_duration_sec_actual"],
            "financial_impact": (missing_seconds / contracted_duration * cost_per_airing).round(2),
            "air_date": shortened["air_date"].dt.strftime("%Y-%m-%d"),
            "channel": shortened["channel"],
            "matched_log_id": shortened["id"],
        }
    )

    # ── DUPLICATE_BILLED ──────────────────────────────────────────────────
    expected_counts = expected.groupby(["channel", "air_date"]).size().rename("expected_count")
    logs_with_counts = logs.join(expected_counts, on=["channel", "air_date"])
    duplicate_logs = logs_with_counts.loc[
        logs_with_counts["expected_count"].notna()
        & (logs_with_counts["slot_sequence"] >= logs_with_counts["expected_count"])
    ].copy()
    duplicate_rows = pd.DataFrame(
        {
            "type": "DUPLICATE_BILLED",
            "expected_value": "No additional contracted slot",
            "actual_value": duplicate_logs["actual_datetime"].dt.strftime("%Y-%m-%d %H:%M:%S"),
            "financial_impact": cost_per_airing,
            "air_date": duplicate_logs["air_date"].dt.strftime("%Y-%m-%d"),
            "channel": duplicate_logs["channel"],
            "matched_log_id": duplicate_logs["id"],
        }
    )

    result = pd.concat(
        [missed_rows, shortened_rows, out_of_slot_rows, duplicate_rows],
        ignore_index=True,
    )

    elapsed = time_module.perf_counter() - t_start
    logger.info(
        "Reconciliation complete: %d logs, %d discrepancies in %.3fs "
        "(duration_tolerance_pct=%.0f%%, time_window=%dmin)",
        len(broadcast_logs),
        len(result),
        elapsed,
        duration_tolerance_pct * 100,
        tolerance_minutes,
    )

    if result.empty:
        return _empty_result()

    result = result.reindex(columns=DISCREPANCY_COLUMNS)
    result["financial_impact"] = pd.to_numeric(result["financial_impact"], errors="coerce").fillna(0).round(2)
    return result
