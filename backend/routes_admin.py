from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from bson import ObjectId
from bson.errors import InvalidId
from database import db
from security import require_roles, iso, utcnow
from helpers import clean, get_settings, get_watermark, audit, page_params, is_paid
from uploads import save_image, delete_image
from models import (TradeIn, CouponIn, WatermarkIn, PlatformSettingsIn, TermsIn,
                    AdminUserIn, AdminProfessionalIn, ReorderIn)
from datetime import timedelta

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


def to_oid(id_str):
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Not found")


@router.get("/overview")
async def overview():
    settings = await get_settings()
    paid_count = await db.subscriptions.count_documents({"plan": "pro", "status": "active"})
    return {
        "users": await db.users.count_documents({"status": {"$ne": "deleted"}}),
        "pros": await db.users.count_documents({"role": "pro", "status": {"$ne": "deleted"}}),
        "customers": await db.users.count_documents({"role": "customer", "status": {"$ne": "deleted"}}),
        "quotes": await db.quotes.count_documents({}),
        "invoices": await db.invoices.count_documents({}),
        "requests": await db.estimate_requests.count_documents({}),
        "paid_subscriptions": paid_count,
        "mrr": round(paid_count * settings["plan_price"], 2),
    }


# ---------- Users ----------

@router.get("/users")
async def list_users(role: str = "", q: str = "", page: int = 1, limit: int = 15):
    page, limit, skip = page_params(page, limit)
    query = {"status": {"$ne": "deleted"}}
    if role in ("admin", "pro", "customer"):
        query["role"] = role
    if q:
        query["$or"] = [{"email": {"$regex": q.strip()[:60], "$options": "i"}},
                        {"name": {"$regex": q.strip()[:60], "$options": "i"}}]
    total = await db.users.count_documents(query)
    docs = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for u in docs:
        item = clean(u)
        sub = await db.subscriptions.find_one({"user_id": item["id"]})
        prof = await db.professionals.find_one({"user_id": item["id"]})
        profile = await db.profiles.find_one({"user_id": item["id"]})
        usage_q = await db.usage_records.count_documents({"user_id": item["id"], "kind": "quote"})
        usage_i = await db.usage_records.count_documents({"user_id": item["id"], "kind": "invoice"})
        item["subscription"] = {"plan": (sub or {}).get("plan", "free"), "status": (sub or {}).get("status", "active")}
        item["professional"] = clean(prof) if prof else None
        item["profile_slug"] = (profile or {}).get("slug")
        item["usage"] = {"quotes_sent": usage_q, "invoices_sent": usage_i}
        out.append(item)
    return {"items": out, "total": total, "page": page, "limit": limit}


@router.put("/users/{user_id}")
async def update_user(user_id: str, data: AdminUserIn, request: Request, admin=Depends(require_roles("admin"))):
    target = await db.users.find_one({"_id": to_oid(user_id)})
    if not target:
        raise HTTPException(404, "User not found")
    if target["email"] == admin["email"] and (data.status == "suspended" or (data.role and data.role != "admin")):
        raise HTTPException(400, "You cannot suspend or demote your own account.")
    updates = {}
    if data.name:
        updates["name"] = data.name.strip()
    if data.status:
        updates["status"] = data.status
    if data.role:
        updates["role"] = data.role
    if updates:
        await db.users.update_one({"_id": target["_id"]}, {"$set": updates})
    if data.plan:
        if data.plan == "pro":
            await db.subscriptions.update_one({"user_id": user_id}, {"$set": {
                "plan": "pro", "status": "active",
                "current_period_end": (utcnow() + timedelta(days=30)).isoformat(),
                "started_at": iso()}}, upsert=True)
        else:
            await db.subscriptions.update_one({"user_id": user_id},
                                              {"$set": {"plan": "free", "status": "active"}}, upsert=True)
    await audit(request, admin, "admin_user_updated", target["email"], str(data.model_dump(exclude_none=True))[:300])
    return {"ok": True}


@router.put("/users/{user_id}/professional")
async def update_professional(user_id: str, data: AdminProfessionalIn, request: Request,
                              admin=Depends(require_roles("admin"))):
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if updates:
        updates["updated_at"] = iso()
        await db.professionals.update_one({"user_id": user_id}, {"$set": updates}, upsert=True)
    if data.business_name or data.primary_trade:
        prof = await db.professionals.find_one({"user_id": user_id})
        if prof:
            await db.profiles.update_one({"user_id": user_id},
                                         {"$set": {"display_name": prof["business_name"]}})
    await audit(request, admin, "admin_professional_updated", user_id, str(updates)[:300])
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request, admin=Depends(require_roles("admin"))):
    target = await db.users.find_one({"_id": to_oid(user_id)})
    if not target:
        raise HTTPException(404, "User not found")
    if target["email"] == admin["email"]:
        raise HTTPException(400, "You cannot delete your own account.")
    # Safe deletion: soft-delete + anonymize PII; documents retained for records
    await db.users.update_one({"_id": target["_id"]}, {"$set": {
        "status": "deleted", "email": f"deleted+{user_id}@example.invalid",
        "name": "Deleted User", "password_hash": "!"}})
    await db.profiles.update_one({"user_id": user_id}, {"$set": {"is_public": False}})
    await audit(request, admin, "admin_user_deleted", target["email"])
    return {"ok": True}


# ---------- Trades ----------

@router.get("/trades")
async def list_trades():
    trades = await db.trades.find({}).sort("order", 1).to_list(200)
    return [clean(t) for t in trades]


@router.post("/trades", status_code=201)
async def create_trade(data: TradeIn, request: Request, admin=Depends(require_roles("admin"))):
    name = data.name.strip()
    if await db.trades.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}):
        raise HTTPException(409, "Trade already exists")
    max_order = await db.trades.find().sort("order", -1).limit(1).to_list(1)
    order = (max_order[0]["order"] + 1) if max_order else 0
    doc = {"name": name, "active": data.active, "order": order, "created_at": iso()}
    res = await db.trades.insert_one(doc)
    await audit(request, admin, "trade_created", name)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


@router.put("/trades/{trade_id}")
async def update_trade(trade_id: str, data: TradeIn, request: Request, admin=Depends(require_roles("admin"))):
    res = await db.trades.update_one({"_id": to_oid(trade_id)},
                                     {"$set": {"name": data.name.strip(), "active": data.active}})
    if res.matched_count == 0:
        raise HTTPException(404, "Trade not found")
    await audit(request, admin, "trade_updated", data.name)
    return {"ok": True}


@router.delete("/trades/{trade_id}")
async def delete_trade(trade_id: str, request: Request, admin=Depends(require_roles("admin"))):
    res = await db.trades.delete_one({"_id": to_oid(trade_id)})
    if res.deleted_count == 0:
        raise HTTPException(404, "Trade not found")
    await audit(request, admin, "trade_deleted", trade_id)
    return {"ok": True}


@router.post("/trades/reorder")
async def reorder_trades(data: ReorderIn, admin=Depends(require_roles("admin"))):
    for pos, tid in enumerate(data.order):
        try:
            await db.trades.update_one({"_id": ObjectId(tid)}, {"$set": {"order": pos}})
        except Exception:
            pass
    return {"ok": True}


# ---------- Coupons ----------

@router.get("/coupons")
async def list_coupons():
    coupons = await db.coupons.find({}).sort("created_at", -1).to_list(200)
    out = []
    for c in coupons:
        item = clean(c)
        item["redemptions"] = await db.coupon_redemptions.count_documents({"coupon_id": item["id"]})
        out.append(item)
    return out


@router.post("/coupons", status_code=201)
async def create_coupon(data: CouponIn, request: Request, admin=Depends(require_roles("admin"))):
    code = data.code.strip().upper()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(409, "Coupon code already exists")
    doc = {"code": code, "type": data.type, "value": data.value,
           "start_date": data.start_date or None, "end_date": data.end_date or None,
           "max_redemptions": data.max_redemptions, "active": data.active, "created_at": iso()}
    res = await db.coupons.insert_one(doc)
    await audit(request, admin, "coupon_created", code)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


@router.put("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, data: CouponIn, request: Request, admin=Depends(require_roles("admin"))):
    res = await db.coupons.update_one({"_id": to_oid(coupon_id)}, {"$set": {
        "code": data.code.strip().upper(), "type": data.type, "value": data.value,
        "start_date": data.start_date or None, "end_date": data.end_date or None,
        "max_redemptions": data.max_redemptions, "active": data.active}})
    if res.matched_count == 0:
        raise HTTPException(404, "Coupon not found")
    await audit(request, admin, "coupon_updated", data.code)
    return {"ok": True}


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, request: Request, admin=Depends(require_roles("admin"))):
    res = await db.coupons.delete_one({"_id": to_oid(coupon_id)})
    if res.deleted_count == 0:
        raise HTTPException(404, "Coupon not found")
    await audit(request, admin, "coupon_deleted", coupon_id)
    return {"ok": True}


# ---------- Watermark ----------

@router.get("/watermark")
async def get_wm():
    return clean(await get_watermark())


@router.put("/watermark")
async def update_wm(data: WatermarkIn, request: Request, admin=Depends(require_roles("admin"))):
    await db.watermarks.update_one({"_id": "global"}, {"$set": {
        "enabled": data.enabled, "text": data.text.strip(), "size": data.size,
        "opacity": data.opacity, "position": data.position}}, upsert=True)
    await audit(request, admin, "watermark_updated", "", str(data.model_dump())[:300])
    return {"ok": True}


@router.post("/watermark/image")
async def upload_wm_image(request: Request, file: UploadFile = File(...), admin=Depends(require_roles("admin"))):
    settings = await get_settings()
    path = await save_image(file, "watermarks", settings)
    wm = await get_watermark()
    if wm.get("image_path"):
        delete_image(wm["image_path"])
    await db.watermarks.update_one({"_id": "global"}, {"$set": {"image_path": path}}, upsert=True)
    await audit(request, admin, "watermark_image_uploaded")
    return {"ok": True, "image_path": path}


@router.delete("/watermark/image")
async def delete_wm_image(request: Request, admin=Depends(require_roles("admin"))):
    wm = await get_watermark()
    if wm.get("image_path"):
        delete_image(wm["image_path"])
    await db.watermarks.update_one({"_id": "global"}, {"$set": {"image_path": None}})
    await audit(request, admin, "watermark_image_removed")
    return {"ok": True}


# ---------- Platform Settings / Terms ----------

@router.get("/settings")
async def get_platform_settings():
    return clean(await get_settings())


@router.put("/settings")
async def update_platform_settings(data: PlatformSettingsIn, request: Request,
                                   admin=Depends(require_roles("admin"))):
    allowed = [t for t in data.image_allowed_types if t in ("image/jpeg", "image/png", "image/webp")]
    await db.platform_settings.update_one({"_id": "global"}, {"$set": {
        "plan_price": data.plan_price, "free_quote_limit": data.free_quote_limit,
        "free_invoice_limit": data.free_invoice_limit, "max_request_images": data.max_request_images,
        "max_portfolio_images": data.max_portfolio_images, "image_max_mb": data.image_max_mb,
        "image_max_dimension": data.image_max_dimension,
        "image_allowed_types": allowed or ["image/jpeg", "image/png"],
        "support_phone": data.support_phone.strip()}})
    await db.subscription_plans.update_one({"_id": "pro"}, {"$set": {"price": data.plan_price}})
    await audit(request, admin, "platform_settings_updated", "", str(data.model_dump())[:300])
    return {"ok": True}


@router.get("/terms")
async def list_terms():
    return [clean(t) for t in await db.terms_versions.find({}).sort("created_at", -1).to_list(50)]


@router.post("/terms", status_code=201)
async def create_terms(data: TermsIn, request: Request, admin=Depends(require_roles("admin"))):
    if await db.terms_versions.find_one({"version": data.version}):
        raise HTTPException(409, "Version already exists")
    await db.terms_versions.update_many({}, {"$set": {"active": False}})
    doc = {"version": data.version.strip(), "content": data.content, "active": True, "created_at": iso()}
    res = await db.terms_versions.insert_one(doc)
    await audit(request, admin, "terms_version_created", data.version)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


# ---------- Audit & Documents ----------

@router.get("/audit-logs")
async def audit_logs(page: int = 1, limit: int = 20):
    page, limit, skip = page_params(page, limit)
    total = await db.audit_logs.count_documents({})
    docs = await db.audit_logs.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [clean(d) for d in docs], "total": total, "page": page, "limit": limit}


@router.get("/quotes")
async def admin_quotes(page: int = 1, limit: int = 15):
    page, limit, skip = page_params(page, limit)
    total = await db.quotes.count_documents({})
    docs = await db.quotes.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for d in docs:
        item = clean(d)
        owner = await db.users.find_one({"_id": ObjectId(d["user_id"])})
        item["owner_email"] = (owner or {}).get("email", "unknown")
        out.append(item)
    return {"items": out, "total": total, "page": page, "limit": limit}


@router.get("/invoices")
async def admin_invoices(page: int = 1, limit: int = 15):
    page, limit, skip = page_params(page, limit)
    total = await db.invoices.count_documents({})
    docs = await db.invoices.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for d in docs:
        item = clean(d)
        owner = await db.users.find_one({"_id": ObjectId(d["user_id"])})
        item["owner_email"] = (owner or {}).get("email", "unknown")
        out.append(item)
    return {"items": out, "total": total, "page": page, "limit": limit}


@router.get("/requests")
async def admin_requests(page: int = 1, limit: int = 15):
    page, limit, skip = page_params(page, limit)
    total = await db.estimate_requests.count_documents({})
    docs = await db.estimate_requests.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for d in docs:
        item = clean(d)
        pro = await db.users.find_one({"_id": ObjectId(d["pro_id"])})
        item["pro_email"] = (pro or {}).get("email", "unknown")
        out.append(item)
    return {"items": out, "total": total, "page": page, "limit": limit}


@router.get("/subscriptions")
async def admin_subscriptions(page: int = 1, limit: int = 20):
    page, limit, skip = page_params(page, limit)
    total = await db.subscriptions.count_documents({})
    docs = await db.subscriptions.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for d in docs:
        item = clean(d)
        owner = await db.users.find_one({"_id": ObjectId(d["user_id"])})
        item["email"] = (owner or {}).get("email", "unknown")
        out.append(item)
    return {"items": out, "total": total, "page": page, "limit": limit}
