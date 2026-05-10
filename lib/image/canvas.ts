import type { ProcessedImage } from "./types";

const MAX_PROCESSING_EDGE = 2400;
export const MAX_UPLOAD_WARNING_BYTES = 20 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  if (!isSupportedImageFile(file)) {
    throw new Error("対応していない画像形式です。JPEG、PNG、WebP、HEICをお試しください。");
  }

  let url: string | null = null;
  try {
    const blob = isHeicFile(file) ? await convertHeicToJpeg(file) : file;
    url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } catch (error) {
    if (isHeicFile(file)) {
      throw new Error("HEIC画像を変換できませんでした。iPhone側でJPEGとして共有するか、JPEG/PNGに変換してからお試しください。");
    }
    if (error instanceof Error) throw error;
    throw new Error("画像を読み込めませんでした。JPEG、PNG、WebP、HEICをお試しください。");
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function isSupportedImageFile(file: File): boolean {
  if (isHeicFile(file)) return true;
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

async function convertHeicToJpeg(file: File): Promise<Blob> {
  try {
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return Array.isArray(result) ? result[0] : result;
  } catch {
    throw new Error("HEIC画像を変換できませんでした。");
  }
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
