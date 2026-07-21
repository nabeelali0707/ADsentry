import io
import json
from datetime import date, timedelta

import pandas as pd
import pytest
import psycopg2
from fastapi.testclient import TestClient

from app.main import app
from app.core import auth

# Fixture to create a test organization in the database and provide its ID
@pytest.fixture(scope="module")
def test_org_id():
    import uuid
    org_id = str(uuid.uuid4())
    import os
    DATABASE_URL = os.getenv("DATABASE_URL")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO organizations (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
            (org_id, "Test Organization"),
        )
        cur.close()
        conn.close()
    except Exception:
        # Fallback to Supabase client if direct postgres connection is unavailable
        try:
            from app.core.supabase_client import get_supabase_client
            get_supabase_client().table("organizations").insert({"id": org_id, "name": "Test Organization"}).execute()
        except Exception:
            pass
    return org_id

# Override authentication dependency to use the test organization
def _override_current_profile(test_org_id):
    return {
        "id": "test-user-id",
        "organization_id": test_org_id,
        "full_name": "Test User",
        "role": "BRAND",
    }

@pytest.fixture(scope="module", autouse=True)
def override_auth(test_org_id):
    app.dependency_overrides[auth.get_current_profile] = lambda: _override_current_profile(test_org_id)

client = TestClient(app)

@pytest.fixture(scope="module")
def contract_id(test_org_id):
    """Upload a single contract and return its generated id."""
    contract_data = {
        "brand_name": ["National Foods"],
        "campaign_name": ["Spring Launch"],
        "channel": ["TV"],
        "start_date": [date.today()],
        "end_date": [date.today() + timedelta(days=30)],
        "contracted_airings": [100],
        "spot_duration_sec": [30],
        "cost_per_airing": [1500.00],
        "total_contract_value": [150000.00],
    }
    df = pd.DataFrame(contract_data)
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    response = client.post(
        "/contracts/upload",
        data={"organization_id": test_org_id},
        files={"file": ("contract.csv", csv_bytes, "text/csv")},
    )
    assert response.status_code == 201, f"Contract upload failed: {response.text}"
    payload = response.json()
    return payload["contract"]["id"]

def test_full_audit_flow(contract_id, test_org_id):
    # 1. Upload broadcast logs (≈50 rows with mixed types)
    logs = []
    for i in range(50):
        logs.append({
            "channel": "TV",
            "air_date": (date.today() + timedelta(days=i % 31)).isoformat(),
            "air_time": ("20:00:00" if i % 4 != 2 else "20:00:00"),
            "spot_duration_sec": 30,
            "ad_identifier": f"AD-{i+1:03d}",
        })
    df_logs = pd.DataFrame(logs)
    csv_logs = df_logs.to_csv(index=False).encode("utf-8")

    resp_logs = client.post(
        f"/contracts/{contract_id}/broadcast-logs/upload",
        files={"file": ("logs.csv", csv_logs, "text/csv")},
    )
    assert resp_logs.status_code == 201, f"Logs upload failed: {resp_logs.text}"

    # 2. Run audit
    audit_resp = client.post(f"/contracts/{contract_id}/run-audit")
    assert audit_resp.status_code == 200, f"Run audit failed: {audit_resp.text}"

    # 3. Dashboard
    dash_resp = client.get(f"/contracts/{contract_id}/dashboard")
    assert dash_resp.status_code == 200, f"Dashboard failed: {dash_resp.text}"
    dashboard = dash_resp.json()
    assert dashboard["compliance_ring"]["rate"] > 0

    # 4. Financial impact
    fin_resp = client.get(f"/contracts/{contract_id}/financial-impact")
    assert fin_resp.status_code == 200, f"Financial impact failed: {fin_resp.text}"
    fin_data = fin_resp.json()
    assert fin_data["total_overpayment"] > 0

    # 5. Discrepancies list
    disc_resp = client.get(f"/contracts/{contract_id}/discrepancies")
    assert disc_resp.status_code == 200, f"Discrepancies endpoint failed: {disc_resp.text}"

    # 6. AI summary (assuming endpoint exists)
    ai_resp = client.get(f"/contracts/{contract_id}/ai-summary")
    assert ai_resp.status_code == 200, f"AI summary failed: {ai_resp.text}"

    # 7. Export XLSX
    export_resp = client.post(f"/contracts/{contract_id}/export/xlsx")
    assert export_resp.status_code == 200, f"Export XLSX failed: {export_resp.text}"
    export_data = export_resp.json()
    assert "download_url" in export_data
