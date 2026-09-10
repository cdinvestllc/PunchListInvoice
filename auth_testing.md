# Auth Testing Playbook

## Step 1: MongoDB Verification
```
mongosh
use test_database
db.users.find({role: "admin"}).pretty()
db.users.findOne({role: "admin"}, {password_hash: 1})
```
Verify: bcrypt hash starts with `$2b$`; unique index on users.email; TTL index on password_reset_tokens.expires_at; index on login_attempts.identifier.

## Step 2: API Testing
```
curl -c cookies.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"cdinvestllc@gmail.com","password":"ChangeMe!Admin2026"}'
cat cookies.txt
curl -b cookies.txt $API/api/auth/me
```
Login returns the user object and sets `access_token` + `refresh_token` httpOnly cookies. `/me` returns the same user via cookies.

## Step 3: RBAC
- pro.free token calling GET /api/admin/users → 403
- unauthenticated GET /api/quotes → 401
- pro.free accessing another pro's quote id → 404/403

## Step 4: Lockout
5 failed logins for same email+ip → 429/423 for 15 minutes.
