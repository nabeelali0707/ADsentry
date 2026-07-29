import logging

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.routers import ai_summary
from app.routers import audio_verification
from app.routers import audit
from app.routers import auth
from app.routers import contracts
from app.routers import dashboard
from app.routers import export
from app.routers import upload
from app.routers import session

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
)


# ─────────────────────────────────────────────────────────────────────────────
# Security Middleware (TLS / Security Headers — Requirement 5.1)
# ─────────────────────────────────────────────────────────────────────────────

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next) -> Response:
    """
    Inject industry-standard HTTP security headers on every response.

    Headers added:
      Strict-Transport-Security — enforces HTTPS for 1 year (TLS in Transit)
      X-Content-Type-Options    — prevents MIME-type sniffing
      X-Frame-Options           — blocks clickjacking via iframes
      Referrer-Policy           — limits referrer info leakage
      X-XSS-Protection          — legacy XSS filter hint for older browsers
      Cache-Control             — prevents sensitive API responses from being cached
                                  in shared/proxy caches
    """
    response: Response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Prevent sensitive audit data from being stored in intermediate caches
    if request.url.path.startswith("/contracts") or request.url.path.startswith("/discrepancies"):
        response.headers["Cache-Control"] = "no-store, private"
    return response


# Trusted Host Middleware — rejects requests with unexpected Host headers.
# Host list comes from settings.trusted_hosts (TRUSTED_HOSTS env var) so it
# can be tightened per-environment without a code change. The default still
# includes "*" for permissive local/staging use — set TRUSTED_HOSTS to your
# real production domain(s) and drop the wildcard before going live.
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.trusted_hosts_list,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Startup — API Key Validation
# ─────────────────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup() -> None:
    """
    API Key Handling (Security 5.1): Validate all required secret keys are
    present before the server starts accepting requests. Logs confirmation
    WITHOUT revealing key values.
    """
    # 1. Verify ffmpeg is on PATH (Fail fast if missing)
    import shutil
    if not shutil.which("ffmpeg"):
        raise RuntimeError(
            "CRITICAL ERROR: ffmpeg executable was not found on PATH. "
            "The ADsentry backend depends on ffmpeg for both the standard and live "
            "audio verification features. Please install ffmpeg and ensure it is available on the system PATH."
        )
    logger.info("✓ ffmpeg executable found on PATH.")

    # 2. Verify DEJAVU_DATABASE_URL is set (Fail fast if empty)
    if not settings.dejavu_database_url or not settings.dejavu_database_url.strip():
        raise RuntimeError(
            "CRITICAL ERROR: DEJAVU_DATABASE_URL is not set or is empty. "
            "This environment variable must be set to a valid PostgreSQL connection string "
            "for the audio fingerprinting/matching engine to function. Please set it in your .env "
            "or environment variables (it can reuse the same value as DATABASE_URL)."
        )
    logger.info("✓ DEJAVU_DATABASE_URL is configured.")

    try:
        settings.validate_secrets()
        logger.info("✓ ADsentry backend startup complete — all secrets validated.")
    except ValueError as exc:
        logger.warning("⚠ Secret validation warning: %s", exc)
        logger.warning("  Running in degraded mode — some features may be unavailable.")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """
    Kills any running ffmpeg subprocesses of live verification sessions on server shutdown/restart.
    """
    from app.services.live_monitor_service import active_sessions
    logger.info("Shutdown event triggered — cleaning up active live verification sessions.")
    for session_id, session in list(active_sessions.items()):
        if session.get("status") in ("starting", "running"):
            proc = session.get("process")
            if proc and proc.returncode is None:
                try:
                    proc.terminate()
                    logger.info(f"Terminated ffmpeg subprocess for live session {session_id}")
                except Exception as exc:
                    logger.error(f"Failed to terminate ffmpeg subprocess for live session {session_id}: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "version": settings.app_version}


# ─────────────────────────────────────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(contracts.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(ai_summary.router)
app.include_router(export.router)
app.include_router(session.router)   # Session cleanup + audit trail
app.include_router(audio_verification.router)
