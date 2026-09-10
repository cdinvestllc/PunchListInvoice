import os
from datetime import timedelta
from bson import ObjectId
from database import db
from security import hash_password, iso, utcnow
from helpers import DEFAULT_SETTINGS, DEFAULT_WATERMARK

TRADES = ["General Labor", "Plumbing", "HVAC", "Electrical", "Lawn Services", "General Handy Man", "Painting"]

TERMS_V1 = """Quote Flow Terms & Conditions (v1.0)

1. Quote Flow provides quoting, invoicing and business profile tools for trade professionals.
2. Free Mode allows up to 3 sent estimates/quotes and 3 sent invoices per calendar month and applies a platform watermark to generated documents.
3. Full Mode (paid subscription) unlocks unlimited documents, logo branding, public profile, portfolio and estimate requests.
4. You are responsible for the accuracy of quotes, invoices and profile content you publish.
5. Abuse, fraud or unlawful use may result in suspension or termination.
6. This is a demonstration deployment; do not store real customer payment data.
"""

PORTFOLIO_SEED = [
    ("https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&q=80", "Full home rewiring"),
    ("https://images.unsplash.com/photo-1676210133055-eab6ef033ce3?w=800&q=80", "Kitchen sink re-pipe"),
    ("https://images.unsplash.com/photo-1642749776312-aa42ce20c9f5?w=800&q=80", "Rooftop HVAC service"),
    ("https://images.unsplash.com/photo-1523413555809-0fb1d4da238d?w=800&q=80", "Bathroom faucet replacement"),
]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.professionals.create_index("user_id", unique=True)
    await db.profiles.create_index("slug", unique=True)
    await db.profiles.create_index("user_id", unique=True)
    await db.trades.create_index("name", unique=True)
    await db.subscriptions.create_index("user_id", unique=True)
    await db.coupons.create_index("code", unique=True)
    await db.usage_records.create_index([("user_id", 1), ("kind", 1), ("doc_id", 1)], unique=True)
    await db.quotes.create_index("user_id")
    await db.invoices.create_index("user_id")
    await db.quote_items.create_index("quote_id")
    await db.invoice_items.create_index("invoice_id")
    await db.estimate_requests.create_index("pro_id")
    await db.estimate_request_images.create_index("request_id")
    await db.portfolio_images.create_index("user_id")
    await db.notifications.create_index("user_id")
    await db.audit_logs.create_index("created_at")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.email_verification_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.coupon_redemptions.create_index([("coupon_id", 1), ("user_id", 1)], unique=True)


async def upsert(coll, key, doc):
    await coll.update_one(key, {"$setOnInsert": doc}, upsert=True)


async def seed_base():
    for r in ["admin", "pro", "customer"]:
        await upsert(db.roles, {"_id": r}, {"_id": r, "name": r.capitalize(), "created_at": iso()})
    for i, t in enumerate(TRADES):
        await upsert(db.trades, {"name": t}, {"name": t, "active": True, "order": i, "created_at": iso()})
    await upsert(db.subscription_plans, {"_id": "free"}, {
        "_id": "free", "name": "Free Mode", "price": 0, "quote_limit": 3, "invoice_limit": 3,
        "features": ["3 sent estimates/quotes per month", "3 sent invoices per month", "Platform watermark on PDFs"],
        "created_at": iso()})
    await upsert(db.subscription_plans, {"_id": "pro"}, {
        "_id": "pro", "name": "Full Mode", "price": 9.99, "quote_limit": None, "invoice_limit": None,
        "features": ["Unlimited estimates & invoices", "Logo & business branding", "No platform watermark",
                      "Public pro profile & portfolio", "Customer estimate request inbox"],
        "created_at": iso()})
    await upsert(db.platform_settings, {"_id": "global"}, dict(DEFAULT_SETTINGS))
    await upsert(db.watermarks, {"_id": "global"}, dict(DEFAULT_WATERMARK))
    await upsert(db.terms_versions, {"version": "1.0"}, {
        "version": "1.0", "content": TERMS_V1, "active": True, "created_at": iso()})
    await upsert(db.coupons, {"code": "WELCOME10"}, {
        "code": "WELCOME10", "type": "percent", "value": 10, "start_date": None, "end_date": None,
        "max_redemptions": 100, "active": True, "created_at": iso()})
    await upsert(db.counters, {"_id": "Q"}, {"_id": "Q", "seq": 2})
    await upsert(db.counters, {"_id": "INV"}, {"_id": "INV", "seq": 3})


async def make_pro(email, password, name, business, trade, phone, slug, paid=False, public=False, description=""):
    existing = await db.users.find_one({"email": email})
    if existing:
        return str(existing["_id"])
    uid = ObjectId()
    await db.users.insert_one({
        "_id": uid, "email": email, "password_hash": hash_password(password), "name": name,
        "role": "pro", "status": "active", "email_verified": True, "is_demo": True, "created_at": iso(),
    })
    await db.professionals.insert_one({
        "user_id": str(uid), "business_name": business, "primary_trade": trade, "phone": phone,
        "email": email, "address": "123 Main St, Des Moines, IA 50309", "license": "IA-000000",
        "logo_path": None, "default_tax_rate": 7.0, "default_labor_rate": 65.0, "created_at": iso(), "updated_at": iso(),
    })
    await db.profiles.insert_one({
        "user_id": str(uid), "slug": slug, "display_name": business, "description": description,
        "avatar_path": None, "is_public": public, "created_at": iso(), "updated_at": iso(),
    })
    end = (utcnow() + timedelta(days=30)).isoformat() if paid else None
    await db.subscriptions.insert_one({
        "user_id": str(uid), "plan": "pro" if paid else "free", "status": "active",
        "price": 9.99 if paid else 0, "coupon_code": None, "started_at": iso(),
        "current_period_end": end, "created_at": iso(),
    })
    return str(uid)


async def seed_demo():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.test")
    admin_password = os.environ.get("ADMIN_PASSWORD", "ChangeMe!Admin2026")
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_password), "name": "Platform Owner",
            "role": "admin", "status": "active", "email_verified": True, "is_demo": False, "created_at": iso(),
        })
    elif not await _password_matches(admin_email, admin_password):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password), "role": "admin", "status": "active"}})

    if not await db.users.find_one({"email": "admin.demo@example.test"}):
        await db.users.insert_one({
            "email": "admin.demo@example.test", "password_hash": hash_password("ChangeMe!Admin2026"),
            "name": "Demo Admin", "role": "admin", "status": "active", "email_verified": True, "is_demo": True, "created_at": iso(),
        })

    free_id = await make_pro(
        "pro.free@example.test", "ChangeMe!Free2026", "Fred Brown", "Brown Lawn & Labor",
        "Lawn Services", "(515) 555-0142", "brown-lawn-labor", paid=False, public=False,
        description="Reliable lawn care and general labor for the Des Moines area.")
    paid_id = await make_pro(
        "pro.paid@example.test", "ChangeMe!Paid2026", "Paul Smith", "Smith Services",
        "General Handy Man", "(515) 555-0188", "smith-services", paid=True, public=True,
        description="Licensed and insured handyman services: plumbing, electrical, HVAC and painting. 15 years serving central Iowa with upfront pricing and clean work.")

    if not await db.users.find_one({"email": "customer.demo@example.test"}):
        await db.users.insert_one({
            "email": "customer.demo@example.test", "password_hash": hash_password("ChangeMe!Customer2026"),
            "name": "Casey Customer", "role": "customer", "status": "active", "email_verified": True,
            "is_demo": True, "created_at": iso(),
        })

    if not await db.quotes.find_one({"quote_number": "Q1001"}):
        qid = ObjectId()
        await db.quotes.insert_one({
            "_id": qid, "user_id": free_id, "quote_number": "Q1001", "customer_name": "Dennis Right",
            "customer_email": "dennis.right@example.test", "customer_phone": "(515) 555-0110",
            "customer_address": "88 Oak Ave, Des Moines, IA", "job_description": "Full yard cleanup and haul-away",
            "issue_date": "2026-09-09", "expiry_date": "2026-10-09", "tax_rate": 8.9,
            "subtotal": 300.0, "tax_amount": 26.70, "total": 326.70, "status": "draft",
            "notes": "", "source_request_id": None, "created_at": iso(), "updated_at": iso(),
        })
        await db.quote_items.insert_one({"quote_id": str(qid), "description": "Yard cleanup (day rate)", "qty": 1, "unit_price": 300.0, "position": 0})

    if not await db.quotes.find_one({"quote_number": "Q1002"}):
        qid = ObjectId()
        await db.quotes.insert_one({
            "_id": qid, "user_id": paid_id, "quote_number": "Q1002", "customer_name": "Maria Lopez",
            "customer_email": "maria.lopez@example.test", "customer_phone": "(515) 555-0121",
            "customer_address": "12 Elm Ct, Ankeny, IA", "job_description": "Replace water heater, 50 gal",
            "issue_date": "2026-09-08", "expiry_date": "2026-10-08", "tax_rate": 7.0,
            "subtotal": 1450.0, "tax_amount": 101.50, "total": 1551.50, "status": "accepted",
            "notes": "Includes disposal of old unit", "source_request_id": None, "created_at": iso(), "updated_at": iso(),
        })
        await db.quote_items.insert_many([
            {"quote_id": str(qid), "description": "50 gal water heater", "qty": 1, "unit_price": 1100.0, "position": 0},
            {"quote_id": str(qid), "description": "Labor", "qty": 5, "unit_price": 70.0, "position": 1},
        ])

    if not await db.invoices.find_one({"invoice_number": "INV1001"}):
        iid = ObjectId()
        await db.invoices.insert_one({
            "_id": iid, "user_id": paid_id, "invoice_number": "INV1001", "customer_name": "James Brown",
            "customer_email": "james.brown@example.test", "customer_phone": "(404) 555-7840",
            "customer_address": "502 Pryor Street SW, Atlanta, GA", "job_description": "Gravel delivery and spread",
            "issue_date": "2026-09-10", "due_date": "2026-10-10", "tax_rate": 8.0,
            "subtotal": 200.0, "tax_amount": 16.0, "total": 216.0, "status": "draft",
            "notes": "", "quote_id": None, "paid_at": None, "created_at": iso(), "updated_at": iso(),
        })
        await db.invoice_items.insert_one({"invoice_id": str(iid), "description": "Gravel", "qty": 1, "unit_price": 200.0, "position": 0})

    if not await db.invoices.find_one({"invoice_number": "INV1002"}):
        iid = ObjectId()
        month_start = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        await db.invoices.insert_one({
            "_id": iid, "user_id": paid_id, "invoice_number": "INV1002", "customer_name": "Maria Lopez",
            "customer_email": "maria.lopez@example.test", "customer_phone": "(515) 555-0121",
            "customer_address": "12 Elm Ct, Ankeny, IA", "job_description": "Water heater install (Q1002)",
            "issue_date": month_start[:10], "due_date": month_start[:10], "tax_rate": 7.0,
            "subtotal": 1450.0, "tax_amount": 101.50, "total": 1551.50, "status": "paid",
            "notes": "", "quote_id": None, "paid_at": iso(), "created_at": iso(), "updated_at": iso(),
        })
        await db.invoice_items.insert_many([
            {"invoice_id": str(iid), "description": "50 gal water heater", "qty": 1, "unit_price": 1100.0, "position": 0},
            {"invoice_id": str(iid), "description": "Labor", "qty": 5, "unit_price": 70.0, "position": 1},
        ])

    if not await db.estimate_requests.find_one({"pro_id": paid_id}):
        rid = ObjectId()
        await db.estimate_requests.insert_one({
            "_id": rid, "pro_id": paid_id, "customer_name": "Casey Customer",
            "customer_phone": "(515) 555-0199", "customer_email": "customer.demo@example.test",
            "address": "300 Walnut St, Des Moines, IA", "service": "Plumbing",
            "description": "Kitchen faucet is leaking at the base and the shutoff valve is stuck. Looking for a repair quote this month.",
            "timeframe": "Within 2 weeks", "contact_method": "Email", "status": "new",
            "quote_id": None, "created_at": iso(), "updated_at": iso(),
        })
        await db.notifications.insert_one({
            "user_id": paid_id, "type": "estimate_request", "title": "New estimate request",
            "message": "Casey Customer requested an estimate for Plumbing.", "link": "/requests",
            "read": False, "created_at": iso(),
        })

    if not await db.portfolio_images.find_one({"user_id": paid_id}):
        await db.portfolio_images.insert_many([
            {"user_id": paid_id, "file_path": url, "caption": cap, "position": i, "created_at": iso()}
            for i, (url, cap) in enumerate(PORTFOLIO_SEED)
        ])


async def _password_matches(email, password):
    from security import verify_password
    u = await db.users.find_one({"email": email})
    return u and verify_password(password, u["password_hash"])


async def run_seed():
    await ensure_indexes()
    await seed_base()
    if os.environ.get("SEED_DEMO_DATA", "true").lower() != "false":
        await seed_demo()
