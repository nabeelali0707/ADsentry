import logging
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.auth import get_current_profile
from app.models.schemas import (
    FingerprintSourceRequest,
    FingerprintSourceResponse,
    VerifyClipResponse,
)
from app.services.audio_verification_service import (
    download_youtube_audio,
    fingerprint_recording,
    get_audio_duration_seconds,
    has_fingerprinted_sources,
    recognize_clip,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/audio-verification",
    tags=["audio-verification"],
    dependencies=[Depends(get_current_profile)],
)


@router.post("/fingerprint-source", response_model=FingerprintSourceResponse)
def fingerprint_source(
    payload: FingerprintSourceRequest,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = str(Path(tmp_dir) / "source_audio")
        try:
            downloaded_path = download_youtube_audio(payload.youtube_url, output_path)
        except Exception as exc:
            logger.error("YouTube audio download failed for %s: %s", payload.youtube_url, exc)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not download audio from that YouTube URL: {exc}",
            ) from exc

        duration_seconds = get_audio_duration_seconds(downloaded_path)

        try:
            fingerprint_recording(downloaded_path, payload.title)
        except Exception as exc:
            logger.error("Fingerprinting failed for '%s': %s", payload.title, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Fingerprinting the downloaded audio failed.",
            ) from exc

    return {
        "status": "fingerprinted",
        "title": payload.title,
        "duration_seconds": duration_seconds,
    }


def _format_timestamp(seconds: float) -> str:
    total_seconds = max(0, round(seconds))
    minutes, secs = divmod(total_seconds, 60)
    return f"{minutes:02d}:{secs:02d}"


@router.post("/verify-clip", response_model=VerifyClipResponse)
async def verify_clip(
    file: UploadFile = File(...),
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    if not has_fingerprinted_sources():
        return {
            "found": False,
            "matched_title": None,
            "timestamp_seconds": None,
            "timestamp_formatted": None,
            "confidence": None,
            "reason": "no_sources_fingerprinted",
        }

    file_bytes = await file.read()
    suffix = Path(file.filename or "clip.wav").suffix or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
        tmp_file.write(file_bytes)
        tmp_path = tmp_file.name

    try:
        match = recognize_clip(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if match is None:
        return {
            "found": False,
            "matched_title": None,
            "timestamp_seconds": None,
            "timestamp_formatted": None,
            "confidence": None,
            "reason": "no_match",
        }

    offset_seconds = match["offset_seconds"]
    return {
        "found": True,
        "matched_title": match["matched_title"],
        "timestamp_seconds": offset_seconds,
        "timestamp_formatted": _format_timestamp(offset_seconds),
        "confidence": match["confidence"],
    }
