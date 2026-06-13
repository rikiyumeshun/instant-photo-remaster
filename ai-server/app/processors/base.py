from abc import ABC, abstractmethod

from PIL import Image


class ImageProcessor(ABC):
    name = "base"

    @abstractmethod
    def process(self, image: Image.Image) -> Image.Image:
        pass

    def warmup(self) -> None:
        return None

    def health_info(self) -> dict[str, str | bool]:
        return {
            "processor": self.name,
            "ready": True,
            "backend": self.name,
            "device": "n/a",
            "max_input_edge": "n/a",
            "message": "Processor is ready.",
        }
