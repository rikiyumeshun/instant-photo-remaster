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
          imageWidth={state.sourceSize?.width}
          imageHeight={state.sourceSize?.height}
        />
        <PhotoPreview src={state.correctedUrl} label="台形補正後" emptyText="四隅を合わせて台形補正すると表示されます。" />
        <PresetSelector
          preset={state.preset}
          outputMode={state.outputMode}
          cropSettings={state.cropSettings}
          upscale={state.upscale}
          disabled={!state.correctedUrl || state.isProcessing}
          onPresetChange={actions.setPreset}
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
        />
      </div>
      {state.isProcessing ? (
        <div className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-xl rounded-[8px] bg-ink px-4 py-3 text-center text-sm font-bold text-white shadow-soft">
          画像を処理しています...
        </div>
      ) : null}
    </main>
  );
}
