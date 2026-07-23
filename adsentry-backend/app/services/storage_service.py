from app.core.supabase_client import get_supabase_client


def upload_file(bucket: str, path: str, file_bytes: bytes, content_type: str | None = None) -> str:
    """
    Upload raw bytes to Supabase Storage.

    ``content_type`` must be passed for buckets with an ``allowed_mime_types``
    restriction (contracts/broadcast-logs only accept CSV/XLSX) — without it,
    the storage client defaults to ``text/plain`` and every upload is
    rejected with a 400.
    """
    storage = get_supabase_client().storage.from_(bucket)
    file_options = {"upsert": "true"}
    if content_type:
        file_options["content-type"] = content_type
    storage.upload(path, file_bytes, file_options=file_options)
    return path


def get_signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    storage = get_supabase_client().storage.from_(bucket)
    response = storage.create_signed_url(path, expires_in)

    if isinstance(response, dict):
        signed_url = response.get("signedURL") or response.get("signed_url")
        if signed_url:
            return signed_url

    signed_url = getattr(response, "signed_url", None) or getattr(response, "signedURL", None)
    if signed_url:
        return signed_url

    raise RuntimeError("Supabase did not return a signed URL.")


def delete_file(bucket: str, path: str) -> None:
    storage = get_supabase_client().storage.from_(bucket)
    storage.remove([path])
