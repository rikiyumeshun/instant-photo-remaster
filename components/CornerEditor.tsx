"use client";

import { useMemo, useState } from "react";
import type { Point, Quad } from "@/lib/image/types";

type Props = {
  imageUrl: string | null;
  quad: Quad | null;
  onChange: (quad: Quad) => void;
  onApply: () => void;
  disabled?: boolean;
  confidence?: number;
  imageWidth?: number;
  imageHeight?: number;
};

export function CornerEditor({ imageUrl, quad, onChange, onApply, disabled, confidence, imageWidth = 1, imageHeight = 1 }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const viewBox = useMemo(() => "0 0 100 100", []);

  const points = quad ? normalizeQuad(quad, imageWidth, imageHeight) : null;

  const updatePoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (active === null || !quad || !event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const denormalized = denormalizePoint({ x: clamp(x, 0, 100), y: clamp(y, 0, 100) }, imageWidth, imageHeight);
    const next = [...quad] as Quad;
    next[active] = denormalized;
    onChange(next);
  };

  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">四隅調整</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">白枠の外側四隅に丸を合わせてください。</p>
          </div>
          {typeof confidence === "number" ? (
            <span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-zinc-700">検出 {Math.round(confidence * 100)}%</span>
          ) : null}
        </div>
        <div className="relative mt-4 overflow-hidden rounded-[8px] bg-zinc-100">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="四隅調整用プレビュー" className="w-full select-none object-contain" draggable={false} />
          ) : null}
          {imageUrl && points ? (
            <svg
              viewBox={viewBox}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerMove={updatePoint}
              onPointerUp={() => setActive(null)}
              onPointerCancel={() => setActive(null)}
            >
              <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(122,183,216,0.14)" stroke="#7ab7d8" strokeWidth="1.2" />
              {points.map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r="4.2"
                  fill={active === index ? "#18181b" : "#ffffff"}
                  stroke="#18181b"
                  strokeWidth="1.2"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setActive(index);
                  }}
                />
              ))}
            </svg>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!imageUrl || !quad || disabled}
          onClick={onApply}
          className="mt-4 min-h-14 w-full rounded-[8px] bg-ink px-5 py-4 text-base font-bold text-white disabled:opacity-50"
        >
          台形補正する
        </button>
      </div>
    </section>
  );
}

function normalizeQuad(quad: Quad, width: number, height: number): Quad {
  return quad.map((point) => ({ x: (point.x / width) * 100, y: (point.y / height) * 100 })) as Quad;
}

function denormalizePoint(point: Point, width: number, height: number): Point {
  return { x: (point.x / 100) * width, y: (point.y / 100) * height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
