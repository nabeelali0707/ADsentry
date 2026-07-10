from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import ai_summary
from app.routers import audit
from app.routers import contracts
from app.routers import dashboard
from app.routers import upload


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(upload.router)
app.include_router(contracts.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(ai_summary.router)
