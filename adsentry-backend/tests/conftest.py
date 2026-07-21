import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv
load_dotenv()

import pytest
import subprocess

# Ensure migrations are applied before any tests run
@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    # Run the migration script using the same Python interpreter
    result = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), '..', 'db', 'apply_migrations.py')], capture_output=True, text=True)
    if result.returncode != 0:
        print("Migration notice (skipped or direct connection unavailable):\n", result.stdout, result.stderr)
    else:
        print("Migrations applied successfully:\n", result.stdout)



