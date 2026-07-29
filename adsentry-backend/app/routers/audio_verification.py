import logging
import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Request

from app.core.auth import get_current_profile, get_contract_for_profile
from app.core.supabase_client import get_supabase_client
from app.models.schemas import (
    FingerprintSourceRequest,
    FingerprintSourceResponse,
    VerifyClipResponse,
    LiveVerificationStartRequest,
    LiveVerificationStartResponse,
    LiveVerificationStatusResponse,
)
from app.services.audio_verification_service import (
    download_youtube_audio,
    fingerprint_recording,
    get_audio_duration_seconds,
    has_fingerprinted_sources,
    recognize_clip,
)
from app.services.live_monitor_service import (
    start_live_verification_session,
    stop_live_verification_session,
    get_live_verification_session_status,
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
    request: Request,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    if not getattr(request.app.state, "audio_verification_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio verification is not configured on this server.",
        )
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

        try:
            duration_seconds = get_audio_duration_seconds(downloaded_path)
        except Exception as exc:
            logger.error("Failed to determine audio duration: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Could not determine audio duration: {exc}",
            ) from exc

        try:
            fingerprint_recording(downloaded_path, payload.title, str(current_profile["organization_id"]))
        except Exception as exc:
            logger.error("Fingerprinting failed for '%s': %s", payload.title, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Fingerprinting the downloaded audio failed: {exc}",
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
    request: Request,
    file: UploadFile = File(...),
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    if not getattr(request.app.state, "audio_verification_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio verification is not configured on this server.",
        )
    try:
        if not has_fingerprinted_sources(str(current_profile["organization_id"])):
            return {
                "found": False,
                "matched_title": None,
                "timestamp_seconds": None,
                "timestamp_formatted": None,
                "confidence": None,
                "reason": "no_sources_fingerprinted",
            }
    except Exception as exc:
        logger.error("Database connection failure in verify_clip: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database check failed: {exc}",
        ) from exc

    file_bytes = await file.read()
    suffix = Path(file.filename or "clip.wav").suffix or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
        tmp_file.write(file_bytes)
        tmp_path = tmp_file.name

    try:
        match = recognize_clip(tmp_path, str(current_profile["organization_id"]))
    except Exception as exc:
        logger.error("Audio clip recognition failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio recognition failed: {exc}",
        ) from exc
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


@router.post("/live/start", response_model=LiveVerificationStartResponse)
async def start_live_verification(
    payload: LiveVerificationStartRequest,
    request: Request,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    if not getattr(request.app.state, "audio_verification_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio verification is not configured on this server.",
        )
    # 1. Verify that user belongs to the contract's organization
    get_contract_for_profile(payload.contract_id, current_profile)

    # 2. Enforce one active live session per user at a time
    user_id = current_profile["id"]
    supabase = get_supabase_client()
    active_resp = (
        supabase.table("live_sessions")
        .select("id")
        .eq("user_id", str(user_id))
        .in_("status", ["starting", "running"])
        .execute()
    )
    if active_resp.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an active live monitoring session running. Please stop it first before starting a new one."
        )

    try:
        session_id = await start_live_verification_session(
            youtube_url=payload.youtube_url,
            contract_id=str(payload.contract_id),
            user_id=str(user_id)
        )
        return {"session_id": session_id}
    except RuntimeError as exc:
        logger.error("Failed to start live verification: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc)
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error starting live verification")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {exc}"
        ) from exc


@router.get("/live/{session_id}/status", response_model=LiveVerificationStatusResponse)
def get_live_status(
    session_id: UUID,
    request: Request,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    if not getattr(request.app.state, "audio_verification_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio verification is not configured on this server.",
        )
    supabase = get_supabase_client()
    # 1. Fetch session from DB to check contract
    session_resp = supabase.table("live_sessions").select("*").eq("id", str(session_id)).execute()
    if not session_resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live session not found.")
    session = session_resp.data[0]

    # 2. Verify session ownership
    if session.get("user_id") and str(session["user_id"]) != str(current_profile["id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this live session.",
        )

    # 3. Verify organization ownership
    get_contract_for_profile(session["contract_id"], current_profile)

    try:
        return get_live_verification_session_status(str(session_id))
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch session status: {exc}"
        )


@router.post("/live/{session_id}/stop")
async def stop_live_verification(
    session_id: UUID,
    request: Request,
    current_profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, str]:
    if not getattr(request.app.state, "audio_verification_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio verification is not configured on this server.",
        )
    supabase = get_supabase_client()
    # 1. Fetch session from DB to check contract
    session_resp = supabase.table("live_sessions").select("*").eq("id", str(session_id)).execute()
    if not session_resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live session not found.")
    session = session_resp.data[0]

    # 2. Verify session ownership
    if session.get("user_id") and str(session["user_id"]) != str(current_profile["id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to stop this live session.",
        )

    # 3. Verify organization ownership
    get_contract_for_profile(session["contract_id"], current_profile)

    try:
        await stop_live_verification_session(str(session_id))
        return {"status": "stopped"}
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop session: {exc}"
        )
