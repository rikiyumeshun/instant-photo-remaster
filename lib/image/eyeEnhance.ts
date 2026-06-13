import type { EyeClarityLevel } from "./types";
import { cloneCanvas, getCanvasContext } from "./canvas";

export type EyeEnhanceResult = {
  canvas: HTMLCanvasElement;
  applied: boolean;
  skippedReason?: string;
};

const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const LEFT_EYEBROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];
const RIGHT_EYEBROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];
const LEFT_IRIS = [474, 475, 476, 477, 473];
const RIGHT_IRIS = [469, 470, 471, 472, 468];

const STRENGTH: Record<Exclude<EyeClarityLevel, 0>, number> = {
  1: 0.38,
  2: 0.62,
  3: 0.88,
};

type Landmark = { x: number; y: number };

let landmarkerPromise: Promise<FaceLandmarkerLike | null> | null = null;

type FaceLandmarkerLike = {
  detect: (image: CanvasImageSource) => { faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>> };
};

export async function applyEyeClarity(source: HTMLCanvasElement, level: EyeClarityLevel): Promise<EyeEnhanceResult> {
  if (level === 0) return { canvas: source, applied: false };

  const strength = STRENGTH[level];
  const landmarks = await detectEyeLandmarks(source);
  if (!landmarks) {
    return { canvas: source, applied: false, skippedReason: "顔を検出できなかったため、目元補正はスキップしました。" };
  }

  const mask = buildEyeMask(source.width, source.height, landmarks);
  if (!maskHasSignal(mask)) {
    return { canvas: source, applied: false, skippedReason: "目元領域を特定できなかったため、目元補正はスキップしました。" };
  }

  const output = cloneCanvas(source);
  applyEyeRegionEnhancement(output, mask, strength);
  return { canvas: output, applied: true };
}

async function detectEyeLandmarks(source: HTMLCanvasElement): Promise<Landmark[] | null> {
  const landmarker = await getFaceLandmarker();
  if (!landmarker) return null;

  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  let detectCanvas = source;
  if (scale < 1) {
    detectCanvas = document.createElement("canvas");
    detectCanvas.width = Math.round(source.width * scale);
    detectCanvas.height = Math.round(source.height * scale);
    const ctx = getCanvasContext(detectCanvas);
    ctx.drawImage(source, 0, 0, detectCanvas.width, detectCanvas.height);
  }

  const result = landmarker.detect(detectCanvas);
  const points = result.faceLandmarks?.[0];
  if (!points || points.length < 468) return null;

  const inv = 1 / scale;
  const indices = [...LEFT_EYE, ...RIGHT_EYE, ...LEFT_EYEBROW, ...RIGHT_EYEBROW, ...LEFT_IRIS, ...RIGHT_IRIS];
  return indices.map((index) => ({
    x: points[index].x * detectCanvas.width * inv,
    y: points[index].y * detectCanvas.height * inv,
  }));
}

async function getFaceLandmarker(): Promise<FaceLandmarkerLike | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = initFaceLandmarker();
  }
  return landmarkerPromise;
}

async function initFaceLandmarker(): Promise<FaceLandmarkerLike | null> {
  try {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const wasmPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "IMAGE",
      numFaces: 1,
    });
    return landmarker as FaceLandmarkerLike;
  } catch {
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const wasmPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
      const vision = await FilesetResolver.forVisionTasks(wasmPath);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numFaces: 1,
      });
      return landmarker as FaceLandmarkerLike;
    } catch {
      return null;
    }
  }
}

function buildEyeMask(width: number, height: number, landmarks: Landmark[]): Float32Array {
  let offset = 0;
  const take = (count: number) => {
    const slice = landmarks.slice(offset, offset + count);
    offset += count;
    return slice;
  };

  const groups = [
    take(LEFT_EYE.length),
    take(RIGHT_EYE.length),
    take(LEFT_EYEBROW.length),
    take(RIGHT_EYEBROW.length),
    take(LEFT_IRIS.length),
    take(RIGHT_IRIS.length),
  ];

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const ctx = getCanvasContext(maskCanvas);

  ctx.fillStyle = "#ffffff";
  for (const group of groups) {
    const expanded = expandPolygon(group, 1.18);
    ctx.beginPath();
    expanded.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fill();
  }

  const blurPx = Math.max(5, Math.round(Math.max(width, height) * 0.012));
  const blurred = document.createElement("canvas");
  blurred.width = width;
  blurred.height = height;
  const bctx = getCanvasContext(blurred);
  bctx.filter = `blur(${blurPx}px)`;
  bctx.drawImage(maskCanvas, 0, 0);
  bctx.filter = "none";

  const data = bctx.getImageData(0, 0, width, height).data;
  const mask = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    mask[p] = data[i] / 255;
  }
  return mask;
}

function expandPolygon(points: Landmark[], factor: number): Landmark[] {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((point) => ({
    x: cx + (point.x - cx) * factor,
    y: cy + (point.y - cy) * factor,
  }));
}

function maskHasSignal(mask: Float32Array): boolean {
  let max = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] > max) max = mask[i];
  }
  return max > 0.08;
}

function applyEyeRegionEnhancement(canvas: HTMLCanvasElement, mask: Float32Array, strength: number): void {
  const ctx = getCanvasContext(canvas);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const blurred = boxBlur(copyImage(data, width, height), width, height, 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const m = mask[p];
      if (m < 0.04) continue;

      const i = p * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);

      const sharpAmount = strength * m * 0.55;
      r += (r - blurred[i]) * sharpAmount;
      g += (g - blurred[i + 1]) * sharpAmount;
      b += (b - blurred[i + 2]) * sharpAmount;

      const localContrast = 1 + strength * m * 0.1;
      r = (r - 128) * localContrast + 128;
      g = (g - 128) * localContrast + 128;
      b = (b - 128) * localContrast + 128;

      if (luma < 95) {
        const darkWeight = Math.max(0, 1 - luma / 95) * strength * m;
        r -= 5 * darkWeight;
        g -= 5 * darkWeight;
        b -= 4.5 * darkWeight;
      }

      if (luma > 168 && chroma < 34) {
        const scleraWeight = Math.min(1, (luma - 168) / 70) * strength * m;
        const yellow = Math.max(0, (r + g) * 0.5 - b - 6);
        b += (2.2 + yellow * 0.08) * scleraWeight;
        r -= (1.2 + yellow * 0.05) * scleraWeight;
        g -= (0.8 + yellow * 0.04) * scleraWeight;
        r += (252 - r) * scleraWeight * 0.12;
        g += (252 - g) * scleraWeight * 0.1;
        b += (255 - b) * scleraWeight * 0.14;
      }

      if (luma > 210 && chroma < 28) {
        const catchWeight = Math.min(1, (luma - 210) / 40) * strength * m * 0.45;
        r += (255 - r) * catchWeight * 0.08;
        g += (255 - g) * catchWeight * 0.07;
        b += (255 - b) * catchWeight * 0.09;
      }

      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
    }
  }

  ctx.putImageData(image, 0, 0);
}

function copyImage(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(data.slice(0, width * height * 4));
}

function boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const idx = (ny * width + nx) * 4;
          sr += data[idx];
          sg += data[idx + 1];
          sb += data[idx + 2];
          count += 1;
        }
      }
      const idx = (y * width + x) * 4;
      output[idx] = sr / count;
      output[idx + 1] = sg / count;
      output[idx + 2] = sb / count;
      output[idx + 3] = data[idx + 3];
    }
  }
  return output;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
