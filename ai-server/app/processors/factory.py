import os

from app.processors.base import ImageProcessor
from app.processors.local_dummy import LocalDummyProcessor
from app.processors.realesrgan_processor import RealESRGANProcessor


def create_processor() -> ImageProcessor:
    kind = os.getenv("AI_PROCESSOR", "local_dummy").strip().lower()
    if kind in {"local_dummy", "dummy", "pillow"}:
        return LocalDummyProcessor()
    if kind in {"realesrgan", "real-esrgan", "esrgan"}:
        return RealESRGANProcessor()
    raise ValueError(f"Unknown AI_PROCESSOR: {kind}")
