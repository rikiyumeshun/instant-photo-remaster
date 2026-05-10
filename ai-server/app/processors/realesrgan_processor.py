from PIL import Image

from app.processors.base import ImageProcessor


class RealESRGANProcessor(ImageProcessor):
    name = "realesrgan"

    def process(self, image: Image.Image) -> Image.Image:
        # Future integration point for Real-ESRGAN or another commercial-safe
        # super-resolution backend. Keep model weights and runtime licensing
        # checks outside this PoC implementation.
        raise NotImplementedError("Real-ESRGAN processor is not implemented in this PoC.")
