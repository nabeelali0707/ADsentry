from typing import Any, Callable
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status

from app.core.supabase_client import get_supabase_client


def _extract_bearer_token(request: Request) -> str:
    authorization = request.headers.get("Authorization")
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header.",
        )

    return token.strip()


def _extract_user_id(auth_response: Any) -> str | None:
    user = getattr(auth_response, "user", None)
    if user is None and isinstance(auth_response, dict):
        user = auth_response.get("user")

    if user is None:
        return None

    if isinstance(user, dict):
        return user.get("id")

    return getattr(user, "id", None)


def get_current_profile(request: Request) -> dict[str, Any]:
    token = _extract_bearer_token(request)
    supabase = get_supabase_client()

    try:
        auth_response = supabase.auth.get_user(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc

    user_id = _extract_user_id(auth_response)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    profile_response = (
        supabase.table("profiles")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_response.data
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Profile not found.",
        )

    if not profile.get("organization_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profile is not assigned to an organization.",
        )

    return profile


def require_role(*roles: str) -> Callable[[dict[str, Any]], dict[str, Any]]:
    allowed_roles = set(roles)

    def dependency(profile: dict[str, Any] = Depends(get_current_profile)) -> dict[str, Any]:
        if profile.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role for this action.",
            )
        return profile

    return dependency


def ensure_same_organization(profile: dict[str, Any], organization_id: str | UUID | None) -> None:
    if not organization_id or str(profile["organization_id"]) != str(organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Resource does not belong to your organization.",
        )


def get_contract_for_profile(contract_id: str | UUID, profile: dict[str, Any]) -> dict[str, Any]:
    response = (
        get_supabase_client()
        .table("contracts")
        .select("*")
        .eq("id", str(contract_id))
        .single()
        .execute()
    )
    contract = response.data
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contract not found.",
        )

    ensure_same_organization(profile, contract.get("organization_id"))
    return contract
