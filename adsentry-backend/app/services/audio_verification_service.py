import logging
import os
from functools import lru_cache
from typing import Any

from pydub import AudioSegment

from app.core.config import settings
from app.vendor.dejavu import Dejavu
from app.vendor.dejavu import decoder as dejavu_decoder
from app.vendor.dejavu import fingerprint as dejavu_fingerprint
from app.vendor.dejavu.database import Song
from app.vendor.dejavu.recognize import FileRecognizer


logger = logging.getLogger(__name__)


@lru_cache()
def _get_dejavu() -> Dejavu:
    """
    Single shared Dejavu instance for the process. Dejavu manages its own
    tables (dejavu_songs/dejavu_fingerprints — see app/vendor/dejavu/README.md
    for why they're namespaced) and creates them automatically on first
    connect, so fingerprints persist in Postgres across backend restarts.
    """
    return Dejavu(dburl=settings.dejavu_database_url)


def fingerprint_recording(file_path: str, title: str) -> None:
    """
    Adds a long recording into Dejavu's fingerprint database under the given
    title — the "haystack" that verify_clip's short reference clips are later
    searched against. Idempotent: re-fingerprinting a file with identical
    content is a no-op (Dejavu keys on the file's content hash).
    """
    djv = _get_dejavu()
    djv.fingerprint_file(file_path, song_name=title)


def download_youtube_audio(youtube_url: str, output_path: str) -> str:
    """
    Downloads just the audio track of a YouTube video to `{output_path}.wav`
    via yt-dlp + ffmpeg, returning the final file path.
    """
    import yt_dlp

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path + ".%(ext)s",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
    except Exception as exc:
        raise RuntimeError(
            f"Download failed — the URL may be invalid, geo-blocked, or unavailable ({exc})"
        ) from exc

    final_path = output_path + ".wav"
    if not os.path.exists(final_path):
        raise RuntimeError("Download completed but no audio file was produced.")
    return final_path


def get_audio_duration_seconds(file_path: str) -> float:
    audio = AudioSegment.from_file(file_path)
    return round(len(audio) / 1000.0, 2)


def has_fingerprinted_sources() -> bool:
    try:
        djv = _get_dejavu()
        count = (
            djv.db.session.query(Song)
            .filter(Song.fingerprinted.is_(True))
            .count()
        )
        return count > 0
    except Exception as exc:
        logger.error("Could not check for fingerprinted sources: %s", exc)
        return False


def _confidence_pct(clip_file_path: str, match: dict[str, Any]) -> float:
    """
    Normalizes Dejavu's raw matched-hash count into a 0-100 confidence
    percentage: matched hashes / total hashes generated from the query clip.
    """
    try:
        channels, sample_rate = dejavu_decoder.read(clip_file_path)
        total_hashes = sum(
            len(list(dejavu_fingerprint.fingerprint(channel, Fs=sample_rate)))
            for channel in channels
        )
        if total_hashes == 0:
            return 0.0
        matched_hashes = match.get(Dejavu.CONFIDENCE, 0)
        return min(100.0, round((matched_hashes / total_hashes) * 100, 1))
    except Exception as exc:
        logger.warning("Could not compute confidence percentage: %s", exc)
        return 0.0


def recognize_clip(clip_file_path: str) -> dict[str, Any] | None:
    """
    Queries a short reference clip against everything fingerprinted so far.
    Returns {matched_title, offset_seconds, confidence} on a match, or None
    if there's no match or Dejavu errors for any reason.
    """
    try:
        djv = _get_dejavu()
        match = djv.recognize(FileRecognizer, clip_file_path)
    except Exception as exc:
        logger.error("Dejavu recognition failed for '%s': %s", clip_file_path, exc)
        return None

    if not match:
        return None

    return {
        "matched_title": match.get("song_name"),
        "offset_seconds": float(match.get("offset_seconds", 0.0)),
        "confidence": _confidence_pct(clip_file_path, match),
    }
