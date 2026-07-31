import logging
import tempfile
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    app_name: str = "ADsentry Backend"
    app_version: str = "0.1.0"
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])

    # Comma-separated list for TrustedHostMiddleware. Defaults preserve the
    # existing permissive dev/staging behavior (including the "*" wildcard);
    # set TRUSTED_HOSTS in production to your real domain(s) and drop the "*".
    trusted_hosts: str = "localhost,127.0.0.1,*.vercel.app,*.onrender.com,*.railway.app,*"

    supabase_url: str = ""
    supabase_project_id: str = ""
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""
    groq_api_key: str = ""
    database_url: str = ""
    direct_url: str = ""

    # Dejavu audio fingerprinting (Independent Audio Verification PoC): its own
    # Postgres connection, kept separate from the main Supabase client so its
    # self-managed tables (songs/fingerprints, renamed below) never touch the
    # service-role-authenticated ORM path used elsewhere in the app.
    dejavu_database_url: str = ""

    # yt-dlp cookie-based auth: lets the server authenticate to YouTube as a
    # logged-in session so datacenter/cloud IPs aren't flagged with "Sign in
    # to confirm you're not a bot". Set one of the two — content takes
    # priority if both are set. See .env.example for how to obtain a
    # cookies.txt.
    ytdlp_cookies_file: str = ""
    ytdlp_cookies_content: str = ""

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def trusted_hosts_list(self) -> list[str]:
        return [host.strip() for host in self.trusted_hosts.split(",") if host.strip()]

    @property
    def ytdlp_cookies_path(self) -> str | None:
        """
        Resolves a cookies.txt path for yt-dlp's `cookiefile` option, from
        either raw content (e.g. an env var) or a path to a file already on
        disk. Returns None if neither is configured.
        """
        if self.ytdlp_cookies_content:
            cookies_path = Path(tempfile.gettempdir()) / "adsentry_ytdlp_cookies.txt"
            existing = cookies_path.read_text(encoding="utf-8") if cookies_path.exists() else None
            if existing != self.ytdlp_cookies_content:
                cookies_path.write_text(self.ytdlp_cookies_content, encoding="utf-8")
            return str(cookies_path)
        if self.ytdlp_cookies_file:
            return self.ytdlp_cookies_file
        return None

    def validate_secrets(self) -> None:
        """
        API Key Handling (Security 5.1): Validate that all required secret keys
        are present at startup. Raises ValueError if any are missing.
        Never logs the actual key values.
        """
        missing: list[str] = []

        if not self.groq_api_key:
            missing.append("GROQ_API_KEY")
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_service_role_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")

        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}. "
                "Please configure them in your .env file. "
                "API keys are stored server-side only and never exposed to clients."
            )

        # Log confirmation WITHOUT logging actual key values
        logger.info("✓ GROQ_API_KEY loaded (server-side only, %d chars)", len(self.groq_api_key))
        logger.info("✓ SUPABASE_SERVICE_ROLE_KEY loaded (server-side only, %d chars)", len(self.supabase_service_role_key))
        logger.info("✓ SUPABASE_URL = %s", self.supabase_url)


settings = Settings()
