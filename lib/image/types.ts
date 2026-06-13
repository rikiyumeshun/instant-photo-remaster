export type Point = {
  x: number;
  y: number;
};

export type Quad = [Point, Point, Point, Point];

export type BrightIntensity = "standard" | "strong" | "max";

export type EyeClarityLevel = 0 | 1 | 2 | 3;

export const EYE_CLARITY_LABELS: Record<EyeClarityLevel, string> = {
  0: "なし",
  1: "ほんの少し",
  2: "自然にくっきり",
  3: "強め",
};

export type EnhancementPreset = "natural" | "crisp" | "soft" | "retro" | "bright" | "whitePink";

export type BrightPreset = "bright" | "whitePink";

export function isBrightPreset(preset: EnhancementPreset): preset is BrightPreset {
  return preset === "bright" || preset === "whitePink";
}

export const BRIGHT_STYLE_PRESETS: BrightPreset[] = ["bright", "whitePink"];

export type EnhancementEngine = "local" | "device-ai" | "ai";

export type DeviceEnhanceQuality = "standard" | "high" | "max";

export type ErrorScope = "load" | "detect" | "perspective" | "enhance-local" | "enhance-device" | "enhance-ai" | "save" | "share";

export type NoticeKind = "success" | "error" | "warning" | "info";

export type Notice = {
  id: number;
  kind: NoticeKind;
  message: string;
};

export type PreprocessMode = "direct" | "perspective";

export type OutputMode = "frame" | "inner";

export type CropSettings = {
  top: number;
  side: number;
  bottom: number;
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export type ProcessingSizeLog = {
  input: ImageDimensions;
  aiOutput?: ImageDimensions;
  final: ImageDimensions;
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
  bright: "明るく盛る",
  whitePink: "白ピンク盛り",
  natural: "自然補正",
  crisp: "くっきり補正",
  soft: "やわらか補正",
  retro: "レトロ補正",
};

export const PRESET_ORDER: EnhancementPreset[] = ["bright", "whitePink", "natural", "crisp", "soft", "retro"];

export const BRIGHT_INTENSITY_LABELS: Record<BrightIntensity, string> = {
  standard: "標準",
  strong: "強め",
  max: "最大",
};
