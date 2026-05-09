import type { DetectionResult, Point, Quad } from "./types";
import { getCanvasContext } from "./canvas";

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
};

type Candidate = Bounds & {
  score: number;
  quad: Quad;
  touchesEdge: number;
};

export function defaultQuad(width: number, height: number): Quad {
  const insetX = width * 0.08;
  const insetY = height * 0.06;
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
  const sampleMax = 520;
  const scale = Math.min(1, sampleMax / Math.max(width, height));
  sampleCanvas.width = Math.max(1, Math.round(width * scale));
  sampleCanvas.height = Math.max(1, Math.round(height * scale));
  const sampleCtx = getCanvasContext(sampleCanvas);
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);

  const data = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const mask = buildWhiteMask(data.data, sampleCanvas.width, sampleCanvas.height);
  const candidate = bestFrameCandidate(mask, data.data, sampleCanvas.width, sampleCanvas.height);

  if (!candidate) {
    return {
      quad: defaultQuad(width, height),
      confidence: 0,
      method: "fallback",
      message: "白枠候補を見つけられませんでした。手動で四隅を合わせてください。",
    };
  }

  const quad = candidate.quad.map((point) => scalePoint(point, 1 / scale)) as Quad;

  // Touch original context once so browser decodes backing store before the next step.
  ctx.getImageData(0, 0, 1, 1);

  const confidence = clamp(candidate.score, 0.18, 0.9);
  return {
    quad,
    confidence,
    method: "heuristic",
    message: confidence < 0.55 ? "自動検出が怪しいので四隅を確認してください。" : undefined,
  };
}

function buildWhiteMask(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    if (brightness > 185 && max - min < 48) {
      mask[index] = 1;
    }
  }
  return mask;
}

function bestFrameCandidate(mask: Uint8Array, data: Uint8ClampedArray, width: number, height: number): Candidate | null {
  const visited = new Uint8Array(mask.length);
  let best: Candidate | null = null;
  const queue: number[] = [];

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;
    visited[i] = 1;
    queue.length = 0;
    queue.push(i);
    const bounds = flood(mask, visited, queue, width, height);
    const candidate = scoreCandidate(bounds, data, width, height);
    if (candidate && (!best || candidate.score > best.score)) best = candidate;
  }

  return best;
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

function scoreCandidate(bounds: Bounds, data: Uint8ClampedArray, width: number, height: number): Candidate | null {
  const candidateWidth = bounds.maxX - bounds.minX + 1;
  const candidateHeight = bounds.maxY - bounds.minY + 1;
  const area = candidateWidth * candidateHeight;
  const imageArea = width * height;
  const areaRatio = area / imageArea;
  if (bounds.count < imageArea * 0.025 || areaRatio < 0.08) return null;

  const ratio = candidateWidth / Math.max(1, candidateHeight);
  const instantPortrait = closeness(ratio, 54 / 85, 0.58);
  const instantLandscape = closeness(ratio, 85 / 54, 0.92);
  const ratioScore = Math.max(instantPortrait, instantLandscape, ratio > 0.45 && ratio < 1.95 ? 0.44 : 0);
  if (ratioScore < 0.25) return null;

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerDistance = Math.hypot(centerX / width - 0.5, centerY / height - 0.5);
  const centerScore = clamp(1 - centerDistance * 1.7, 0, 1);
  const touchesEdge = edgeTouches(bounds, width, height);
  const edgePenalty = touchesEdge >= 3 ? 0.46 : touchesEdge === 2 ? 0.24 : touchesEdge === 1 ? 0.1 : 0;
  const backgroundPenalty = areaRatio > 0.86 && touchesEdge >= 2 ? 0.44 : 0;
  const fillRatio = bounds.count / area;
  const borderContrast = measureBorderContrast(bounds, data, width, height);
  const contrastScore = clamp(borderContrast / 42, 0, 1);

  const quad = estimateQuadFromBounds(bounds, data, width, height);
  const shapeScore = isSaneQuad(quad) ? 0.16 : -0.35;
  const score =
    areaRatio * 0.55 +
    ratioScore * 0.26 +
    centerScore * 0.17 +
    contrastScore * 0.2 +
    fillRatio * 0.1 +
    shapeScore -
    edgePenalty -
    backgroundPenalty;

  return score > 0.18 ? { ...bounds, score, quad, touchesEdge } : null;
}

function estimateQuadFromBounds(bounds: Bounds, data: Uint8ClampedArray, width: number, height: number): Quad {
  const points: Point[] = [];
  const step = Math.max(1, Math.floor(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 180));

  for (let y = bounds.minY; y <= bounds.maxY; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      if (brightness > 185 && max - min < 48) points.push({ x, y });
    }
  }

  if (points.length < 8) {
    return boundsToQuad(bounds);
  }

  const topLeft = extreme(points, (point) => point.x + point.y);
  const topRight = extreme(points, (point) => -point.x + point.y);
  const bottomRight = extreme(points, (point) => -point.x - point.y);
  const bottomLeft = extreme(points, (point) => point.x - point.y);
  const insetFallback = boundsToQuad(bounds);

  return [
    topLeft ?? insetFallback[0],
    topRight ?? insetFallback[1],
    bottomRight ?? insetFallback[2],
    bottomLeft ?? insetFallback[3],
  ];
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

function closeness(value: number, target: number, tolerance: number): number {
  return clamp(1 - Math.abs(value - target) / tolerance, 0, 1);
}

function scalePoint(point: Point, scale: number): Point {
  return { x: point.x * scale, y: point.y * scale };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
