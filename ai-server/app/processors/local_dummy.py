from PIL import Image, ImageEnhance, ImageFilter

from app.processors.base import ImageProcessor


class LocalDummyProcessor(ImageProcessor):
    name = "local-dummy-pillow"

    def process(self, image: Image.Image) -> Image.Image:
        rgb = image.convert("RGB")
        width, height = rgb.size
        enlarged = rgb.resize((width * 2, height * 2), Image.Resampling.LANCZOS)
        contrasted = ImageEnhance.Contrast(enlarged).enhance(1.08)
        saturated = ImageEnhance.Color(contrasted).enhance(1.04)
        return saturated.filter(ImageFilter.UnsharpMask(radius=1.4, percent=115, threshold=3))
