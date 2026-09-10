import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quote-invoice-pro-10.preview.emergentagent.com").rstrip("/")

# All mutating requests must include a valid Origin (CSRF middleware in server.py)
DEFAULT_HEADERS = {"Origin": BASE_URL, "Content-Type": "application/json"}


def _session():
    s = requests.Session()
    s.headers.update(DEFAULT_HEADERS)
    return s


def _login(email, password):
    s = _session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture()
def anon_session():
    return _session()


@pytest.fixture(scope="session")
def admin_session():
    s, me = _login("cdinvestllc@gmail.com", "ChangeMe!Admin2026")
    return s, me


@pytest.fixture(scope="session")
def pro_paid_session():
    s, me = _login("pro.paid@example.test", "ChangeMe!Paid2026")
    return s, me


@pytest.fixture(scope="session")
def pro_free_session():
    s, me = _login("pro.free@example.test", "ChangeMe!Free2026")
    return s, me


@pytest.fixture(scope="session")
def current_terms():
    r = requests.get(f"{BASE_URL}/api/public/terms", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def any_trade():
    r = requests.get(f"{BASE_URL}/api/public/trades", timeout=15)
    assert r.status_code == 200 and len(r.json()) > 0
    return r.json()[0]["name"]
