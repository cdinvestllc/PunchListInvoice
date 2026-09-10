# Quote Flow — Secure SaaS for Trade Professionals

Fast quotes, estimates and invoices for every trade, with professional public profiles and client estimate requests.

## Stack

- **Frontend**: React 19 + Tailwind + shadcn/ui (`/app/frontend`)
- **Backend**: FastAPI + Motor (async MongoDB) (`/app/backend`)
- **Database**: MongoDB with normalized collections (FK-style references, unique indexes)

> The spec requested a relational DB; this deployment environment mandates MongoDB, so entities are modeled as normalized collections (users, roles, professionals, customers, trades, profiles, portfolio_images, estimate_requests, estimate_request_images, quotes, quote_items, invoices, invoice_items, subscription_plans, subscriptions, coupons, coupon_redemptions, usage_records, platform_settings, watermarks, notifications, terms_versions, terms_acceptances, audit_logs) with unique constraints and safe soft-deletion.

## Quick Start (local)

```bash
cd backend && cp .env.example .env   # fill in values (never commit real values)
pip install -r requirements.txt
cd ../frontend && yarn install
# Services run under supervisor:
sudo supervisorctl restart backend frontend
```

- Frontend: http://localhost:3000 · API: http://localhost:8001/api (all routes prefixed `/api`)
- Demo data seeds automatically on startup when `SEED_DEMO_DATA=true` (set `false` in production).

## Demo Accounts (development only — never in production)

| Role | Email | Password |
|---|---|---|
| Admin (owner) | cdinvestllc@gmail.com | ChangeMe!Admin2026 |
| Admin (demo) | admin.demo@example.test | ChangeMe!Admin2026 |
| Pro Free | pro.free@example.test | ChangeMe!Free2026 |
| Pro Paid | pro.paid@example.test | ChangeMe!Paid2026 |
| Customer | customer.demo@example.test | ChangeMe!Customer2026 |

Demo coupon: `WELCOME10` (10% off upgrade).

## Roles & Plans

- **ADMIN**: full platform control via `/admin` (users, trades, coupons, watermark, platform settings, terms, audit logs, all documents).
- **PRO (Free)**: 3 sent estimates/quotes + 3 sent invoices per calendar month (server-enforced via `usage_records`), no logo, platform watermark on PDFs, upgrade CTAs throughout.
- **PRO (Full Mode, $9.99/mo configurable)**: unlimited documents, logo/branding, no watermark, public profile `/pro/{slug}`, portfolio (max 8), estimate request inbox. Simulated checkout; Stripe pluggable via `STRIPE_*` env vars. No card data stored.
- **CUSTOMER**: views public pro profiles and submits estimate requests without a pro account.

## API Summary

- `POST /api/auth/register|login|logout|refresh|forgot-password|reset-password|resend-verification`, `GET /api/auth/me`, `GET /api/auth/verify-email`
- `GET /api/dashboard`
- CRUD `/api/quotes`, `/api/invoices` + `/send`, `/mark-paid`, `/convert-to-invoice`, `/pdf` (totals recomputed server-side)
- `GET/PUT /api/settings/business`, `POST/DELETE /api/settings/logo`
- `GET/PUT /api/profile`, `/api/profile/avatar`, `/api/profile/portfolio` (+reorder, caption, delete)
- `GET /api/requests`, `PUT /api/requests/{id}/status`, `POST /api/requests/{id}/convert`
- `GET /api/subscription`, `POST /api/subscription/upgrade|cancel`, `POST /api/coupons/validate`
- Public: `GET /api/public/config|trades|terms|pros/{slug}`, `POST /api/public/pros/{slug}/requests` (multipart, images validated)
- Admin: `/api/admin/overview|users|trades|coupons|watermark|settings|terms|audit-logs|quotes|invoices|requests|subscriptions`

## Security Checklist

- bcrypt password hashing; JWT access (30 min) + refresh (7 d) in httpOnly Secure SameSite=Lax cookies
- Login throttling (5 failures → 15 min lockout per IP+email) + in-memory rate limits on auth/public endpoints
- Server-side RBAC + ownership checks on every protected route; plan state never trusted from the client
- Origin validation on mutating requests (CSRF mitigation), CORS allowlist, 35 MB body limit
- Upload security: MIME + real-content (PIL verify) + dimension + size checks, random storage names, image re-encoding, no execution
- Safe errors (no stack traces), audit logging, secure headers (nosniff, frame, referrer, permissions)
- Secrets only in server `.env`; `.env.example` contains names only; nothing secret in frontend
- Terms acceptance recorded (version + timestamp + IP); signup blocked without it

## Emails

Transactional emails are **mocked** (console log + in-app notifications) per project config. Check `backend` supervisor logs for `[MOCK EMAIL]` lines.

## PWA

`public/manifest.json` + `public/sw.js` + icons make the app installable; an install prompt appears in supported browsers.

## Deployment

Set env vars from `.env.example`, set `SEED_DEMO_DATA=false`, use a strong unique `JWT_SECRET`, and serve behind HTTPS. Static frontend build: `yarn build`; backend runs with uvicorn under the process manager.
