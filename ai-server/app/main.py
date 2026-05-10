from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, UnidentifiedImageError

from app.processors.local_dummy import LocalDummyProcessor

app = FastAPI(title="Instant Photo Remaster AI Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
)

processor = LocalDummyProcessor()


@app.post("/enhance")
async def enhance(image: UploadFile = File(...)) -> Response:
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="JPEG, PNG, or WebP image is required.")

    try:
        raw = await image.read()
        source = Image.open(BytesIO(raw))
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
