import type { DeviceEnhanceQuality, EnhancementPreset } from "./types";
import { applyEnhancementPreset } from "./enhance";
import { getCanvasContext } from "./canvas";

type DeviceEnhanceOptions = {
  preset: EnhancementPreset;
  quality?: DeviceEnhanceQuality;
  scale?: number;
};

type DeviceConfig = {
  denoise: number;
  detail: number;
  microContrast: number;
};

const CONFIGS: Record<EnhancementPreset, DeviceConfig> = {
  natural: { denoise: 0.32, detail: 0.34, microContrast: 0.08 },
  crisp: { denoise: 0.24, detail: 0.56, microContrast: 0.14 },
  soft: { denoise: 0.42, detail: 0.18, microContrast: 0.03 },
  retro: { denoise: 0.28, detail: 0.22, microContrast: 0.04 },
};

const QUALITY_MULTIPLIERS: Record<DeviceEnhanceQuality, DeviceConfig> = {
  standard: { denoise: 0.78, detail: 0.76, microContrast: 0.82 },
  high: { denoise: 1, detail: 1, microContrast: 1 },
  max: { denoise: 1.18, detail: 1.24, microContrast: 0.88 },
};

const MAX_OUTPUT_EDGE: Record<DeviceEnhanceQuality, number> = {
  standard: 2600,
  high: 3200,
  max: 3600,
};

// Browser-only enhancement path. It does not send images to a server and can later
// be replaced by a WebGPU / ONNX super-resolution model behind the same API.
export async function enhanceOnDevice(source: HTMLCanvasElement, options: DeviceEnhanceOptions): Promise<HTMLCanvasElement> {
  const quality = options.quality ?? "high";
  const config = multiplyConfig(CONFIGS[options.preset], QUALITY_MULTIPLIERS[quality]);
  const requestedScale = options.scale ?? 2;
  const scale = Math.min(requestedScale, MAX_OUTPUT_EDGE[quality] / Math.max(source.width, source.height));
  const toned = applyEnhancementPreset(source, options.preset);
  await yieldToBrowser();

  const denoised = edgeAwareDenoise(toned, config.denoise);
  await yieldToBrowser();

  const upscaled = upscaleProgressive(denoised, scale);
  await yieldToBrowser();

  if (quality === "max") {
    edgeAwareDenoise(upscaled, config.denoise * 0.34);
    await yieldToBrowser();
  }

  enhanceLocalDetail(upscaled, config);
  return upscaled;
}

function multiplyConfig(base: DeviceConfig, multiplier: DeviceConfig): DeviceConfig {
  return {
    denoise: base.denoise * multiplier.denoise,
    detail: base.detail * multiplier.detail,
    microContrast: base.microContrast * multiplier.microContrast,
  };
}

function edgeAwareDenoise(source: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  const ctx = getCanvasContext(source);
  const image = ctx.getImageData(0, 0, source.width, source.height);
  const original = new Uint8ClampedArray(image.data);
  const width = source.width;
  const height = source.height;
  const strength = amount * 0.42;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const centerLuma = lumaAt(original, index);
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let weightSum = 0;

      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const sampleIndex = ((y + oy) * width + x + ox) * 4;
          const diff = Math.abs(centerLuma - lumaAt(original, sampleIndex));
          const spatial = ox === 0 && oy === 0 ? 1.4 : 1;
          const weight = Math.max(0, 1 - diff / 38) * spatial;
          sumR += original[sampleIndex] * weight;
          sumG += original[sampleIndex + 1] * weight;
          sumB += original[sampleIndex + 2] * weight;
          weightSum += weight;
        }
      }

      if (weightSum > 0) {
        image.data[index] = blendByte(original[index], sumR / weightSum, strength);
        image.data[index + 1] = blendByte(original[index + 1], sumG / weightSum, strength);
        image.data[index + 2] = blendByte(original[index + 2], sumB / weightSum, strength);
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return source;
}

function upscaleProgressive(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const output = document.createElement("canvas");
  output.width = Math.round(source.width * scale);
  output.height = Math.round(source.height * scale);
  const ctx = getCanvasContext(output);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (scale <= 1.5) {
    ctx.drawImage(source, 0, 0, output.width, output.height);
    return output;
  }

  const mid = document.createElement("canvas");
  mid.width = Math.round(source.width * Math.sqrt(scale));
  mid.height = Math.round(source.height * Math.sqrt(scale));
  const midCtx = getCanvasContext(mid);
  midCtx.imageSmoothingEnabled = true;
  midCtx.imageSmoothingQuality = "high";
  midCtx.drawImage(source, 0, 0, mid.width, mid.height);
  ctx.drawImage(mid, 0, 0, output.width, output.height);
  return output;
}

function enhanceLocalDetail(canvas: HTMLCanvasElement, config: DeviceConfig): void {
  const ctx = getCanvasContext(canvas);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const original = new Uint8ClampedArray(image.data);
  const blurred = blurredCopy(canvas, 1.05);
  const width = canvas.width;
  const height = canvas.height;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const edge = localEdgeStrength(original, width, x, y);
      const edgeWeight = Math.min(1, edge / 48);
      const detailAmount = config.detail * (0.55 + edgeWeight * 0.75);
      const contrast = 1 + config.microContrast * edgeWeight;

      for (let channel = 0; channel < 3; channel += 1) {
        const value = original[index + channel];
        const detail = value - blurred[index + channel];
        const contrasted = (value - 128) * contrast + 128;
        image.data[index + channel] = clampByte(contrasted + detail * detailAmount);
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}

function blurredCopy(source: HTMLCanvasElement, radius: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = getCanvasContext(canvas);
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function localEdgeStrength(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const left = lumaAt(data, (y * width + x - 1) * 4);
  const right = lumaAt(data, (y * width + x + 1) * 4);
  const top = lumaAt(data, ((y - 1) * width + x) * 4);
  const bottom = lumaAt(data, ((y + 1) * width + x) * 4);
  return Math.abs(right - left) + Math.abs(bottom - top);
}

function lumaAt(data: Uint8ClampedArray, index: number): number {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function blendByte(a: number, b: number, amount: number): number {
  return clampByte(a + (b - a) * amount);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 20));
}
