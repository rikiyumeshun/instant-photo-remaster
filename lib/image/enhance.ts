import type { EnhancementPreset } from "./types";
import { cloneCanvas, getCanvasContext } from "./canvas";

type PresetConfig = {
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
  shadows: number;
  highlights: number;
  sharpen: number;
  grain: number;
  blackLift: number;
  denoise: number;
};

const PRESETS: Record<EnhancementPreset, PresetConfig> = {
  natural: { exposure: 8, contrast: 1.08, saturation: 1.06, warmth: 2, shadows: 10, highlights: 0.94, sharpen: 0.26, grain: 0, blackLift: 0, denoise: 0.35 },
  crisp: { exposure: 6, contrast: 1.18, saturation: 1.12, warmth: 0, shadows: 8, highlights: 0.92, sharpen: 0.55, grain: 0, blackLift: 0, denoise: 0.28 },
  soft: { exposure: 10, contrast: 1.02, saturation: 0.98, warmth: 3, shadows: 12, highlights: 0.86, sharpen: 0.12, grain: 1.2, blackLift: 4, denoise: 0.45 },
  retro: { exposure: 4, contrast: 0.98, saturation: 0.9, warmth: 9, shadows: 8, highlights: 0.9, sharpen: 0.16, grain: 3.3, blackLift: 12, denoise: 0.2 },
};

export function applyEnhancementPreset(source: HTMLCanvasElement, preset: EnhancementPreset): HTMLCanvasElement {
  const config = PRESETS[preset];
  const base = cloneCanvas(source);
  applyToneAndColor(base, config);
  const denoised = config.denoise > 0 ? blurBlend(base, config.denoise) : base;
  return unsharpMask(denoised, config.sharpen, config.grain);
}

function applyToneAndColor(canvas: HTMLCanvasElement, config: PresetConfig): void {
  const ctx = getCanvasContext(canvas);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const balance = estimateWhiteBalance(data);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * balance.r + config.warmth;
    let g = data[i + 1] * balance.g;
    let b = data[i + 2] * balance.b - config.warmth * 0.45;

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadowLift = Math.max(0, 1 - luma / 150) * config.shadows;
    const highlightTame = luma > 210 ? 1 - (1 - config.highlights) * ((luma - 210) / 45) : 1;
    r = (r + shadowLift + config.exposure) * highlightTame;
    g = (g + shadowLift + config.exposure) * highlightTame;
    b = (b + shadowLift + config.exposure) * highlightTame;

    r = (r - 128) * config.contrast + 128 + config.blackLift;
    g = (g - 128) * config.contrast + 128 + config.blackLift;
    b = (b - 128) * config.contrast + 128 + config.blackLift;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * config.saturation;
    g = gray + (g - gray) * config.saturation;
    b = gray + (b - gray) * config.saturation;

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }

  ctx.putImageData(image, 0, 0);
}

function estimateWhiteBalance(data: Uint8ClampedArray): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const step = Math.max(4, Math.floor(data.length / 28000) * 4);

  for (let i = 0; i < data.length; i += step) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness > 40 && brightness < 238) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }

  if (count === 0) return { r: 1, g: 1, b: 1 };
  const avgR = r / count;
  const avgG = g / count;
  const avgB = b / count;
  const gray = (avgR + avgG + avgB) / 3;
  return {
    r: clamp(gray / avgR, 0.9, 1.1),
    g: clamp(gray / avgG, 0.92, 1.08),
    b: clamp(gray / avgB, 0.9, 1.12),
  };
}

function blurBlend(source: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  const output = cloneCanvas(source);
  const ctx = getCanvasContext(output);
  const blur = document.createElement("canvas");
  blur.width = source.width;
  blur.height = source.height;
  const blurCtx = getCanvasContext(blur);
  blurCtx.filter = "blur(0.85px)";
  blurCtx.drawImage(source, 0, 0);
  ctx.globalAlpha = amount * 0.28;
  ctx.drawImage(blur, 0, 0);
  ctx.globalAlpha = 1;
  return output;
}

function unsharpMask(source: HTMLCanvasElement, amount: number, grain: number): HTMLCanvasElement {
  const ctx = getCanvasContext(source);
  const original = ctx.getImageData(0, 0, source.width, source.height);
  const blur = document.createElement("canvas");
  blur.width = source.width;
  blur.height = source.height;
  const blurCtx = getCanvasContext(blur);
  blurCtx.filter = "blur(1.1px)";
  blurCtx.drawImage(source, 0, 0);
  const blurred = blurCtx.getImageData(0, 0, blur.width, blur.height);

  for (let i = 0; i < original.data.length; i += 4) {
    const noise = grain ? (pseudoRandom(i) - 0.5) * grain : 0;
    original.data[i] = clampByte(original.data[i] + (original.data[i] - blurred.data[i]) * amount + noise);
    original.data[i + 1] = clampByte(original.data[i + 1] + (original.data[i + 1] - blurred.data[i + 1]) * amount + noise);
    original.data[i + 2] = clampByte(original.data[i + 2] + (original.data[i + 2] - blurred.data[i + 2]) * amount + noise);
  }

  ctx.putImageData(original, 0, 0);
  return source;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
