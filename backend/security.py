import os
import re
import time
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from bson import ObjectId
from database import db

JWT_ALGORITHM = "HS256"


def utcnow():
    return datetime.now(timezone.utc)


def iso():
    return utcnow().isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user) -> str:
    payload = {
        "sub": str(user["_id"]),
        "email": user["email"],
        "role": user["role"],
        "type": "access",
        "exp": utcnow() + timedelta(minutes=30),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user) -> str:
    payload = {"sub": str(user["_id"]), "type": "refresh", "exp": utcnow() + timedelta(days=7)}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, user):
    response.set_cookie("access_token", create_access_token(user), httponly=True, secure=True, samesite="lax", max_age=1800, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user), httponly=True, secure=True, samesite="lax", max_age=604800, path="/")


def clear_auth_cookies(response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended. Contact support.")
    if user.get("status") == "deleted":
        raise HTTPException(status_code=401, detail="Account not found")
    user["id"] = str(user["_id"])
    user.pop("password_hash", None)
    return user


def require_roles(*roles):
    async def dep(request: Request):
        user = await get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


# In-memory fixed-window rate limiter (per key)
_rate_buckets: dict = {}


def rate_limit(key: str, limit: int, window_seconds: int):
    now = time.time()
    bucket = _rate_buckets.get(key)
    if not bucket or now - bucket["start"] > window_seconds:
        bucket = {"start": now, "count": 0}
        _rate_buckets[key] = bucket
    bucket["count"] += 1
    if bucket["count"] > limit:
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def strong_password(pw: str) -> bool:
    return len(pw) >= 8 and re.search(r"[A-Za-z]", pw) and re.search(r"\d", pw)
