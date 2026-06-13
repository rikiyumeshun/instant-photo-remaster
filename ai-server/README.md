# Instant Photo Remaster AI Server

FastAPI PoC server for AI super-resolution routing. The default processor is a lightweight Pillow dummy. Real-ESRGAN x2 super-resolution can be enabled for PoC testing.

## Processors

Switch with `AI_PROCESSOR`:

| Value | Description |
|---|---|
| `local_dummy` | Default. Pillow resize + light sharpen. No ML. |
| `realesrgan` | Real-ESRGAN x2 super-resolution PoC |

## Run (dummy)

```bash
cd ai-server
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Run (Real-ESRGAN PoC)

### Option A: PyTorch backend (recommended for local PoC)

CPU works but is slow. GPU (CUDA) is much faster when available.

```bash
cd ai-server
pip install -r requirements.txt -r requirements-realesrgan.txt
set AI_PROCESSOR=realesrgan
set REALESRGAN_BACKEND=torch
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

On first request, `RealESRGAN_x2plus.pth` is downloaded into `ai-server/models/`.

### Option B: NCNN Vulkan binary (lighter deploy, no PyTorch)

Download [realesrgan-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN/releases) and point to the binary:

```bash
set AI_PROCESSOR=realesrgan
set REALESRGAN_BACKEND=ncnn
set REALESRGAN_NCNN_BIN=C:\path\to\realesrgan-ncnn-vulkan.exe
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `AI_PROCESSOR` | `local_dummy` | `local_dummy` or `realesrgan` |
| `REALESRGAN_MODEL` | `x2plus` | `x2plus` or `x4plus` (x4 is much slower on CPU) |
| `REALESRGAN_BACKEND` | `auto` | `auto`, `torch`, or `ncnn` |
| `REALESRGAN_MAX_INPUT_EDGE` | `1920` | Reject larger images with 413 |
| `AI_PROCESS_TIMEOUT_SECONDS` | `120` | Processing timeout |
| `REALESRGAN_MODEL_DIR` | `ai-server/models` | Torch weights cache |
| `REALESRGAN_NCNN_BIN` | _(auto)_ | Path to ncnn binary |
| `REALESRGAN_NCNN_MODEL` | `realesrgan-x2plus` | NCNN model name |

## Endpoint

`POST /enhance`

- multipart field: `image`
- accepted input: JPEG, PNG, WebP
- output: JPEG
- response header: `X-AI-Model`

Images are processed in memory and are not written to disk.

## Health

`GET /health`

Returns processor name, readiness, backend, and device info.

## PoC notes

- Scale defaults to **x2** (`REALESRGAN_MODEL=x2plus`). **x4** (`x4plus`) is available but extremely slow on CPU and memory-heavy.
- Default max input edge is **1920px for x2** and **1280px for x4** unless overridden.
- **CPU inference is supported** but can take tens of seconds to minutes depending on image size.
- **GPU (CUDA) is recommended** for Real-ESRGAN PyTorch backend.
- This is **not face restoration AI**. Faces may change slightly due to generative upscaling, but GFPGAN-style face rewrite is intentionally not included.
- Post-processing is intentionally minimal so you can evaluate pure super-resolution quality.
- Render free tier should keep `AI_PROCESSOR=local_dummy` unless you add GPU and heavy dependencies.

## Python 3.12 + torch CPU notes

- Tested PoC path: **Python 3.12**, **torch CPU**, Real-ESRGAN x2.
- CPU works for verification, but large images are slow and memory-heavy.
- First torch startup may take a while while weights download into `ai-server/models/`.
- `/health` returns `degraded` when Real-ESRGAN dependencies are missing or incompatible.

## basicsr / torchvision compatibility

Newer `torchvision` removed `torchvision.transforms.functional_tensor`. Older `basicsr` still imports:

```python
from torchvision.transforms.functional_tensor import rgb_to_grayscale
```

This server applies an **automatic shim at startup** (`app/compat/torchvision_basicsr.py`) so you usually do not need to edit site-packages.

If the shim does not work in your environment, apply this manual workaround inside your Python environment:

1. Open `basicsr/data/degradations.py` in site-packages.
2. Replace:

```python
from torchvision.transforms.functional_tensor import rgb_to_grayscale
```

with:

```python
from torchvision.transforms.functional import rgb_to_grayscale
```

3. Restart uvicorn.

When this import error occurs, `/health` returns `status: degraded`, `error_kind: torchvision_basicsr_compat`, and a short explanation in `message`.

## Smoke test

With the server running:

```bash
python scripts/smoke_test_ai_server.py
```
