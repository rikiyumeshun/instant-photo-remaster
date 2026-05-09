import type { DetectionResult, Point, Quad } from "./types";
import { getCanvasContext } from "./canvas";

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
};

type MaskStrategy = "strict" | "tolerant" | "dark";

type ImageStats = {
  p70: number;
  p80: number;
  p90: number;
  p95: number;
  average: number;
};

type Candidate = Bounds & {
  score: number;
  quad: Quad;
  touchesEdge: number;
  strategy: MaskStrategy;
  areaRatio: number;
  ratio: number;
  ringScore: number;
  mask: Uint8Array;
  candidateCount: number;
};

export function defaultQuad(width: number, height: number): Quad {
  const insetX = width * 0.04;
  const insetY = height * 0.04;
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ];
}

export function detectInstantPhotoFrame(canvas: HTMLCanvasElement): DetectionResult {
  const ctx = getCanvasContext(canvas);
  const { width, height } = canvas;
  const sampleCanvas = document.createElement("canvas");
  const sampleMax = 560;
  const scale = Math.min(1, sampleMax / Math.max(width, height));
  sampleCanvas.width = Math.max(1, Math.round(width * scale));
  sampleCanvas.height = Math.max(1, Math.round(height * scale));
  const sampleCtx = getCanvasContext(sampleCanvas);
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);

  const data = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const stats = analyzeBrightness(data.data);
  const candidates = findCandidatesAcrossStrategies(data.data, sampleCanvas.width, sampleCanvas.height, stats);
  const candidate = candidates[0] ?? null;

  if (!candidate) {
    return {
      quad: defaultQuad(width, height),
      confidence: 0.08,
      method: "fallback",
      strategy: "fallback",
      message: "白枠を自動検出できませんでした。四隅を白枠の外側に手動で合わせてください。",
      debug: {
        strategy: "fallback",
        candidateCount: 0,
        reason: "no_candidate",
        maskPreviewUrl: createMaskPreviewUrl(buildWhiteMask(data.data, sampleCanvas.width, sampleCanvas.height, stats, "tolerant"), sampleCanvas.width, sampleCanvas.height),
      },
    };
  }

  const quad = candidate.quad.map((point) => scalePoint(point, 1 / scale)) as Quad;

  // Touch original context once so browser decodes backing store before the next step.
  ctx.getImageData(0, 0, 1, 1);

  const confidence = clamp(candidate.score, 0.18, 0.92);
  return {
    quad,
    confidence,
    method: "heuristic",
    strategy: candidate.strategy,
    message: confidence < 0.55 ? "自動検出が怪しいため、白枠の外側四隅に手動で合わせてください。" : undefined,
    debug: {
      strategy: candidate.strategy,
      candidateCount: candidate.candidateCount,
      bestScore: round(candidate.score),
      areaRatio: round(candidate.areaRatio),
      ratio: round(candidate.ratio),
      edgeTouches: candidate.touchesEdge,
      ringScore: round(candidate.ringScore),
      reason: confidence < 0.55 ? "low_confidence" : "selected",
      maskPreviewUrl: createMaskPreviewUrl(candidate.mask, sampleCanvas.width, sampleCanvas.height),
    },
  };
}

function analyzeBrightness(data: Uint8ClampedArray): ImageStats {
  const values: number[] = [];
  let total = 0;
  const step = Math.max(4, Math.floor(data.length / 60000) * 4);
  for (let i = 0; i < data.length; i += step) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    values.push(brightness);
    total += brightness;
  }
  values.sort((a, b) => a - b);
  return {
    p70: percentile(values, 0.7),
    p80: percentile(values, 0.8),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
    average: total / Math.max(1, values.length),
  };
}

function findCandidatesAcrossStrategies(data: Uint8ClampedArray, width: number, height: number, stats: ImageStats): Candidate[] {
  const all: Candidate[] = [];
  for (const strategy of ["strict", "tolerant", "dark"] as const) {
    const rawMask = buildWhiteMask(data, width, height, stats, strategy);
    const mask = closeMask(rawMask, width, height, strategy === "strict" ? 1 : 2);
    const candidates = bestFrameCandidates(mask, data, width, height, strategy);
    all.push(...candidates.map((candidate) => ({ ...candidate, candidateCount: candidates.length })));
  }
  return all.sort((a, b) => b.score - a.score);
}

function buildWhiteMask(data: Uint8ClampedArray, width: number, height: number, stats: ImageStats, strategy: MaskStrategy): Uint8Array {
  const mask = new Uint8Array(width * height);
  const thresholds = getStrategyThresholds(stats, strategy);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const chroma = max - min;
    const warmth = Math.max(0, r - b);
    const whiteness = brightness - chroma * thresholds.chromaPenalty + Math.min(warmth, 34) * thresholds.warmAllowance;
    const lowChroma = chroma <= thresholds.maxChroma || (warmth > 10 && chroma <= thresholds.warmChroma);

    if (brightness >= thresholds.minBrightness && whiteness >= thresholds.minWhiteness && lowChroma) {
      mask[index] = 1;
    }
  }

  return mask;
}

function getStrategyThresholds(stats: ImageStats, strategy: MaskStrategy): { minBrightness: number; minWhiteness: number; maxChroma: number; warmChroma: number; chromaPenalty: number; warmAllowance: number } {
  const darkScene = stats.average < 116 || stats.p90 < 165;
  const brightScene = stats.p95 > 236;
  if (strategy === "strict") {
    return {
      minBrightness: clamp(Math.max(176, stats.p80 - 8), 160, brightScene ? 218 : 206),
      minWhiteness: clamp(stats.p90 - 22, 148, 218),
      maxChroma: 42,
      warmChroma: 58,
      chromaPenalty: 0.55,
      warmAllowance: 0.12,
    };
  }
  if (strategy === "dark") {
    return {
      minBrightness: clamp(Math.max(118, stats.p70 - 10), darkScene ? 104 : 126, 176),
      minWhiteness: clamp(stats.p80 - 34, 104, 176),
      maxChroma: 74,
      warmChroma: 96,
      chromaPenalty: 0.42,
      warmAllowance: 0.22,
    };
  }
  return {
    minBrightness: clamp(Math.max(142, stats.p70 - 4), 124, brightScene ? 206 : 188),
    minWhiteness: clamp(stats.p80 - 28, 118, 196),
    maxChroma: 62,
    warmChroma: 84,
    chromaPenalty: 0.48,
    warmAllowance: 0.18,
  };
}

function closeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return erodeMask(dilateMask(mask, width, height, radius), width, height, radius);
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx]) {
            found = true;
            break;
          }
        }
      }
      output[y * width + x] = found ? 1 : 0;
    }
  }
  return output;
}

function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]) {
            keep = false;
            break;
          }
        }
      }
      output[y * width + x] = keep ? 1 : 0;
    }
  }
  return output;
}

function bestFrameCandidates(mask: Uint8Array, data: Uint8ClampedArray, width: number, height: number, strategy: MaskStrategy): Candidate[] {
  const visited = new Uint8Array(mask.length);
  const candidates: Candidate[] = [];
  const queue: number[] = [];

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;
    visited[i] = 1;
    queue.length = 0;
    queue.push(i);
    const bounds = flood(mask, visited, queue, width, height);
    const candidate = scoreCandidate(bounds, data, width, height, mask, strategy);
    if (candidate) candidates.push(candidate);
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

function flood(mask: Uint8Array, visited: Uint8Array, queue: number[], width: number, height: number): Bounds {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const x = current % width;
    const y = Math.floor(current / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    count += 1;

    const neighbors = [current - 1, current + 1, current - width, current + width];
    for (const next of neighbors) {
      if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
      const nx = next % width;
      if (Math.abs(nx - x) > 1) continue;
      visited[next] = 1;
      queue.push(next);
    }
  }

  return { minX, minY, maxX, maxY, count };
}

function scoreCandidate(bounds: Bounds, data: Uint8ClampedArray, width: number, height: number, mask: Uint8Array, strategy: MaskStrategy): Candidate | null {
  const candidateWidth = bounds.maxX - bounds.minX + 1;
  const candidateHeight = bounds.maxY - bounds.minY + 1;
  const area = candidateWidth * candidateHeight;
  const imageArea = width * height;
  const areaRatio = area / imageArea;
  if (bounds.count < imageArea * 0.015 || areaRatio < 0.055) return null;

  const ratio = candidateWidth / Math.max(1, candidateHeight);
  const instantPortrait = closeness(ratio, 54 / 85, 0.72);
  const instantLandscape = closeness(ratio, 85 / 54, 1.05);
  const broadRatio = ratio > 0.36 && ratio < 2.45 ? 0.36 : 0;
  const ratioScore = Math.max(instantPortrait, instantLandscape, broadRatio);
  if (ratioScore < 0.2) return null;

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerDistance = Math.hypot(centerX / width - 0.5, centerY / height - 0.5);
  const centerScore = clamp(1 - centerDistance * 1.55, 0, 1);
  const touchesEdge = edgeTouches(bounds, width, height);
  const edgePenalty = touchesEdge >= 3 ? 0.58 : touchesEdge === 2 ? 0.34 : touchesEdge === 1 ? 0.12 : 0;
  const backgroundPenalty = areaRatio > 0.85 ? 0.52 + touchesEdge * 0.08 : 0;
  const fillRatio = bounds.count / area;
  const ringScore = measureRingScore(bounds, data, mask, width, height);
  const borderContrast = measureBorderContrast(bounds, data, width, height);
  const contrastScore = clamp(borderContrast / 38, 0, 1);
  const strategyBonus = strategy === "strict" ? 0.03 : strategy === "tolerant" ? 0.01 : -0.02;

  const quad = estimateQuadFromBounds(bounds, mask, width);
  const shapeScore = isSaneQuad(quad) ? 0.14 : -0.32;
  const score =
    areaRatio * 0.34 +
    ratioScore * 0.25 +
    centerScore * 0.14 +
    contrastScore * 0.17 +
    ringScore * 0.36 +
    fillRatio * 0.06 +
    shapeScore +
    strategyBonus -
    edgePenalty -
    backgroundPenalty;

  return score > 0.16 ? { ...bounds, score, quad, touchesEdge, strategy, areaRatio, ratio, ringScore, mask, candidateCount: 0 } : null;
}

function estimateQuadFromBounds(bounds: Bounds, mask: Uint8Array, width: number): Quad {
  const points: Point[] = [];
  const step = Math.max(1, Math.floor(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 210));

  for (let y = bounds.minY; y <= bounds.maxY; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      if (mask[y * width + x]) points.push({ x, y });
    }
  }

  if (points.length < 8) return boundsToQuad(bounds);

  const topLeft = extreme(points, (point) => point.x + point.y);
  const topRight = extreme(points, (point) => -point.x + point.y);
  const bottomRight = extreme(points, (point) => -point.x - point.y);
  const bottomLeft = extreme(points, (point) => point.x - point.y);
  const fallback = boundsToQuad(bounds);

  return [topLeft ?? fallback[0], topRight ?? fallback[1], bottomRight ?? fallback[2], bottomLeft ?? fallback[3]];
}

function boundsToQuad(bounds: Bounds): Quad {
  const pad = 2;
  return [
    { x: Math.max(0, bounds.minX - pad), y: Math.max(0, bounds.minY - pad) },
    { x: bounds.maxX + pad, y: Math.max(0, bounds.minY - pad) },
    { x: bounds.maxX + pad, y: bounds.maxY + pad },
    { x: Math.max(0, bounds.minX - pad), y: bounds.maxY + pad },
  ];
}

function measureRingScore(bounds: Bounds, data: Uint8ClampedArray, mask: Uint8Array, width: number, height: number): number {
  const w = bounds.maxX - bounds.minX + 1;
  const h = bounds.maxY - bounds.minY + 1;
  const side = Math.max(3, Math.round(Math.min(w, h) * 0.1));
  const top = sampleRegion(data, mask, width, height, bounds.minX, bounds.minY, bounds.maxX, bounds.minY + side);
  const left = sampleRegion(data, mask, width, height, bounds.minX, bounds.minY, bounds.minX + side, bounds.maxY);
  const right = sampleRegion(data, mask, width, height, bounds.maxX - side, bounds.minY, bounds.maxX, bounds.maxY);
  const bottom = sampleRegion(data, mask, width, height, bounds.minX, bounds.maxY - Math.round(side * 1.45), bounds.maxX, bounds.maxY);
  const inner = sampleRegion(
    data,
    mask,
    width,
    height,
    bounds.minX + Math.round(w * 0.18),
    bounds.minY + Math.round(h * 0.16),
    bounds.maxX - Math.round(w * 0.18),
    bounds.maxY - Math.round(h * 0.24),
  );
  const borderWhite = (top.maskRatio + left.maskRatio + right.maskRatio + bottom.maskRatio * 1.1) / 4.1;
  const innerContrast = clamp((top.brightness + left.brightness + right.brightness + bottom.brightness) / 4 - inner.brightness, -20, 90);
  const innerColor = clamp(inner.chroma / 52, 0, 1);
  const bottomBias = clamp(bottom.maskRatio - top.maskRatio * 0.55, -0.1, 0.28);
  return clamp(borderWhite * 0.48 + (innerContrast / 90) * 0.32 + innerColor * 0.16 + bottomBias * 0.28, 0, 1);
}

function sampleRegion(data: Uint8ClampedArray, mask: Uint8Array, width: number, height: number, minX: number, minY: number, maxX: number, maxY: number): { brightness: number; chroma: number; maskRatio: number } {
  let brightness = 0;
  let chroma = 0;
  let maskCount = 0;
  let count = 0;
  const sx = clamp(Math.round(minX), 0, width - 1);
  const sy = clamp(Math.round(minY), 0, height - 1);
  const ex = clamp(Math.round(maxX), 0, width - 1);
  const ey = clamp(Math.round(maxY), 0, height - 1);
  const step = Math.max(1, Math.floor(Math.max(ex - sx, ey - sy) / 70));

  for (let y = sy; y <= ey; y += step) {
    for (let x = sx; x <= ex; x += step) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      brightness += (r + g + b) / 3;
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
      maskCount += mask[y * width + x] ? 1 : 0;
      count += 1;
    }
  }

  return {
    brightness: count ? brightness / count : 0,
    chroma: count ? chroma / count : 0,
    maskRatio: count ? maskCount / count : 0,
  };
}

function measureBorderContrast(bounds: Bounds, data: Uint8ClampedArray, width: number, height: number): number {
  const inset = Math.max(4, Math.round(Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.08));
  const outside = averageBrightness(data, width, height, bounds.minX - inset, bounds.minY - inset, bounds.maxX + inset, bounds.maxY + inset, bounds);
  const inside = averageBrightness(data, width, height, bounds.minX + inset, bounds.minY + inset, bounds.maxX - inset, bounds.maxY - inset);
  return Math.max(0, outside - inside);
}

function averageBrightness(data: Uint8ClampedArray, width: number, height: number, minX: number, minY: number, maxX: number, maxY: number, exclude?: Bounds): number {
  let total = 0;
  let count = 0;
  const sx = clamp(Math.round(minX), 0, width - 1);
  const sy = clamp(Math.round(minY), 0, height - 1);
  const ex = clamp(Math.round(maxX), 0, width - 1);
  const ey = clamp(Math.round(maxY), 0, height - 1);
  const step = Math.max(1, Math.floor(Math.max(ex - sx, ey - sy) / 80));

  for (let y = sy; y <= ey; y += step) {
    for (let x = sx; x <= ex; x += step) {
      if (exclude && x >= exclude.minX && x <= exclude.maxX && y >= exclude.minY && y <= exclude.maxY) continue;
      const offset = (y * width + x) * 4;
      total += (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
      count += 1;
    }
  }

  return count ? total / count : 0;
}

function createMaskPreviewUrl(mask: Uint8Array, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = getCanvasContext(canvas);
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i += 1) {
    const value = mask[i] ? 255 : 0;
    const offset = i * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function edgeTouches(bounds: Bounds, width: number, height: number): number {
  const marginX = width * 0.025;
  const marginY = height * 0.025;
  return [
    bounds.minX <= marginX,
    bounds.minY <= marginY,
    bounds.maxX >= width - marginX,
    bounds.maxY >= height - marginY,
  ].filter(Boolean).length;
}

function isSaneQuad(quad: Quad): boolean {
  const area = polygonArea(quad);
  const edges = quad.map((point, index) => {
    const next = quad[(index + 1) % quad.length];
    return Math.hypot(point.x - next.x, point.y - next.y);
  });
  return area > 50 && Math.min(...edges) > 4 && !segmentsIntersect(quad[0], quad[1], quad[2], quad[3]) && !segmentsIntersect(quad[1], quad[2], quad[3], quad[0]);
}

function polygonArea(points: Quad): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area / 2);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const ccw = (p1: Point, p2: Point, p3: Point) => (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function extreme(points: Point[], score: (point: Point) => number): Point | null {
  let best: Point | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const current = score(point);
    if (current < bestScore) {
      best = point;
      bestScore = current;
    }
  }
  return best;
}

function percentile(values: number[], percent: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * percent)))];
}

function closeness(value: number, target: number, tolerance: number): number {
  return clamp(1 - Math.abs(value - target) / tolerance, 0, 1);
}

function scalePoint(point: Point, scale: number): Point {
  return { x: point.x * scale, y: point.y * scale };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
