from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


# lru_cache disabled for testing
@lru_cache()
def get_supabase_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        # Stub for tests/local environment
        class _StubStorage:
            def from_(self, bucket: str):
                class _StubBucket:
                    def upload(self, path, file_bytes, file_options=None):
                        return {"Key": path}

                    def create_signed_url(self, path, expires_in=3600):
                        return {"signedURL": f"http://localhost/{bucket}/{path}"}

                    def remove(self, paths):
                        return {"data": None}
                return _StubBucket()

        class _StubResponse:
            def __init__(self, data):
                self.data = data

        class _StubTable:
            def __init__(self, name: str):
                self.name = name
                self._data = []
                self._filters = []  # list of (column, value)
                self._single = False

            def insert(self, payload):
                # Ensure each inserted record has a unique 'id' field for downstream aggregations
                def _assign_id(record):
                    if isinstance(record, dict) and 'id' not in record:
                        # simple incremental id based on current data length + 1
                        record['id'] = len(self._data) + 1
                    return record
                if isinstance(payload, list):
                    self._data.extend([_assign_id(item) for item in payload])
                else:
                    self._data.append(_assign_id(payload))
                return self

            def delete(self):
                self._data.clear()
                return self

            def eq(self, column, value):
                self._filters.append((column, value))
                return self

            def limit(self, n):
                self._limit = n
                return self

            def update(self, *args, **kwargs):
                return self

            def order(self, column: str, desc: bool = False):
                # Simple stub: ignore ordering, just return self for chaining.
                # In a real implementation this would sort the filtered data.
                return self

            def select(self, *args, **kwargs):
                return self

            def single(self):
                self._single = True
                return self

            def execute(self):
                # Apply equality filters
                if self._filters:
                    filtered = [row for row in self._data if isinstance(row, dict) and all(str(row.get(col)) == str(val) for col, val in self._filters)]
                else:
                    filtered = self._data
                # Apply limit if set
                if hasattr(self, '_limit'):
                    filtered = filtered[:self._limit]
                    del self._limit
                # Return single record if .single() was called
                if self._single:
                    data = filtered[0] if filtered else None
                else:
                    data = filtered
                # Reset filters and single flag for next operation
                self._filters = []
                self._single = False
                return _StubResponse(data)

        class _StubClient:
            storage = _StubStorage()

            def __init__(self):
                # Dictionary to hold tables' data across calls
                self._tables: dict[str, _StubTable] = {}

            def table(self, name: str):
                # Return a persistent StubTable for the given table name
                if name not in self._tables:
                    self._tables[name] = _StubTable(name)
                return self._tables[name]

        return _StubClient()
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
