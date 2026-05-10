export const runtime = "nodejs";

type ErrorBody = {
  error: string;
};

export async function POST(request: Request): Promise<Response> {
  const serverUrl = process.env.AI_ENHANCE_SERVER_URL;
  if (!serverUrl) {
    return jsonError("AI enhancement server is not configured.", 501);
  }

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File)) {
    return jsonError("Image file is required.", 400);
  }

  const upstreamForm = new FormData();
  upstreamForm.append("image", image, image.name || "instant-photo.jpg");

  try {
    const upstream = await fetch(serverUrl, {
      method: "POST",
      body: upstreamForm,
    });

    if (!upstream.ok) {
      return jsonError("AI enhancement server failed.", 502);
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/jpeg") && !contentType.startsWith("image/png")) {
      return jsonError("AI enhancement server returned an unsupported response.", 502);
    }

    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-ai-model": upstream.headers.get("x-ai-model") ?? "local-dummy",
      },
    });
  } catch {
    return jsonError("AI enhancement server is unavailable.", 502);
  }
}

function jsonError(error: string, status: number): Response {
  const body: ErrorBody = { error };
  return Response.json(body, { status });
}
