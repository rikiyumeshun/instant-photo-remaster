"use client";

import type { CropSettings, DeviceEnhanceQuality, EnhancementEngine, EnhancementPreset, OutputMode } from "@/lib/image/types";
import { PRESET_LABELS } from "@/lib/image/types";

type Props = {
  preset: EnhancementPreset;
  enhancementEngine: EnhancementEngine;
  deviceEnhanceQuality: DeviceEnhanceQuality;
  aiConsent: boolean;
  aiAccessCode: string;
  outputMode: OutputMode;
  cropSettings: CropSettings;
  upscale: boolean;
  errorMessage?: string | null;
  disabled?: boolean;
  onPresetChange: (preset: EnhancementPreset) => void;
  onEnhancementEngineChange: (engine: EnhancementEngine) => void;
  onDeviceEnhanceQualityChange: (quality: DeviceEnhanceQuality) => void;
  onAiConsentChange: (consent: boolean) => void;
  onAiAccessCodeChange: (code: string) => void;
  onOutputModeChange: (mode: OutputMode) => void;
  onCropSettingsChange: (settings: CropSettings) => void;
  onUpscaleChange: (upscale: boolean) => void;
  onRender: () => void;
  onRetry: () => void;
  onUseLocal: () => void;
  onUseDeviceHigh: () => void;
};

const descriptions: Record<EnhancementPreset, string> = {
  natural: "明るさ、色、シャープを軽く整えます。",
  crisp: "SNS向けに輪郭とコントラストを強めます。",
  soft: "淡い色と空気感を残して柔らかくします。",
  retro: "暖色、浮いた黒、粒状感を少し加えます。",
};

const AI_ACCESS_CODE_REQUIRED = process.env.NEXT_PUBLIC_AI_ACCESS_CODE_REQUIRED === "true";

const qualityOptions: Array<{ key: DeviceEnhanceQuality; label: string; badge: string; description: string }> = [
  { key: "standard", label: "標準", badge: "高速", description: "軽めの補正。古いスマホ向けです。" },
  { key: "high", label: "高品質", badge: "おすすめ", description: "解像感と自然さのバランス。通常はこれ。" },
  { key: "max", label: "最高品質", badge: "画質優先", description: "少し時間をかけ、ていねいに拡大・ノイズ低減・シャープ補正します。" },
];

export function PresetSelector({
  preset,
  enhancementEngine,
  deviceEnhanceQuality,
  aiConsent,
  aiAccessCode,
  outputMode,
  cropSettings,
  upscale,
  errorMessage,
  disabled,
  onPresetChange,
  onEnhancementEngineChange,
  onDeviceEnhanceQualityChange,
  onAiConsentChange,
  onAiAccessCodeChange,
  onOutputModeChange,
  onCropSettingsChange,
  onUpscaleChange,
  onRender,
  onRetry,
  onUseLocal,
  onUseDeviceHigh,
}: Props) {
  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <h2 className="text-lg font-bold text-ink">補正と保存範囲</h2>
        <div className="mt-4 rounded-[8px] border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-bold text-ink">補正エンジン</p>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => onEnhancementEngineChange("local")}
              className={`rounded-[8px] border p-3 text-left ${enhancementEngine === "local" ? "border-ink bg-white" : "border-zinc-200 bg-white"}`}
            >
              <span className="block text-sm font-bold text-ink">ローカル高速補正</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">スマホ内で処理します。写真は外部サーバーへ送信されません。AI風の見た目改善で、本物AI復元ではありません。</span>
            </button>
            <button
              type="button"
              onClick={() => onEnhancementEngineChange("device-ai")}
              className={`rounded-[8px] border p-3 text-left ${enhancementEngine === "device-ai" ? "border-ink bg-white" : "border-zinc-200 bg-white"}`}
            >
              <span className="block text-sm font-bold text-ink">スマホ内AI風補正</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">
                写真を送信せず、端末内でノイズ低減、2倍拡大、輪郭の再強調を行います。軽量な推定補正で、重いAIモデルは使いません。
              </span>
            </button>
            <button
              type="button"
              onClick={() => onEnhancementEngineChange("ai")}
              className={`rounded-[8px] border p-3 text-left ${enhancementEngine === "ai" ? "border-ink bg-white" : "border-zinc-200 bg-white"}`}
            >
              <span className="block text-sm font-bold text-ink">AI高画質化</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">サーバー側で高画質化処理を行います。ローカル補正より時間がかかり、写真をサーバーへ送信します。</span>
            </button>
          </div>
          {enhancementEngine === "ai" ? (
            <div className="mt-3 space-y-3">
              <label className="flex items-start gap-3 rounded-[8px] border border-amber-200 bg-amber-50 p-3">
                <input type="checkbox" checked={aiConsent} onChange={(event) => onAiConsentChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-ink" />
                <span className="text-xs font-semibold leading-5 text-amber-900">
                  AI高画質化では、補正のために写真をサーバーへ送信します。処理後、画像はサーバーに保存しない設計です。この内容に同意して実行します。
                </span>
              </label>
              <label className="block rounded-[8px] border border-zinc-200 bg-white p-3">
                <span className="flex items-center justify-between gap-3 text-xs font-bold text-ink">
                  <span>AIアクセスコード</span>
                  {AI_ACCESS_CODE_REQUIRED ? <span className="rounded-full bg-ink px-2 py-1 text-[11px] text-white">必須</span> : null}
                </span>
                <input
                  type="text"
                  value={aiAccessCode}
                  onChange={(event) => onAiAccessCodeChange(event.target.value)}
                  placeholder={AI_ACCESS_CODE_REQUIRED ? "購入または発行されたコードを入力" : "ベータ版は空欄で実行できます"}
                  className="mt-2 min-h-11 w-full rounded-[8px] border border-zinc-300 px-3 text-sm"
                />
                <span className="mt-2 block text-xs leading-5 text-zinc-600">
                  {AI_ACCESS_CODE_REQUIRED
                    ? "AI高画質化を実行するにはアクセスコードが必要です。未入力の場合は送信前に止めます。"
                    : "有料チケット運用に切り替えた場合、購入後に発行されるコードを入力します。"}
                </span>
              </label>
              <PricingLinks />
            </div>
          ) : null}
          {enhancementEngine === "device-ai" ? (
            <div className="mt-3 rounded-[8px] border border-sky-100 bg-sky-50 p-3">
              <p className="text-xs font-bold text-ink">スマホ内AI風補正の品質</p>
              <div className="mt-2 grid gap-2">
                {qualityOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onDeviceEnhanceQualityChange(option.key)}
                    className={`rounded-[8px] border bg-white p-3 text-left ${
                      deviceEnhanceQuality === option.key ? "border-ink" : "border-zinc-200"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-ink">{option.label}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-700">{option.badge}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-600">{option.description}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-600">スマホ内AI風補正では写真を外部送信しません。最高品質は端末によって少し時間がかかります。</p>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700">
              <p>{errorMessage}</p>
              {enhancementEngine === "ai" ? (
                <div className="mt-3 grid gap-2">
                  <button type="button" onClick={onUseDeviceHigh} className="min-h-10 rounded-[8px] bg-ink px-3 py-2 text-sm font-bold text-white">
                    スマホ内AI風補正に切り替え
                  </button>
                  <button type="button" onClick={onUseLocal} className="min-h-10 rounded-[8px] border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700">
                    ローカル高速補正に切り替え
                  </button>
                  <button type="button" onClick={onRetry} className="min-h-10 rounded-[8px] border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700">
                    30秒ほど待って再試行
                  </button>
                </div>
              ) : enhancementEngine === "device-ai" ? (
                <div className="mt-3 grid gap-2">
                  <button type="button" onClick={onUseDeviceHigh} className="min-h-10 rounded-[8px] bg-ink px-3 py-2 text-sm font-bold text-white">
                    高品質で再試行
                  </button>
                  <button type="button" onClick={onUseLocal} className="min-h-10 rounded-[8px] border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700">
                    ローカル高速補正に切り替え
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
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
          <span className="text-sm font-bold text-ink">{enhancementEngine === "device-ai" ? "最大2倍のスマホ内高画質化" : "2倍の高画質化風出力"}</span>
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

function PricingLinks() {
  const links = [
    { label: "10枚パック", href: process.env.NEXT_PUBLIC_STRIPE_PACK_10_URL },
    { label: "30枚パック", href: process.env.NEXT_PUBLIC_STRIPE_PACK_30_URL },
    { label: "100枚パック", href: process.env.NEXT_PUBLIC_STRIPE_PACK_100_URL },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  if (links.length === 0) {
    return (
      <div className="rounded-[8px] border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-600">
        AIチケット販売は準備中です。Stripe Payment Links を設定すると、ここに購入ボタンが表示されます。
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-zinc-200 bg-white p-3">
      <p className="text-xs font-bold text-ink">AIチケット</p>
      <div className="mt-2 grid gap-2">
        {links.map((link) => (
          <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="min-h-10 rounded-[8px] bg-ink px-3 py-2 text-center text-sm font-bold text-white">
            {link.label}を購入
          </a>
        ))}
      </div>
    </div>
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
