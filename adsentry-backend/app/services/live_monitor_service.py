import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timedelta, time
from typing import Any

import pandas as pd
import yt_dlp

from app.core.config import settings
from app.core.supabase_client import get_supabase_client
from app.core.cache import cache_delete_prefix
from app.services.audio_verification_service import recognize_clip, get_audio_duration_seconds
from app.services.storage_service import upload_file, get_signed_url
from app.services.reconciliation_service import run_reconciliation
from app.services.audit_report_service import compute_audit_report

logger = logging.getLogger(__name__)

# Lightweight in-memory dictionary holding active process handles.
# Keys are session_id (str), values are dict:
# {
#     "process": asyncio.subprocess.Process,
#     "task": asyncio.Task
# }
active_processes: dict[str, dict[str, Any]] = {}


def _ydl_opts(use_cookies: bool) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {"youtube": {"player_client": ["android"]}},
    }
    if use_cookies and settings.ytdlp_cookies_path is not None:
        opts["cookiefile"] = settings.ytdlp_cookies_path
    return opts


def _extract_info_with_cookie_fallback(youtube_url: str) -> dict[str, Any]:
    """
    Extracts video info, preferring a cookie-authenticated session (needed to
    dodge YouTube's bot-detection on cloud IPs). Some authenticated sessions
    are served SABR-only formats for live streams that yt-dlp can't parse yet
    ("No video formats found") — that specific failure is unrelated to cookie
    validity, so retry once without cookies rather than failing outright.
    """
    use_cookies = settings.ytdlp_cookies_path is not None
    try:
        with yt_dlp.YoutubeDL(_ydl_opts(use_cookies=use_cookies)) as ydl:
            return ydl.extract_info(youtube_url, download=False)
    except Exception as exc:
        if use_cookies and "No video formats found" in str(exc):
            logger.warning("yt-dlp extraction failed with cookies (%s); retrying without cookies.", exc)
            with yt_dlp.YoutubeDL(_ydl_opts(use_cookies=False)) as ydl:
                return ydl.extract_info(youtube_url, download=False)
        raise


def resolve_live_stream_url(youtube_url: str) -> str:
    """
    Validates if the YouTube URL is a live stream and extracts the HLS/m3u8 stream manifest URL.
    """
    try:
        info = _extract_info_with_cookie_fallback(youtube_url)
    except Exception as exc:
        exc_str = str(exc)
        if "Sign in to confirm" in exc_str or "not a bot" in exc_str:
            raise RuntimeError(
                "Failed to fetch video information — YouTube is blocking this server's IP "
                "and requires a signed-in session. Set YTDLP_COOKIES_CONTENT or "
                "YTDLP_COOKIES_FILE in the environment (see .env.example)."
            ) from exc
        raise RuntimeError(f"Failed to fetch video information: {exc}") from exc

    is_live = info.get("is_live") or info.get("live_status") == "is_live"
    if not is_live:
        raise RuntimeError("The provided YouTube URL is not currently a live broadcast.")

    manifest_url = info.get("url")
    if not manifest_url:
        formats = info.get("formats", [])
        for fmt in formats:
            if fmt.get("protocol") == "m3u8_native" or "m3u8" in fmt.get("url", ""):
                manifest_url = fmt["url"]
                break

    if not manifest_url and formats:
        for fmt in formats:
            if fmt.get("url"):
                manifest_url = fmt["url"]
                break

    if not manifest_url:
        raise RuntimeError("Could not extract a live HLS/manifest stream URL from this live video.")

    return manifest_url


def _run_auto_reconciliation_sync(contract_id: str) -> None:
    try:
        supabase = get_supabase_client()
        contract_resp = supabase.table("contracts").select("*").eq("id", contract_id).single().execute()
        contract = contract_resp.data
        if not contract:
            logger.error(f"Auto-reconciliation failed: Contract {contract_id} not found.")
            return

        logs_resp = supabase.table("broadcast_logs").select("*").eq("contract_id", contract_id).execute()
        logs = logs_resp.data or []

        discrepancies_df = run_reconciliation(contract, logs)
        rows = discrepancies_df.to_dict(orient="records")
        for row in rows:
            row["contract_id"] = contract_id

        # Replace existing discrepancies
        supabase.table("discrepancies").delete().eq("contract_id", contract_id).execute()
        if rows:
            supabase.table("discrepancies").insert(rows).execute()

        # Re-compute report
        compute_audit_report(contract_id)

        # Clear dashboard cache keys
        cache_delete_prefix(f"dashboard:{contract_id}")
        cache_delete_prefix(f"financial:{contract_id}")
        cache_delete_prefix(f"ai_summary:{contract_id}")
        logger.info(f"✓ Auto-reconciliation complete for contract {contract_id}")
    except Exception as e:
        logger.exception(f"Failed to run auto-reconciliation for contract {contract_id}: {e}")


async def run_auto_reconciliation(contract_id: str) -> None:
    """
    Immediately runs reconciliation and recalculates the audit report.
    Invalidates dashboard, financial impact, and summary caches.

    The Supabase client and reconciliation/report work are all synchronous and
    network-bound, so they run in a worker thread — calling them inline would
    stall the event loop serving every other request (and on Windows corrupts
    socket state outright, surfacing as WinError 10035).
    """
    await asyncio.to_thread(_run_auto_reconciliation_sync, contract_id)


def _record_match_sync(
    session_id: str,
    contract_id: str,
    matched_title: str,
    confidence: float,
    offset_seconds: float,
    file_path: str,
    matched_at: datetime,
) -> bool:
    """
    Blocking half of handle_match_found: uploads evidence, records the match,
    and inserts the broadcast log. Returns True if the contract was found and
    reconciliation should follow.
    """
    supabase = get_supabase_client()

    # 1. Upload evidence clip snippet
    evidence_clip_path = None
    try:
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                file_bytes = f.read()
            filename = os.path.basename(file_path)
            # Save into audio-evidence bucket
            evidence_clip_path = upload_file(
                bucket="audio-evidence",
                path=f"matches/{session_id}/{filename}",
                file_bytes=file_bytes,
                content_type="audio/wav"
            )
            logger.info(f"Uploaded evidence clip: {evidence_clip_path}")
    except Exception as e:
        logger.error(f"Failed to upload evidence snippet for session {session_id}: {e}")

    # 2. Record the match in live_matches
    try:
        match_row = {
            "session_id": session_id,
            "matched_title": matched_title,
            "confidence": confidence,
            "matched_at": matched_at.isoformat(),
            "offset_seconds": offset_seconds,
            "evidence_clip_path": evidence_clip_path
        }
        supabase.table("live_matches").insert(match_row).execute()
        logger.info(f"Recorded live match: {matched_title} (confidence: {confidence}%)")
    except Exception as e:
        logger.error(f"Failed to save live match to database: {e}")

    # 3. Create broadcast log row
    try:
        # Fetch contract to get channel name and duration
        contract_resp = supabase.table("contracts").select("*").eq("id", contract_id).single().execute()
        contract = contract_resp.data
        if contract:
            # Determine chunk duration
            try:
                duration_sec = int(get_audio_duration_seconds(file_path))
            except Exception:
                duration_sec = int(contract["spot_duration_sec"])

            log_row = {
                "contract_id": contract_id,
                "channel": contract["channel"],
                "air_date": matched_at.strftime("%Y-%m-%d"),
                "air_time": matched_at.strftime("%H:%M:%S"),
                "spot_duration_sec": duration_sec,
                "ad_identifier": f"LIVE-MATCH-{matched_title}",
                "source": "independent_audio_verification"
            }
            supabase.table("broadcast_logs").insert(log_row).execute()
            logger.info(f"Inserted broadcast log for matched airing: {log_row['air_date']} {log_row['air_time']}")
            return True
    except Exception as e:
        logger.error(f"Failed to insert broadcast log: {e}")
    return False


async def handle_match_found(session_id: str, contract_id: str, matched_title: str, confidence: float, offset_seconds: float, file_path: str) -> None:
    """
    Saves the live match to the database, uploads the evidence snippet,
    inserts a broadcast log row, and runs auto-reconciliation.
    """
    should_reconcile = await asyncio.to_thread(
        _record_match_sync,
        session_id,
        contract_id,
        matched_title,
        confidence,
        offset_seconds,
        file_path,
        datetime.now(),
    )
    if should_reconcile:
        await run_auto_reconciliation(contract_id)


def _check_missed_airings_sync(session_id: str, contract_id: str) -> None:
    try:
        supabase = get_supabase_client()
        contract_resp = supabase.table("contracts").select("*").eq("id", contract_id).single().execute()
        contract = contract_resp.data
        if not contract or not contract.get("expected_air_time"):
            return

        today = datetime.now().date()
        # Verify contract dates
        start_date = datetime.strptime(contract["start_date"], "%Y-%m-%d").date() if isinstance(contract["start_date"], str) else contract["start_date"]
        end_date = datetime.strptime(contract["end_date"], "%Y-%m-%d").date() if isinstance(contract["end_date"], str) else contract["end_date"]
        if not (start_date <= today <= end_date):
            return

        # Parse expected time
        t_str = contract["expected_air_time"]
        if isinstance(t_str, str):
            t = datetime.strptime(t_str, "%H:%M:%S").time()
        else:
            t = t_str

        expected_datetime = datetime.combine(today, t)
        tolerance_minutes = int(contract.get("time_window_tolerance_minutes") or 15)
        cutoff_time = expected_datetime + timedelta(minutes=tolerance_minutes)

        now = datetime.now()
        # If expected window has passed
        if now > cutoff_time:
            # Check if any match exists in the window for this session
            matches_resp = (
                supabase.table("live_matches")
                .select("id")
                .eq("session_id", session_id)
                .gte("matched_at", (expected_datetime - timedelta(minutes=tolerance_minutes)).isoformat())
                .lte("matched_at", (expected_datetime + timedelta(minutes=tolerance_minutes)).isoformat())
                .execute()
            )
            if not matches_resp.data:
                # No matches! Check if we already created a MISSED discrepancy for this slot
                expected_val_str = expected_datetime.strftime("%Y-%m-%d %H:%M:%S")
                disc_resp = (
                    supabase.table("discrepancies")
                    .select("id")
                    .eq("contract_id", contract_id)
                    .eq("type", "MISSED")
                    .eq("expected_value", expected_val_str)
                    .execute()
                )
                if not disc_resp.data:
                    # Insert direct MISSED discrepancy
                    cost_per_airing = float(contract["cost_per_airing"])
                    disc_row = {
                        "contract_id": contract_id,
                        "type": "MISSED",
                        "expected_value": expected_val_str,
                        "actual_value": None,
                        "financial_impact": cost_per_airing,
                        "air_date": today.strftime("%Y-%m-%d"),
                        "channel": contract["channel"],
                        "matched_log_id": None
                    }
                    supabase.table("discrepancies").insert(disc_row).execute()
                    logger.warning(f"Live Monitor flagged a MISSED airing for contract {contract_id} at {expected_val_str}")
                    
                    # Update report & clear caches
                    compute_audit_report(contract_id)
                    cache_delete_prefix(f"dashboard:{contract_id}")
                    cache_delete_prefix(f"financial:{contract_id}")
                    cache_delete_prefix(f"ai_summary:{contract_id}")
    except Exception as e:
        logger.error(f"Error checking missed airings for contract {contract_id}: {e}")


async def check_missed_airings(session_id: str, contract_id: str) -> None:
    """
    Checks if a contract's expected airing time window has closed without a recorded match.
    If yes, logs a MISSED discrepancy directly.
    """
    await asyncio.to_thread(_check_missed_airings_sync, session_id, contract_id)


async def monitor_session_loop(session_id: str, contract_id: str, temp_dir: str) -> None:
    """
    Loops checking for WAV segments, runs recognition on them, deletes them,
    and supports reconnect-on-drop retry logic (up to 3 times).
    """
    supabase = get_supabase_client()
    max_duration = 2 * 3600  # 2 hours limit
    start_time = asyncio.get_event_loop().time()
    processed_files = set()
    retry_count = 0
    backoffs = [5, 15, 45]

    # Fetch contract organization_id for organization scoping
    organization_id = None
    try:
        contract_resp = await asyncio.to_thread(
            supabase.table("contracts").select("organization_id").eq("id", contract_id).single().execute
        )
        if contract_resp.data:
            organization_id = str(contract_resp.data["organization_id"])
    except Exception as e:
        logger.error(f"Failed to fetch organization_id for contract {contract_id}: {e}")

    try:
        while True:
            # 1. Fetch current status from DB
            session_resp = await asyncio.to_thread(
                supabase.table("live_sessions").select("status", "youtube_url").eq("id", session_id).execute
            )
            if not session_resp.data:
                logger.error(f"Session {session_id} not found in DB. Exiting loop.")
                break
            session_db = session_resp.data[0]
            if session_db["status"] != "running":
                break

            # 2. Hard max session duration timeout check
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= max_duration:
                logger.info(f"Live verification session {session_id} hit max duration limit. Auto-stopping.")
                await asyncio.to_thread(
                    supabase.table("live_sessions")
                    .update({"status": "stopped", "ended_at": datetime.now().isoformat()})
                    .eq("id", session_id).execute
                )
                break

            # 3. Check ffmpeg process status
            proc_handle = active_processes.get(session_id)
            if not proc_handle or not proc_handle.get("process"):
                logger.error(f"No process handle registered for session {session_id}. Exiting loop.")
                break
            proc = proc_handle["process"]

            # If ffmpeg process died unexpectedly
            if proc.returncode is not None:
                logger.warning(f"ffmpeg subprocess for session {session_id} exited with code {proc.returncode}.")
                if retry_count < 3:
                    backoff = backoffs[retry_count]
                    logger.info(f"Reconnecting stream in {backoff}s (Attempt {retry_count + 1}/3)...")
                    retry_count += 1
                    await asyncio.sleep(backoff)
                    
                    # Restart ffmpeg
                    try:
                        manifest_url = await asyncio.to_thread(resolve_live_stream_url, session_db["youtube_url"])
                        new_proc = await start_ffmpeg_process(manifest_url, temp_dir)
                        active_processes[session_id]["process"] = new_proc
                        logger.info(f"✓ Reconnected successfully for session {session_id}.")
                        continue
                    except Exception as e:
                        logger.error(f"Reconnect attempt failed: {e}")
                        continue
                else:
                    logger.error(f"Exceeded 3 reconnect retries. Marking session {session_id} as error.")
                    await asyncio.to_thread(
                        supabase.table("live_sessions").update({
                            "status": "error",
                            "error_message": "Stream dropped and reconnection retries were exhausted.",
                            "ended_at": datetime.now().isoformat()
                        }).eq("id", session_id).execute
                    )
                    break

            # 4. Search and process files
            try:
                files = sorted([f for f in os.listdir(temp_dir) if f.startswith("chunk_") and f.endswith(".wav")])
            except Exception as e:
                logger.error(f"Error listing live directory: {e}")
                files = []

            if len(files) > 1:
                for f in files[:-1]:
                    if f not in processed_files:
                        file_path = os.path.join(temp_dir, f)
                        processed_files.add(f)
                        try:
                            # Run Dejavu check in a thread with organization scoping
                            match = await asyncio.to_thread(recognize_clip, file_path, organization_id)
                            if match:
                                await handle_match_found(
                                    session_id=session_id,
                                    contract_id=contract_id,
                                    matched_title=match["matched_title"],
                                    confidence=match["confidence"],
                                    offset_seconds=match["offset_seconds"],
                                    file_path=file_path
                                )
                        except Exception as e:
                            logger.error(f"Failed recognizing clip {f}: {e}")
                        finally:
                            try:
                                os.remove(file_path)
                            except Exception:
                                pass

            # 5. Missed airings check
            await check_missed_airings(session_id, contract_id)

            await asyncio.sleep(2)

        # Post-loop cleanup
        proc_handle = active_processes.get(session_id)
        if proc_handle and proc_handle.get("process"):
            proc = proc_handle["process"]
            if proc.returncode is None:
                try:
                    proc.terminate()
                    await proc.wait()
                except Exception:
                    pass

        # Process any remaining WAV chunks
        try:
            files = sorted([f for f in os.listdir(temp_dir) if f.startswith("chunk_") and f.endswith(".wav")])
            for f in files:
                file_path = os.path.join(temp_dir, f)
                try:
                    match = await asyncio.to_thread(recognize_clip, file_path, organization_id)
                    if match:
                        await handle_match_found(
                            session_id=session_id,
                            contract_id=contract_id,
                            matched_title=match["matched_title"],
                            confidence=match["confidence"],
                            offset_seconds=match["offset_seconds"],
                            file_path=file_path
                        )
                except Exception:
                    pass
                finally:
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
        except Exception:
            pass

    except Exception as e:
        logger.exception(f"Unexpected error in background monitor loop for session {session_id}")
        try:
            await asyncio.to_thread(
                supabase.table("live_sessions").update({
                    "status": "error",
                    "error_message": f"Unexpected monitor error: {e}",
                    "ended_at": datetime.now().isoformat()
                }).eq("id", session_id).execute
            )
        except Exception:
            # Never let the error-reporting write mask the original failure,
            # and never leave the finally-block cleanup unreached.
            logger.exception(f"Also failed to mark session {session_id} as error")
    finally:
        # Delete process registration
        active_processes.pop(session_id, None)
        # Clean up temp folder
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info(f"Cleaned up temp directory: {temp_dir}")
        except Exception as e:
            logger.error(f"Failed to delete temp dir {temp_dir}: {e}")


class FFmpegProcess:
    """
    Thin adapter over subprocess.Popen exposing the slice of
    asyncio.subprocess.Process that this module relies on.

    asyncio.create_subprocess_exec can't be used here: under --reload uvicorn
    manages its own worker subprocesses, and uvicorn.loops.asyncio then selects
    SelectorEventLoop — which on Windows raises a bare NotImplementedError for
    any subprocess creation. Popen is loop-independent, so live capture behaves
    the same in Windows dev and Linux production.
    """

    def __init__(self, popen: subprocess.Popen) -> None:
        self._popen = popen

    @property
    def pid(self) -> int:
        return self._popen.pid

    @property
    def returncode(self) -> int | None:
        # Popen only refreshes returncode when polled, unlike the asyncio
        # Process whose transport updates it on exit.
        return self._popen.poll()

    def terminate(self) -> None:
        self._popen.terminate()

    async def wait(self) -> int:
        return await asyncio.to_thread(self._popen.wait)


async def start_ffmpeg_process(manifest_url: str, temp_dir: str) -> FFmpegProcess:
    """
    Launches an ffmpeg subprocess to read the manifest stream and output wav chunks.
    """
    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-i", manifest_url,
        "-vn",
        "-acodec", "pcm_s16le",
        "-f", "segment",
        "-segment_time", "15",
        "-segment_format", "wav",
        os.path.join(temp_dir, "chunk_%05d.wav")
    ]
    popen = await asyncio.to_thread(
        subprocess.Popen,
        ffmpeg_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return FFmpegProcess(popen)


async def start_live_verification_session(youtube_url: str, contract_id: str, user_id: str | None) -> str:
    """
    Initiates live verification: inserts live_sessions record, starts ffmpeg capture,
    and runs the background monitoring task.
    """
    # 1. Resolve manifest URL
    manifest_url = await asyncio.to_thread(resolve_live_stream_url, youtube_url)

    # 2. Insert row in database
    supabase = get_supabase_client()
    session_row = {
        "contract_id": contract_id,
        "youtube_url": youtube_url,
        "status": "starting",
        "started_at": datetime.now().isoformat(),
        "user_id": user_id
    }
    insert_resp = await asyncio.to_thread(supabase.table("live_sessions").insert(session_row).execute)
    if not insert_resp.data:
        raise RuntimeError("Failed to create live session in database.")
    session = insert_resp.data[0]
    session_id = session["id"]

    # 3. Create temp directory
    temp_dir = tempfile.mkdtemp(prefix=f"adsentry_live_{session_id}_")

    try:
        # 4. Spawn ffmpeg process
        proc = await start_ffmpeg_process(manifest_url, temp_dir)
        
        # 5. Register process handle
        active_processes[session_id] = {
            "process": proc,
            "task": None
        }

        # 6. Mark status as running
        await asyncio.to_thread(
            supabase.table("live_sessions").update({"status": "running"}).eq("id", session_id).execute
        )

        # 7. Launch background task
        task = asyncio.create_task(monitor_session_loop(session_id, contract_id, temp_dir))
        active_processes[session_id]["task"] = task

        return session_id
    except Exception as e:
        logger.exception(f"Failed to start live verify capture for session {session_id}")
        await asyncio.to_thread(
            supabase.table("live_sessions").update({
                "status": "error",
                "error_message": str(e),
                "ended_at": datetime.now().isoformat()
            }).eq("id", session_id).execute
        )
        shutil.rmtree(temp_dir, ignore_errors=True)
        active_processes.pop(session_id, None)
        raise RuntimeError(f"Failed to start live verify capture: {e}") from e


async def stop_live_verification_session(session_id: str) -> None:
    """
    Stops live verification: marks session as stopped and terminates subprocesses.
    """
    supabase = get_supabase_client()
    
    # Update status to stopped
    await asyncio.to_thread(
        supabase.table("live_sessions").update({
            "status": "stopped",
            "ended_at": datetime.now().isoformat()
        }).eq("id", session_id).execute
    )

    proc_handle = active_processes.get(session_id)
    if proc_handle:
        proc = proc_handle.get("process")
        if proc and proc.returncode is None:
            try:
                proc.terminate()
            except Exception:
                pass
        task = proc_handle.get("task")
        if task:
            try:
                await task
            except Exception:
                pass


def get_live_verification_session_status(session_id: str) -> dict[str, Any]:
    """
    Fetches the status and matches from DB, including evidence signed URLs.
    """
    supabase = get_supabase_client()
    session_resp = supabase.table("live_sessions").select("*").eq("id", session_id).execute()
    if not session_resp.data:
        raise KeyError(f"Live session {session_id} not found.")
    session = session_resp.data[0]

    matches_resp = supabase.table("live_matches").select("*").eq("session_id", session_id).execute()
    matches = matches_resp.data or []

    # Map signed URLs for evidence
    for match in matches:
        if match.get("evidence_clip_path"):
            try:
                match["evidence_url"] = get_signed_url("audio-evidence", match["evidence_clip_path"])
            except Exception as e:
                logger.error(f"Failed getting signed URL for evidence {match['evidence_clip_path']}: {e}")
                match["evidence_url"] = None
        else:
            match["evidence_url"] = None

    # Fetch missed airings since session started (Phase 4)
    missed_resp = (
        supabase.table("discrepancies")
        .select("expected_value", "air_date", "financial_impact")
        .eq("contract_id", session["contract_id"])
        .eq("type", "MISSED")
        .gte("created_at", session["started_at"])
        .execute()
    )
    missed_airings = missed_resp.data or []

    # Map matched fields for schemas
    mapped_matches = []
    for m in matches:
        mapped_matches.append({
            "title": m["matched_title"],
            "offset_seconds": float(m["offset_seconds"]),
            "confidence": float(m["confidence"]),
            "timestamp": m["matched_at"],
            "evidence_url": m.get("evidence_url")
        })

    return {
        "session_id": session_id,
        "youtube_url": session["youtube_url"],
        "contract_id": session["contract_id"],
        "status": session["status"],
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "matches": mapped_matches,
        "missed_airings": missed_airings,
        "error_message": session["error_message"]
    }


async def run_live_scheduler_tick() -> None:
    """
    Checks scheduled contracts and starts/stops live captures automatically.
    """
    try:
        supabase = get_supabase_client()
        # Query contracts with scheduler URL
        contracts_resp = await asyncio.to_thread(
            supabase.table("contracts").select("*").not_.is_("live_source_url", "null").execute
        )
        contracts = contracts_resp.data or []

        now = datetime.now()
        today = now.date()

        for contract in contracts:
            expected_time_str = contract.get("expected_air_time")
            if not expected_time_str:
                continue

            # Verify dates
            start_date = datetime.strptime(contract["start_date"], "%Y-%m-%d").date() if isinstance(contract["start_date"], str) else contract["start_date"]
            end_date = datetime.strptime(contract["end_date"], "%Y-%m-%d").date() if isinstance(contract["end_date"], str) else contract["end_date"]
            if not (start_date <= today <= end_date):
                continue

            # Parse expected airing time
            if isinstance(expected_time_str, str):
                t = datetime.strptime(expected_time_str, "%H:%M:%S").time()
            else:
                t = expected_time_str

            expected_datetime = datetime.combine(today, t)
            tolerance_minutes = int(contract.get("time_window_tolerance_minutes") or 15)

            # Define scheduler windows
            start_window = expected_datetime - timedelta(minutes=5)
            stop_window = expected_datetime + timedelta(minutes=tolerance_minutes + 5)

            # Query any existing session for this contract started today
            sessions_resp = await asyncio.to_thread(
                supabase.table("live_sessions")
                .select("*")
                .eq("contract_id", contract["id"])
                .gte("started_at", today.isoformat())
                .execute
            )
            sessions = sessions_resp.data or []
            active_session = next((s for s in sessions if s["status"] in ("starting", "running")), None)

            # If inside running window and no active session
            if start_window <= now <= stop_window:
                if not active_session:
                    logger.info(f"Scheduler: Starting auto-verification for contract {contract['id']}")
                    try:
                        await start_live_verification_session(
                            youtube_url=contract["live_source_url"],
                            contract_id=contract["id"],
                            user_id=None
                        )
                    except Exception as e:
                        logger.error(f"Scheduler failed starting live session: {e}")
            # If past running window and there is an active session
            elif now > stop_window:
                if active_session:
                    logger.info(f"Scheduler: Stopping auto-verification for session {active_session['id']}")
                    try:
                        await stop_live_verification_session(active_session["id"])
                    except Exception as e:
                        logger.error(f"Scheduler failed stopping session: {e}")
    except Exception as e:
        logger.error(f"Error in scheduler tick: {e}")


async def live_scheduler_loop() -> None:
    """
    Indefinite loop that runs the scheduled auto-start/stop tick every 60 seconds.
    """
    logger.info("Starting live capture scheduler loop...")
    while True:
        await asyncio.sleep(60)
        await run_live_scheduler_tick()
