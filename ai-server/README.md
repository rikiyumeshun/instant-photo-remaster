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

- Scale is **x2** only (not x4) to limit memory and latency.
- **CPU inference is supported** but can take tens of seconds to minutes depending on image size.
- **GPU (CUDA) is recommended** for Real-ESRGAN PyTorch backend.
- This is **not face restoration AI**. Faces may change slightly due to generative upscaling, but GFPGAN-style face rewrite is intentionally not included.
- Post-processing is intentionally minimal so you can evaluate pure super-resolution quality.
- Render free tier should keep `AI_PROCESSOR=local_dummy` unless you add GPU and heavy dependencies.

## Smoke test

With the server running:

```bash
python scripts/smoke_test_ai_server.py
```
