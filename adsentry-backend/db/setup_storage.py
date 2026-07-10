from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.supabase_client import get_supabase_client


BUCKETS = {
    "contracts": {
        "public": False,
        "file_size_limit": 20 * 1024 * 1024,
        "allowed_mime_types": [
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
    },
    "broadcast-logs": {
        "public": False,
        "file_size_limit": 20 * 1024 * 1024,
        "allowed_mime_types": [
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
    },
    "reports": {
        "public": False,
        "file_size_limit": 20 * 1024 * 1024,
        "allowed_mime_types": [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
    },
}


def _bucket_exists(bucket_name: str) -> bool:
    storage = get_supabase_client().storage
    buckets = storage.list_buckets()
    return any(bucket.name == bucket_name for bucket in buckets)


def create_private_bucket(bucket_name: str, options: dict) -> None:
    if _bucket_exists(bucket_name):
        return

    get_supabase_client().storage.create_bucket(bucket_name, options=options)


def setup_storage() -> None:
    for bucket_name, options in BUCKETS.items():
        create_private_bucket(bucket_name, options)


if __name__ == "__main__":
    setup_storage()
    print("Supabase storage buckets are ready.")
