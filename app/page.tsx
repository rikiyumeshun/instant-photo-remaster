"use client";

import { AppHeader } from "@/components/AppHeader";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { CornerEditor } from "@/components/CornerEditor";
import { ExportPanel } from "@/components/ExportPanel";
import { ImageUploader } from "@/components/ImageUploader";
import { PhotoPreview } from "@/components/PhotoPreview";
import { PresetSelector } from "@/components/PresetSelector";
import { ProcessingSteps } from "@/components/ProcessingSteps";
import { useImageProcessor } from "@/hooks/useImageProcessor";

export default function Home() {
  const { state, actions } = useImageProcessor();
  const enhanceError =
    state.errorScope === "enhance-local" || state.errorScope === "enhance-device" || state.errorScope === "enhance-ai" ? state.error : null;
  const exportError = state.errorScope === "save" || state.errorScope === "share" ? state.error : null;

  return (
    <main className="min-h-screen pb-8">
      <AppHeader />
      <ProcessingSteps hasImage={Boolean(state.originalUrl)} hasCorrected={Boolean(state.correctedUrl)} hasFinal={Boolean(state.finalUrl)} />
      <div className="space-y-6">
        <ImageUploader onSelect={actions.loadFile} disabled={state.isProcessing} />
        {state.error ? (
          <section className="mx-auto max-w-xl px-5">
            <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{state.error}</div>
          </section>
        ) : null}
        <PhotoPreview src={state.originalUrl} label="読み込み画像" />
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
        <PresetSelector
          preset={state.preset}
          enhancementEngine={state.enhancementEngine}
          deviceEnhanceQuality={state.deviceEnhanceQuality}
          aiConsent={state.aiConsent}
          aiAccessCode={state.aiAccessCode}
          outputMode={state.outputMode}
          cropSettings={state.cropSettings}
          upscale={state.upscale}
          errorMessage={enhanceError}
          disabled={!state.correctedUrl || state.isProcessing}
          onPresetChange={actions.setPreset}
          onEnhancementEngineChange={actions.setEnhancementEngine}
          onDeviceEnhanceQualityChange={actions.setDeviceEnhanceQuality}
          onAiConsentChange={actions.setAiConsent}
          onAiAccessCodeChange={actions.setAiAccessCode}
          onOutputModeChange={actions.setOutputMode}
          onCropSettingsChange={actions.setCropSettings}
          onUpscaleChange={actions.setUpscale}
          onRender={actions.renderFinal}
        />
        <BeforeAfterSlider before={state.correctedUrl} after={state.finalUrl} />
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
          {state.processingMessage ?? "画像を処理しています..."}
        </div>
      ) : null}
    </main>
  );
}
