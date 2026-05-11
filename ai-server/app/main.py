import os
import time
from collections import defaultdict, deque
from io import BytesIO

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, UnidentifiedImageError

from app.processors.local_dummy import LocalDummyProcessor

app = FastAPI(title="Instant Photo Remaster AI Server")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

processor = LocalDummyProcessor()
allowed_access_codes = {
    code.strip()
    for code in os.getenv("AI_ACCESS_CODES", "").split(",")
    if code.strip()
}

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
MAX_IMAGE_EDGE = 5000
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 5
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

# PoC-only in-memory rate limiter. For production, move this to Redis or a
# managed gateway so limits survive restarts and work across multiple instances.
request_log: dict[str, deque[float]] = defaultdict(deque)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "processor": processor.name}


@app.post("/enhance")
async def enhance(request: Request, image: UploadFile = File(...), x_ai_access_code: str | None = Header(default=None)) -> Response:
    client_ip = get_client_ip(request)
    if is_rate_limited(client_ip):
        return JSONResponse(status_code=429, content={"error": "リクエストが多すぎます。少し待ってから再実行してください。"})

    if allowed_access_codes and (not x_ai_access_code or x_ai_access_code not in allowed_access_codes):
        raise HTTPException(status_code=402, detail="A valid AI access code is required.")

    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        return JSONResponse(status_code=400, content={"error": "対応している画像形式は JPEG / PNG / WebP です。"})

    try:
        raw = await image.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            return JSONResponse(status_code=413, content={"error": "画像が大きすぎます。10MB以下に縮小してからお試しください。"})

        source = Image.open(BytesIO(raw))
        width, height = source.size
        if width * height > MAX_IMAGE_PIXELS or max(width, height) > MAX_IMAGE_EDGE:
            return JSONResponse(status_code=413, content={"error": "画像が大きすぎます。16MP以下、最大辺5000px以下に縮小してからお試しください。"})

        source.load()
        result = processor.process(source)
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="画像を読み込めませんでした。JPEG / PNG / WebPをお試しください。") from exc
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": f"Enhancement failed: {exc}"})

    output = BytesIO()
    result.convert("RGB").save(output, format="JPEG", quality=92, optimize=True)
    return Response(
        content=output.getvalue(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store",
            "X-AI-Model": processor.name,
        },
    )


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def is_rate_limited(client_ip: str) -> bool:
    now = time.monotonic()
    entries = request_log[client_ip]
    while entries and now - entries[0] > RATE_LIMIT_WINDOW_SECONDS:
        entries.popleft()
    if len(entries) >= RATE_LIMIT_MAX_REQUESTS:
        return True
    entries.append(now)
    return False
