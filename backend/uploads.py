import io
import re
import secrets
from pathlib import Path
from fastapi import HTTPException, UploadFile
from PIL import Image

UPLOAD_DIR = Path("/app/backend/uploads")
KINDS = {"logos", "avatars", "portfolio", "watermarks", "requests"}

EXT_MAP = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
MIME_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

for k in KINDS:
    (UPLOAD_DIR / k).mkdir(parents=True, exist_ok=True)


async def save_image(file: UploadFile, kind: str, settings: dict) -> str:
    """Validate MIME, extension, real content, dimensions and size. Re-encode and store under a random name."""
    if kind not in KINDS:
        raise HTTPException(400, "Invalid upload type")
    allowed = settings.get("image_allowed_types", list(MIME_MAP.keys()))
    max_bytes = int(settings.get("image_max_mb", 5)) * 1024 * 1024
    max_dim = int(settings.get("image_max_dimension", 2048))

    if file.content_type not in MIME_MAP or file.content_type not in allowed:
        raise HTTPException(400, f"Unsupported image type: {file.content_type}. Allowed: {', '.join(allowed)}")

    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(400, f"Image exceeds max size of {settings.get('image_max_mb', 5)} MB")
    if len(data) < 32:
        raise HTTPException(400, "Invalid image file")

    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()
        img = Image.open(io.BytesIO(data))
    except Exception:
        raise HTTPException(400, "File content is not a valid image")

    fmt = img.format if img.format in EXT_MAP else None
    if not fmt or EXT_MAP[fmt] != MIME_MAP[file.content_type]:
        raise HTTPException(400, "Image content does not match declared type")

    if img.width > max_dim * 2 or img.height > max_dim * 2:
        raise HTTPException(400, f"Image dimensions too large (max {max_dim}px)")

    if fmt == "PNG" and kind == "watermarks":
        out = img.convert("RGBA")
        ext = "png"
    else:
        out = img.convert("RGB")
        ext = "jpg"
    out.thumbnail((max_dim, max_dim))

    name = f"{secrets.token_hex(16)}.{ext}"
    dest = UPLOAD_DIR / kind / name
    if ext == "png":
        out.save(dest, "PNG", optimize=True)
    else:
        out.save(dest, "JPEG", quality=85, optimize=True)
    return f"{kind}/{name}"


def delete_image(path: str):
    try:
        if path and not path.startswith("http"):
            p = UPLOAD_DIR / path
            if p.is_file() and p.resolve().is_relative_to(UPLOAD_DIR.resolve()):
                p.unlink()
    except Exception:
        pass


SAFE_NAME = re.compile(r"^[a-f0-9]{32}\.(jpg|png|webp)$")


def resolve_upload(kind: str, filename: str) -> Path:
    if kind not in KINDS or not SAFE_NAME.match(filename):
        raise HTTPException(404, "File not found")
    p = UPLOAD_DIR / kind / filename
    if not p.is_file():
        raise HTTPException(404, "File not found")
    return p
