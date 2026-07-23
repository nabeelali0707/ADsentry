from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.auth import get_current_profile, get_contract_for_profile, require_role
from app.core.supabase_client import get_supabase_client
from app.services.audit_report_service import compute_audit_report
from app.services.export_service import export_pdf, export_xlsx
from app.services.storage_service import get_signed_url, upload_file


router = APIRouter(prefix="/contracts", tags=["exports"], dependencies=[Depends(get_current_profile)])


def _report_path(contract_id: UUID, suffix: str) -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"{contract_id}/audit-report-{timestamp}.{suffix}"


def _save_export_path(contract_id: str, field_name: str, path: str) -> dict[str, Any]:
    audit_report = compute_audit_report(contract_id)
    response = (
        get_supabase_client()
        .table("audit_reports")
        .update({field_name: path, "status": "EXPORTED"})
        .eq("id", audit_report["id"])
        .execute()
    )
    return response.data[0] if response.data else audit_report


@router.post("/{contract_id}/export/pdf")
def export_contract_pdf(
    contract_id: UUID,
    current_profile: dict[str, Any] = Depends(require_role("FINANCE", "BRAND")),
) -> dict[str, str]:
    # Verify contract belongs to the user's organization
    get_contract_for_profile(contract_id, current_profile)
    pdf_bytes = export_pdf(str(contract_id))
    path = _report_path(contract_id, "pdf")
    storage_path = upload_file("reports", path, pdf_bytes, content_type="application/pdf")
    _save_export_path(str(contract_id), "exported_pdf_path", storage_path)

    return {
        "path": storage_path,
        "download_url": get_signed_url("reports", storage_path),
    }


@router.post("/{contract_id}/export/xlsx")
def export_contract_xlsx(
    contract_id: UUID,
    current_profile: dict[str, Any] = Depends(require_role("FINANCE", "BRAND")),
) -> dict[str, str]:
    # Verify contract belongs to the user's organization
    get_contract_for_profile(contract_id, current_profile)
    xlsx_bytes = export_xlsx(str(contract_id))
    path = _report_path(contract_id, "xlsx")
    storage_path = upload_file(
        "reports",
        path,
        xlsx_bytes,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    _save_export_path(str(contract_id), "exported_xlsx_path", storage_path)

    return {
        "path": storage_path,
        "download_url": get_signed_url("reports", storage_path),
    }
