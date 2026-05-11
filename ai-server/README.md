# Instant Photo Remaster AI Server

FastAPI based PoC server for AI enhancement routing. The current processor is a lightweight Pillow implementation, not a real AI model.

## Run

Recommended local setup with `uv`:

```bash
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Fallback with `venv` and `pip`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Render currently uses `requirements.txt` so the deployed free-tier service stays simple. Keep `pyproject.toml` and `requirements.txt` dependency versions aligned.

## Endpoint

`POST /enhance`

- multipart field: `image`
- accepted input: JPEG, PNG, WebP
- output: JPEG

Images are processed in memory and are not written to disk.

## Real-ESRGAN

`app/processors/realesrgan_processor.py` is a placeholder for a future Real-ESRGAN integration. Before adding it, verify model, weight, and dependency licenses for commercial use. GPU is recommended; CPU inference may be very slow.
