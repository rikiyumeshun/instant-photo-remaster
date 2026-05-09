import type { ProcessedImage } from "./types";

const MAX_PROCESSING_EDGE = 2400;

export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }

  try {
    const url = await readFileAsDataUrl(file);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error("画像を読み込めませんでした。JPEG、PNG、WebPをお試しください。");
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("画像を読み込めませんでした。"));
    };
    reader.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
}

export function imageToCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(image, 0, 0);
  return canvas;
}

export function resizeForProcessing(source: HTMLCanvasElement): ProcessedImage {
  const scale = Math.min(1, MAX_PROCESSING_EDGE / Math.max(source.width, source.height));
  if (scale === 1) {
    return { canvas: source, width: source.width, height: source.height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = getCanvasContext(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, width: canvas.width, height: canvas.height };
}

export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  getCanvasContext(canvas).drawImage(source, 0, 0);
  return canvas;
}

export function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvasを初期化できませんでした。");
  }
  return ctx;
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): string {
  return canvas.toDataURL(type, quality);
}
