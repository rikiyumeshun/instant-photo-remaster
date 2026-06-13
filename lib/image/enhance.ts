import type { BrightIntensity, EnhancementPreset } from "./types";
import { cloneCanvas, getCanvasContext } from "./canvas";

export type EnhancementOptions = {
  brightIntensity?: BrightIntensity;
  /** After Real-ESRGAN: apply preset with reduced sharpen/denoise. */
  aiPostProcess?: boolean;
  sharpenScale?: number;
};

export const AI_POST_SHARPEN_SCALE = 0.6;
export const AI_POST_DENOISE_SCALE = 0.45;

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
  midtoneLift: number;
  whiteBoost: number;
  blackCrush: number;
  skinProtect: boolean;
  pinkTint: number;
  skinPinkBoost: number;
  whiteNeutralBoost: number;
  yellowSuppress: number;
  coolBias: number;
  whitePinkProfile: boolean;
};

type BrightTunable = Pick<
  PresetConfig,
  | "exposure"
  | "shadows"
  | "midtoneLift"
  | "whiteBoost"
  | "blackCrush"
  | "pinkTint"
  | "skinPinkBoost"
  | "sharpen"
  | "highlights"
  | "whiteNeutralBoost"
  | "yellowSuppress"
>;

const NEUTRAL_EXTRAS = {
  midtoneLift: 0,
  whiteBoost: 0,
  blackCrush: 0,
  skinProtect: false,
  pinkTint: 0,
  skinPinkBoost: 0,
  whiteNeutralBoost: 0,
  yellowSuppress: 0,
  coolBias: 0,
  whitePinkProfile: false,
};

const PRESETS: Record<Exclude<EnhancementPreset, "bright" | "whitePink">, PresetConfig> = {
  natural: { exposure: 8, contrast: 1.08, saturation: 1.06, warmth: 2, shadows: 10, highlights: 0.94, sharpen: 0.26, grain: 0, blackLift: 0, denoise: 0.35, ...NEUTRAL_EXTRAS },
  crisp: { exposure: 6, contrast: 1.18, saturation: 1.12, warmth: 0, shadows: 8, highlights: 0.92, sharpen: 0.55, grain: 0, blackLift: 0, denoise: 0.28, ...NEUTRAL_EXTRAS },
  soft: { exposure: 10, contrast: 1.02, saturation: 0.98, warmth: 3, shadows: 12, highlights: 0.86, sharpen: 0.12, grain: 1.2, blackLift: 4, denoise: 0.45, ...NEUTRAL_EXTRAS },
  retro: { exposure: 4, contrast: 0.98, saturation: 0.9, warmth: 9, shadows: 8, highlights: 0.9, sharpen: 0.16, grain: 3.3, blackLift: 12, denoise: 0.2, ...NEUTRAL_EXTRAS },
};

const BRIGHT_BASE: Omit<PresetConfig, keyof BrightTunable> = {
  contrast: 1.15,
  saturation: 1.14,
  warmth: 5,
  grain: 0,
  blackLift: -10,
  denoise: 0.3,
  skinProtect: true,
  coolBias: 0,
  whitePinkProfile: false,
};

const WHITE_PINK_BASE: Omit<PresetConfig, keyof BrightTunable> = {
  contrast: 1.14,
  saturation: 1.06,
  warmth: -2,
  grain: 0,
  blackLift: -11,
  denoise: 0.28,
  skinProtect: true,
  coolBias: 1.2,
  whitePinkProfile: true,
};

const BRIGHT_INTENSITY: Record<BrightIntensity, BrightTunable> = {
  standard: {
    exposure: 14,
    shadows: 20,
    midtoneLift: 10,
    whiteBoost: 0.12,
    blackCrush: 7,
    pinkTint: 0.72,
    skinPinkBoost: 0.78,
    sharpen: 0.52,
    highlights: 0.91,
    whiteNeutralBoost: 0,
    yellowSuppress: 0,
  },
  strong: {
    exposure: 22,
    shadows: 32,
    midtoneLift: 16,
    whiteBoost: 0.22,
    blackCrush: 12,
    pinkTint: 1,
    skinPinkBoost: 1,
    sharpen: 0.72,
    highlights: 0.84,
    whiteNeutralBoost: 0,
    yellowSuppress: 0,
  },
  max: {
    exposure: 30,
    shadows: 40,
    midtoneLift: 22,
    whiteBoost: 0.32,
    blackCrush: 15,
    pinkTint: 1.18,
    skinPinkBoost: 1.15,
    sharpen: 0.85,
    highlights: 0.78,
    whiteNeutralBoost: 0,
    yellowSuppress: 0,
  },
};

const WHITE_PINK_INTENSITY: Record<BrightIntensity, BrightTunable> = {
  standard: {
    exposure: 16,
    shadows: 22,
    midtoneLift: 14,
    whiteBoost: 0.2,
    blackCrush: 10,
    pinkTint: 0.88,
    skinPinkBoost: 0.92,
    sharpen: 0.58,
    highlights: 0.86,
    whiteNeutralBoost: 0.22,
    yellowSuppress: 0.55,
  },
  strong: {
    exposure: 24,
    shadows: 34,
    midtoneLift: 20,
    whiteBoost: 0.3,
    blackCrush: 13,
    pinkTint: 1.06,
    skinPinkBoost: 1.1,
    sharpen: 0.72,
    highlights: 0.8,
    whiteNeutralBoost: 0.34,
    yellowSuppress: 0.72,
  },
  max: {
    exposure: 32,
    shadows: 42,
    midtoneLift: 26,
    whiteBoost: 0.4,
    blackCrush: 15,
    pinkTint: 1.2,
    skinPinkBoost: 1.18,
    sharpen: 0.84,
    highlights: 0.74,
    whiteNeutralBoost: 0.42,
    yellowSuppress: 0.85,
  },
};

function resolvePresetConfig(preset: EnhancementPreset, brightIntensity: BrightIntensity = "strong"): PresetConfig {
  if (preset === "bright") return { ...BRIGHT_BASE, ...BRIGHT_INTENSITY[brightIntensity] };
  if (preset === "whitePink") return { ...WHITE_PINK_BASE, ...WHITE_PINK_INTENSITY[brightIntensity] };
  return PRESETS[preset];
}

export function applyEnhancementPreset(source: HTMLCanvasElement, preset: EnhancementPreset, options?: EnhancementOptions): HTMLCanvasElement {
  const config = resolvePresetConfig(preset, options?.brightIntensity);
  const sharpen = config.sharpen * resolveSharpenScale(options);
  const denoise = config.denoise * (options?.aiPostProcess ? AI_POST_DENOISE_SCALE : 1);
  const base = cloneCanvas(source);
  applyToneAndColor(base, config);
  const denoised = denoise > 0 ? blurBlend(base, denoise) : base;
  return unsharpMask(denoised, sharpen, config.grain);
}

function resolveSharpenScale(options?: EnhancementOptions): number {
  if (options?.sharpenScale !== undefined) return options.sharpenScale;
  if (options?.aiPostProcess) return AI_POST_SHARPEN_SCALE;
  return 1;
}

function applyToneAndColor(canvas: HTMLCanvasElement, config: PresetConfig): void {
  const ctx = getCanvasContext(canvas);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const balance = estimateWhiteBalance(data);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * balance.r + config.warmth;
    let g = data[i + 1] * balance.g;
    let b = data[i + 2] * balance.b - config.warmth * 0.45 - config.coolBias;

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const skin = config.skinProtect && isSkinLike(r, g, b, luma);
    const lip = config.whitePinkProfile && isLipLike(r, g, b, luma, skin);
    const shadowLift = Math.max(0, 1 - luma / 150) * config.shadows;
    const midtoneWeight = midtoneBell(luma);
    const midtoneBoost = config.midtoneLift * midtoneWeight;
    const highlightTame = highlightRollOff(luma, config.highlights, skin || lip);

    r = (r + shadowLift + config.exposure + midtoneBoost) * highlightTame;
    g = (g + shadowLift + config.exposure + midtoneBoost) * highlightTame;
    b = (b + shadowLift + config.exposure + midtoneBoost * 0.88 + config.coolBias * 0.35) * highlightTame;

    if (config.whiteBoost > 0 && luma >= 48) {
      const whiteWeight = whiteRegionWeight(r, g, b, luma, skin, config.whitePinkProfile);
      if (whiteWeight > 0) {
        const targetR = config.whitePinkProfile ? 252 : 255;
        const targetG = config.whitePinkProfile ? 251 : 255;
        const targetB = config.whitePinkProfile ? 255 : 255;
        r += (targetR - r) * config.whiteBoost * whiteWeight;
        g += (targetG - g) * config.whiteBoost * whiteWeight;
        b += (targetB - b) * config.whiteBoost * whiteWeight;
      }
    }

    if (config.blackCrush > 0) {
      const darkWeight = Math.max(0, 1 - luma / 52);
      r -= config.blackCrush * darkWeight;
      g -= config.blackCrush * darkWeight;
      b -= config.blackCrush * darkWeight * 1.06;
    }

    r = (r - 128) * config.contrast + 128 + config.blackLift;
    g = (g - 128) * config.contrast + 128 + config.blackLift;
    b = (b - 128) * config.contrast + 128 + config.blackLift * 0.9;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * config.saturation;
    g = gray + (g - gray) * config.saturation;
    b = gray + (b - gray) * config.saturation;

    if (config.whitePinkProfile) {
      ({ r, g, b } = applyWhitePinkFinishing(r, g, b, config, skin, lip));
    } else {
      ({ r, g, b } = applyPinkTint(r, g, b, config));
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }

  ctx.putImageData(image, 0, 0);
}

function applyWhitePinkFinishing(
  r: number,
  g: number,
  b: number,
  config: PresetConfig,
  skin: boolean,
  lip: boolean,
): { r: number; g: number; b: number } {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 48) return { r, g, b };

  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const whiteWeight = whiteRegionWeight(r, g, b, luma, skin, true);

  if (!skin && luma >= 58 && config.yellowSuppress > 0) {
    const yellowCast = Math.max(0, (r + g) * 0.5 - b - 8);
    if (yellowCast > 0 && chroma < 48) {
      const strength = config.yellowSuppress * Math.min(1, yellowCast / 28) * (1 - whiteWeight * 0.7);
      b += strength * 3.2;
      r -= strength * 1.4;
      g -= strength * 1.1;
    }
  }

  if (!skin && config.whiteNeutralBoost > 0) {
    const neutralWeight = neutralWhiteWeight(r, g, b, luma);
    if (neutralWeight > 0) {
      const push = config.whiteNeutralBoost * neutralWeight;
      r += (250 - r) * push * 0.92;
      g += (251 - g) * push * 0.96;
      b += (255 - b) * push;
    }
  }

  if (skin || lip) {
    const highlightFade = luma > 236 ? 0.35 : luma > 214 ? 0.65 : 1;
    const strength = Math.min(1, (lip ? config.skinPinkBoost * 1.15 : config.skinPinkBoost) * highlightFade);
    const orangeGuard = Math.max(0, Math.min(1, (r - g - 10) / 34));

    r += (4 + strength * 7) * (1 - orangeGuard * 0.35);
    b += 1.5 + strength * 3.5;
    g += 0.4 + strength * 0.55;

    if (skin && luma >= 120) {
      const whiteLift = Math.min(1, (luma - 118) / 90) * strength * 0.45;
      r += (252 - r) * whiteLift * 0.35;
      g += (251 - g) * whiteLift * 0.28;
      b += (255 - b) * whiteLift * 0.42;
    }
  } else if (whiteWeight < 0.55 && luma >= 72 && luma <= 205 && chroma >= 8 && config.pinkTint > 0) {
    const strength = config.pinkTint * midtoneBell(luma) * Math.min(1, chroma / 40) * 0.35;
    r += 1.5 + strength * 2;
    b += 0.8 + strength;
  }

  return { r, g, b };
}

function neutralWhiteWeight(r: number, g: number, b: number, luma: number): number {
  if (luma < 145) return 0;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma > 36) return 0;
  const neutral = 1 - chroma / 36;
  const bright = Math.min(1, (luma - 145) / 95);
  return neutral * bright;
}

function midtoneBell(luma: number): number {
  const center = 138;
  const spread = 78;
  const delta = (luma - center) / spread;
  return Math.exp(-delta * delta);
}

function highlightRollOff(luma: number, highlights: number, skin: boolean): number {
  const threshold = skin ? 232 : 202;
  const softness = skin ? 32 : 48;
  if (luma <= threshold) return 1;
  const t = Math.min(1, (luma - threshold) / softness);
  const eased = t * t * (3 - 2 * t);
  return 1 - (1 - highlights) * eased;
}

function whiteRegionWeight(r: number, g: number, b: number, luma: number, skin: boolean, whitePink = false): number {
  if (skin || luma < (whitePink ? 152 : 168)) return 0;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma > (whitePink ? 38 : 42)) return 0;
  const neutral = 1 - chroma / (whitePink ? 38 : 42);
  const bright = Math.min(1, (luma - (whitePink ? 152 : 168)) / (whitePink ? 88 : 72));
  return neutral * bright;
}

function isSkinLike(r: number, g: number, b: number, luma: number): boolean {
  if (luma < 35 || luma > 238) return false;
  if (r <= g || g <= b * 0.88) return false;
  const rg = r - g;
  const gb = g - b;
  return rg > 6 && rg < 92 && gb > 1 && gb < 72 && r > 55;
}

function isLipLike(r: number, g: number, b: number, luma: number, skin: boolean): boolean {
  if (!skin || luma < 45 || luma > 220) return false;
  const rg = r - g;
  return rg > 14 && r > g * 1.06 && r > b * 1.12 && g > b;
}

function applyPinkTint(r: number, g: number, b: number, config: PresetConfig): { r: number; g: number; b: number } {
  if (config.pinkTint <= 0 && config.skinPinkBoost <= 0) {
    return { r, g, b };
  }

  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 48) return { r, g, b };

  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const skin = isSkinLike(r, g, b, luma);
  const whiteWeight = whiteRegionWeight(r, g, b, luma, skin);
  if (whiteWeight > 0.6) return { r, g, b };

  let strength = 0;
  if (skin) {
    const highlightFade = luma > 232 ? 0.25 : luma > 212 ? 0.55 : 1;
    strength = config.skinPinkBoost * highlightFade;
  } else if (luma >= 68 && luma <= 208 && chroma >= 10) {
    strength = config.pinkTint * midtoneBell(luma) * Math.min(1, chroma / 46) * (1 - whiteWeight * 0.85);
  }

  if (strength <= 0) return { r, g, b };
  strength = Math.min(1, strength);

  const rBoost = skin ? 4 + strength * 6 : 2 + strength * 3;
  const bBoost = skin ? 1 + strength * 3 : 1 + strength;
  const gBoost = 0.12 + strength * 0.28;
  const orangeGuard = Math.max(0, Math.min(1, (r - g - 14) / 36));

  return {
    r: r + rBoost * strength * (1 - orangeGuard * 0.4),
    g: g + gBoost * strength,
    b: b + bBoost * strength,
  };
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
