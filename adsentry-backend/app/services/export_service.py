from collections import Counter, defaultdict
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.supabase_client import get_supabase_client
from app.services.audit_report_service import compute_audit_report

_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo.png"


def _fetch_contract(contract_id: str) -> dict[str, Any]:
    response = (
        get_supabase_client()
        .table("contracts")
        .select("*")
        .eq("id", contract_id)
        .single()
        .execute()
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


def _money(value: Any) -> str:
    return f"{float(value or 0):,.2f}"


def _table(data: list[list[Any]], widths: list[float] | None = None) -> Table:
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    return table


def _summary_rows(contract: dict[str, Any], audit_report: dict[str, Any], discrepancies: list[dict]) -> list[list[str]]:
    counts = Counter(item.get("type") for item in discrepancies)
    return [
        ["Metric", "Value"],
        ["Brand", str(contract.get("brand_name") or "")],
        ["Campaign", str(contract.get("campaign_name") or "")],
        ["Channel", str(contract.get("channel") or "")],
        ["Campaign Window", f"{contract.get('start_date')} to {contract.get('end_date')}"],
        ["Contracted Spots", str(contract.get("contracted_airings") or 0)],
        ["Compliance Rate", f"{audit_report.get('compliance_rate', 0)}%"],
        ["Compliance Status", str(audit_report.get("compliance_status") or "")],
        ["Total Overpayment", _money(audit_report.get("total_overpayment"))],
        ["Missed", str(counts["MISSED"])],
        ["Shortened", str(counts["SHORTENED"])],
        ["Out Of Slot", str(counts["OUT_OF_SLOT"])],
        ["Duplicate Billed", str(counts["DUPLICATE_BILLED"])],
    ]


def _impact_rows(discrepancies: list[dict], key: str, label: str) -> list[list[str]]:
    totals: dict[str, float] = defaultdict(float)
    for item in discrepancies:
        totals[str(item.get(key) or "UNKNOWN")] += float(item.get("financial_impact") or 0)

    rows = [[label, "Financial Impact"]]
    rows.extend([[name, _money(value)] for name, value in sorted(totals.items())])
    return rows


def _discrepancy_rows(discrepancies: list[dict]) -> list[list[str]]:
    rows = [["Type", "Date", "Channel", "Expected", "Actual", "Impact", "Matched Log"]]
    for item in discrepancies:
        rows.append(
            [
                str(item.get("type") or ""),
                str(item.get("air_date") or ""),
                str(item.get("channel") or ""),
                str(item.get("expected_value") or ""),
                str(item.get("actual_value") or ""),
                _money(item.get("financial_impact")),
                str(item.get("matched_log_id") or ""),
            ]
        )
    return rows


def export_pdf(contract_id: str) -> bytes:
    contract = _fetch_contract(contract_id)
    audit_report = compute_audit_report(contract_id)
    discrepancies = _fetch_discrepancies(contract_id)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )
    styles = getSampleStyleSheet()
    story: list[Any] = []
    if _LOGO_PATH.exists():
        story.append(Image(str(_LOGO_PATH), width=2.2 * inch, height=0.826 * inch))
        story.append(Spacer(1, 0.12 * inch))
    else:
        story.append(Paragraph("AdSentry Audit Report", styles["Title"]))
    story.extend([
        Paragraph(f"{contract.get('brand_name', '')} - {contract.get('campaign_name', '')}", styles["Heading2"]),
        Spacer(1, 0.16 * inch),
        _table(_summary_rows(contract, audit_report, discrepancies), [2.0 * inch, 4.3 * inch]),
        Spacer(1, 0.22 * inch),
        Paragraph("Loss By Type", styles["Heading2"]),
        _table(_impact_rows(discrepancies, "type", "Type"), [3.0 * inch, 2.0 * inch]),
        Spacer(1, 0.18 * inch),
        Paragraph("Loss By Channel", styles["Heading2"]),
        _table(_impact_rows(discrepancies, "channel", "Channel"), [3.0 * inch, 2.0 * inch]),
        Spacer(1, 0.18 * inch),
        Paragraph("AI Summary", styles["Heading2"]),
        Paragraph(str(audit_report.get("ai_summary_text") or "No AI summary has been generated yet."), styles["BodyText"]),
        Spacer(1, 0.22 * inch),
        Paragraph("Discrepancies", styles["Heading2"]),
        _table(_discrepancy_rows(discrepancies), [1.0 * inch, 0.75 * inch, 0.85 * inch, 1.35 * inch, 1.35 * inch, 0.75 * inch, 1.1 * inch]),
    ])
    doc.build(story)
    return buffer.getvalue()


def export_xlsx(contract_id: str) -> bytes:
    contract = _fetch_contract(contract_id)
    audit_report = compute_audit_report(contract_id)
    discrepancies = _fetch_discrepancies(contract_id)
    counts = Counter(item.get("type") for item in discrepancies)

    summary = pd.DataFrame(
        [
            {"metric": "brand", "value": contract.get("brand_name")},
            {"metric": "campaign", "value": contract.get("campaign_name")},
            {"metric": "channel", "value": contract.get("channel")},
            {"metric": "campaign_window", "value": f"{contract.get('start_date')} to {contract.get('end_date')}"},
            {"metric": "contracted_airings", "value": contract.get("contracted_airings")},
            {"metric": "compliance_rate", "value": audit_report.get("compliance_rate")},
            {"metric": "compliance_status", "value": audit_report.get("compliance_status")},
            {"metric": "total_overpayment", "value": audit_report.get("total_overpayment")},
            {"metric": "total_missed", "value": counts["MISSED"]},
            {"metric": "total_shortened", "value": counts["SHORTENED"]},
            {"metric": "total_out_of_slot", "value": counts["OUT_OF_SLOT"]},
            {"metric": "total_duplicate_billed", "value": counts["DUPLICATE_BILLED"]},
        ]
    )
    discrepancy_df = pd.DataFrame(discrepancies)

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        summary.to_excel(writer, sheet_name="Summary", index=False)
        discrepancy_df.to_excel(writer, sheet_name="Discrepancies", index=False)
    return buffer.getvalue()
