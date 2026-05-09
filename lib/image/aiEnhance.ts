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

  // Not wired into the UI yet: AI enhancement may send photos to a server,
  // so it must stay behind explicit user consent when implemented.
  throw new Error(`AI補正は準備中です。将来は ${endpoint} に画像を送って処理します。`);
}
