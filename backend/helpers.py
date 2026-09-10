import logging
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from database import db
from security import iso, utcnow

logger = logging.getLogger("quoteflow")

DEFAULT_SETTINGS = {
    "_id": "global",
    "plan_price": 9.99,
    "free_quote_limit": 3,
    "free_invoice_limit": 3,
    "max_request_images": 4,
    "max_portfolio_images": 8,
    "image_max_mb": 5,
    "image_max_dimension": 2048,
    "image_allowed_types": ["image/jpeg", "image/png", "image/webp"],
    "support_phone": "(515) 717-3277",
}

DEFAULT_WATERMARK = {
    "_id": "global",
    "enabled": True,
    "text": "Created with Quote Flow Free",
    "size": 44,
    "opacity": 0.12,
    "position": "center",
    "image_path": None,
}


def clean(doc):
    if doc is None:
        return None
    d = dict(doc)
    d["id"] = str(d.pop("_id"))
    return d


async def get_settings() -> dict:
    doc = await db.platform_settings.find_one({"_id": "global"})
    s = dict(DEFAULT_SETTINGS)
    if doc:
        s.update(doc)
    return s


async def get_watermark() -> dict:
    doc = await db.watermarks.find_one({"_id": "global"})
    w = dict(DEFAULT_WATERMARK)
    if doc:
        w.update(doc)
    return w


async def get_subscription(user_id: str) -> dict:
    sub = await db.subscriptions.find_one({"user_id": user_id})
    if not sub:
        return {"plan": "free", "status": "active", "current_period_end": None, "price": 0}
    if sub.get("plan") == "pro" and sub.get("status") in ("active", "canceled"):
        end = sub.get("current_period_end")
        if end and end < iso():
            return {"plan": "free", "status": "expired", "current_period_end": end, "price": 0}
    return sub


async def is_paid(user_id: str) -> bool:
    sub = await get_subscription(user_id)
    return sub.get("plan") == "pro" and sub.get("status") in ("active", "canceled")


async def monthly_usage(user_id: str):
    now = utcnow()
    q = await db.usage_records.count_documents({"user_id": user_id, "kind": "quote", "year": now.year, "month": now.month})
    inv = await db.usage_records.count_documents({"user_id": user_id, "kind": "invoice", "year": now.year, "month": now.month})
    return {"quotes_sent": q, "invoices_sent": inv}


async def check_send_allowed(user_id: str, kind: str) -> tuple:
    """Returns (allowed, message). Enforced server-side; never trust client plan state."""
    if await is_paid(user_id):
        return True, ""
    settings = await get_settings()
    limit = settings["free_quote_limit"] if kind == "quote" else settings["free_invoice_limit"]
    usage = await monthly_usage(user_id)
    used = usage["quotes_sent"] if kind == "quote" else usage["invoices_sent"]
    if used >= limit:
        label = "estimates/quotes" if kind == "quote" else "invoices"
        return False, f"Free plan limit reached: {limit} sent {label} per month. Upgrade to Full Mode for unlimited."
    return True, ""


async def record_usage(user_id: str, kind: str, doc_id: str):
    now = utcnow()
    try:
        await db.usage_records.insert_one({
            "user_id": user_id, "kind": kind, "doc_id": doc_id,
            "year": now.year, "month": now.month, "created_at": iso(),
        })
    except DuplicateKeyError:
        pass


async def next_number(prefix: str) -> str:
    doc = await db.counters.find_one_and_update(
        {"_id": prefix}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return f"{prefix}{1000 + doc['seq']}"


def calc_totals(items, tax_rate: float):
    subtotal = round(sum(round(float(i["qty"]) * float(i["unit_price"]), 2) for i in items), 2)
    tax = round(subtotal * float(tax_rate) / 100, 2)
    return subtotal, tax, round(subtotal + tax, 2)


async def audit(request, actor, action: str, target: str = "", details: str = ""):
    try:
        await db.audit_logs.insert_one({
            "actor_id": actor.get("id") if actor else None,
            "actor_email": actor.get("email") if actor else "public",
            "action": action,
            "target": target,
            "details": details[:500],
            "ip": request.client.host if request and request.client else "",
            "created_at": iso(),
        })
    except Exception:
        logger.exception("audit log failed")


async def notify(user_id: str, ntype: str, title: str, message: str, link: str = None):
    await db.notifications.insert_one({
        "user_id": user_id, "type": ntype, "title": title, "message": message,
        "link": link, "read": False, "created_at": iso(),
    })


def send_email(to: str, subject: str, body: str):
    """Mocked transactional email: logged to console only (per project config)."""
    logger.info(f"[MOCK EMAIL] to={to} subject={subject}\n{body}")


def page_params(page: int, limit: int):
    page = max(1, min(page or 1, 10000))
    limit = max(1, min(limit or 10, 100))
    return page, limit, (page - 1) * limit
