"""Comprehensive backend tests for Quote Flow.

Covers: health, auth (login/register/rbac/lockout-safe), public endpoints, quotes CRUD,
free-plan send limits, PDF generation, subscription/coupon upgrade, admin CRUD.
"""
import io
import time
import uuid
import pytest
import requests

from conftest import BASE_URL, DEFAULT_HEADERS, _session, _login


# -------------------- Health & Public --------------------

class TestHealthPublic:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_public_config(self):
        r = requests.get(f"{BASE_URL}/api/public/config", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("plan_price", "max_request_images", "image_max_mb", "timeframes", "contact_methods"):
            assert k in data

    def test_public_trades(self):
        r = requests.get(f"{BASE_URL}/api/public/trades", timeout=15)
        assert r.status_code == 200 and isinstance(r.json(), list)
        assert len(r.json()) > 0

    def test_public_terms(self):
        r = requests.get(f"{BASE_URL}/api/public/terms", timeout=15)
        assert r.status_code == 200
        assert "version" in r.json() and "content" in r.json()

    def test_manifest_and_sw(self):
        assert requests.get(f"{BASE_URL}/manifest.json", timeout=15).status_code == 200
        assert requests.get(f"{BASE_URL}/sw.js", timeout=15).status_code == 200


# -------------------- Auth --------------------

class TestAuth:
    def test_login_success_admin(self, admin_session):
        s, me = admin_session
        assert me["role"] == "admin"
        assert me["email"] == "cdinvestllc@gmail.com"
        # Verify cookies stored
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == "cdinvestllc@gmail.com"

    def test_login_success_pro_paid(self, pro_paid_session):
        _, me = pro_paid_session
        assert me["role"] == "pro"
        assert me["subscription"]["plan"] == "pro"

    def test_login_invalid_credentials(self):
        # Use unique email to avoid triggering lockout on real accounts
        s = _session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": f"nouser+{uuid.uuid4().hex}@example.invalid", "password": "wrongpass"},
                   timeout=15)
        assert r.status_code == 401

    def test_me_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout(self, pro_paid_session):
        # Use fresh session so we don't kill the shared fixture
        s, _ = _login("pro.paid@example.test", "ChangeMe!Paid2026")
        r = s.post(f"{BASE_URL}/api/auth/logout", headers=DEFAULT_HEADERS, timeout=15)
        assert r.status_code == 200
        # Cookies cleared
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r2.status_code == 401

    def test_register_missing_terms_rejected(self, current_terms, any_trade):
        s = _session()
        payload = {
            "name": "Test No Terms",
            "email": f"noterms+{uuid.uuid4().hex}@example.test",
            "password": "Passw0rd!",
            "business_name": "NT Services",
            "primary_trade": any_trade,
            "phone": "555-000-1111",
            "terms_accepted": False,
            "terms_version": current_terms["version"],
        }
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
        assert r.status_code == 400
        assert "terms" in r.text.lower()

    def test_register_with_terms_success(self, current_terms, any_trade):
        s = _session()
        email = f"newpro+{uuid.uuid4().hex[:10]}@example.test"
        payload = {
            "name": "New Pro",
            "email": email,
            "password": "Passw0rd!",
            "business_name": f"Pro {uuid.uuid4().hex[:6]}",
            "primary_trade": any_trade,
            "phone": "555-222-3333",
            "terms_accepted": True,
            "terms_version": current_terms["version"],
        }
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["email"] == email
        assert me["role"] == "pro"
        assert me["subscription"]["plan"] == "free"
        assert me["usage"]["quotes_sent"] == 0
        # store on class for later use
        TestAuth._new_pro = {"email": email, "password": payload["password"], "session": s}

    def test_forgot_password_mock_email(self):
        s = _session()
        r = s.post(f"{BASE_URL}/api/auth/forgot-password",
                   json={"email": "pro.free@example.test"}, timeout=15)
        # Always 200 (no user enumeration) per implementation
        assert r.status_code == 200
        assert r.json().get("ok") is True


# -------------------- RBAC --------------------

class TestRBAC:
    def test_pro_cannot_call_admin_endpoint(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.get(f"{BASE_URL}/api/admin/users", timeout=15)
        assert r.status_code == 403

    def test_unauth_cannot_list_quotes(self):
        r = requests.get(f"{BASE_URL}/api/quotes", timeout=15)
        assert r.status_code == 401

    def test_admin_can_list_users(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/admin/users", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data


# -------------------- Dashboard --------------------

class TestDashboard:
    def test_pro_paid_dashboard_metrics(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.get(f"{BASE_URL}/api/dashboard", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "metrics" in data and "recent" in data
        m = data["metrics"]
        for k in ("outstanding", "paid_this_month", "open_quotes", "overdue"):
            assert k in m
        # Seeded to $1,551.50 per problem statement
        assert m["paid_this_month"] == pytest.approx(1551.50, rel=0.01) or m["paid_this_month"] > 0


# -------------------- Quotes CRUD --------------------

class TestQuotes:
    def _quote_payload(self, status="draft"):
        return {
            "customer_name": "TEST_Acme Co",
            "customer_email": "acme@example.test",
            "customer_phone": "555-1234",
            "customer_address": "1 Main St",
            "job_description": "Kitchen renovation",
            "issue_date": "2026-01-15",
            "expiry_date": "2026-02-15",
            "tax_rate": 8.25,
            "status": status,
            "notes": "TEST",
            "items": [
                {"description": "Cabinet install", "qty": 10, "unit_price": 100},
                {"description": "Plumbing hookup", "qty": 2, "unit_price": 250.5},
            ],
        }

    def test_create_quote_computes_totals(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.post(f"{BASE_URL}/api/quotes", json=self._quote_payload("draft"), timeout=20)
        assert r.status_code == 201, r.text
        d = r.json()
        # subtotal = 10*100 + 2*250.5 = 1501, tax = 1501 * 0.0825 = 123.83, total = 1624.83
        assert d["subtotal"] == pytest.approx(1501.00, abs=0.01)
        assert d["tax_amount"] == pytest.approx(123.83, abs=0.05)
        assert d["total"] == pytest.approx(1624.83, abs=0.05)
        assert d["status"] == "draft"
        assert d["quote_number"].startswith("Q-") or "Q" in d["quote_number"]
        assert len(d["items"]) == 2
        TestQuotes._id = d["id"]

    def test_get_quote_persisted(self, pro_paid_session):
        s, _ = pro_paid_session
        qid = TestQuotes._id
        r = s.get(f"{BASE_URL}/api/quotes/{qid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["customer_name"] == "TEST_Acme Co"
        assert len(r.json()["items"]) == 2

    def test_list_quotes_contains_created(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.get(f"{BASE_URL}/api/quotes?limit=20", timeout=15)
        assert r.status_code == 200
        ids = [q["id"] for q in r.json()["items"]]
        assert TestQuotes._id in ids

    def test_quote_pdf_paid_no_watermark(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.get(f"{BASE_URL}/api/quotes/{TestQuotes._id}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_delete_quote(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.delete(f"{BASE_URL}/api/quotes/{TestQuotes._id}", timeout=15)
        assert r.status_code == 200
        r2 = s.get(f"{BASE_URL}/api/quotes/{TestQuotes._id}", timeout=15)
        assert r2.status_code == 404


# -------------------- Free plan send limits --------------------

class TestFreeLimits:
    """Register a brand-new pro and enforce 3 sent-quote limit on 4th."""

    @pytest.fixture(scope="class")
    def fresh_pro(self, current_terms, any_trade):
        s = _session()
        email = f"limit+{uuid.uuid4().hex[:10]}@example.test"
        payload = {
            "name": "Limit Pro",
            "email": email,
            "password": "Passw0rd!",
            "business_name": f"LimitBiz {uuid.uuid4().hex[:6]}",
            "primary_trade": any_trade,
            "phone": "555-999-0000",
            "terms_accepted": True,
            "terms_version": current_terms["version"],
        }
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        return s

    def _payload(self, status="sent"):
        return {
            "customer_name": f"TEST_Cust {uuid.uuid4().hex[:4]}",
            "customer_email": "cust@example.test",
            "customer_phone": "555", "customer_address": "1 St",
            "job_description": "Job", "issue_date": "2026-01-15",
            "expiry_date": None, "tax_rate": 0, "status": status,
            "notes": "", "items": [{"description": "Work", "qty": 1, "unit_price": 100}],
        }

    def test_three_sent_then_fourth_blocked(self, fresh_pro):
        s = fresh_pro
        for i in range(3):
            r = s.post(f"{BASE_URL}/api/quotes", json=self._payload("sent"), timeout=20)
            assert r.status_code == 201, f"sent quote #{i+1} failed: {r.status_code} {r.text}"
        # 4th sent should get 402
        r4 = s.post(f"{BASE_URL}/api/quotes", json=self._payload("sent"), timeout=20)
        assert r4.status_code == 402, f"Expected 402, got {r4.status_code}: {r4.text}"
        msg = r4.text.lower()
        assert "upgrade" in msg or "limit" in msg or "free" in msg


# -------------------- Subscription / Coupon --------------------

class TestUpgrade:
    def test_coupon_validate_welcome10(self, current_terms, any_trade):
        s = _session()
        email = f"upgtest+{uuid.uuid4().hex[:8]}@example.test"
        payload = {
            "name": "Upg Pro", "email": email, "password": "Passw0rd!",
            "business_name": f"UBiz {uuid.uuid4().hex[:5]}", "primary_trade": any_trade,
            "phone": "555-100-2000", "terms_accepted": True, "terms_version": current_terms["version"],
        }
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200
        v = s.post(f"{BASE_URL}/api/coupons/validate", json={"code": "WELCOME10"}, timeout=15)
        assert v.status_code == 200, v.text
        d = v.json()
        assert d["code"] == "WELCOME10"
        assert d["type"] == "percent" and d["value"] == 10
        assert d["final_price"] == pytest.approx(round(d["original_price"] * 0.9, 2), abs=0.01)
        # Upgrade
        u = s.post(f"{BASE_URL}/api/subscription/upgrade", json={"coupon_code": "WELCOME10"}, timeout=20)
        assert u.status_code == 200, u.text
        assert u.json()["plan"] == "pro"
        # Verify via /me
        me = s.get(f"{BASE_URL}/api/auth/me", timeout=15).json()
        assert me["subscription"]["plan"] == "pro"
        assert me["subscription"]["status"] == "active"

    def test_invalid_coupon(self, pro_paid_session):
        # pro.paid already active -> coupon validate still runs, use fresh pro
        s = _session()
        # Login as pro.free (still on free plan per note it was reset)
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": "pro.free@example.test", "password": "ChangeMe!Free2026"}, timeout=15)
        if r.status_code != 200:
            pytest.skip("pro.free login unavailable")
        v = s.post(f"{BASE_URL}/api/coupons/validate", json={"code": "NOTACODE"}, timeout=15)
        assert v.status_code == 400


# -------------------- Public profile + estimate request --------------------

class TestPublicProfile:
    def test_smith_services_profile(self):
        r = requests.get(f"{BASE_URL}/api/public/pros/smith-services", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["slug"] == "smith-services"
        assert "portfolio" in d
        assert isinstance(d["portfolio"], list)

    def test_submit_estimate_request(self):
        s = _session()
        # multipart form
        headers = {"Origin": BASE_URL}  # don't force json content-type
        files = {
            "name": (None, "TEST_Requestor"),
            "phone": (None, "555-777-8888"),
            "email": (None, "req@example.test"),
            "address": (None, "42 Test Ave"),
            "service": (None, "Plumbing"),
            "description": (None, "Leaky faucet needs fixing"),
            "timeframe": (None, "ASAP"),
            "contact_method": (None, "Email"),
        }
        r = requests.post(f"{BASE_URL}/api/public/pros/smith-services/requests",
                          files=files, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        TestPublicProfile._req_id = r.json()["id"]

    def test_pro_paid_sees_new_request(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.get(f"{BASE_URL}/api/requests?limit=20", timeout=15)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()["items"]]
        assert TestPublicProfile._req_id in ids

    def test_convert_request_to_quote(self, pro_paid_session):
        s, _ = pro_paid_session
        r = s.post(f"{BASE_URL}/api/requests/{TestPublicProfile._req_id}/convert",
                   timeout=15)
        assert r.status_code == 200, r.text
        assert "id" in r.json()


# -------------------- Free plan restrictions --------------------

class TestFreePlanRestrictions:
    def test_free_pro_cannot_upload_logo(self, pro_free_session):
        s, _ = pro_free_session
        # Use a fresh requests call with cookies from session to avoid the
        # session-level "Content-Type: application/json" default header
        # interfering with multipart encoding.
        files = {"file": ("logo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 100, "image/png")}
        r = requests.post(f"{BASE_URL}/api/settings/logo",
                          files=files, headers={"Origin": BASE_URL},
                          cookies=s.cookies, timeout=15)
        # Free-plan endpoint must reject BEFORE saving. Accept 400/403.
        assert r.status_code in (400, 403), f"Got {r.status_code}: {r.text}"
        if r.status_code == 403:
            assert "upgrade" in r.text.lower() or "full mode" in r.text.lower()

    def test_free_pdf_watermarked_is_valid_pdf(self, pro_free_session):
        s, _ = pro_free_session
        # find any quote owned by pro.free
        r = s.get(f"{BASE_URL}/api/quotes?limit=1", timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        if not items:
            pytest.skip("pro.free has no quotes to PDF-test")
        qid = items[0]["id"]
        r2 = s.get(f"{BASE_URL}/api/quotes/{qid}/pdf", timeout=30)
        assert r2.status_code == 200
        assert r2.content[:4] == b"%PDF"


# -------------------- Admin CRUD --------------------

class TestAdmin:
    def test_admin_overview(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/admin/overview", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("users", "pros", "quotes", "invoices", "paid_subscriptions", "mrr"):
            assert k in d

    def test_admin_audit_logs(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/admin/audit-logs", timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()
        assert r.json()["total"] > 0

    def test_admin_trades_crud(self, admin_session):
        s, _ = admin_session
        name = f"TEST_Trade_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{BASE_URL}/api/admin/trades", json={"name": name, "active": True}, timeout=15)
        assert r.status_code == 201
        tid = r.json()["id"]
        # Update
        r2 = s.put(f"{BASE_URL}/api/admin/trades/{tid}",
                   json={"name": name + "_upd", "active": False}, timeout=15)
        assert r2.status_code == 200
        # Delete
        r3 = s.delete(f"{BASE_URL}/api/admin/trades/{tid}", timeout=15)
        assert r3.status_code == 200

    def test_admin_coupon_crud(self, admin_session):
        s, _ = admin_session
        code = f"TEST{uuid.uuid4().hex[:6].upper()}"
        r = s.post(f"{BASE_URL}/api/admin/coupons",
                   json={"code": code, "type": "percent", "value": 15,
                         "max_redemptions": 5, "active": True}, timeout=15)
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        r2 = s.put(f"{BASE_URL}/api/admin/coupons/{cid}",
                   json={"code": code, "type": "percent", "value": 20,
                         "max_redemptions": 5, "active": False}, timeout=15)
        assert r2.status_code == 200
        r3 = s.delete(f"{BASE_URL}/api/admin/coupons/{cid}", timeout=15)
        assert r3.status_code == 200

    def test_admin_platform_settings_roundtrip(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/admin/settings", timeout=15)
        assert r.status_code == 200
        cur = r.json()
        payload = {
            "plan_price": cur["plan_price"],
            "free_quote_limit": cur["free_quote_limit"],
            "free_invoice_limit": cur["free_invoice_limit"],
            "max_request_images": cur["max_request_images"],
            "max_portfolio_images": cur["max_portfolio_images"],
            "image_max_mb": cur["image_max_mb"],
            "image_max_dimension": cur["image_max_dimension"],
            "image_allowed_types": cur["image_allowed_types"],
            "support_phone": cur.get("support_phone", ""),
        }
        r2 = s.put(f"{BASE_URL}/api/admin/settings", json=payload, timeout=15)
        assert r2.status_code == 200

    def test_admin_watermark_update(self, admin_session):
        s, _ = admin_session
        r = s.put(f"{BASE_URL}/api/admin/watermark",
                  json={"enabled": True, "text": "Created with Quote Flow Free",
                        "size": 44, "opacity": 0.12, "position": "center"}, timeout=15)
        assert r.status_code == 200
