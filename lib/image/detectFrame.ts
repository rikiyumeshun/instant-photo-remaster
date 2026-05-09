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
type DetectionStrategy = "white-region" | "inner-photo" | "edge-line";

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
  strategy: DetectionStrategy;
  maskStrategy?: MaskStrategy;
  areaRatio: number;
  ratio: number;
  ringScore: number;
  mask: Uint8Array;
  candidateCount: number;
  innerPhotoBounds?: Bounds;
  lineScore?: number;
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
  const tolerantMask = closeMask(buildWhiteMask(data.data, sampleCanvas.width, sampleCanvas.height, stats, "tolerant"), sampleCanvas.width, sampleCanvas.height, 2);
  const candidates = findCandidatesAcrossStrategies(data.data, sampleCanvas.width, sampleCanvas.height, stats, tolerantMask);
  const candidate = candidates[0] ?? null;
  const debugScores = summarizeScores(candidates);

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
        ...debugScores,
        reason: "no_candidate",
        maskPreviewUrl: createMaskPreviewUrl(tolerantMask, sampleCanvas.width, sampleCanvas.height),
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
      ...debugScores,
      areaRatio: round(candidate.areaRatio),
      ratio: round(candidate.ratio),
      edgeTouches: candidate.touchesEdge,
      ringScore: round(candidate.ringScore),
      reason: confidence < 0.55 ? `low_confidence:${candidate.strategy}` : `selected:${candidate.strategy}`,
      innerPhotoBounds: candidate.innerPhotoBounds ? boundsToDebugRect(candidate.innerPhotoBounds) : undefined,
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

function summarizeScores(candidates: Candidate[]): { whiteRegionScore?: number; innerPhotoScore?: number; edgeLineScore?: number } {
  return {
    whiteRegionScore: round(Math.max(0, ...candidates.filter((candidate) => candidate.strategy === "white-region").map((candidate) => candidate.score))),
    innerPhotoScore: round(Math.max(0, ...candidates.filter((candidate) => candidate.strategy === "inner-photo").map((candidate) => candidate.score))),
    edgeLineScore: round(Math.max(0, ...candidates.filter((candidate) => candidate.strategy === "edge-line").map((candidate) => candidate.score))),
  };
}

function boundsToDebugRect(bounds: Bounds): { x: number; y: number; width: number; height: number } {
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX + 1,
    height: bounds.maxY - bounds.minY + 1,
  };
}

function findCandidatesAcrossStrategies(data: Uint8ClampedArray, width: number, height: number, stats: ImageStats, tolerantMask: Uint8Array): Candidate[] {
  const all: Candidate[] = [];
  for (const strategy of ["strict", "tolerant", "dark"] as const) {
    const rawMask = buildWhiteMask(data, width, height, stats, strategy);
    const mask = closeMask(rawMask, width, height, strategy === "strict" ? 1 : 2);
    const candidates = bestFrameCandidates(mask, data, width, height, strategy);
    all.push(...candidates.map((candidate) => ({ ...candidate, candidateCount: candidates.length })));
  }
  const innerPhoto = detectInnerPhotoCandidate(data, width, height, stats, tolerantMask);
  if (innerPhoto) all.push(innerPhoto);
  const edgeLine = detectEdgeLineCandidate(data, width, height, tolerantMask);
  if (edgeLine) all.push(edgeLine);
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
    const candidate = scoreWhiteRegionCandidate(bounds, data, width, height, mask, strategy);
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

function scoreWhiteRegionCandidate(bounds: Bounds, data: Uint8ClampedArray, width: number, height: number, mask: Uint8Array, maskStrategy: MaskStrategy): Candidate | null {
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
  const edgeBandScore = measureWhiteEdgeBands(bounds, mask, width, height);
  const strategyBonus = maskStrategy === "strict" ? 0.03 : maskStrategy === "tolerant" ? 0.01 : -0.02;

  const quad = estimateQuadFromBounds(bounds, mask, width);
  const shapeScore = isSaneQuad(quad) ? 0.14 : -0.32;
  const score =
    areaRatio * 0.34 +
    ratioScore * 0.25 +
    centerScore * 0.14 +
    contrastScore * 0.17 +
    ringScore * 0.36 +
    edgeBandScore * 0.18 +
    fillRatio * 0.06 +
    shapeScore +
    strategyBonus -
    edgePenalty -
    backgroundPenalty;

  return score > 0.16
    ? { ...bounds, score, quad, touchesEdge, strategy: "white-region", maskStrategy, areaRatio, ratio, ringScore, mask, candidateCount: 0 }
    : null;
}

function detectInnerPhotoCandidate(data: Uint8ClampedArray, width: number, height: number, stats: ImageStats, whiteMask: Uint8Array): Candidate | null {
  const photoMask = buildInnerPhotoMask(data, width, height, stats);
  const closed = closeMask(photoMask, width, height, 2);
  const components = collectBounds(closed, width, height)
    .map((bounds) => scoreInnerPhotoBounds(bounds, data, width, height, whiteMask))
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score);
  const best = components[0] ?? null;
  return best ? { ...best, candidateCount: components.length } : null;
}

function buildInnerPhotoMask(data: Uint8ClampedArray, width: number, height: number, stats: ImageStats): Uint8Array {
  const mask = new Uint8Array(width * height);
  const darkThreshold = clamp(stats.p70 - 8, 42, 178);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const brightness = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const photoLike = brightness < darkThreshold || (brightness < stats.p90 - 12 && chroma > 28);
    if (photoLike) mask[index] = 1;
  }
  return mask;
}

function scoreInnerPhotoBounds(inner: Bounds, data: Uint8ClampedArray, width: number, height: number, whiteMask: Uint8Array): Candidate | null {
  const imageArea = width * height;
  const innerWidth = inner.maxX - inner.minX + 1;
  const innerHeight = inner.maxY - inner.minY + 1;
  const innerAreaRatio = (innerWidth * innerHeight) / imageArea;
  if (innerAreaRatio < 0.06 || innerAreaRatio > 0.68) return null;

  const centerX = (inner.minX + inner.maxX) / 2;
  const centerY = (inner.minY + inner.maxY) / 2;
  const centerScore = clamp(1 - Math.hypot(centerX / width - 0.5, centerY / height - 0.48) * 1.55, 0, 1);
  const innerRatio = innerWidth / Math.max(1, innerHeight);
  const portraitScore = closeness(innerRatio, 46 / 62, 0.64);
  const landscapeScore = closeness(innerRatio, 62 / 46, 0.86);
  const landscape = landscapeScore > portraitScore;
  const ratioScore = Math.max(portraitScore, landscapeScore, innerRatio > 0.45 && innerRatio < 2.1 ? 0.28 : 0);
  if (ratioScore < 0.22) return null;

  const outer = estimateOuterFromInner(inner, width, height, landscape);
  const areaRatio = boundsArea(outer) / imageArea;
  if (areaRatio < 0.12 || areaRatio > 0.86) return null;
  const ratio = (outer.maxX - outer.minX + 1) / Math.max(1, outer.maxY - outer.minY + 1);
  const touchesEdge = edgeTouches(outer, width, height);
  const ringScore = measureRingScore(outer, data, whiteMask, width, height);
  const borderWhite = measureWhiteEdgeBands(outer, whiteMask, width, height);
  const innerStats = sampleRegion(data, whiteMask, width, height, inner.minX, inner.minY, inner.maxX, inner.maxY);
  const photoContentScore = clamp((255 - innerStats.brightness) / 150, 0, 1) * 0.55 + clamp(innerStats.chroma / 54, 0, 1) * 0.45;
  const bottomBias = estimateBottomMarginBias(outer, inner);
  const edgePenalty = touchesEdge >= 3 ? 0.46 : touchesEdge === 2 ? 0.22 : touchesEdge === 1 ? 0.08 : 0;
  const score =
    0.22 +
    centerScore * 0.16 +
    ratioScore * 0.2 +
    ringScore * 0.26 +
    borderWhite * 0.22 +
    photoContentScore * 0.22 +
    bottomBias * 0.12 -
    edgePenalty;

  return score > 0.22
    ? {
        ...outer,
        score,
        quad: boundsToQuad(outer),
        touchesEdge,
        strategy: "inner-photo",
        areaRatio,
        ratio,
        ringScore,
        mask: whiteMask,
        candidateCount: 0,
        innerPhotoBounds: inner,
      }
    : null;
}

function detectEdgeLineCandidate(data: Uint8ClampedArray, width: number, height: number, whiteMask: Uint8Array): Candidate | null {
  const left = bestVerticalEdge(data, width, height, Math.round(width * 0.03), Math.round(width * 0.36));
  const right = bestVerticalEdge(data, width, height, Math.round(width * 0.64), Math.round(width * 0.97));
  const top = bestHorizontalEdge(data, width, height, Math.round(height * 0.03), Math.round(height * 0.32));
  const bottom = bestHorizontalEdge(data, width, height, Math.round(height * 0.68), Math.round(height * 0.97));
  if (!left || !right || !top || !bottom) return null;

  const bounds = normalizeBounds({
    minX: Math.min(left.position, right.position),
    maxX: Math.max(left.position, right.position),
    minY: Math.min(top.position, bottom.position),
    maxY: Math.max(top.position, bottom.position),
    count: 0,
  }, width, height);
  const areaRatio = boundsArea(bounds) / (width * height);
  const ratio = (bounds.maxX - bounds.minX + 1) / Math.max(1, bounds.maxY - bounds.minY + 1);
  if (areaRatio < 0.12 || areaRatio > 0.88 || ratio < 0.32 || ratio > 2.6) return null;

  const ratioScore = Math.max(closeness(ratio, 54 / 85, 0.78), closeness(ratio, 85 / 54, 1.08), 0.24);
  const centerScore = clamp(1 - Math.hypot((bounds.minX + bounds.maxX) / 2 / width - 0.5, (bounds.minY + bounds.maxY) / 2 / height - 0.5) * 1.45, 0, 1);
  const lineScore = clamp((left.score + right.score + top.score + bottom.score) / 168, 0, 1);
  const ringScore = measureRingScore(bounds, data, whiteMask, width, height);
  const touchesEdge = edgeTouches(bounds, width, height);
  const edgePenalty = touchesEdge >= 3 ? 0.42 : touchesEdge === 2 ? 0.22 : touchesEdge === 1 ? 0.08 : 0;
  const score = 0.14 + lineScore * 0.32 + ringScore * 0.24 + ratioScore * 0.18 + centerScore * 0.14 - edgePenalty;

  return score > 0.2
    ? {
        ...bounds,
        score,
        quad: boundsToQuad(bounds),
        touchesEdge,
        strategy: "edge-line",
        areaRatio,
        ratio,
        ringScore,
        mask: whiteMask,
        candidateCount: 1,
        lineScore,
      }
    : null;
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

function collectBounds(mask: Uint8Array, width: number, height: number): Bounds[] {
  const visited = new Uint8Array(mask.length);
  const queue: number[] = [];
  const boundsList: Bounds[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;
    visited[i] = 1;
    queue.length = 0;
    queue.push(i);
    boundsList.push(flood(mask, visited, queue, width, height));
  }
  return boundsList;
}

function estimateOuterFromInner(inner: Bounds, width: number, height: number, landscape: boolean): Bounds {
  const innerWidth = inner.maxX - inner.minX + 1;
  const innerHeight = inner.maxY - inner.minY + 1;
  const outerWidthFromInner = landscape ? innerWidth / 0.73 : innerWidth / 0.85;
  const outerHeightFromInner = landscape ? innerHeight / 0.85 : innerHeight / 0.73;
  const outerWidth = Math.max(innerWidth * 1.12, outerWidthFromInner);
  const outerHeight = Math.max(innerHeight * 1.18, outerHeightFromInner);
  const sideMargin = (outerWidth - innerWidth) / 2;
  const topMargin = landscape ? (outerHeight - innerHeight) / 2 : outerHeight * 0.1;
  const bottomMargin = landscape ? (outerHeight - innerHeight) / 2 : outerHeight * 0.24;
  return normalizeBounds(
    {
      minX: Math.round(inner.minX - sideMargin),
      maxX: Math.round(inner.maxX + sideMargin),
      minY: Math.round(inner.minY - topMargin),
      maxY: Math.round(inner.maxY + bottomMargin),
      count: inner.count,
    },
    width,
    height,
  );
}

function estimateBottomMarginBias(outer: Bounds, inner: Bounds): number {
  const top = inner.minY - outer.minY;
  const bottom = outer.maxY - inner.maxY;
  const total = Math.max(1, top + bottom);
  return clamp(bottom / total - 0.5, 0, 0.45) / 0.45;
}

function normalizeBounds(bounds: Bounds, width: number, height: number): Bounds {
  const minX = clamp(Math.min(bounds.minX, bounds.maxX), 0, width - 1);
  const maxX = clamp(Math.max(bounds.minX, bounds.maxX), 0, width - 1);
  const minY = clamp(Math.min(bounds.minY, bounds.maxY), 0, height - 1);
  const maxY = clamp(Math.max(bounds.minY, bounds.maxY), 0, height - 1);
  return { ...bounds, minX, minY, maxX, maxY };
}

function boundsArea(bounds: Bounds): number {
  return Math.max(0, bounds.maxX - bounds.minX + 1) * Math.max(0, bounds.maxY - bounds.minY + 1);
}

function measureWhiteEdgeBands(bounds: Bounds, mask: Uint8Array, width: number, height: number): number {
  const w = bounds.maxX - bounds.minX + 1;
  const h = bounds.maxY - bounds.minY + 1;
  const band = Math.max(3, Math.round(Math.min(w, h) * 0.08));
  const top = maskRatio(mask, width, height, bounds.minX, bounds.minY, bounds.maxX, bounds.minY + band);
  const left = maskRatio(mask, width, height, bounds.minX, bounds.minY, bounds.minX + band, bounds.maxY);
  const right = maskRatio(mask, width, height, bounds.maxX - band, bounds.minY, bounds.maxX, bounds.maxY);
  const bottom = maskRatio(mask, width, height, bounds.minX, bounds.maxY - Math.round(band * 1.35), bounds.maxX, bounds.maxY);
  const presentEdges = [top, left, right, bottom].filter((value) => value > 0.22).length;
  return clamp((top + left + right + bottom * 1.12) / 4.12 + presentEdges * 0.055, 0, 1);
}

function maskRatio(mask: Uint8Array, width: number, height: number, minX: number, minY: number, maxX: number, maxY: number): number {
  let total = 0;
  let count = 0;
  const sx = clamp(Math.round(minX), 0, width - 1);
  const sy = clamp(Math.round(minY), 0, height - 1);
  const ex = clamp(Math.round(maxX), 0, width - 1);
  const ey = clamp(Math.round(maxY), 0, height - 1);
  const step = Math.max(1, Math.floor(Math.max(ex - sx, ey - sy) / 80));
  for (let y = sy; y <= ey; y += step) {
    for (let x = sx; x <= ex; x += step) {
      total += mask[y * width + x] ? 1 : 0;
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function bestVerticalEdge(data: Uint8ClampedArray, width: number, height: number, start: number, end: number): { position: number; score: number } | null {
  let best: { position: number; score: number } | null = null;
  const y0 = Math.round(height * 0.12);
  const y1 = Math.round(height * 0.88);
  for (let x = clamp(start, 2, width - 3); x <= clamp(end, 2, width - 3); x += 1) {
    let score = 0;
    let count = 0;
    for (let y = y0; y <= y1; y += 3) {
      score += pixelDifference(data, width, x - 2, y, x + 2, y);
      count += 1;
    }
    const normalized = count ? score / count : 0;
    if (!best || normalized > best.score) best = { position: x, score: normalized };
  }
  return best && best.score > 10 ? best : null;
}

function bestHorizontalEdge(data: Uint8ClampedArray, width: number, height: number, start: number, end: number): { position: number; score: number } | null {
  let best: { position: number; score: number } | null = null;
  const x0 = Math.round(width * 0.12);
  const x1 = Math.round(width * 0.88);
  for (let y = clamp(start, 2, height - 3); y <= clamp(end, 2, height - 3); y += 1) {
    let score = 0;
    let count = 0;
    for (let x = x0; x <= x1; x += 3) {
      score += pixelDifference(data, width, x, y - 2, x, y + 2);
      count += 1;
    }
    const normalized = count ? score / count : 0;
    if (!best || normalized > best.score) best = { position: y, score: normalized };
  }
  return best && best.score > 10 ? best : null;
}

function pixelDifference(data: Uint8ClampedArray, width: number, x1: number, y1: number, x2: number, y2: number): number {
  const a = pixelStats(data, width, x1, y1);
  const b = pixelStats(data, width, x2, y2);
  return Math.abs(a.luma - b.luma) + Math.abs(a.chroma - b.chroma) * 0.52;
}

function pixelStats(data: Uint8ClampedArray, width: number, x: number, y: number): { luma: number; chroma: number } {
  const offset = (y * width + x) * 4;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return {
    luma: (r + g + b) / 3,
    chroma: Math.max(r, g, b) - Math.min(r, g, b),
  };
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
