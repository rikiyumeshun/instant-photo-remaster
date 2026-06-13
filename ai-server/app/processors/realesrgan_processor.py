from __future__ import annotations

import os
import subprocess
import tempfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path

from PIL import Image

from app.processors.base import ImageProcessor
from app.processors.errors import ImageTooLargeError, ProcessingTimeoutError, ProcessorNotReadyError

MODEL_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
MODEL_FILENAME = "RealESRGAN_x2plus.pth"


class RealESRGANProcessor(ImageProcessor):
    name = "realesrgan-x2plus"
    scale = 2

    def __init__(self) -> None:
        self.max_input_edge = int(os.getenv("REALESRGAN_MAX_INPUT_EDGE", "1920"))
        self.timeout_seconds = int(os.getenv("AI_PROCESS_TIMEOUT_SECONDS", "120"))
        self.backend = os.getenv("REALESRGAN_BACKEND", "auto").strip().lower()
        self.ncnn_bin = os.getenv("REALESRGAN_NCNN_BIN", "").strip()
        self.ncnn_model = os.getenv("REALESRGAN_NCNN_MODEL", "realesrgan-x2plus").strip()
        self.model_dir = Path(os.getenv("REALESRGAN_MODEL_DIR", Path(__file__).resolve().parents[2] / "models"))
        self._torch_runner: _TorchRealESRGAN | None = None
        self._active_backend: str | None = None
        self._ready = False
        self._ready_message = "Real-ESRGAN processor is not initialized yet."
        self._device = "cpu"

    def health_info(self) -> dict[str, str | bool]:
        return {
            "processor": self.name,
            "ready": self._ready,
            "backend": self._active_backend or "uninitialized",
            "device": self._device,
            "max_input_edge": str(self.max_input_edge),
            "message": self._ready_message,
        }

    def warmup(self) -> None:
        self._ensure_backend()

    def process(self, image: Image.Image) -> Image.Image:
        self._ensure_backend()
        width, height = image.size
        max_edge = max(width, height)
        if max_edge > self.max_input_edge:
            raise ImageTooLargeError(
                f"画像が大きすぎます。Real-ESRGAN PoCでは最大辺{self.max_input_edge}px以下に縮小してからお試しください。"
            )

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(self._process_inner, image.convert("RGB"))
            try:
                return future.result(timeout=self.timeout_seconds)
            except FuturesTimeoutError as exc:
                raise ProcessingTimeoutError(
                    "Real-ESRGAN処理がタイムアウトしました。画像を縮小するか、ローカル補正をお試しください。"
                ) from exc

    def _process_inner(self, image: Image.Image) -> Image.Image:
        if self._active_backend == "ncnn":
            return self._process_ncnn(image)
        if self._active_backend == "torch" and self._torch_runner is not None:
            return self._torch_runner.process(image)
        raise ProcessorNotReadyError(self._ready_message)

    def _ensure_backend(self) -> None:
        if self._ready:
            return

        candidates = self._backend_candidates()
        errors: list[str] = []
        for backend in candidates:
            try:
                if backend == "ncnn":
                    self._validate_ncnn()
                    self._active_backend = "ncnn"
                    self._device = "ncnn-vulkan"
                    self.name = f"realesrgan-x2plus-{self.ncnn_model}-ncnn"
                    self._ready = True
                    self._ready_message = "Real-ESRGAN NCNN backend is ready."
                    return
                if backend == "torch":
                    self._torch_runner = _TorchRealESRGAN(
                        model_dir=self.model_dir,
                        timeout_seconds=self.timeout_seconds,
                    )
                    self._torch_runner.warmup()
                    self._active_backend = "torch"
                    self._device = self._torch_runner.device
                    self.name = f"realesrgan-x2plus-{self._device}"
                    self._ready = True
                    self._ready_message = f"Real-ESRGAN PyTorch backend is ready on {self._device}."
                    return
            except Exception as exc:  # noqa: BLE001 - collect all backend startup failures for PoC diagnostics
                errors.append(f"{backend}: {exc}")

        detail = " / ".join(errors) if errors else "No Real-ESRGAN backend configured."
        self._ready_message = (
            "Real-ESRGAN PoC is not ready. Install PyTorch dependencies "
            "(pip install -r requirements-realesrgan.txt) or set REALESRGAN_NCNN_BIN. "
            f"Details: {detail}"
        )
        raise ProcessorNotReadyError(self._ready_message)

    def _backend_candidates(self) -> list[str]:
        if self.backend == "ncnn":
            return ["ncnn"]
        if self.backend == "torch":
            return ["torch"]
        ordered: list[str] = []
        if self._resolve_ncnn_bin():
            ordered.append("ncnn")
        ordered.append("torch")
        return ordered

    def _resolve_ncnn_bin(self) -> str | None:
        if self.ncnn_bin and Path(self.ncnn_bin).exists():
            return self.ncnn_bin
        repo_root = Path(__file__).resolve().parents[2]
        for candidate in (
            repo_root / "bin" / "realesrgan-ncnn-vulkan.exe",
            repo_root / "bin" / "realesrgan-ncnn-vulkan",
            repo_root / "realesrgan-ncnn-vulkan.exe",
            repo_root / "realesrgan-ncnn-vulkan",
        ):
            if candidate.exists():
                return str(candidate)
        return None

    def _validate_ncnn(self) -> None:
        resolved = self._resolve_ncnn_bin()
        if not resolved:
            raise ProcessorNotReadyError(
                "REALESRGAN_NCNN_BIN is not set and no bundled realesrgan-ncnn-vulkan binary was found."
            )
        self.ncnn_bin = resolved

    def _process_ncnn(self, image: Image.Image) -> Image.Image:
        assert self.ncnn_bin
        with tempfile.TemporaryDirectory(prefix="realesrgan-") as tmp_dir:
            input_path = Path(tmp_dir) / "input.png"
            output_path = Path(tmp_dir) / "output.png"
            image.save(input_path, format="PNG")

            command = [
                self.ncnn_bin,
                "-i",
                str(input_path),
                "-o",
                str(output_path),
                "-n",
                self.ncnn_model,
                "-s",
                str(self.scale),
            ]
            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                )
            except subprocess.TimeoutExpired as exc:
                raise ProcessingTimeoutError(
                    "Real-ESRGAN NCNN処理がタイムアウトしました。画像を縮小するか、ローカル補正をお試しください。"
                ) from exc
            except OSError as exc:
                raise ProcessorNotReadyError(f"Real-ESRGAN NCNN binary failed to start: {exc}") from exc

            if completed.returncode != 0:
                stderr = (completed.stderr or completed.stdout or "").strip()
                raise ProcessorNotReadyError(f"Real-ESRGAN NCNN failed: {stderr or 'unknown error'}")

            if not output_path.exists():
                raise ProcessorNotReadyError("Real-ESRGAN NCNN did not produce an output image.")

            with Image.open(output_path) as result:
                return result.convert("RGB")


class _TorchRealESRGAN:
    def __init__(self, model_dir: Path, timeout_seconds: int) -> None:
        self.model_dir = model_dir
        self.timeout_seconds = timeout_seconds
        self.device = "cpu"
        self._upsampler = None

    def warmup(self) -> None:
        self._ensure_model()

    def process(self, image: Image.Image) -> Image.Image:
        self._ensure_model()
        import cv2
        import numpy as np

        assert self._upsampler is not None
        bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        try:
            output, _ = self._upsampler.enhance(bgr, outscale=2)
        except RuntimeError as exc:
            message = str(exc).lower()
            if "out of memory" in message or "cuda" in message:
                raise ProcessorNotReadyError(
                    "Real-ESRGAN実行時にメモリ不足またはGPUエラーが発生しました。画像を縮小して再試行してください。"
                ) from exc
            raise
        rgb = cv2.cvtColor(output, cv2.COLOR_BGR2RGB)
        return Image.fromarray(rgb)

    def _ensure_model(self) -> None:
        if self._upsampler is not None:
            return
        try:
            import torch
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer
        except ImportError as exc:
            raise ProcessorNotReadyError(
                "Real-ESRGAN PyTorch dependencies are missing. Install with: pip install -r requirements-realesrgan.txt"
            ) from exc

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        model_path = self._ensure_model_weights()
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        tile = 400 if self.device == "cuda" else 256
        self._upsampler = RealESRGANer(
            scale=2,
            model_path=str(model_path),
            model=model,
            tile=tile,
            tile_pad=10,
            pre_pad=0,
            half=self.device == "cuda",
            device=self.device,
        )

    def _ensure_model_weights(self) -> Path:
        self.model_dir.mkdir(parents=True, exist_ok=True)
        model_path = self.model_dir / MODEL_FILENAME
        if model_path.exists() and model_path.stat().st_size > 1_000_000:
            return model_path
        try:
            urllib.request.urlretrieve(MODEL_URL, model_path)
        except Exception as exc:  # noqa: BLE001
            raise ProcessorNotReadyError(
                f"Failed to download Real-ESRGAN weights to {model_path}: {exc}"
            ) from exc
        if not model_path.exists():
            raise ProcessorNotReadyError(f"Real-ESRGAN weights were not found at {model_path}.")
        return model_path
