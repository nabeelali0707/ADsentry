import os
import uuid
import random
from datetime import date, timedelta, datetime, time

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from psycopg2.extras import execute_values

# Load database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable not set")

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = False
cur = conn.cursor()

try:
    # Insert a sample organization
    org_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO organizations (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
        (org_id, "National Foods Ltd."),
    )

    # Skip profile insertion because profiles.id references auth.users(id)
    # Insert a sample contract (National Foods example)
    contract_id = str(uuid.uuid4())
    contract_data = {
        "id": contract_id,
        "organization_id": org_id,
        "created_by": None,
        "brand_name": "National Foods",
        "campaign_name": "Spring Launch",
        "channel": "TV",
        "start_date": date.today(),
        "end_date": date.today() + timedelta(days=30),
        "contracted_airings": 100,
        "spot_duration_sec": 30,
        "cost_per_airing": 1500.00,
        "total_contract_value": 150000.00,
        "time_window_tolerance_minutes": 15,
        "compliance_threshold_pct": 97.00,
        "status": "DRAFT",
    }
    cur.execute(
        """INSERT INTO contracts (id, organization_id, created_by, brand_name, campaign_name, channel, start_date, end_date, contracted_airings, spot_duration_sec, cost_per_airing, total_contract_value, time_window_tolerance_minutes, compliance_threshold_pct, status)
        VALUES (%(id)s, %(organization_id)s, %(created_by)s, %(brand_name)s, %(campaign_name)s, %(channel)s, %(start_date)s, %(end_date)s, %(contracted_airings)s, %(spot_duration_sec)s, %(cost_per_airing)s, %(total_contract_value)s, %(time_window_tolerance_minutes)s, %(compliance_threshold_pct)s, %(status)s)""",
        contract_data,
    )

    # Generate ~50 broadcast log entries with mixed deviations (air_time never null)
    logs = []
    scheduled = time(20, 0, 0)
    for i in range(50):
        air_date = contract_data["start_date"] + timedelta(days=random.randint(0, 30))
        deviation = random.choice(["ON_TIME", "MISSED", "SHORTENED", "OUT_OF_SLOT"])
        if deviation in ["ON_TIME", "SHORTENED"]:
            air_time = scheduled
        elif deviation == "MISSED":
            # Use a placeholder time; the discrepancy type will handle missed logic elsewhere
            air_time = scheduled
        else:  # OUT_OF_SLOT
            delta = random.choice([-30, 30])
            hour = (scheduled.hour + delta // 60) % 24
            minute = (scheduled.minute + delta % 60) % 60
            air_time = time(hour, minute, 0)
        logs.append(
            (
                str(uuid.uuid4()),
                contract_id,
                "TV",
                air_date,
                air_time,
                30,
                f"AD-{i+1:03d}",
                None,
                datetime.utcnow(),
            )
        )
    insert_q = """
        INSERT INTO broadcast_logs (id, contract_id, channel, air_date, air_time, spot_duration_sec, ad_identifier, raw_upload_path, created_at)
        VALUES %s
    """
    execute_values(cur, insert_q, logs)

    conn.commit()
    print("Seed data inserted successfully.")
except Exception as e:
    conn.rollback()
    raise
finally:
    cur.close()
    conn.close()
