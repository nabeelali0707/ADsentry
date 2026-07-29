import asyncio
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime
from typing import Any

import yt_dlp

from app.services.audio_verification_service import recognize_clip

logger = logging.getLogger(__name__)

# In-memory dictionary holding active monitoring session states.
# Keys are session_id (str), values are dict:
# {
#     "youtube_url": str,
#     "status": str,  # "starting" | "running" | "stopped" | "error"
#     "started_at": datetime,
#     "matches": list[dict],
#     "error_message": str | None,
#     "user_id": str,
#     "process": asyncio.subprocess.Process | None,
#     "task": asyncio.Task | None,
#     "temp_dir": str
# }
active_sessions: dict[str, dict[str, Any]] = {}


def resolve_live_stream_url(youtube_url: str) -> str:
    """
    Validates if the YouTube URL is a live stream and extracts the HLS/m3u8 stream manifest URL.
    """
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(youtube_url, download=False)
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch video information: {exc}") from exc

        # Check if it is currently a live broadcast
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


async def run_recognition_on_chunk(session: dict[str, Any], file_path: str) -> None:
    """
    Runs recognize_clip on a single chunk file in a thread pool to avoid blocking the asyncio event loop.
    Appends any match to the session's matches.
    """
    try:
        # Run CPU-bound sync function in a separate thread
        match = await asyncio.to_thread(recognize_clip, file_path)
        if match:
            match_entry = {
                "title": match["matched_title"],
                "offset_seconds": match["offset_seconds"],
                "confidence": match["confidence"],
                "timestamp": datetime.now()
            }
            session["matches"].append(match_entry)
            logger.info(f"✓ Live match found for session: {match_entry}")
    except Exception as exc:
        logger.error(f"Error recognizing clip {file_path}: {exc}")


async def monitor_session_loop(session_id: str, temp_dir: str, proc: asyncio.subprocess.Process) -> None:
    """
    Background loop that watches the temporary directory and processes fully written wav files.
    """
    session = active_sessions.get(session_id)
    if not session:
        return

    start_time = asyncio.get_event_loop().time()
    max_duration = 2 * 3600  # 2 hours in seconds
    processed_files = set()

    try:
        session["status"] = "running"
        logger.info(f"Live monitoring session {session_id} is running.")

        while session["status"] == "running":
            # 1. Enforce hard max session duration
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= max_duration:
                logger.info(f"Live session {session_id} exceeded max duration of 2 hours. Auto-stopping.")
                break

            # 2. Check if ffmpeg process exited unexpectedly
            if proc.returncode is not None:
                if proc.returncode != 0:
                    session["status"] = "error"
                    session["error_message"] = f"ffmpeg process exited unexpectedly with code {proc.returncode}."
                break

            # 3. Read segment chunks in the directory
            try:
                files = sorted([f for f in os.listdir(temp_dir) if f.startswith("chunk_") and f.endswith(".wav")])
            except Exception as e:
                logger.error(f"Error listing directory {temp_dir}: {e}")
                files = []

            # Process completed files (we know they are complete if a subsequent chunk file exists)
            if len(files) > 1:
                for f in files[:-1]:
                    if f not in processed_files:
                        file_path = os.path.join(temp_dir, f)
                        await run_recognition_on_chunk(session, file_path)
                        processed_files.add(f)
                        try:
                            os.remove(file_path)
                        except Exception:
                            pass

            await asyncio.sleep(2)

        # Post-loop cleanup
        # Terminate ffmpeg subprocess if it's still running
        if proc.returncode is None:
            try:
                proc.terminate()
                await proc.wait()
            except Exception as e:
                logger.warning(f"Error terminating ffmpeg for session {session_id}: {e}")

        # Process any remaining chunks
        try:
            files = sorted([f for f in os.listdir(temp_dir) if f.startswith("chunk_") and f.endswith(".wav")])
            for f in files:
                file_path = os.path.join(temp_dir, f)
                await run_recognition_on_chunk(session, file_path)
                try:
                    os.remove(file_path)
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error during final chunk processing for session {session_id}: {e}")

        if session["status"] == "running":
            session["status"] = "stopped"

    except Exception as e:
        logger.exception(f"Unexpected error in monitor loop for session {session_id}")
        session["status"] = "error"
        session["error_message"] = f"Unexpected monitoring error: {e}"
        if proc.returncode is None:
            try:
                proc.terminate()
            except Exception:
                pass
    finally:
        # Delete the temp directory
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info(f"Cleaned up temp directory for session {session_id}: {temp_dir}")
        except Exception as e:
            logger.error(f"Failed to delete temp dir {temp_dir}: {e}")


async def start_live_verification_session(youtube_url: str, user_id: str) -> str:
    """
    Starts a live stream monitoring session. Resolves the live stream manifest url,
    spawns ffmpeg segment capture, and launches a background task.
    """
    # Fail fast if ffmpeg is missing
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg executable not found on PATH. Cannot start live verification.")

    # 1. Resolve direct HLS stream URL (run in thread pool to avoid blocking)
    manifest_url = await asyncio.to_thread(resolve_live_stream_url, youtube_url)

    # 2. Create a unique session ID and temp directory
    session_id = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp(prefix=f"adsentry_live_{session_id}_")

    # 3. Start ffmpeg subprocess asynchronously
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

    try:
        proc = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"Failed to start ffmpeg subprocess: {e}") from e

    # 4. Initialize session entry
    session = {
        "youtube_url": youtube_url,
        "status": "starting",
        "started_at": datetime.now(),
        "matches": [],
        "error_message": None,
        "user_id": user_id,
        "process": proc,
        "temp_dir": temp_dir,
        "task": None
    }
    active_sessions[session_id] = session

    # 5. Launch background monitor task
    task = asyncio.create_task(monitor_session_loop(session_id, temp_dir, proc))
    session["task"] = task

    return session_id


async def stop_live_verification_session(session_id: str) -> None:
    """
    Stops the active live verification session and terminates subprocesses.
    """
    session = active_sessions.get(session_id)
    if not session:
        raise KeyError("Live verification session not found.")

    if session["status"] in ("starting", "running"):
        session["status"] = "stopped"
        proc = session.get("process")
        if proc and proc.returncode is None:
            try:
                proc.terminate()
            except Exception:
                pass
        
        task = session.get("task")
        if task:
            try:
                await task
            except Exception:
                pass


def get_live_verification_session_status(session_id: str) -> dict[str, Any]:
    """
    Retrieves the status and accumulated matches for a session.
    """
    session = active_sessions.get(session_id)
    if not session:
        raise KeyError("Live verification session not found.")

    return {
        "session_id": session_id,
        "youtube_url": session["youtube_url"],
        "status": session["status"],
        "started_at": session["started_at"],
        "matches": session["matches"],
        "error_message": session["error_message"]
    }
