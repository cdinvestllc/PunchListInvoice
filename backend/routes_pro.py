from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Response
from bson import ObjectId
from bson.errors import InvalidId
from database import db
from security import require_roles, get_current_user, iso, utcnow, rate_limit
from helpers import (clean, get_settings, get_watermark, get_subscription, is_paid,
                     monthly_usage, check_send_allowed, record_usage, next_number,
                     calc_totals, audit, notify, page_params)
from uploads import save_image, delete_image
from pdfgen import build_pdf
from models import (DocIn, BusinessIn, ProfileIn, CaptionIn, ReorderIn,
                    RequestStatusIn, CouponValidateIn, UpgradeIn)
from datetime import timedelta

router = APIRouter(tags=["pro"])

QUOTE_STATUSES = {"draft", "sent", "accepted", "declined"}
INVOICE_STATUSES = {"draft", "sent", "paid", "overdue"}
REQUEST_STATUSES = {"new", "contacted", "scheduled", "quoted", "accepted", "declined", "completed"}


def to_oid(id_str, label="Resource"):
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(404, f"{label} not found")


async def doc_items(coll, key, doc_id):
    return await coll.find({key: doc_id}).sort("position", 1).to_list(200)


async def owned_doc(coll, doc_id, user):
    doc = await coll.find_one({"_id": to_oid(doc_id)})
    if not doc or (doc["user_id"] != user["id"] and user["role"] != "admin"):
        raise HTTPException(404, "Not found")
    return doc


def doc_out(d, items):
    out = clean(d)
    out["items"] = [clean(i) for i in items]
    return out


async def save_doc(coll, items_coll, key, number_field, user, data: DocIn, existing=None):
    if data.customer_email and "@" not in data.customer_email:
        raise HTTPException(400, "Invalid customer email")
    allowed = QUOTE_STATUSES if number_field == "quote_number" else INVOICE_STATUSES
    if data.status not in allowed:
        raise HTTPException(400, "Invalid status")
    items = [i.model_dump() for i in data.items]
    subtotal, tax, total = calc_totals(items, data.tax_rate)

    kind = "quote" if number_field == "quote_number" else "invoice"
    new_send = data.status == "sent" and (not existing or existing.get("status") != "sent")
    if new_send:
        allowed_send, msg = await check_send_allowed(user["id"], kind)
        if not allowed_send:
            raise HTTPException(402, msg)

    base = {
        "customer_name": data.customer_name.strip(), "customer_email": data.customer_email.strip().lower(),
        "customer_phone": data.customer_phone.strip(), "customer_address": data.customer_address.strip(),
        "job_description": data.job_description.strip(), "issue_date": data.issue_date,
        "tax_rate": data.tax_rate, "subtotal": subtotal, "tax_amount": tax, "total": total,
        "status": data.status, "notes": data.notes.strip(), "updated_at": iso(),
    }
    if number_field == "quote_number":
        base["expiry_date"] = data.expiry_date or None
    else:
        base["due_date"] = data.due_date or None

    if existing:
        doc_id = str(existing["_id"])
        await coll.update_one({"_id": existing["_id"]}, {"$set": base})
        await items_coll.delete_many({key: doc_id})
    else:
        doc_id = str(ObjectId())
        base.update({
            "_id": ObjectId(doc_id), "user_id": user["id"],
            number_field: await next_number("Q" if kind == "quote" else "INV"),
            "created_at": iso(),
        })
        if kind == "quote":
            base["source_request_id"] = data.source_request_id
        else:
            base["quote_id"] = None
            base["paid_at"] = iso() if data.status == "paid" else None
        await coll.insert_one(base)

    await items_coll.insert_many([
        {key: doc_id, "description": i["description"].strip(), "qty": i["qty"],
         "unit_price": i["unit_price"], "position": n}
        for n, i in enumerate(items)
    ] if items else [])

    if new_send:
        await record_usage(user["id"], kind, doc_id)
    doc = await coll.find_one({"_id": ObjectId(doc_id)})
    items_out = await doc_items(items_coll, key, doc_id)
    return doc_out(doc, items_out)


async def pdf_response(coll, items_coll, key, kind, doc_id, user, label):
    doc = await owned_doc(coll, doc_id, user)
    items = await doc_items(items_coll, key, doc_id)
    professional = await db.professionals.find_one({"user_id": doc["user_id"]})
    owner = await db.users.find_one({"_id": ObjectId(doc["user_id"])})
    settings = await get_settings()
    wm = await get_watermark()
    paid = await is_paid(doc["user_id"])
    apply_watermark = (not paid) and wm.get("enabled", True)
    pdf_bytes = build_pdf(kind, doc, items, professional, owner or user, settings, wm, apply_watermark)
    filename = f"{label}-{doc.get('quote_number') or doc.get('invoice_number')}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


# ---------- Dashboard ----------

@router.get("/dashboard")
async def dashboard(user=Depends(require_roles("pro", "admin", "customer"))):
    uid = user["id"]
    today = iso()[:10]
    month_prefix = today[:7]
    invoices = await db.invoices.find({"user_id": uid}).to_list(1000)
    quotes = await db.quotes.find({"user_id": uid}).to_list(1000)

    outstanding = sum(i["total"] for i in invoices if i["status"] in ("sent", "overdue"))
    paid_month = sum(i["total"] for i in invoices if i["status"] == "paid" and str(i.get("paid_at") or "").startswith(month_prefix))
    overdue_docs = [i for i in invoices if i["status"] == "overdue" or (i["status"] == "sent" and i.get("due_date") and i["due_date"] < today)]
    open_quotes = sum(1 for q in quotes if q["status"] in ("draft", "sent"))

    recent = sorted(
        [{"type": "quote", "id": str(q["_id"]), "number": q["quote_number"], "customer": q["customer_name"],
          "total": q["total"], "status": q["status"], "date": q["created_at"]} for q in quotes] +
        [{"type": "invoice", "id": str(i["_id"]), "number": i["invoice_number"], "customer": i["customer_name"],
          "total": i["total"], "status": i["status"], "date": i["created_at"]} for i in invoices],
        key=lambda x: x["date"], reverse=True)[:6]

    usage = await monthly_usage(uid)
    sub = await get_subscription(uid)
    settings = await get_settings()
    paid = sub.get("plan") == "pro" and sub.get("status") in ("active", "canceled")
    new_requests = await db.estimate_requests.count_documents({"pro_id": uid, "status": "new"})
    return {
        "metrics": {"outstanding": round(outstanding, 2), "paid_this_month": round(paid_month, 2),
                    "open_quotes": open_quotes, "overdue": len(overdue_docs),
                    "overdue_amount": round(sum(i["total"] for i in overdue_docs), 2)},
        "recent": recent,
        "usage": usage,
        "limits": {"quote_limit": None if paid else settings["free_quote_limit"],
                    "invoice_limit": None if paid else settings["free_invoice_limit"]},
        "plan": sub.get("plan", "free"),
        "new_requests": new_requests,
    }


# ---------- Quotes ----------

@router.get("/quotes")
async def list_quotes(status: str = "", q: str = "", page: int = 1, limit: int = 10,
                      user=Depends(require_roles("pro", "admin"))):
    page, limit, skip = page_params(page, limit)
    query = {"user_id": user["id"]}
    if status in QUOTE_STATUSES:
        query["status"] = status
    if q:
        query["$or"] = [{"customer_name": {"$regex": q.strip()[:60], "$options": "i"}},
                        {"quote_number": {"$regex": q.strip()[:20], "$options": "i"}}]
    total = await db.quotes.count_documents(query)
    docs = await db.quotes.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [clean(d) for d in docs], "total": total, "page": page, "limit": limit}


@router.post("/quotes", status_code=201)
async def create_quote(data: DocIn, request: Request, user=Depends(require_roles("pro", "admin"))):
    if data.source_request_id:
        req = await db.estimate_requests.find_one({"_id": to_oid(data.source_request_id, "Request"), "pro_id": user["id"]})
        if not req:
            raise HTTPException(404, "Source request not found")
    out = await save_doc(db.quotes, db.quote_items, "quote_id", "quote_number", user, data)
    if data.source_request_id:
        await db.estimate_requests.update_one({"_id": ObjectId(data.source_request_id)},
                                              {"$set": {"status": "quoted", "quote_id": out["id"], "updated_at": iso()}})
    await audit(request, user, "quote_created", out["quote_number"], f"total={out['total']}")
    return out


@router.get("/quotes/{doc_id}")
async def get_quote(doc_id: str, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.quotes, doc_id, user)
    items = await doc_items(db.quote_items, "quote_id", doc_id)
    return doc_out(doc, items)


@router.put("/quotes/{doc_id}")
async def update_quote(doc_id: str, data: DocIn, request: Request, user=Depends(require_roles("pro", "admin"))):
    existing = await owned_doc(db.quotes, doc_id, user)
    out = await save_doc(db.quotes, db.quote_items, "quote_id", "quote_number", user, data, existing)
    await audit(request, user, "quote_updated", existing["quote_number"], f"status={data.status}")
    return out


@router.delete("/quotes/{doc_id}")
async def delete_quote(doc_id: str, request: Request, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.quotes, doc_id, user)
    await db.quote_items.delete_many({"quote_id": doc_id})
    await db.quotes.delete_one({"_id": doc["_id"]})
    await audit(request, user, "quote_deleted", doc["quote_number"])
    return {"ok": True}


@router.post("/quotes/{doc_id}/send")
async def send_quote(doc_id: str, request: Request, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.quotes, doc_id, user)
    if doc["status"] == "draft":
        allowed, msg = await check_send_allowed(user["id"], "quote")
        if not allowed:
            raise HTTPException(402, msg)
        await record_usage(user["id"], "quote", doc_id)
        await db.quotes.update_one({"_id": doc["_id"]}, {"$set": {"status": "sent", "updated_at": iso()}})
        await audit(request, user, "quote_sent", doc["quote_number"])
    return {"ok": True, "status": "sent"}


@router.post("/quotes/{doc_id}/convert-to-invoice")
async def convert_quote(doc_id: str, request: Request, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.quotes, doc_id, user)
    items = await doc_items(db.quote_items, "quote_id", doc_id)
    iid = ObjectId()
    await db.invoices.insert_one({
        "_id": iid, "user_id": user["id"], "invoice_number": await next_number("INV"),
        "customer_name": doc["customer_name"], "customer_email": doc["customer_email"],
        "customer_phone": doc["customer_phone"], "customer_address": doc["customer_address"],
        "job_description": doc["job_description"], "issue_date": iso()[:10], "due_date": None,
        "tax_rate": doc["tax_rate"], "subtotal": doc["subtotal"], "tax_amount": doc["tax_amount"],
        "total": doc["total"], "status": "draft", "notes": doc.get("notes", ""),
        "quote_id": doc_id, "paid_at": None, "created_at": iso(), "updated_at": iso(),
    })
    await db.invoice_items.insert_many([
        {"invoice_id": str(iid), "description": i["description"], "qty": i["qty"],
         "unit_price": i["unit_price"], "position": i["position"]} for i in items
    ] if items else [])
    await audit(request, user, "quote_converted_to_invoice", doc["quote_number"])
    return {"ok": True, "id": str(iid)}


@router.get("/quotes/{doc_id}/pdf")
async def quote_pdf(doc_id: str, user=Depends(require_roles("pro", "admin"))):
    return await pdf_response(db.quotes, db.quote_items, "quote_id", "QUOTE", doc_id, user, "quote")


# ---------- Invoices ----------

@router.get("/invoices")
async def list_invoices(status: str = "", q: str = "", page: int = 1, limit: int = 10,
                        user=Depends(require_roles("pro", "admin"))):
    page, limit, skip = page_params(page, limit)
    query = {"user_id": user["id"]}
    if status in INVOICE_STATUSES:
        query["status"] = status
    if q:
        query["$or"] = [{"customer_name": {"$regex": q.strip()[:60], "$options": "i"}},
                        {"invoice_number": {"$regex": q.strip()[:20], "$options": "i"}}]
    total = await db.invoices.count_documents(query)
    docs = await db.invoices.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [clean(d) for d in docs], "total": total, "page": page, "limit": limit}


@router.post("/invoices", status_code=201)
async def create_invoice(data: DocIn, request: Request, user=Depends(require_roles("pro", "admin"))):
    out = await save_doc(db.invoices, db.invoice_items, "invoice_id", "invoice_number", user, data)
    await audit(request, user, "invoice_created", out["invoice_number"], f"total={out['total']}")
    return out


@router.get("/invoices/{doc_id}")
async def get_invoice(doc_id: str, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.invoices, doc_id, user)
    items = await doc_items(db.invoice_items, "invoice_id", doc_id)
    return doc_out(doc, items)


@router.put("/invoices/{doc_id}")
async def update_invoice(doc_id: str, data: DocIn, request: Request, user=Depends(require_roles("pro", "admin"))):
    existing = await owned_doc(db.invoices, doc_id, user)
    out = await save_doc(db.invoices, db.invoice_items, "invoice_id", "invoice_number", user, data, existing)
    await audit(request, user, "invoice_updated", existing["invoice_number"], f"status={data.status}")
    return out


@router.delete("/invoices/{doc_id}")
async def delete_invoice(doc_id: str, request: Request, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.invoices, doc_id, user)
    await db.invoice_items.delete_many({"invoice_id": doc_id})
    await db.invoices.delete_one({"_id": doc["_id"]})
    await audit(request, user, "invoice_deleted", doc["invoice_number"])
    return {"ok": True}


@router.post("/invoices/{doc_id}/send")
async def send_invoice(doc_id: str, request: Request, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.invoices, doc_id, user)
    if doc["status"] == "draft":
        allowed, msg = await check_send_allowed(user["id"], "invoice")
        if not allowed:
            raise HTTPException(402, msg)
        await record_usage(user["id"], "invoice", doc_id)
        await db.invoices.update_one({"_id": doc["_id"]}, {"$set": {"status": "sent", "updated_at": iso()}})
        await audit(request, user, "invoice_sent", doc["invoice_number"])
    return {"ok": True, "status": "sent"}


@router.post("/invoices/{doc_id}/mark-paid")
async def mark_paid(doc_id: str, request: Request, user=Depends(require_roles("pro", "admin"))):
    doc = await owned_doc(db.invoices, doc_id, user)
    await db.invoices.update_one({"_id": doc["_id"]},
                                 {"$set": {"status": "paid", "paid_at": iso(), "updated_at": iso()}})
    await audit(request, user, "invoice_paid", doc["invoice_number"])
    return {"ok": True, "status": "paid"}


@router.get("/invoices/{doc_id}/pdf")
async def invoice_pdf(doc_id: str, user=Depends(require_roles("pro", "admin"))):
    return await pdf_response(db.invoices, db.invoice_items, "invoice_id", "INVOICE", doc_id, user, "invoice")


# ---------- Settings / Business ----------

@router.put("/settings/business")
async def update_business(data: BusinessIn, request: Request, user=Depends(require_roles("pro"))):
    trade = await db.trades.find_one({"name": data.primary_trade, "active": True})
    if not trade:
        raise HTTPException(400, "Please choose a valid primary trade.")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"name": data.name.strip()}})
    await db.professionals.update_one({"user_id": user["id"]}, {"$set": {
        "business_name": data.business_name.strip(), "primary_trade": data.primary_trade,
        "address": data.address.strip(), "phone": data.phone.strip(),
        "email": str(data.email).lower(), "license": data.license.strip(),
        "default_tax_rate": data.default_tax_rate, "default_labor_rate": data.default_labor_rate,
        "updated_at": iso(),
    }})
    await audit(request, user, "business_settings_updated")
    return {"ok": True}


@router.post("/settings/logo")
async def upload_logo(request: Request, file: UploadFile = File(...), user=Depends(require_roles("pro"))):
    if not await is_paid(user["id"]):
        raise HTTPException(403, "Business logo is a Full Mode feature. Upgrade to unlock branding.")
    settings = await get_settings()
    path = await save_image(file, "logos", settings)
    prof = await db.professionals.find_one({"user_id": user["id"]})
    if prof and prof.get("logo_path"):
        delete_image(prof["logo_path"])
    await db.professionals.update_one({"user_id": user["id"]}, {"$set": {"logo_path": path, "updated_at": iso()}})
    await audit(request, user, "logo_uploaded")
    return {"ok": True, "logo_path": path}


@router.delete("/settings/logo")
async def delete_logo(request: Request, user=Depends(require_roles("pro"))):
    prof = await db.professionals.find_one({"user_id": user["id"]})
    if prof and prof.get("logo_path"):
        delete_image(prof["logo_path"])
    await db.professionals.update_one({"user_id": user["id"]}, {"$set": {"logo_path": None, "updated_at": iso()}})
    await audit(request, user, "logo_removed")
    return {"ok": True}


# ---------- Profile & Portfolio ----------

@router.put("/profile")
async def update_profile(data: ProfileIn, request: Request, user=Depends(require_roles("pro"))):
    if data.is_public and not await is_paid(user["id"]):
        raise HTTPException(403, "Public profiles are a Full Mode feature. Upgrade to publish your profile.")
    await db.profiles.update_one({"user_id": user["id"]}, {"$set": {
        "display_name": data.display_name.strip(), "description": data.description.strip(),
        "is_public": data.is_public, "updated_at": iso(),
    }})
    await audit(request, user, "profile_updated")
    return {"ok": True}


@router.post("/profile/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...), user=Depends(require_roles("pro"))):
    settings = await get_settings()
    path = await save_image(file, "avatars", settings)
    profile = await db.profiles.find_one({"user_id": user["id"]})
    if profile and profile.get("avatar_path"):
        delete_image(profile["avatar_path"])
    await db.profiles.update_one({"user_id": user["id"]}, {"$set": {"avatar_path": path, "updated_at": iso()}})
    return {"ok": True, "avatar_path": path}


@router.get("/profile/portfolio")
async def get_portfolio(user=Depends(require_roles("pro"))):
    items = await db.portfolio_images.find({"user_id": user["id"]}).sort("position", 1).to_list(50)
    return [clean(i) for i in items]


@router.post("/profile/portfolio", status_code=201)
async def add_portfolio_image(request: Request, file: UploadFile = File(...), caption: str = "",
                              user=Depends(require_roles("pro"))):
    if not await is_paid(user["id"]):
        raise HTTPException(403, "Portfolio is a Full Mode feature. Upgrade to showcase your work.")
    settings = await get_settings()
    max_images = int(settings["max_portfolio_images"])
    count = await db.portfolio_images.count_documents({"user_id": user["id"]})
    if count >= max_images:
        raise HTTPException(400, f"Portfolio is limited to {max_images} images.")
    path = await save_image(file, "portfolio", settings)
    doc = {"user_id": user["id"], "file_path": path, "caption": caption.strip()[:200],
           "position": count, "created_at": iso()}
    res = await db.portfolio_images.insert_one(doc)
    await audit(request, user, "portfolio_image_added")
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


@router.put("/profile/portfolio/{image_id}")
async def update_portfolio_caption(image_id: str, data: CaptionIn, user=Depends(require_roles("pro"))):
    res = await db.portfolio_images.update_one(
        {"_id": to_oid(image_id, "Image"), "user_id": user["id"]},
        {"$set": {"caption": data.caption.strip()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Image not found")
    return {"ok": True}


@router.put("/profile/portfolio-reorder")
async def reorder_portfolio(data: ReorderIn, user=Depends(require_roles("pro"))):
    owned = await db.portfolio_images.find({"user_id": user["id"]}).to_list(50)
    owned_ids = {str(i["_id"]) for i in owned}
    for pos, image_id in enumerate(data.order):
        if image_id in owned_ids:
            await db.portfolio_images.update_one({"_id": ObjectId(image_id)}, {"$set": {"position": pos}})
    return {"ok": True}


@router.delete("/profile/portfolio/{image_id}")
async def delete_portfolio_image(image_id: str, request: Request, user=Depends(require_roles("pro"))):
    doc = await db.portfolio_images.find_one({"_id": to_oid(image_id, "Image"), "user_id": user["id"]})
    if not doc:
        raise HTTPException(404, "Image not found")
    delete_image(doc["file_path"])
    await db.portfolio_images.delete_one({"_id": doc["_id"]})
    await audit(request, user, "portfolio_image_deleted")
    return {"ok": True}


# ---------- Estimate Requests ----------

@router.get("/requests")
async def list_requests(status: str = "", page: int = 1, limit: int = 10,
                        user=Depends(require_roles("pro", "admin"))):
    page, limit, skip = page_params(page, limit)
    query = {"pro_id": user["id"]}
    if status in REQUEST_STATUSES:
        query["status"] = status
    total = await db.estimate_requests.count_documents(query)
    docs = await db.estimate_requests.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for d in docs:
        item = clean(d)
        images = await db.estimate_request_images.find({"request_id": item["id"]}).sort("position", 1).to_list(10)
        item["images"] = [clean(i) for i in images]
        out.append(item)
    return {"items": out, "total": total, "page": page, "limit": limit}


@router.put("/requests/{request_id}/status")
async def update_request_status(request_id: str, data: RequestStatusIn, request: Request,
                                user=Depends(require_roles("pro", "admin"))):
    if data.status not in REQUEST_STATUSES:
        raise HTTPException(400, "Invalid status")
    res = await db.estimate_requests.update_one(
        {"_id": to_oid(request_id, "Request"), "pro_id": user["id"]},
        {"$set": {"status": data.status, "updated_at": iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
    await audit(request, user, "request_status_updated", request_id, data.status)
    return {"ok": True, "status": data.status}


@router.post("/requests/{request_id}/convert")
async def convert_request(request_id: str, request: Request, user=Depends(require_roles("pro", "admin"))):
    req = await db.estimate_requests.find_one({"_id": to_oid(request_id, "Request"), "pro_id": user["id"]})
    if not req:
        raise HTTPException(404, "Request not found")
    if req.get("quote_id"):
        return {"ok": True, "id": req["quote_id"]}
    qid = ObjectId()
    prof = await db.professionals.find_one({"user_id": user["id"]}) or {}
    tax_rate = float(prof.get("default_tax_rate") or 0)
    await db.quotes.insert_one({
        "_id": qid, "user_id": user["id"], "quote_number": await next_number("Q"),
        "customer_name": req["customer_name"], "customer_email": req["customer_email"],
        "customer_phone": req["customer_phone"], "customer_address": req["address"],
        "job_description": f"{req['service']}: {req['description']}"[:2000],
        "issue_date": iso()[:10], "expiry_date": None, "tax_rate": tax_rate,
        "subtotal": 0, "tax_amount": 0, "total": 0, "status": "draft",
        "notes": f"Preferred timeframe: {req['timeframe']}. Contact via {req['contact_method']}.",
        "source_request_id": request_id, "created_at": iso(), "updated_at": iso(),
    })
    await db.estimate_requests.update_one({"_id": req["_id"]},
                                          {"$set": {"status": "quoted", "quote_id": str(qid), "updated_at": iso()}})
    await audit(request, user, "request_converted_to_quote", request_id)
    return {"ok": True, "id": str(qid)}


# ---------- Subscription / Coupons ----------

@router.get("/subscription")
async def get_my_subscription(user=Depends(require_roles("pro", "admin"))):
    sub = await get_subscription(user["id"])
    usage = await monthly_usage(user["id"])
    settings = await get_settings()
    plan_doc = await db.subscription_plans.find_one({"_id": "pro"}) or {}
    return {
        "subscription": {"plan": sub.get("plan", "free"), "status": sub.get("status", "active"),
                          "current_period_end": sub.get("current_period_end"), "price": sub.get("price", 0)},
        "usage": usage,
        "plan_price": settings["plan_price"],
        "free_limits": {"quotes": settings["free_quote_limit"], "invoices": settings["free_invoice_limit"]},
        "pro_features": plan_doc.get("features", []),
    }


async def validate_coupon(code: str, user_id: str):
    coupon = await db.coupons.find_one({"code": code.strip().upper()})
    if not coupon or not coupon.get("active"):
        raise HTTPException(400, "Invalid or inactive coupon code.")
    today = iso()[:10]
    if coupon.get("start_date") and coupon["start_date"] > today:
        raise HTTPException(400, "This coupon is not active yet.")
    if coupon.get("end_date") and coupon["end_date"] < today:
        raise HTTPException(400, "This coupon has expired.")
    redemptions = await db.coupon_redemptions.count_documents({"coupon_id": str(coupon["_id"])})
    if redemptions >= coupon.get("max_redemptions", 0):
        raise HTTPException(400, "This coupon has reached its redemption limit.")
    if await db.coupon_redemptions.find_one({"coupon_id": str(coupon["_id"]), "user_id": user_id}):
        raise HTTPException(400, "You have already redeemed this coupon.")
    return coupon


@router.post("/coupons/validate")
async def coupon_validate(data: CouponValidateIn, request: Request, user=Depends(require_roles("pro"))):
    rate_limit(f"coupon:{user['id']}", 20, 60)
    coupon = await validate_coupon(data.code, user["id"])
    settings = await get_settings()
    price = settings["plan_price"]
    if coupon["type"] == "percent":
        final = round(price * (1 - coupon["value"] / 100), 2)
    else:
        final = max(0, round(price - coupon["value"], 2))
    return {"code": coupon["code"], "type": coupon["type"], "value": coupon["value"],
            "original_price": price, "final_price": final}


@router.post("/subscription/upgrade")
async def upgrade(data: UpgradeIn, request: Request, user=Depends(require_roles("pro"))):
    sub = await get_subscription(user["id"])
    if sub.get("plan") == "pro" and sub.get("status") == "active":
        raise HTTPException(400, "You already have an active Full Mode subscription.")
    settings = await get_settings()
    price = settings["plan_price"]
    coupon_code = None
    if data.coupon_code:
        coupon = await validate_coupon(data.coupon_code, user["id"])
        if coupon["type"] == "percent":
            price = round(price * (1 - coupon["value"] / 100), 2)
        else:
            price = max(0, round(price - coupon["value"], 2))
        coupon_code = coupon["code"]
        await db.coupon_redemptions.insert_one({
            "coupon_id": str(coupon["_id"]), "user_id": user["id"], "created_at": iso()})
    # Simulated checkout: payment processor (Stripe) pluggable via env keys; never store card data.
    await db.subscriptions.update_one({"user_id": user["id"]}, {"$set": {
        "plan": "pro", "status": "active", "price": price, "coupon_code": coupon_code,
        "started_at": iso(), "current_period_end": (utcnow() + timedelta(days=30)).isoformat(),
    }}, upsert=True)
    await audit(request, user, "subscription_upgraded", "pro", f"price={price} coupon={coupon_code}")
    await notify(user["id"], "subscription", "Welcome to Full Mode",
                 "Unlimited estimates & invoices, branding, public profile and more are now unlocked.", "/dashboard")
    return {"ok": True, "plan": "pro", "price_charged": price}


@router.post("/subscription/cancel")
async def cancel_subscription(request: Request, user=Depends(require_roles("pro"))):
    sub = await get_subscription(user["id"])
    if sub.get("plan") != "pro":
        raise HTTPException(400, "No active subscription to cancel.")
    await db.subscriptions.update_one({"user_id": user["id"]}, {"$set": {"status": "canceled"}})
    await audit(request, user, "subscription_canceled")
    return {"ok": True, "message": "Subscription canceled. Full Mode stays active until the end of the current period."}


# ---------- Notifications ----------

@router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"items": [clean(d) for d in docs], "unread": unread}


@router.post("/notifications/read-all")
async def read_all_notifications(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}
