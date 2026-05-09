import type { Point, Quad } from "./types";
import { getCanvasContext } from "./canvas";

const FRAME_RATIO = 54 / 85;

export function perspectiveTransform(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const orderedQuad = orderQuad(quad);
  validateQuad(orderedQuad, source.width, source.height);

  const top = distance(orderedQuad[0], orderedQuad[1]);
  const right = distance(orderedQuad[1], orderedQuad[2]);
  const bottom = distance(orderedQuad[2], orderedQuad[3]);
  const left = distance(orderedQuad[3], orderedQuad[0]);
  const averageWidth = (top + bottom) / 2;
  const averageHeight = (left + right) / 2;
  const sourceWide = averageWidth > averageHeight;
  const expectedLong = sourceWide ? averageWidth : averageHeight;

  const targetWidth = sourceWide ? Math.round(expectedLong) : Math.round(expectedLong * FRAME_RATIO);
  const targetHeight = sourceWide ? Math.round(expectedLong * FRAME_RATIO) : Math.round(expectedLong);
  const width = clamp(targetWidth, 420, 1800);
  const height = clamp(targetHeight, 420, 2400);

  const destination: Quad = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];

  const transform = computeHomography(destination, orderedQuad);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = getCanvasContext(output);
  const out = ctx.createImageData(width, height);
  const srcCtx = getCanvasContext(source);
  const src = srcCtx.getImageData(0, 0, source.width, source.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mapped = applyHomography(transform, x, y);
      const color = sampleBilinear(src.data, source.width, source.height, mapped.x, mapped.y);
      const offset = (y * width + x) * 4;
      out.data[offset] = color[0];
      out.data[offset + 1] = color[1];
      out.data[offset + 2] = color[2];
      out.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  return output;
}

export function orderQuad(quad: Quad): Quad {
  const center = {
    x: quad.reduce((sum, point) => sum + point.x, 0) / quad.length,
    y: quad.reduce((sum, point) => sum + point.y, 0) / quad.length,
  };
  const sorted = [...quad].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const startIndex = sorted.reduce((bestIndex, point, index) => (point.x + point.y < sorted[bestIndex].x + sorted[bestIndex].y ? index : bestIndex), 0);
  return [sorted[startIndex], sorted[(startIndex + 1) % 4], sorted[(startIndex + 2) % 4], sorted[(startIndex + 3) % 4]] as Quad;
}

function validateQuad(quad: Quad, imageWidth: number, imageHeight: number): void {
  if (segmentsIntersect(quad[0], quad[1], quad[2], quad[3]) || segmentsIntersect(quad[1], quad[2], quad[3], quad[0])) {
    throw new Error("四隅が交差しています。丸を白枠の外側四隅へ順番に合わせてください。");
  }

  const area = polygonArea(quad);
  const imageArea = imageWidth * imageHeight;
  if (area < imageArea * 0.025) {
    throw new Error("四隅が近すぎます。白枠全体を囲むように広げてください。");
  }

  const edges = quad.map((point, index) => distance(point, quad[(index + 1) % quad.length]));
  if (Math.min(...edges) < Math.min(imageWidth, imageHeight) * 0.04) {
    throw new Error("四隅の一部が近すぎます。角を離して調整してください。");
  }

  const width = (edges[0] + edges[2]) / 2;
  const height = (edges[1] + edges[3]) / 2;
  const ratio = width / Math.max(1, height);
  if (ratio < 0.28 || ratio > 3.2) {
    throw new Error("四角形が極端に細くなっています。四隅の位置を確認してください。");
  }
}

function computeHomography(from: Quad, to: Quad): number[] {
  const matrix: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const u = to[i].x;
    const v = to[i].y;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem(matrix, b);
  return [...h, 1];
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] {
  const n = values.length;
  const a = matrix.map((row, i) => [...row, values[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col] || 1e-12;
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

function applyHomography(h: number[], x: number, y: number): Point {
  const denominator = h[6] * x + h[7] * y + h[8];
  return {
    x: (h[0] * x + h[1] * y + h[2]) / denominator,
    y: (h[3] * x + h[4] * y + h[5]) / denominator,
  };
}

function sampleBilinear(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): [number, number, number] {
  const safeX = clamp(x, 0, width - 1);
  const safeY = clamp(y, 0, height - 1);
  const x0 = Math.floor(safeX);
  const y0 = Math.floor(safeY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const dx = safeX - x0;
  const dy = safeY - y0;

  const c00 = pixel(data, width, x0, y0);
  const c10 = pixel(data, width, x1, y0);
  const c01 = pixel(data, width, x0, y1);
  const c11 = pixel(data, width, x1, y1);

  return [0, 1, 2].map((channel) => {
    const top = c00[channel] * (1 - dx) + c10[channel] * dx;
    const bottom = c01[channel] * (1 - dx) + c11[channel] * dx;
    return Math.round(top * (1 - dy) + bottom * dy);
  }) as [number, number, number];
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number] {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  const direction = (p1: Point, p2: Point, p3: Point) => (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
  const d1 = direction(a, b, c);
  const d2 = direction(a, b, d);
  const d3 = direction(c, d, a);
  const d4 = direction(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
