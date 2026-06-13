export type AIEnhanceOptions = {
  endpoint?: string;
  accessCode?: string;
  signal?: AbortSignal;
};

export type AIEnhanceResult = {
  blob: Blob;
  modelName?: string;
};

export async function enhanceWithAI(image: Blob, options: AIEnhanceOptions = {}): Promise<AIEnhanceResult> {
  const endpoint = options.endpoint ?? process.env.NEXT_PUBLIC_AI_ENHANCE_ENDPOINT;
  if (!endpoint) {
    throw new Error("AI高画質化サーバーが未設定です。ローカル補正をお試しください。");
  }
  const formData = new FormData();
  formData.append("image", image, "instant-photo.jpg");

  // This sends the user's photo to the configured AI enhancement server.
  // Callers must gate this behind explicit user consent.
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: options.accessCode ? { "x-ai-access-code": options.accessCode } : undefined,
      body: formData,
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("AIサーバーの起動または補正がタイムアウトしました。少し待って再実行するか、ローカル補正を使ってください。");
    }
    throw new Error("AIサーバーに接続できませんでした。少し待って再実行するか、ローカル補正を使ってください。");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      throw new Error("AIアクセスコードが正しくありません。コードを確認してください。");
    }
    if (response.status === 413) {
      throw new Error("画像が大きすぎます。少し縮小してからお試しください。");
    }
    if (response.status === 400 || response.status === 415) {
      throw new Error("AI補正に対応していない画像形式、または読み込めない画像です。JPEG、PNG、WebPをお試しください。");
    }
    if (response.status === 501) {
      throw new Error("AI高画質化サーバーで超解像モデルが未設定です。ローカル補正をお試しください。");
    }
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error("AIサーバーが起動中、または一時的に応答できません。少し待って再実行するか、ローカル補正を使ってください。");
    }

    let message = "AI補正サーバーでエラーが発生しました。";
    try {
      const payload = (await response.json()) as { error?: string; detail?: string };
      if (payload.error || payload.detail) message = payload.error ?? payload.detail ?? message;
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
