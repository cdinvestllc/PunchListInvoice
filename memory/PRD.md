# Quote Flow — Secure SaaS Clone + Professional Profiles

## Original Problem Statement
Reproduce the Quote Flow SaaS (quotes.opsflow.pro) from supplied PDFs: Dashboard, Quotes, Invoices, Upgrade, Settings with metrics, quote/invoice creation/editing/PDF, business defaults, logo upload, subscription workflow. Add: server-side RBAC (ADMIN/PRO/CUSTOMER), secure auth (register/login/logout/password reset/email verification, Terms acceptance with version+timestamp), Free plan limits (3 sent quotes + 3 sent invoices/month server-enforced, no logo, platform watermark), Paid plan ($9.99/mo admin-configurable: unlimited, branding, no watermark, public profile, portfolio, estimate requests), public pro profiles at /pro/{slug} with portfolio (max 8 images) and Request-an-Estimate form (max 4 images, admin-configurable rules), request→quote conversion, admin console (users/trades/coupons/watermark/settings/terms/audit), coupons, watermark config, PWA, normalized DB entities, full security hardening, demo seed accounts.

## User Choices
- Payments: SIMULATED upgrade (admin-activatable; Stripe pluggable via env vars, no card data)
- Emails: MOCKED (console log + in-app notifications)
- DB: MongoDB with normalized collections (platform constraint; relational model mapped to collections with FK-style refs + unique indexes)
- Scope: full end-to-end MVP in one pass
- Owner/admin account uses real email cdinvestllc@gmail.com

## Architecture
- Backend: FastAPI + Motor — server.py (middleware: security headers, origin check, 35MB body limit, CORS allowlist, file serving), database.py, security.py (bcrypt, JWT httpOnly cookies, RBAC deps, rate limiting, lockout), helpers.py (settings, usage, totals, audit, notify), models.py (pydantic), uploads.py (PIL validation + re-encode, random names), pdfgen.py (reportlab + watermark), seed.py, routes_auth/public/pro/admin.py
- Frontend: React 19 + Tailwind + shadcn — App.js routes, context/AuthContext, components/Layout (sidebar, banners, notifications, install prompt), DocForm (shared quote/invoice editor), pages: auth x5, Dashboard, DocList, Requests, Upgrade, Settings, Profile, PublicProfile, Admin (8 tabs)
- PWA: public/manifest.json, sw.js, icons, install prompt

## Implemented (2026-09-10)
- Full auth suite w/ terms gating, email verification + password reset (mocked), lockout, rate limits
- Quotes/Invoices CRUD, line items, server-side totals, send (usage-enforced), mark-paid, convert quote→invoice, PDF with admin-configurable watermark (free) / logo (paid)
- Dashboard metrics + recent activity; Requests inbox with statuses + convert-to-quote
- Public profile /pro/{slug} with SEO/OG, portfolio (8 max), estimate request form (4 images, validated), confirmation + pro notification
- Subscription upgrade (simulated) w/ server-side coupon validation + redemption tracking; cancel
- Admin console: overview, users (suspend/activate/delete/plan), trades CRUD+reorder, coupons, watermark, platform settings, terms, audit logs, documents
- Seeds: 7 trades, plans, settings, terms v1.0, watermark, coupon WELCOME10, 5 accounts, sample quotes/invoices/request/portfolio; SEED_DEMO_DATA flag
- Docs: README (setup/API/security checklist), .env.example (names only), auth_testing.md, test_credentials.md

## Fixes Applied During Build
- email-validator rejected .test demo domains → switched to regex validation
- reportlab c.restore() → restoreState()
- Ingress rewrites Origin header → origin check falls back to same-host comparison

## Test Results (iteration 1, 2026-09-10)
- Backend: 37/37 pytest passed — auth, RBAC, limits, totals, PDFs (watermarked + clean), coupons, upgrade, requests, admin, audit, PWA assets
- Frontend: all critical Playwright smoke flows passed (anon redirect, paid login dashboard, sidebar nav, logout, admin console tabs, audit logs)
- Post-review fixes applied: serve_file 403 handling, coupon_redemptions unique index, UTC-aware token expiry comparisons
- Test artifacts: /app/backend/tests/backend_test.py, /app/test_reports/iteration_1.json

## Known Limitations / Next Tasks
- P0: none
- P1: Stripe live checkout wiring (env keys stubbed in .env.example); real email provider (Resend playbook ready)
- P1: Object storage for uploads (currently local disk under /app/backend/uploads)
- P2: Quick-add line items per trade; PDF email delivery; customer portal for request tracking
