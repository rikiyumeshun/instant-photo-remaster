"use client";

import type { CropSettings, EnhancementPreset, OutputMode } from "@/lib/image/types";
import { PRESET_LABELS } from "@/lib/image/types";

type Props = {
  preset: EnhancementPreset;
  outputMode: OutputMode;
  cropSettings: CropSettings;
  upscale: boolean;
  disabled?: boolean;
  onPresetChange: (preset: EnhancementPreset) => void;
  onOutputModeChange: (mode: OutputMode) => void;
  onCropSettingsChange: (settings: CropSettings) => void;
  onUpscaleChange: (upscale: boolean) => void;
  onRender: () => void;
};

const descriptions: Record<EnhancementPreset, string> = {
  natural: "明るさ、色、シャープを軽く整えます。",
  crisp: "SNS向けに輪郭とコントラストを強めます。",
  soft: "淡い色と空気感を残して柔らかくします。",
  retro: "暖色、浮いた黒、粒状感を少し加えます。",
};

export function PresetSelector({
  preset,
  outputMode,
  cropSettings,
  upscale,
  disabled,
  onPresetChange,
  onOutputModeChange,
  onCropSettingsChange,
  onUpscaleChange,
  onRender,
}: Props) {
  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <h2 className="text-lg font-bold text-ink">補正と保存範囲</h2>
        <div className="mt-4 grid gap-3">
          {(Object.keys(PRESET_LABELS) as EnhancementPreset[]).map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => onPresetChange(key)}
              className={`rounded-[8px] border p-4 text-left ${preset === key ? "border-ink bg-mist" : "border-zinc-200 bg-white"}`}
            >
              <span className="block text-base font-bold text-ink">{PRESET_LABELS[key]}</span>
              <span className="mt-1 block text-sm leading-6 text-zinc-600">{descriptions[key]}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-[8px] bg-zinc-100 p-1">
          <button type="button" onClick={() => onOutputModeChange("frame")} className={`min-h-12 rounded-[7px] text-sm font-bold ${outputMode === "frame" ? "bg-white shadow" : "text-zinc-600"}`}>
            白枠込み
          </button>
          <button type="button" onClick={() => onOutputModeChange("inner")} className={`min-h-12 rounded-[7px] text-sm font-bold ${outputMode === "inner" ? "bg-white shadow" : "text-zinc-600"}`}>
            写真部分のみ
          </button>
        </div>

        {outputMode === "inner" ? (
          <div className="mt-5 space-y-4">
            <Range label="上余白" value={cropSettings.top} min={0.04} max={0.22} onChange={(top) => onCropSettingsChange({ ...cropSettings, top })} />
            <Range label="左右余白" value={cropSettings.side} min={0.02} max={0.18} onChange={(side) => onCropSettingsChange({ ...cropSettings, side })} />
            <Range label="下余白" value={cropSettings.bottom} min={0.12} max={0.35} onChange={(bottom) => onCropSettingsChange({ ...cropSettings, bottom })} />
          </div>
        ) : null}

        <label className="mt-5 flex min-h-12 items-center justify-between rounded-[8px] border border-zinc-200 px-4 py-3">
          <span className="text-sm font-bold text-ink">2倍の高画質化風出力</span>
          <input type="checkbox" checked={upscale} onChange={(event) => onUpscaleChange(event.target.checked)} className="h-6 w-6 accent-ink" />
        </label>

        <label className="mt-3 flex min-h-12 items-center justify-between rounded-[8px] border border-zinc-200 px-4 py-3 opacity-50">
          <span className="text-sm font-bold text-ink">顔を自然に補正</span>
          <input type="checkbox" disabled className="h-6 w-6" />
        </label>

        <button type="button" disabled={disabled} onClick={onRender} className="mt-5 min-h-14 w-full rounded-[8px] bg-ink px-5 py-4 text-base font-bold text-white disabled:opacity-50">
          補正プレビューを作成
        </button>
      </div>
    </section>
  );
}

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm font-bold text-zinc-700">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </span>
      <input type="range" value={value} min={min} max={max} step={0.005} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-ink" />
    </label>
  );
}
