import re
import secrets
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from bson import ObjectId
from database import db
from security import (hash_password, verify_password, set_auth_cookies, clear_auth_cookies,
                      get_current_user, rate_limit, client_ip, strong_password, iso, utcnow,
                      create_access_token, jwt_secret, EMAIL_RE)
import jwt as pyjwt
from datetime import timezone
from helpers import audit, notify, send_email, monthly_usage, get_settings, get_subscription, clean
from models import RegisterIn, LoginIn, ForgotIn, ResetIn

router = APIRouter(prefix="/auth", tags=["auth"])

LOCKOUT_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "pro"
    return s[:60]


async def unique_slug(base):
    slug = base
    n = 2
    while await db.profiles.find_one({"slug": slug}):
        slug = f"{base}-{n}"
        n += 1
    return slug


async def me_payload(user):
    professional = await db.professionals.find_one({"user_id": user["id"]})
    profile = await db.profiles.find_one({"user_id": user["id"]})
    sub = await get_subscription(user["id"])
    usage = await monthly_usage(user["id"])
    settings = await get_settings()
    paid = sub.get("plan") == "pro" and sub.get("status") in ("active", "canceled")
    return {
        "id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"],
        "email_verified": user.get("email_verified", False), "is_demo": user.get("is_demo", False),
        "professional": clean(professional) if professional else None,
        "profile": clean(profile) if profile else None,
        "subscription": {"plan": sub.get("plan", "free"), "status": sub.get("status", "active"),
                          "current_period_end": sub.get("current_period_end"), "price": sub.get("price", 0)},
        "usage": usage,
        "limits": {"quote_limit": None if paid else settings["free_quote_limit"],
                    "invoice_limit": None if paid else settings["free_invoice_limit"]},
        "settings": {"plan_price": settings["plan_price"], "max_portfolio_images": settings["max_portfolio_images"],
                      "max_request_images": settings["max_request_images"], "image_max_mb": settings["image_max_mb"]},
    }


@router.post("/register")
async def register(data: RegisterIn, request: Request, response: Response):
    rate_limit(f"register:{client_ip(request)}", 10, 60)
    email = data.email.lower().strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email address.")
    if not data.terms_accepted:
        raise HTTPException(400, "You must accept the Terms & Conditions to sign up.")
    terms = await db.terms_versions.find_one({"active": True})
    if not terms or data.terms_version != terms["version"]:
        raise HTTPException(400, "Outdated Terms version. Please reload and accept the current Terms.")
    if not strong_password(data.password):
        raise HTTPException(400, "Password must be at least 8 characters and include letters and numbers.")
    trade = await db.trades.find_one({"name": data.primary_trade, "active": True})
    if not trade:
        raise HTTPException(400, "Please choose a valid primary trade.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists.")

    uid = ObjectId()
    await db.users.insert_one({
        "_id": uid, "email": email, "password_hash": hash_password(data.password), "name": data.name.strip(),
        "role": "pro", "status": "active", "email_verified": False, "is_demo": False, "created_at": iso(),
    })
    await db.professionals.insert_one({
        "user_id": str(uid), "business_name": data.business_name.strip(), "primary_trade": data.primary_trade,
        "phone": data.phone.strip(), "email": email, "address": "", "license": "", "logo_path": None,
        "default_tax_rate": 0.0, "default_labor_rate": 0.0, "created_at": iso(), "updated_at": iso(),
    })
    await db.profiles.insert_one({
        "user_id": str(uid), "slug": await unique_slug(slugify(data.business_name)),
        "display_name": data.business_name.strip(), "description": "", "avatar_path": None,
        "is_public": False, "created_at": iso(), "updated_at": iso(),
    })
    await db.subscriptions.insert_one({
        "user_id": str(uid), "plan": "free", "status": "active", "price": 0, "coupon_code": None,
        "started_at": iso(), "current_period_end": None, "created_at": iso(),
    })
    await db.terms_acceptances.insert_one({
        "user_id": str(uid), "version": terms["version"], "accepted_at": iso(), "ip": client_ip(request),
    })

    token = secrets.token_urlsafe(32)
    await db.email_verification_tokens.insert_one({
        "user_id": str(uid), "token": token, "used": False,
        "expires_at": utcnow() + timedelta(hours=24), "created_at": iso(),
    })
    link = f"/verify-email?token={token}"
    send_email(email, "Verify your Quote Flow email", f"Verify: {link}")
    await notify(str(uid), "email_verification", "Verify your email", "Confirm your email to secure your account.", link)

    user = await db.users.find_one({"_id": uid})
    set_auth_cookies(response, user)
    await audit(request, {"id": str(uid), "email": email}, "register", email, "pro signup, terms v" + terms["version"])
    user["id"] = str(uid)
    return await me_payload(user)


@router.post("/login")
async def login(data: LoginIn, request: Request, response: Response):
    ip = client_ip(request)
    email = data.email.lower().strip()
    identifier = f"{ip}:{email}"
    rate_limit(f"login:{ip}", 30, 60)

    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= LOCKOUT_ATTEMPTS:
        if (utcnow() - attempt["last"].replace(tzinfo=timezone.utc)).total_seconds() < LOCKOUT_MINUTES * 60:
            raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
        await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"last": utcnow()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password.")
    if user.get("status") == "suspended":
        raise HTTPException(403, "Account suspended. Contact support.")
    if user.get("status") == "deleted":
        raise HTTPException(401, "Invalid email or password.")

    await db.login_attempts.delete_one({"identifier": identifier})
    set_auth_cookies(response, user)
    await audit(request, {"id": str(user["_id"]), "email": email}, "login", email)
    user["id"] = str(user["_id"])
    return await me_payload(user)


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return await me_payload(user)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = pyjwt.decode(token, jwt_secret(), algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Refresh token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user or user.get("status") != "active":
        raise HTTPException(401, "User not found")
    response.set_cookie("access_token", create_access_token(user), httponly=True, secure=True,
                        samesite="lax", max_age=1800, path="/")
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(data: ForgotIn, request: Request):
    rate_limit(f"forgot:{client_ip(request)}", 5, 60)
    email = data.email.lower().strip()
    if not EMAIL_RE.match(email):
        return {"ok": True, "message": "If that email exists, a reset link has been sent."}
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "user_id": str(user["_id"]), "token": token, "used": False,
            "expires_at": utcnow() + timedelta(hours=1), "created_at": iso(),
        })
        link = f"/reset-password?token={token}"
        send_email(email, "Reset your Quote Flow password", f"Reset link (valid 1 hour): {link}")
        await audit(request, None, "password_reset_requested", email)
    return {"ok": True, "message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(data: ResetIn, request: Request):
    rate_limit(f"reset:{client_ip(request)}", 10, 60)
    rec = await db.password_reset_tokens.find_one({"token": data.token, "used": False})
    if not rec or rec["expires_at"].replace(tzinfo=timezone.utc) < utcnow():
        raise HTTPException(400, "Reset link is invalid or expired.")
    if not strong_password(data.password):
        raise HTTPException(400, "Password must be at least 8 characters and include letters and numbers.")
    await db.users.update_one({"_id": ObjectId(rec["user_id"])},
                              {"$set": {"password_hash": hash_password(data.password)}})
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    await audit(request, None, "password_reset_completed", rec["user_id"])
    return {"ok": True, "message": "Password updated. You can now log in."}


@router.get("/verify-email")
async def verify_email(token: str, request: Request):
    rec = await db.email_verification_tokens.find_one({"token": token, "used": False})
    if not rec or rec["expires_at"].replace(tzinfo=timezone.utc) < utcnow():
        raise HTTPException(400, "Verification link is invalid or expired.")
    await db.users.update_one({"_id": ObjectId(rec["user_id"])}, {"$set": {"email_verified": True}})
    await db.email_verification_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    await audit(request, None, "email_verified", rec["user_id"])
    return {"ok": True, "message": "Email verified."}


@router.post("/resend-verification")
async def resend_verification(request: Request, user=Depends(get_current_user)):
    rate_limit(f"resend:{user['id']}", 3, 300)
    token = secrets.token_urlsafe(32)
    await db.email_verification_tokens.insert_one({
        "user_id": user["id"], "token": token, "used": False,
        "expires_at": utcnow() + timedelta(hours=24), "created_at": iso(),
    })
    link = f"/verify-email?token={token}"
    send_email(user["email"], "Verify your Quote Flow email", f"Verify: {link}")
    await notify(user["id"], "email_verification", "Verify your email", "Confirm your email to secure your account.", link)
    return {"ok": True}
