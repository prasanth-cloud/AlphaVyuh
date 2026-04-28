from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from app.services.supabase import get_admin_client, settings

security = HTTPBearer()


def _user_id_from_local_jwt(token: str) -> str | None:
    """Validate standard Supabase HS256 access tokens without a network hop."""
    if not settings.supabase_jwt_secret:
        return None

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError:
        return None

    subject = payload.get("sub")
    return str(subject) if subject else None


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Validate Supabase JWT by calling Supabase Auth API — works for all token formats."""
    token = credentials.credentials
    if not token or token in {"null", "undefined"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    user_id = _user_id_from_local_jwt(token)
    if user_id:
        return user_id

    try:
        client = get_admin_client()
        response = client.auth.get_user(token)
        user = response.user
        if not user or not user.id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return str(user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {e}",
        )
