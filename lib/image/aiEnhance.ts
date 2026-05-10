export type AIEnhanceOptions = {
  endpoint?: string;
  signal?: AbortSignal;
};

export type AIEnhanceResult = {
  blob: Blob;
  modelName?: string;
};

export async function enhanceWithAI(image: Blob, options: AIEnhanceOptions = {}): Promise<AIEnhanceResult> {
  const endpoint = options.endpoint ?? "/api/ai-enhance";
  const formData = new FormData();
  formData.append("image", image, "instant-photo.jpg");

  // This sends the user's photo to the configured AI enhancement server.
  // Callers must gate this behind explicit user consent.
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
    signal: options.signal,
  });

  if (!response.ok) {
    let message = "AI補正サーバーでエラーが発生しました。";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the generic user-facing message when the server returns non-JSON.
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/jpeg") && !contentType.startsWith("image/png")) {
    throw new Error("AI補正サーバーから画像以外のレスポンスが返りました。");
  }

  return {
    blob: await response.blob(),
    modelName: response.headers.get("x-ai-model") ?? undefined,
  };
}
