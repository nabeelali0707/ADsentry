"""
Session-Scoped File Handling (Security Requirement 5.1)

Deletes all raw uploaded files associated with a given contract from
Supabase Storage buckets so that no files persist beyond the audit session.

Buckets cleaned:
- contracts       — raw contract CSV/XLSX uploads
- broadcast-logs  — raw broadcaster log CSV uploads
- reports         — exported PDF/XLSX audit reports
"""

import logging
from typing import Any

from app.core.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


def _list_bucket_files(bucket: str, prefix: str) -> list[str]:
    """Return all storage paths in *bucket* that start with *prefix*."""
    try:
        supabase = get_supabase_client()
        response = supabase.storage.from_(bucket).list(prefix)
        files = response if isinstance(response, list) else []
        return [f"{prefix}/{item['name']}" for item in files if isinstance(item, dict) and "name" in item]
    except Exception as exc:
        logger.warning("Could not list bucket '%s' prefix '%s': %s", bucket, prefix, exc)
        return []


def _delete_bucket_files(bucket: str, paths: list[str]) -> list[str]:
    """Delete *paths* from *bucket*. Returns successfully deleted paths."""
    if not paths:
        return []
    deleted: list[str] = []
    try:
        supabase = get_supabase_client()
        supabase.storage.from_(bucket).remove(paths)
        deleted = paths
        logger.info("Deleted %d file(s) from bucket '%s'", len(paths), bucket)
    except Exception as exc:
        logger.warning("Failed to delete from bucket '%s': %s", bucket, exc)
    return deleted


def _delete_path_from_db(contract_id: str, bucket_field: str) -> list[str]:
    """
    Read stored raw_upload_path values from DB tables and delete them from storage.
    Returns list of paths deleted.
    """
    supabase = get_supabase_client()
    deleted: list[str] = []

    # Contract raw_upload_path
    if bucket_field == "contracts":
        resp = (
            supabase.table("contracts")
            .select("raw_upload_path")
            .eq("id", contract_id)
            .single()
            .execute()
        )
        if resp.data and resp.data.get("raw_upload_path"):
            path = resp.data["raw_upload_path"]
            deleted.extend(_delete_bucket_files("contracts", [path]))

    # Broadcast log raw_upload_paths (may be multiple)
    elif bucket_field == "broadcast-logs":
        resp = (
            supabase.table("broadcast_logs")
            .select("raw_upload_path")
            .eq("contract_id", contract_id)
            .execute()
        )
        paths = list(
            {r["raw_upload_path"] for r in (resp.data or []) if r.get("raw_upload_path")}
        )
        deleted.extend(_delete_bucket_files("broadcast-logs", paths))

    # Exported PDF/XLSX reports
    elif bucket_field == "reports":
        resp = (
            supabase.table("audit_reports")
            .select("exported_pdf_path, exported_xlsx_path")
            .eq("contract_id", contract_id)
            .execute()
        )
        paths = []
        for row in resp.data or []:
            if row.get("exported_pdf_path"):
                paths.append(row["exported_pdf_path"])
            if row.get("exported_xlsx_path"):
                paths.append(row["exported_xlsx_path"])
        deleted.extend(_delete_bucket_files("reports", paths))

    return deleted


def cleanup_session_files(contract_id: str) -> dict[str, Any]:
    """
    Delete all uploaded and exported files for *contract_id* from Supabase Storage.

    Returns a summary dict with `{deleted_paths: [...], bucket_counts: {...}}`.
    """
    all_deleted: list[str] = []

    for bucket in ("contracts", "broadcast-logs", "reports"):
        deleted = _delete_path_from_db(contract_id, bucket)
        all_deleted.extend(deleted)

    bucket_counts = {
        "contracts": sum(1 for p in all_deleted if not p.startswith("reports") and "broadcast" not in p),
        "broadcast-logs": sum(1 for p in all_deleted if "broadcast" in p.lower() or "/log" in p.lower()),
        "reports": sum(1 for p in all_deleted if "report" in p.lower() or ".pdf" in p or ".xlsx" in p),
    }

    logger.info(
        "Session cleanup for contract %s: deleted %d file(s) total.",
        contract_id,
        len(all_deleted),
    )

    return {
        "contract_id": contract_id,
        "deleted_paths": all_deleted,
        "total_deleted": len(all_deleted),
    }
