export type Point = {
  x: number;
  y: number;
};

export type Quad = [Point, Point, Point, Point];

export type EnhancementPreset = "natural" | "crisp" | "soft" | "retro";

export type EnhancementEngine = "local" | "ai";

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
  strategy?: "strict" | "tolerant" | "dark" | "fallback";
  message?: string;
  debug?: {
    strategy?: string;
    candidateCount?: number;
    bestScore?: number;
    areaRatio?: number;
    ratio?: number;
    edgeTouches?: number;
    reason?: string;
    ringScore?: number;
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
