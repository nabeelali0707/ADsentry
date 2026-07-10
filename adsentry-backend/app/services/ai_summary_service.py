import json
from collections import Counter
from typing import Any

from groq import Groq

from app.core.config import settings


GROQ_MODEL = "llama-3.3-70b-versatile"


def _json_safe(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _build_context(
    contract: dict,
    audit_report: dict,
    discrepancies: list[dict],
) -> str:
    counts = Counter(item.get("type") for item in discrepancies)
    top_discrepancies = sorted(
        discrepancies,
        key=lambda item: float(item.get("financial_impact") or 0),
        reverse=True,
    )[:5]

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
        "discrepancy_counts_by_type": {
            key: value for key, value in counts.items() if key is not None
        },
        "top_5_highest_financial_impact_discrepancies": [
            {
                "id": item.get("id"),
                "type": item.get("type"),
                "expected_value": item.get("expected_value"),
                "actual_value": item.get("actual_value"),
                "financial_impact": item.get("financial_impact"),
                "air_date": item.get("air_date"),
                "channel": item.get("channel"),
                "matched_log_id": item.get("matched_log_id"),
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
    response = _groq_client().chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=320,
    )
    return response.choices[0].message.content.strip()


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
    return _chat(system_prompt, f"Audit context JSON:\n{context}")


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
    return _chat(
        system_prompt,
        f"Audit context JSON:\n{context}\n\nQuestion:\n{question}",
    )
