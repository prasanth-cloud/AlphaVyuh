import base64
import hashlib
import hmac
import json
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.supabase import get_admin_client, settings

security = HTTPBearer()


def _decode_base64url_json(segment: str) -> dict:
    padded = segment + "=" * (-len(segment) % 4)
    decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
    value = json.loads(decoded.decode("utf-8"))
    return value if isinstance(value, dict) else {}


def _user_id_from_local_jwt(token: str) -> str | None:
    """Validate standard Supabase HS256 access tokens without a network hop."""
    if not settings.supabase_jwt_secret:
        return None

    try:
        header_segment, payload_segment, signature_segment = token.split(".", 2)
        header = _decode_base64url_json(header_segment)
        if header.get("alg") != "HS256":
            return None

        signed = f"{header_segment}.{payload_segment}".encode("ascii")
        expected = hmac.new(settings.supabase_jwt_secret.encode("utf-8"), signed, hashlib.sha256).digest()
        padded_signature = signature_segment + "=" * (-len(signature_segment) % 4)
        provided = base64.urlsafe_b64decode(padded_signature.encode("ascii"))
        if not hmac.compare_digest(expected, provided):
            return None

        payload = _decode_base64url_json(payload_segment)
        audience = payload.get("aud")
        if audience != "authenticated" and not (isinstance(audience, list) and "authenticated" in audience):
            return None

        expires_at = payload.get("exp")
        if expires_at is not None and float(expires_at) <= time.time():
            return None
    except Exception:
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
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )
