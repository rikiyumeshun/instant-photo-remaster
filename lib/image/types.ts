export type Point = {
  x: number;
  y: number;
};

export type Quad = [Point, Point, Point, Point];

export type EnhancementPreset = "natural" | "crisp" | "soft" | "retro";

export type EnhancementEngine = "local" | "device-ai" | "ai";

export type DeviceEnhanceQuality = "standard" | "high" | "max";

export type ErrorScope = "load" | "detect" | "perspective" | "enhance-local" | "enhance-device" | "enhance-ai" | "save" | "share";

export type OutputMode = "frame" | "inner";

export type CropSettings = {
  top: number;
  side: number;
  bottom: number;
};

export type ProcessedImage = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export type DetectionResult = {
  quad: Quad;
  confidence: number;
  method: "opencv" | "heuristic" | "fallback";
  strategy?: "white-region" | "inner-photo" | "edge-line" | "fallback";
  message?: string;
  debug?: {
    strategy?: string;
    candidateCount?: number;
    bestScore?: number;
    whiteRegionScore?: number;
    innerPhotoScore?: number;
    edgeLineScore?: number;
    areaRatio?: number;
    ratio?: number;
    edgeTouches?: number;
    reason?: string;
    ringScore?: number;
    innerPhotoBounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    maskPreviewUrl?: string;
  };
};

export const DEFAULT_CROP_SETTINGS: CropSettings = {
  top: 0.1,
  side: 0.075,
  bottom: 0.22,
};

export const PRESET_LABELS: Record<EnhancementPreset, string> = {
  natural: "自然補正",
  crisp: "くっきり補正",
  soft: "やわらか補正",
  retro: "レトロ補正",
};
