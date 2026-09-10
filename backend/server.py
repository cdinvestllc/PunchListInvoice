import os
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from database import db, client
from seed import run_seed
from uploads import resolve_upload
from security import get_current_user
from routes_auth import router as auth_router
from routes_public import router as public_router
from routes_pro import router as pro_router
from routes_admin import router as admin_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("quoteflow")

app = FastAPI(title="Quote Flow API", docs_url=None, redoc_url=None, openapi_url=None)
api_router = APIRouter(prefix="/api")

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
frontend_url = os.environ.get("FRONTEND_URL")
if frontend_url and frontend_url not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(frontend_url)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Request body limit (35 MB covers max image batches)
    length = request.headers.get("content-length")
    if length and int(length) > 35 * 1024 * 1024:
        return JSONResponse({"detail": "Request too large"}, status_code=413)
    # CSRF mitigation: validate Origin on mutating requests
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("origin")
        if origin and ALLOWED_ORIGINS and origin not in ALLOWED_ORIGINS:
            from urllib.parse import urlparse
            origin_host = urlparse(origin).netloc
            if origin_host != request.headers.get("host"):
                logger.warning(f"Blocked origin={origin} host={request.headers.get('host')} path={request.url.path}")
                return JSONResponse({"detail": "Forbidden origin"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.url.path}")
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


@api_router.get("/")
async def root():
    return {"message": "Quote Flow API"}


@api_router.get("/health")
async def health():
    return {"ok": True}


@api_router.get("/files/{kind}/{filename}")
async def serve_file(kind: str, filename: str, request: Request):
    path = resolve_upload(kind, filename)
    if kind == "requests":
        user = await get_current_user(request)
        if user["role"] not in ("pro", "admin"):
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Forbidden")
    media = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[filename.rsplit(".", 1)[1]]
    return FileResponse(path, media_type=media, headers={"X-Content-Type-Options": "nosniff",
                                                         "Cache-Control": "private, max-age=86400"})


app.include_router(auth_router, prefix="/api")
app.include_router(public_router, prefix="/api")
app.include_router(pro_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS or ["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await run_seed()
    logger.info("Quote Flow API started (seed complete)")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
