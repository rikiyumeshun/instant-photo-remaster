"""Smoke test for the AI server /health and /enhance endpoints."""

from __future__ import annotations

import io
import sys
import urllib.error
import urllib.request

from PIL import Image


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"
    health_url = f"{base_url.rstrip('/')}/health"
    enhance_url = f"{base_url.rstrip('/')}/enhance"

    print(f"GET {health_url}")
    with urllib.request.urlopen(health_url, timeout=10) as response:
        print(response.read().decode("utf-8"))

    buffer = io.BytesIO()
    Image.new("RGB", (320, 240), color=(180, 150, 140)).save(buffer, format="JPEG", quality=85)
    payload = buffer.getvalue()

    boundary = "----instant-photo-remaster"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="image"; filename="test.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + payload + f"\r\n--{boundary}--\r\n".encode("utf-8")

    request = urllib.request.Request(
        enhance_url,
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )

    print(f"POST {enhance_url}")
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            result = response.read()
            model = response.headers.get("X-AI-Model", "unknown")
            print(f"status={response.status} bytes={len(result)} x-ai-model={model}")
    except urllib.error.HTTPError as exc:
        print(f"status={exc.code} body={exc.read().decode('utf-8', errors='replace')}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
