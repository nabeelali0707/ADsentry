import json
import logging
import time as time_module
from collections import Counter
from typing import Any, Generator

from groq import Groq

from app.core.config import settings

logger = logging.getLogger(__name__)

GROQ_MODEL = "llama-3.3-70b-versatile"

# AI Summary Performance (5.2): Reduced from 320 to 260 tokens saves ~0.5s
# while still producing a ~200-word narrative.
_MAX_TOKENS = 260

# Timeout guard: abort Groq call after this many seconds and return fallback
_GROQ_TIMEOUT_SECONDS = 3.8


def _json_safe(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _build_context(
    contract: dict,
    audit_report: dict,
    discrepancies: list[dict],
) -> str:
    """
    Pre-aggregate all heavy computations BEFORE calling Groq so the API call
    receives a compact, pre-summarised payload. This reduces prompt size and
    improves response latency (Performance 5.2: AI Summary < 4 seconds).
    """
    # Single-pass aggregation: counts + financial totals by type
    counts: dict[str, int] = Counter()
    financial_by_type: dict[str, float] = {}
    top_heap: list[tuple[float, dict]] = []

    for item in discrepancies:
        dtype = item.get("type")
        if dtype:
            counts[dtype] += 1
            impact = float(item.get("financial_impact") or 0)
            financial_by_type[dtype] = financial_by_type.get(dtype, 0.0) + impact
            top_heap.append((impact, item))

    # Top-5 by financial impact (sorted in one pass)
    top_heap.sort(key=lambda x: x[0], reverse=True)
    top_discrepancies = [item for _, item in top_heap[:5]]

    context = {
        "contract": {
            "id": contract.get("id"),
            "brand_name": contract.get("brand_name"),
            "campaign_name": contract.get("campaign_name"),
            "channel": contract.get("channel"),
            "start_date": contract.get("start_date"),
            "end_date": contract.get("end_date"),
            "contracted_airings": contract.get("contracted_airings"),
            "spot_duration_sec": contract.get("spot_duration_sec"),
            "cost_per_airing": contract.get("cost_per_airing"),
            "total_contract_value": contract.get("total_contract_value"),
        },
        "audit_report": {
            "compliance_rate": audit_report.get("compliance_rate"),
            "compliance_status": audit_report.get("compliance_status"),
            "total_overpayment": audit_report.get("total_overpayment"),
        },
        # Pre-aggregated counts and totals — no extra processing needed by Groq
        "discrepancy_counts_by_type": dict(counts),
        "financial_impact_by_type": {k: round(v, 2) for k, v in financial_by_type.items()},
        "top_5_highest_financial_impact_discrepancies": [
            {
                "id": item.get("id"),
                "type": item.get("type"),
                "expected_value": item.get("expected_value"),
                "actual_value": item.get("actual_value"),
                "financial_impact": item.get("financial_impact"),
                "air_date": item.get("air_date"),
                "channel": item.get("channel"),
            }
            for item in top_discrepancies
        ],
    }
    return json.dumps(context, default=_json_safe, separators=(",", ":"))


def _groq_client() -> Groq:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY must be configured.")
    return Groq(api_key=settings.groq_api_key)


def _chat(system_prompt: str, user_prompt: str) -> str:
    """
    Make a Groq API call with a hard timeout.

    If the call exceeds _GROQ_TIMEOUT_SECONDS, returns a pre-built fallback
    summary constructed from the pre-aggregated context so the user always
    receives a useful response (Performance 5.2: AI Summary < 4 seconds).
    """
    t_start = time_module.perf_counter()
    try:
        response = _groq_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=_MAX_TOKENS,
            # Groq SDK supports timeout parameter
            timeout=_GROQ_TIMEOUT_SECONDS,
        )
        elapsed = time_module.perf_counter() - t_start
        logger.info("Groq response received in %.2fs", elapsed)
        return response.choices[0].message.content.strip()
    except Exception as exc:
        elapsed = time_module.perf_counter() - t_start
        logger.warning("Groq call failed/timed out after %.2fs: %s", elapsed, exc)
        # Return None to signal fallback — caller will handle
        return ""


def _build_fallback_summary(contract: dict, audit_report: dict, discrepancies: list[dict]) -> str:
    """
    Construct a factual summary from pre-aggregated data without an LLM call.
    Used as fallback when Groq times out.
    """
    counts = Counter(d.get("type") for d in discrepancies if d.get("type"))
    total = sum(counts.values())
    overpayment = audit_report.get("total_overpayment", 0)
    compliance = audit_report.get("compliance_rate", 0)
    status = audit_report.get("compliance_status", "UNKNOWN")

    parts = [
        f"AdSentry AI reconciled {contract.get('contracted_airings', 'N/A')} expected airings "
        f"for {contract.get('brand_name', 'the brand')} on {contract.get('channel', 'the channel')}.",
        f"The audit identified {total} discrepancy event(s) with an overall compliance rate of {compliance:.1f}% ({status.replace('_', ' ')}).",
    ]
    if counts:
        breakdown = ", ".join(f"{v} {k.replace('_', ' ').title()}" for k, v in counts.most_common())
        parts.append(f"Breakdown: {breakdown}.")
    if overpayment:
        parts.append(f"Total estimated overpayment: Rs. {round(overpayment):,}.")
    parts.append("Please review the Discrepancy Explorer for line-item details.")
    return " ".join(parts)


def generate_audit_summary(
    contract: dict,
    audit_report: dict,
    discrepancies: list[dict],
) -> str:
    context = _build_context(contract, audit_report, discrepancies)
    system_prompt = (
        "You are an advertising audit analyst. Explain the headline compliance "
        "result and biggest drivers of loss in plain language. Stay strictly "
        "factual based on the provided JSON data; do not speculate beyond it. "
        "Keep the response under 200 words."
    )
    result = _chat(system_prompt, f"Audit context JSON:\n{context}")
    if not result:
        logger.info("Using fallback summary (Groq unavailable/timed out).")
        return _build_fallback_summary(contract, audit_report, discrepancies)
    return result


def stream_audit_summary(
    contract: dict,
    audit_report: dict,
    discrepancies: list[dict],
) -> Generator[str, None, None]:
    """
    Generator that streams AI summary text chunks directly from Groq.
    (4.6 PRD: 'Response is streamed into the summary panel')

    Falls back to yielding the pre-built factual fallback in a single chunk
    if the Groq API key is missing or the call fails.
    """
    if not settings.groq_api_key:
        logger.warning("GROQ_API_KEY not set — yielding fallback summary.")
        yield _build_fallback_summary(contract, audit_report, discrepancies)
        return

    context = _build_context(contract, audit_report, discrepancies)
    system_prompt = (
        "You are an advertising audit analyst. Explain the headline compliance "
        "result and biggest drivers of loss in plain language. Stay strictly "
        "factual based on the provided JSON data; do not speculate beyond it. "
        "Keep the response under 200 words."
    )
    try:
        stream = _groq_client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Audit context JSON:\n{context}"},
            ],
            temperature=0.2,
            max_tokens=_MAX_TOKENS,
            stream=True,
            timeout=_GROQ_TIMEOUT_SECONDS,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as exc:
        logger.warning("Groq streaming failed: %s", exc)
        yield _build_fallback_summary(contract, audit_report, discrepancies)


def answer_followup_question(
    contract: dict,
    audit_report: dict,
    discrepancies: list[dict],
    question: str,
) -> str:
    context = _build_context(contract, audit_report, discrepancies)
    system_prompt = (
        "You are an advertising audit analyst. Answer the user's follow-up using "
        "only the provided JSON data unless the user asks for drafting help based "
        "on that data. Stay factual, avoid unsupported claims, and keep the answer "
        "under 200 words."
    )
    result = _chat(
        system_prompt,
        f"Audit context JSON:\n{context}\n\nQuestion:\n{question}",
    )
    if not result:
        return "I was unable to generate a response at this time. Please try again in a moment."
    return result
