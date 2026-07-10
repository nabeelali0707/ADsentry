import os
import sys
import traceback
from pathlib import Path

from dotenv import load_dotenv
import psycopg2
from psycopg2 import sql

# Load environment variables from .env in the project root (adsentry-backend)
project_root = Path(__file__).resolve().parents[1]
load_dotenv(project_root / '.env')

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('❌ Error: DATABASE_URL environment variable not set.', file=sys.stderr)
    sys.exit(1)

# Helper to execute a SQL file within a transaction

def exec_sql_file(conn, path: Path):
    with path.open('r', encoding='utf-8') as f:
        sql_content = f.read()
    try:
        with conn.cursor() as cur:
            cur.execute(sql_content)
        conn.commit()
        print(f'[OK] Successfully applied {path.name}')
    except Exception as e:
        conn.rollback()
        print(f'[FAIL] Failed to apply {path.name}: {e}', file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)

def main():
    try:
        conn = psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f'[FAIL] Could not connect to database: {e}', file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)

    migrations_dir = project_root / 'db' / 'migrations'
    migration_files = ['0001_init_schema.sql', '0002_rls_policies.sql']

    for filename in migration_files:
        file_path = migrations_dir / filename
        if not file_path.is_file():
            print(f'❌ Migration file not found: {file_path}', file=sys.stderr)
            sys.exit(1)
        exec_sql_file(conn, file_path)

    # Verification query
    verify_query = sql.SQL(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    )
    try:
        with conn.cursor() as cur:
            cur.execute(verify_query)
            rows = cur.fetchall()
        table_names = [row[0] for row in rows]
        print('\n[INFO] Tables in public schema:')
        for name in table_names:
            print(f' - {name}')
        expected = {
            'organizations',
            'profiles',
            'contracts',
            'contract_field_corrections',
            'broadcast_logs',
            'discrepancies',
            'audit_reports',
        }
        missing = expected - set(table_names)
        if missing:
            print('\n[WARN] Missing expected tables: ' + ', '.join(missing), file=sys.stderr)
        else:
            print('\n[OK] All expected tables are present.')
    finally:
        conn.close()

if __name__ == '__main__':
    main()
