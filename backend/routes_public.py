from fastapi import APIRouter, HTTPException, Request, UploadFile
from bson import ObjectId
from database import db
from security import rate_limit, client_ip, iso
from helpers import get_settings, is_paid, notify, audit, clean
from uploads import save_image

router = APIRouter(prefix="/public", tags=["public"])

TIMEFRAMES = {"ASAP", "Within 2 weeks", "Within a month", "Flexible"}
CONTACT_METHODS = {"Phone", "Email", "Text"}


@router.get("/config")
async def public_config():
    s = await get_settings()
    return {
        "plan_price": s["plan_price"],
        "max_request_images": s["max_request_images"],
        "image_max_mb": s["image_max_mb"],
        "image_allowed_types": s["image_allowed_types"],
        "support_phone": s["support_phone"],
        "timeframes": sorted(TIMEFRAMES),
        "contact_methods": sorted(CONTACT_METHODS),
    }


@router.get("/trades")
async def public_trades():
    trades = await db.trades.find({"active": True}).sort("order", 1).to_list(100)
    return [{"id": str(t["_id"]), "name": t["name"]} for t in trades]


@router.get("/terms")
async def public_terms():
    terms = await db.terms_versions.find_one({"active": True})
    if not terms:
        return {"version": "1.0", "content": "Terms unavailable."}
    return {"version": terms["version"], "content": terms["content"]}


@router.get("/pros/{slug}")
async def public_profile(slug: str):
    profile = await db.profiles.find_one({"slug": slug.lower()})
    if not profile:
        raise HTTPException(404, "Profile not found")
    pro_user = await db.users.find_one({"_id": ObjectId(profile["user_id"])})
    if not pro_user or pro_user.get("status") != "active":
        raise HTTPException(404, "Profile not found")
    # Public profiles are a Full Mode feature — enforced server-side
    if not profile.get("is_public") or not await is_paid(profile["user_id"]):
        raise HTTPException(404, "This profile is not public")
    professional = await db.professionals.find_one({"user_id": profile["user_id"]}) or {}
    portfolio = await db.portfolio_images.find({"user_id": profile["user_id"]}).sort("position", 1).to_list(50)
    return {
        "slug": profile["slug"],
        "display_name": profile.get("display_name") or professional.get("business_name", ""),
        "pro_name": pro_user["name"],
        "description": profile.get("description", ""),
        "avatar_path": profile.get("avatar_path"),
        "business_name": professional.get("business_name", ""),
        "primary_trade": professional.get("primary_trade", ""),
        "phone": professional.get("phone", ""),
        "email": professional.get("email", ""),
        "address": professional.get("address", ""),
        "logo_path": professional.get("logo_path"),
        "portfolio": [{"id": str(p["_id"]), "file_path": p["file_path"], "caption": p.get("caption", "")} for p in portfolio],
    }


@router.post("/pros/{slug}/requests")
async def submit_estimate_request(slug: str, request: Request):
    rate_limit(f"estreq:{client_ip(request)}", 10, 300)
    profile = await db.profiles.find_one({"slug": slug.lower()})
    if not profile:
        raise HTTPException(404, "Profile not found")
    if not profile.get("is_public") or not await is_paid(profile["user_id"]):
        raise HTTPException(404, "This profile is not accepting requests")
    pro_user = await db.users.find_one({"_id": ObjectId(profile["user_id"])})
    if not pro_user or pro_user.get("status") != "active":
        raise HTTPException(404, "Profile not found")

    form = await request.form()
    def field(name, max_len, required=False):
        v = (form.get(name) or "").strip()
        if required and not v:
            raise HTTPException(400, f"Missing required field: {name}")
        return v[:max_len]

    name = field("name", 120, True)
    phone = field("phone", 30, True)
    email = field("email", 120, True)
    address = field("address", 300, True)
    service = field("service", 80, True)
    description = field("description", 2000, True)
    timeframe = field("timeframe", 40, True)
    contact_method = field("contact_method", 20, True)
    if timeframe not in TIMEFRAMES:
        raise HTTPException(400, "Invalid timeframe")
    if contact_method not in CONTACT_METHODS:
        raise HTTPException(400, "Invalid contact method")
    if "@" not in email:
        raise HTTPException(400, "Invalid email address")

    settings = await get_settings()
    max_images = int(settings["max_request_images"])
    images = [f for f in form.getlist("images") if isinstance(f, UploadFile) and f.filename]
    if len(images) > max_images:
        raise HTTPException(400, f"Maximum {max_images} images allowed")

    rid = ObjectId()
    saved = []
    try:
        for i, img in enumerate(images):
            path = await save_image(img, "requests", settings)
            saved.append(path)
            await db.estimate_request_images.insert_one({
                "request_id": str(rid), "file_path": path, "position": i, "created_at": iso(),
            })
    except HTTPException:
        from uploads import delete_image
        for p in saved:
            delete_image(p)
        raise

    await db.estimate_requests.insert_one({
        "_id": rid, "pro_id": profile["user_id"], "customer_name": name, "customer_phone": phone,
        "customer_email": email.lower(), "address": address, "service": service,
        "description": description, "timeframe": timeframe, "contact_method": contact_method,
        "status": "new", "quote_id": None, "created_at": iso(), "updated_at": iso(),
    })
    await notify(profile["user_id"], "estimate_request", "New estimate request",
                 f"{name} requested an estimate for {service}.", "/requests")
    await audit(request, None, "estimate_request_submitted", slug, f"{name} / {service}")
    return {"ok": True, "id": str(rid), "message": "Your estimate request has been sent. The pro will contact you soon."}
