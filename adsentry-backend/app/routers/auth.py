"""
Signup bootstrap & current-user profile router.

Endpoints:
  POST /auth/bootstrap-profile
    — Creates the first organization + profile row for a brand-new
      Supabase Auth user, using the service-role client to bypass RLS
      (organizations/profiles have no INSERT policy for the anon/authenticated
      roles, since a user cannot belong to an organization until this runs).

  GET /auth/me
    — Returns the caller's existing profile + organization name. 404/401s if
      no profile exists yet, which the frontend uses to detect "needs
      bootstrap" vs "fully set up".
"""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_profile, get_verified_user_id
from app.core.supabase_client import get_supabase_client


router = APIRouter(prefix="/auth", tags=["auth"])


class BootstrapProfileRequest(BaseModel):
    full_name: str = Field(min_length=1)
    organization_name: str = Field(min_length=1)
    role: Literal["BRAND", "AGENCY", "FINANCE"]


@router.post("/bootstrap-profile", status_code=status.HTTP_201_CREATED)
def bootstrap_profile(
    payload: BootstrapProfileRequest,
    user_id: str = Depends(get_verified_user_id),
) -> dict[str, Any]:
    supabase = get_supabase_client()

    existing = (
        supabase.table("profiles")
        .select("id")
        .eq("id", user_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile already exists for this user.",
        )

    org_response = (
        supabase.table("organizations")
        .insert({"name": payload.organization_name})
        .execute()
    )
    organization = org_response.data[0]

    profile_response = (
        supabase.table("profiles")
        .insert(
            {
                "id": user_id,
                "organization_id": organization["id"],
                "full_name": payload.full_name,
                "role": payload.role,
            }
        )
        .execute()
    )
    profile = profile_response.data[0]

    return {"profile": profile, "organization": organization}


@router.get("/me")
def get_me(current_profile: dict[str, Any] = Depends(get_current_profile)) -> dict[str, Any]:
    supabase = get_supabase_client()

    org_response = (
        supabase.table("organizations")
        .select("id, name")
        .eq("id", current_profile["organization_id"])
        .single()
        .execute()
    )

    return {"profile": current_profile, "organization": org_response.data}
