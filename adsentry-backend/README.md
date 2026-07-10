# ADsentry Backend

FastAPI backend for ADsentry.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

## Run

```bash
uvicorn app.main:app --reload
```

Health check:

```text
GET /health
```
