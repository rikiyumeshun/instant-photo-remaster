"use client";

import { AppHeader } from "@/components/AppHeader";
import { AppToast } from "@/components/AppToast";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { CornerEditor } from "@/components/CornerEditor";
import { ExportPanel } from "@/components/ExportPanel";
import { ImageUploader } from "@/components/ImageUploader";
import { PhotoPreview } from "@/components/PhotoPreview";
import { PresetSelector } from "@/components/PresetSelector";
import { ProcessingSteps } from "@/components/ProcessingSteps";
import { useImageProcessor } from "@/hooks/useImageProcessor";
import type { PreprocessMode } from "@/lib/image/types";

export default function Home() {
  const { state, actions } = useImageProcessor();
  const isDirect = state.preprocessMode === "direct";
  const enhanceError =
    state.errorScope === "enhance-local" || state.errorScope === "enhance-device" || state.errorScope === "enhance-ai" ? state.error : null;
  const exportError = state.errorScope === "save" || state.errorScope === "share" ? state.error : null;
  const beforeAfterBefore = isDirect ? state.originalUrl : state.correctedUrl;

  return (
    <main className="min-h-screen pb-8">
      <AppHeader />
      <ProcessingSteps
        preprocessMode={state.preprocessMode}
        hasImage={Boolean(state.originalUrl)}
        hasCorrected={Boolean(state.correctedUrl)}
        hasFinal={Boolean(state.finalUrl)}
      />
      <div className="space-y-6">
        <ImageUploader onSelect={actions.loadFile} disabled={state.isProcessing} />
        <PreprocessModeSelector mode={state.preprocessMode} disabled={state.isProcessing} onChange={actions.setPreprocessMode} />
        {state.error ? (
          <section className="mx-auto max-w-xl px-5">
            <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{state.error}</div>
          </section>
        ) : null}
        <PhotoPreview src={state.originalUrl} label={isDirect ? "元画像" : "読み込み画像"} />
        {!isDirect ? (
          <>
            <section className="mx-auto max-w-xl px-5">
              <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                台形補正は斜めの写真を正面化しますが、四隅の位置によっては縦横比が変わって見えることがあります。通常写真は「そのまま画質補正」がおすすめです。
              </div>
            </section>
            <CornerEditor
              imageUrl={state.originalUrl}
              quad={state.quad}
              onChange={actions.updateQuad}
              onApply={actions.applyCorrection}
              disabled={state.isProcessing}
              confidence={state.detection?.confidence}
              method={state.detection?.method}
              strategy={state.detection?.strategy}
              message={state.detection?.message}
              debug={state.detection?.debug}
              imageWidth={state.sourceSize?.width}
              imageHeight={state.sourceSize?.height}
              errorMessage={state.errorScope === "perspective" || state.errorScope === "detect" ? state.error : null}
            />
            <PhotoPreview src={state.correctedUrl} label="台形補正後" emptyText="四隅を合わせて台形補正すると表示されます。" />
          </>
        ) : null}
        <PresetSelector
          preset={state.preset}
          brightIntensity={state.brightIntensity}
          enhancementEngine={state.enhancementEngine}
          deviceEnhanceQuality={state.deviceEnhanceQuality}
          aiConsent={state.aiConsent}
          aiAccessCode={state.aiAccessCode}
          outputMode={state.outputMode}
          cropSettings={state.cropSettings}
          upscale={state.upscale}
          preprocessMode={state.preprocessMode}
          errorMessage={enhanceError}
          disabled={!state.correctedUrl || state.isProcessing}
          onPresetChange={actions.setPreset}
          onBrightIntensityChange={actions.setBrightIntensity}
          onEnhancementEngineChange={actions.setEnhancementEngine}
          onDeviceEnhanceQualityChange={actions.setDeviceEnhanceQuality}
          onAiConsentChange={actions.setAiConsent}
          onAiAccessCodeChange={actions.setAiAccessCode}
          onOutputModeChange={actions.setOutputMode}
          onCropSettingsChange={actions.setCropSettings}
          onUpscaleChange={actions.setUpscale}
          onRender={actions.renderFinal}
          onRetry={actions.renderFinal}
          onUseLocal={() => actions.setEnhancementEngine("local")}
          onUseDeviceHigh={() => {
            actions.setEnhancementEngine("device-ai");
            actions.setDeviceEnhanceQuality("high");
          }}
        />
        <BeforeAfterSlider before={beforeAfterBefore} after={state.finalUrl} />
        <PhotoPreview src={state.finalUrl} label="保存プレビュー" emptyText="補正プレビューを作成すると保存用画像が表示されます。" />
        <ExportPanel
          disabled={!state.finalUrl || state.isProcessing}
          canShare={state.canShare}
          onSave={actions.saveFinal}
          onSaveComparison={actions.saveComparison}
          onShare={actions.shareFinal}
          errorMessage={exportError}
        />
      </div>
      {state.isProcessing ? (
        <div className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-xl rounded-[8px] bg-ink px-4 py-3 text-center text-sm font-bold text-white shadow-soft">
          <p>{state.processingMessage ?? "画像を処理しています..."}</p>
          {state.canCancel ? (
            <button type="button" onClick={actions.cancelProcessing} className="mt-2 min-h-10 rounded-[8px] border border-white/40 px-4 text-sm font-bold text-white">
              キャンセル
            </button>
          ) : null}
        </div>
      ) : null}
      <AppToast notice={state.notice} offset={state.isProcessing} onClose={actions.clearNotice} />
    </main>
  );
}

function PreprocessModeSelector({ mode, disabled, onChange }: { mode: PreprocessMode; disabled?: boolean; onChange: (mode: PreprocessMode) => void }) {
  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <h2 className="text-lg font-bold text-ink">補正前処理</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">通常写真はそのまま補正、白枠フォトや斜め撮影は台形補正を選んでください。</p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("direct")}
            className={`rounded-[8px] border p-3 text-left disabled:opacity-50 ${mode === "direct" ? "border-ink bg-mist" : "border-zinc-200 bg-white"}`}
          >
            <span className="block text-sm font-bold text-ink">そのまま画質補正</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-600">台形補正せず、読み込んだ画像をそのまま画質補正します。通常写真向けです。</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("perspective")}
            className={`rounded-[8px] border p-3 text-left disabled:opacity-50 ${mode === "perspective" ? "border-ink bg-mist" : "border-zinc-200 bg-white"}`}
          >
            <span className="block text-sm font-bold text-ink">台形補正してから補正</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-600">白枠フォトや斜め撮影を四隅合わせで正面化してから画質補正します。</span>
          </button>
        </div>
      </div>
    </section>
  );
}
