import os
from io import BytesIO

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
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
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "processor": processor.name}


@app.post("/enhance")
async def enhance(image: UploadFile = File(...), x_ai_access_code: str | None = Header(default=None)) -> Response:
    if allowed_access_codes and (not x_ai_access_code or x_ai_access_code not in allowed_access_codes):
        raise HTTPException(status_code=402, detail="A valid AI access code is required.")

    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="JPEG, PNG, or WebP image is required.")

    try:
        raw = await image.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            return JSONResponse(status_code=413, content={"error": "Image file is too large. Maximum upload size is 10MB."})

        source = Image.open(BytesIO(raw))
        width, height = source.size
        if width * height > MAX_IMAGE_PIXELS or max(width, height) > MAX_IMAGE_EDGE:
            return JSONResponse(status_code=413, content={"error": "Image dimensions are too large. Maximum size is 16MP and 5000px on the longest edge."})

        source.load()
        result = processor.process(source)
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Could not decode image.") from exc
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
