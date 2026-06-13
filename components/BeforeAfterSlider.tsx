"use client";

import { useEffect, useState } from "react";
import type { ImageDimensions, ProcessingSizeLog } from "@/lib/image/types";

type Props = {
  before: string | null;
  after: string | null;
  beforeSize?: ImageDimensions | null;
  afterSize?: ImageDimensions | null;
  sizeLog?: ProcessingSizeLog | null;
};

function formatDimensions(size?: ImageDimensions | null): string | null {
  if (!size) return null;
  return `${size.width} × ${size.height}px`;
}

export function BeforeAfterSlider({ before, after, beforeSize, afterSize, sizeLog }: Props) {
  const [position, setPosition] = useState(50);
  const [viewMode, setViewMode] = useState<"fit" | "actual">("fit");
  const [afterNaturalSize, setAfterNaturalSize] = useState<ImageDimensions | null>(afterSize ?? null);

  useEffect(() => {
    setAfterNaturalSize(afterSize ?? null);
  }, [afterSize]);

  const sizeSummary = sizeLog
    ? [
        `input ${sizeLog.input.width}×${sizeLog.input.height}`,
        sizeLog.aiOutput ? `AI ${sizeLog.aiOutput.width}×${sizeLog.aiOutput.height}` : null,
        `final ${sizeLog.final.width}×${sizeLog.final.height}`,
      ]
        .filter(Boolean)
        .join(" → ")
    : null;

  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Before / After</h2>
            {sizeSummary ? <p className="mt-1 text-xs leading-5 text-zinc-600">{sizeSummary}</p> : null}
          </div>
          {before && after ? (
            <div className="flex rounded-[8px] bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode("fit")}
                className={`min-h-9 rounded-[7px] px-3 text-xs font-bold ${viewMode === "fit" ? "bg-white shadow" : "text-zinc-600"}`}
              >
                画面に合わせる
              </button>
              <button
                type="button"
                onClick={() => setViewMode("actual")}
                className={`min-h-9 rounded-[7px] px-3 text-xs font-bold ${viewMode === "actual" ? "bg-white shadow" : "text-zinc-600"}`}
              >
                等倍表示
              </button>
            </div>
          ) : null}
        </div>
        <div className={`relative mt-4 rounded-[8px] bg-zinc-100 ${viewMode === "actual" ? "max-h-[70vh] overflow-auto" : "overflow-hidden"}`}>
          {before && after ? (
            <div className={viewMode === "actual" ? "inline-block min-w-full" : "relative"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={after}
                alt="補正後"
                className={`block select-none ${viewMode === "fit" ? "w-full" : "max-w-none"}`}
                style={viewMode === "actual" && afterNaturalSize ? { width: afterNaturalSize.width } : undefined}
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setAfterNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
              {viewMode === "fit" ? (
                <>
                  <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={before} alt="補正前" className="h-full max-w-none select-none object-cover" style={{ width: `${10000 / position}%` }} draggable={false} />
                  </div>
                  <div className="absolute bottom-0 top-0 w-1 bg-white shadow" style={{ left: `${position}%` }} />
                </>
              ) : null}
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 text-center text-sm leading-6 text-zinc-500">補正プレビューを作成すると比較できます。</div>
          )}
        </div>
        {viewMode === "actual" && before && after ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <ZoomPanel label="Before" src={before} size={beforeSize} />
            <ZoomPanel label="After" src={after} size={afterNaturalSize ?? afterSize} />
          </div>
        ) : null}
        {before && after && viewMode === "fit" ? (
          <input type="range" min={5} max={95} value={position} onChange={(event) => setPosition(Number(event.target.value))} className="mt-4 w-full accent-ink" />
        ) : null}
        {beforeSize || afterNaturalSize || afterSize ? (
          <p className="mt-3 text-xs leading-5 text-zinc-600">
            {beforeSize ? `Before: ${formatDimensions(beforeSize)}` : null}
            {beforeSize && (afterNaturalSize || afterSize) ? " / " : null}
            {afterNaturalSize || afterSize ? `After: ${formatDimensions(afterNaturalSize ?? afterSize)}` : null}
            {viewMode === "actual" ? " · 等倍表示で目元の差を確認できます" : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ZoomPanel({ label, src, size }: { label: string; src: string; size?: ImageDimensions | null }) {
  return (
    <div className="rounded-[8px] border border-zinc-200 bg-white p-2">
      <p className="px-1 text-xs font-bold text-zinc-700">
        {label}
        {size ? ` (${size.width}×${size.height})` : ""}
      </p>
      <div className="mt-2 max-h-64 overflow-auto rounded-[4px] bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="max-w-none" style={size ? { width: size.width } : undefined} draggable={false} />
      </div>
    </div>
  );
}
