import type { DetectionResult, Point, Quad } from "./types";
import { getCanvasContext } from "./canvas";

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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
  const bounds = largestConnectedBounds(mask, sampleCanvas.width, sampleCanvas.height);

  if (!bounds) {
    return { quad: defaultQuad(width, height), confidence: 0, method: "fallback" };
  }

  const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  const imageArea = sampleCanvas.width * sampleCanvas.height;
  const ratio = (bounds.maxX - bounds.minX) / Math.max(1, bounds.maxY - bounds.minY);
  const instantLike = ratio > 0.52 && ratio < 1.35;
  const bigEnough = area / imageArea > 0.18;

  if (!instantLike || !bigEnough) {
    return { quad: defaultQuad(width, height), confidence: 0.15, method: "fallback" };
  }

  const pad = 2;
  const quad: Quad = [
    scalePoint({ x: Math.max(0, bounds.minX - pad), y: Math.max(0, bounds.minY - pad) }, 1 / scale),
    scalePoint({ x: Math.min(sampleCanvas.width, bounds.maxX + pad), y: Math.max(0, bounds.minY - pad) }, 1 / scale),
    scalePoint({ x: Math.min(sampleCanvas.width, bounds.maxX + pad), y: Math.min(sampleCanvas.height, bounds.maxY + pad) }, 1 / scale),
    scalePoint({ x: Math.max(0, bounds.minX - pad), y: Math.min(sampleCanvas.height, bounds.maxY + pad) }, 1 / scale),
  ];

  // Touch original context once so browser decodes backing store before the next step.
  ctx.getImageData(0, 0, 1, 1);

  return { quad, confidence: Math.min(0.92, area / imageArea + 0.38), method: "auto" };
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

function largestConnectedBounds(mask: Uint8Array, width: number, height: number): Bounds | null {
  const visited = new Uint8Array(mask.length);
  let best: (Bounds & { count: number }) | null = null;
  const queue: number[] = [];

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;
    visited[i] = 1;
    queue.length = 0;
    queue.push(i);
    const bounds = flood(mask, visited, queue, width, height);
    if (!best || bounds.count > best.count) best = bounds;
  }

  return best && best.count > width * height * 0.04 ? best : null;
}

function flood(mask: Uint8Array, visited: Uint8Array, queue: number[], width: number, height: number): Bounds & { count: number } {
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

function scalePoint(point: Point, scale: number): Point {
  return { x: point.x * scale, y: point.y * scale };
}
