"use client";

import { useEffect, useRef, useState } from "react";
import type { Point, Quad } from "@/lib/image/types";

type Props = {
  imageUrl: string | null;
  quad: Quad | null;
  onChange: (quad: Quad) => void;
  onApply: () => void;
  disabled?: boolean;
  confidence?: number;
  method?: string;
  message?: string;
  imageWidth?: number;
  imageHeight?: number;
};

const cornerLabels = ["左上", "右上", "右下", "左下"] as const;

export function CornerEditor({
  imageUrl,
  quad,
  onChange,
  onApply,
  disabled,
  confidence,
  method,
  message,
  imageWidth = 1,
  imageHeight = 1,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (!quad) setActive(0);
  }, [quad]);

  const points = quad ? normalizeQuad(quad, imageWidth, imageHeight) : null;
  const confidenceIsLow = typeof confidence === "number" && confidence < 0.55;

  const setPointFromEvent = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!quad) return;
    const point = clientToImagePoint(event.clientX, event.clientY, svgRef.current, imageWidth, imageHeight);
    if (!point) return;
    updatePoint(active, point);
  };

  const updatePoint = (index: number, point: Point) => {
    if (!quad) return;
    const next = [...quad] as Quad;
    next[index] = {
      x: clamp(point.x, 0, imageWidth),
      y: clamp(point.y, 0, imageHeight),
    };
    onChange(next);
  };

  const nudge = (dx: number, dy: number) => {
    if (!quad) return;
    const current = quad[active];
    updatePoint(active, { x: current.x + dx, y: current.y + dy });
  };

  return (
    <section className={`mx-auto px-3 sm:px-5 ${isZoomed ? "max-w-5xl" : "max-w-2xl"}`}>
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">四隅調整</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">白枠の外側四隅に丸を合わせてください。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {method ? <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">{method}</span> : null}
            {typeof confidence === "number" ? (
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${confidenceIsLow ? "bg-blush text-zinc-800" : "bg-mist text-zinc-700"}`}>
                検出 {Math.round(confidence * 100)}%
              </span>
            ) : null}
          </div>
        </div>

        {confidenceIsLow || message ? (
          <div className="mt-3 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-800">
            {message ?? "自動検出が怪しいので四隅を確認してください。"}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-4 gap-1 rounded-[8px] bg-zinc-100 p-1">
            {cornerLabels.map((label, index) => (
              <button
                type="button"
                key={label}
                onClick={() => setActive(index)}
                className={`min-h-10 rounded-[7px] px-2 text-xs font-bold ${active === index ? "bg-ink text-white" : "text-zinc-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setIsZoomed((value) => !value)}
            className="min-h-10 rounded-[8px] border border-zinc-300 bg-white px-3 text-sm font-bold text-ink"
          >
            {isZoomed ? "通常表示" : "拡大して調整"}
          </button>
        </div>

        <div className="mt-4 overflow-auto rounded-[8px] bg-zinc-100 p-3">
          <div
            className="relative mx-auto"
            style={{
              width: "100%",
              minWidth: isZoomed && imageUrl ? Math.min(Math.max(imageWidth * 0.55, 680), 1080) : undefined,
            }}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="四隅調整用プレビュー" className="block w-full select-none rounded-[4px] object-contain" draggable={false} />
            ) : (
              <div className="grid min-h-80 place-items-center text-center text-sm leading-6 text-zinc-500">画像を選択すると四隅調整ができます。</div>
            )}
            {imageUrl && points ? (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                className="absolute inset-0 h-full w-full touch-none"
                onPointerMove={(event) => {
                  if (event.buttons === 1) setPointFromEvent(event);
                }}
              >
                <polygon points={quadToSvg(points)} fill="rgba(122,183,216,0.14)" stroke="#7ab7d8" strokeWidth={Math.max(imageWidth, imageHeight) * 0.004} />
                {points.map((point, index) => (
                  <g key={cornerLabels[index]}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={Math.max(imageWidth, imageHeight) * (isZoomed ? 0.035 : 0.045)}
                      fill="transparent"
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setActive(index);
                        const nextPoint = clientToImagePoint(event.clientX, event.clientY, svgRef.current, imageWidth, imageHeight);
                        if (nextPoint) updatePoint(index, nextPoint);
                      }}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={Math.max(imageWidth, imageHeight) * (isZoomed ? 0.012 : 0.016)}
                      fill={active === index ? "#18181b" : "#ffffff"}
                      stroke={active === index ? "#ffffff" : "#18181b"}
                      strokeWidth={Math.max(imageWidth, imageHeight) * 0.003}
                      pointerEvents="none"
                    />
                    <text
                      x={point.x}
                      y={point.y - Math.max(imageWidth, imageHeight) * 0.025}
                      textAnchor="middle"
                      className="select-none fill-white text-[18px] font-bold"
                      stroke="#18181b"
                      strokeWidth="4"
                      paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {cornerLabels[index]}
                    </text>
                  </g>
                ))}
              </svg>
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-[8px] border border-zinc-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-ink">選択中: {cornerLabels[active]}</p>
            <p className="text-xs leading-5 text-zinc-500">短押し 1px / 5pxボタンで細かく移動</p>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] gap-2">
            <span />
            <NudgeButton label="↑" onClick={() => nudge(0, -1)} disabled={!quad} />
            <span />
            <NudgeButton label="←" onClick={() => nudge(-1, 0)} disabled={!quad} />
            <NudgeButton label="↓" onClick={() => nudge(0, 1)} disabled={!quad} />
            <NudgeButton label="→" onClick={() => nudge(1, 0)} disabled={!quad} />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <NudgeButton label="↑ 5px" onClick={() => nudge(0, -5)} disabled={!quad} />
            <NudgeButton label="↓ 5px" onClick={() => nudge(0, 5)} disabled={!quad} />
            <NudgeButton label="← 5px" onClick={() => nudge(-5, 0)} disabled={!quad} />
            <NudgeButton label="→ 5px" onClick={() => nudge(5, 0)} disabled={!quad} />
          </div>
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

function NudgeButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="min-h-11 rounded-[8px] border border-zinc-300 bg-white text-sm font-bold text-ink disabled:opacity-40">
      {label}
    </button>
  );
}

function normalizeQuad(quad: Quad, width: number, height: number): Quad {
  return quad.map((point) => ({ x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) })) as Quad;
}

function clientToImagePoint(clientX: number, clientY: number, svg: SVGSVGElement | null, width: number, height: number): Point | null {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * width,
    y: ((clientY - rect.top) / rect.height) * height,
  };
}

function quadToSvg(quad: Quad): string {
  return quad.map((point) => `${point.x},${point.y}`).join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
