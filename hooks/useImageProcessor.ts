"use client";

import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { imageToCanvas, loadImageFile, MAX_UPLOAD_WARNING_BYTES, resizeForProcessing } from "@/lib/image/canvas";
import { cropInnerPhoto } from "@/lib/image/crop";
import { detectInstantPhotoFrame } from "@/lib/image/detectFrame";
import { enhanceOnDevice } from "@/lib/image/deviceEnhance";
import { applyEnhancementPreset } from "@/lib/image/enhance";
import { enhanceWithAI } from "@/lib/image/aiEnhance";
import { canvasToBlob, exportImage, makeExportFileName, shareImage } from "@/lib/image/export";
import { perspectiveTransform } from "@/lib/image/perspective";
import { upscaleImage } from "@/lib/image/upscale";
import { applyEyeClarity } from "@/lib/image/eyeEnhance";
import type { BrightIntensity, CropSettings, DetectionResult, DeviceEnhanceQuality, EnhancementEngine, EnhancementPreset, ErrorScope, EyeClarityLevel, Notice, NoticeKind, OutputMode, PreprocessMode, ProcessingSizeLog, Quad } from "@/lib/image/types";
import { DEFAULT_CROP_SETTINGS } from "@/lib/image/types";

type ProcessorState = {
  originalUrl: string | null;
  correctedUrl: string | null;
  finalUrl: string | null;
  comparisonUrl: string | null;
  sourceSize: { width: number; height: number } | null;
  quad: Quad | null;
  detection: DetectionResult | null;
  preprocessMode: PreprocessMode;
  preset: EnhancementPreset;
  brightIntensity: BrightIntensity;
  enhancementEngine: EnhancementEngine;
  deviceEnhanceQuality: DeviceEnhanceQuality;
  aiConsent: boolean;
  aiAccessCode: string;
  outputMode: OutputMode;
  cropSettings: CropSettings;
  isProcessing: boolean;
  processingMessage: string | null;
  error: string | null;
  errorScope: ErrorScope | null;
  notice: Notice | null;
  canShare: boolean;
  canCancel: boolean;
  upscale: boolean;
  eyeClarity: EyeClarityLevel;
  processingSizes: ProcessingSizeLog | null;
};

const initialState: ProcessorState = {
  originalUrl: null,
  correctedUrl: null,
  finalUrl: null,
  comparisonUrl: null,
  sourceSize: null,
  quad: null,
  detection: null,
  preprocessMode: "direct",
  preset: "natural",
  brightIntensity: "strong",
  enhancementEngine: "local",
  deviceEnhanceQuality: "high",
  aiConsent: false,
  aiAccessCode: "",
  outputMode: "frame",
  cropSettings: DEFAULT_CROP_SETTINGS,
  isProcessing: false,
  processingMessage: null,
  error: null,
  errorScope: null,
  notice: null,
  canShare: false,
  canCancel: false,
  upscale: true,
  eyeClarity: 2,
  processingSizes: null,
};

const AI_ACCESS_CODE_REQUIRED = process.env.NEXT_PUBLIC_AI_ACCESS_CODE_REQUIRED === "true";
const AI_TIMEOUT_MS = 120000;
let noticeId = 0;

type EnhancedRenderResult = {
  canvas: HTMLCanvasElement;
  sizeLog?: ProcessingSizeLog | null;
};

function canvasSize(canvas: HTMLCanvasElement) {
  return { width: canvas.width, height: canvas.height };
}

function formatSizeLog(log: ProcessingSizeLog): string {
  const parts = [`input ${log.input.width}x${log.input.height}`];
  if (log.aiOutput) parts.push(`AI ${log.aiOutput.width}x${log.aiOutput.height}`);
  parts.push(`final ${log.final.width}x${log.final.height}`);
  return parts.join(" → ");
}

export function useImageProcessor() {
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const correctedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const finalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const userCancelRef = useRef(false);
  const [state, setState] = useState<ProcessorState>(initialState);

  const notify = useCallback((kind: NoticeKind, message: string) => {
    noticeId += 1;
    setState((current) => ({ ...current, notice: { id: noticeId, kind, message } }));
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "画像を読み込んでいます...", error: null, errorScope: null }));
    try {
      if (file.size > MAX_UPLOAD_WARNING_BYTES) {
        notify("warning", "画像が20MBを超えています。スマホでは読み込みに時間がかかる場合があります。");
      }
      const image = await loadImageFile(file);
      const raw = imageToCanvas(image);
      const resized = resizeForProcessing(raw).canvas;
      const mode = state.preprocessMode;
      sourceCanvasRef.current = resized;
      finalCanvasRef.current = null;

      if (mode === "direct") {
        correctedCanvasRef.current = resized;
        setState((current) => ({
          ...current,
          originalUrl: resized.toDataURL("image/jpeg", 0.9),
          sourceSize: { width: resized.width, height: resized.height },
          correctedUrl: resized.toDataURL("image/jpeg", 0.92),
          finalUrl: null,
          comparisonUrl: null,
          quad: null,
          detection: null,
          outputMode: "frame",
          isProcessing: false,
          processingMessage: null,
          error: null,
          errorScope: null,
          canCancel: false,
        }));
        notify("success", "画像を読み込みました。補正設定を選んでください。");
        return;
      }

      let detection: DetectionResult;
      try {
        detection = detectInstantPhotoFrame(resized);
      } catch {
        setState((current) => ({
          ...current,
          isProcessing: false,
          processingMessage: null,
          error: "白枠検出に失敗しました。別の画像を試すか、画像を少し明るく撮り直してください。",
          errorScope: "detect",
        }));
        return;
      }
      correctedCanvasRef.current = null;
      setState((current) => ({
        ...current,
        originalUrl: resized.toDataURL("image/jpeg", 0.9),
        sourceSize: { width: resized.width, height: resized.height },
        correctedUrl: null,
        finalUrl: null,
        comparisonUrl: null,
        quad: detection.quad,
        detection,
        isProcessing: false,
        processingMessage: null,
        error: null,
        errorScope: null,
        canCancel: false,
      }));
      notify("success", "画像を読み込みました。四隅を確認してください。");
    } catch (error) {
      setState((current) => ({
        ...current,
        isProcessing: false,
        processingMessage: null,
        error: error instanceof Error ? error.message : "画像の読み込みに失敗しました。",
        errorScope: "load",
        canCancel: false,
      }));
      notify("error", error instanceof Error ? error.message : "画像の読み込みに失敗しました。");
    }
  }, [notify, state.preprocessMode]);

  const setPreprocessMode = useCallback((preprocessMode: PreprocessMode) => {
    const source = sourceCanvasRef.current;
    if (!source) {
      setState((current) => ({ ...current, preprocessMode }));
      return;
    }

    if (preprocessMode === "direct") {
      correctedCanvasRef.current = source;
      finalCanvasRef.current = null;
      setState((current) => ({
        ...current,
        preprocessMode,
        correctedUrl: source.toDataURL("image/jpeg", 0.92),
        finalUrl: null,
        comparisonUrl: null,
        outputMode: "frame",
        quad: null,
        detection: null,
        error: null,
        errorScope: null,
      }));
      return;
    }

    let detection: DetectionResult | null = null;
    try {
      detection = detectInstantPhotoFrame(source);
    } catch {
      setState((current) => ({
        ...current,
        preprocessMode,
        correctedUrl: null,
        finalUrl: null,
        comparisonUrl: null,
        error: "白枠検出に失敗しました。別の画像を試すか、画像を少し明るく撮り直してください。",
        errorScope: "detect",
      }));
      correctedCanvasRef.current = null;
      finalCanvasRef.current = null;
      return;
    }

    correctedCanvasRef.current = null;
    finalCanvasRef.current = null;
    setState((current) => ({
      ...current,
      preprocessMode,
      correctedUrl: null,
      finalUrl: null,
      comparisonUrl: null,
      quad: detection.quad,
      detection,
      error: null,
      errorScope: null,
    }));
  }, []);

  const updateQuad = useCallback((quad: Quad) => {
    setState((current) => ({ ...current, quad, correctedUrl: null, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null }));
    correctedCanvasRef.current = null;
    finalCanvasRef.current = null;
  }, []);

  const applyCorrection = useCallback(async () => {
    const source = sourceCanvasRef.current;
    if (!source || !state.quad) return;
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "台形補正中です...", error: null, errorScope: null, canCancel: false }));
    await yieldToBrowser();
    try {
      const corrected = perspectiveTransform(source, state.quad);
      correctedCanvasRef.current = corrected;
      finalCanvasRef.current = null;
      setState((current) => ({
        ...current,
        correctedUrl: corrected.toDataURL("image/jpeg", 0.92),
        finalUrl: null,
        comparisonUrl: null,
        isProcessing: false,
        processingMessage: null,
        error: null,
        errorScope: null,
        canCancel: false,
      }));
      notify("success", "台形補正が完了しました。");
    } catch (error) {
      setState((current) => ({
        ...current,
        isProcessing: false,
        processingMessage: null,
        error: error instanceof Error ? error.message : "台形補正に失敗しました。四隅の位置を少し内側に調整してください。",
        errorScope: "perspective",
        canCancel: false,
      }));
    }
  }, [notify, state.quad]);

  const renderFinal = useCallback(async () => {
    const corrected = correctedCanvasRef.current;
    if (!corrected) return;
    if (state.enhancementEngine === "ai" && !state.aiConsent) {
      const message = "AI高画質化を実行するには、写真をサーバーへ送信することへの同意が必要です。";
      setState((current) => ({ ...current, error: message, errorScope: "enhance-ai" }));
      notify("error", message);
      return;
    }
    if (state.enhancementEngine === "ai" && AI_ACCESS_CODE_REQUIRED && !state.aiAccessCode.trim()) {
      const message = "AI高画質化を実行するには、AIアクセスコードを入力してください。";
      setState((current) => ({ ...current, error: message, errorScope: "enhance-ai" }));
      notify("error", message);
      return;
    }
    setState((current) => ({
      ...current,
      isProcessing: true,
      processingMessage:
        state.enhancementEngine === "ai"
          ? "AI補正中です。無料AIサーバーのため、初回は最大1分ほどかかる場合があります。"
          : state.enhancementEngine === "device-ai"
            ? state.deviceEnhanceQuality === "max"
              ? "最高品質でスマホ内AI風補正中です。端末によっては少し時間がかかります。"
              : "スマホ内で高画質化しています..."
            : "補正画像を作成しています...",
      error: null,
      errorScope: null,
      canCancel: state.enhancementEngine === "ai",
    }));
    await yieldToBrowser();
    try {
      const effectiveOutputMode = state.preprocessMode === "direct" ? "frame" : state.outputMode;
      const target = effectiveOutputMode === "inner" ? cropInnerPhoto(corrected, state.cropSettings) : corrected;
      const safeQuality = getSafeDeviceQuality(target, state.deviceEnhanceQuality, state.upscale);
      if (state.enhancementEngine === "device-ai" && safeQuality !== state.deviceEnhanceQuality) {
        notify("warning", "画像が大きいため、スマホ内AI風補正を最高品質から高品質に自動で切り替えました。");
      }
      const { canvas: enhancedCanvas, sizeLog } = await renderEnhancedCanvas(
        target,
        state.enhancementEngine,
        state.preset,
        safeQuality,
        state.upscale,
        state.aiAccessCode,
        state.brightIntensity,
        aiAbortRef,
      );
      let finalCanvas = enhancedCanvas;
      let processingSizes = sizeLog ?? null;
      if (state.eyeClarity > 0) {
        setState((current) => ({ ...current, processingMessage: "目元をくっきり補正中..." }));
        await yieldToBrowser();
        const eyeResult = await applyEyeClarity(enhancedCanvas, state.eyeClarity);
        finalCanvas = eyeResult.canvas;
        if (eyeResult.skippedReason) {
          notify("info", eyeResult.skippedReason);
        }
      }
      if (state.enhancementEngine === "local" && state.upscale) {
        finalCanvas = upscaleImage(finalCanvas, 2);
        processingSizes = processingSizes
          ? { ...processingSizes, final: canvasSize(finalCanvas) }
          : { input: canvasSize(target), final: canvasSize(finalCanvas) };
      }
      if (sizeLog && process.env.NODE_ENV !== "production") {
        console.info("[instant-photo-remaster] processing sizes", formatSizeLog(sizeLog));
      }
      const beforeCanvas = state.preprocessMode === "direct" ? sourceCanvasRef.current ?? corrected : corrected;
      finalCanvasRef.current = finalCanvas;
      setState((current) => ({
        ...current,
        finalUrl: finalCanvas.toDataURL("image/jpeg", 0.92),
        comparisonUrl: makeComparison(beforeCanvas, finalCanvas),
        processingSizes: processingSizes,
        isProcessing: false,
        processingMessage: null,
        canShare: typeof navigator !== "undefined" && "share" in navigator,
        error: null,
        errorScope: null,
        canCancel: false,
      }));
      notify(
        "success",
        processingSizes ?? sizeLog
          ? `補正プレビューを作成しました。${formatSizeLog(processingSizes ?? sizeLog!)}`
          : "補正プレビューを作成しました。",
      );
    } catch (error) {
      if (userCancelRef.current) {
        userCancelRef.current = false;
        return;
      }
      const message = error instanceof Error ? error.message : "";
      const errorScope = getEnhanceErrorScope(state.enhancementEngine);
      setState((current) => ({
        ...current,
        isProcessing: false,
        processingMessage: null,
        error:
          state.enhancementEngine === "ai"
            ? message || "AI補正に失敗しました。アクセスコードや通信状態を確認するか、ローカル補正をお試しください。"
            : state.enhancementEngine === "device-ai" && state.deviceEnhanceQuality === "max"
              ? "最高品質のスマホ内AI風補正に失敗しました。高品質または標準で再試行してください。"
            : error instanceof Error
              ? error.message
              : "補正画像の作成に失敗しました。別の画像または出力設定をお試しください。",
        errorScope,
        canCancel: false,
      }));
      notify("error", state.enhancementEngine === "ai" ? message || "AI補正に失敗しました。" : "補正に失敗しました。設定を変えて再試行してください。");
    }
  }, [notify, state.aiAccessCode, state.aiConsent, state.brightIntensity, state.cropSettings, state.deviceEnhanceQuality, state.enhancementEngine, state.eyeClarity, state.outputMode, state.preprocessMode, state.preset, state.upscale]);

  const saveFinal = useCallback(async () => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "保存しています...", error: null, errorScope: null, canCancel: false }));
    try {
      await exportImage(canvas);
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null, error: null, errorScope: null }));
      notify("success", "画像を保存しました。");
    } catch {
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null, error: "保存に失敗しました。ブラウザのダウンロード許可を確認してください。", errorScope: "save" }));
      notify("error", "保存に失敗しました。ブラウザのダウンロード許可を確認してください。");
    }
  }, [notify]);

  const saveComparison = useCallback(async () => {
    if (!state.comparisonUrl) return;
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "比較画像を保存しています...", error: null, errorScope: null, canCancel: false }));
    try {
      const image = new Image();
      image.src = state.comparisonUrl;
      await image.decode();
      const canvas = imageToCanvas(image);
      await exportImage(canvas, makeExportFileName("instant-photo-comparison"));
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null, error: null, errorScope: null }));
      notify("success", "比較画像を保存しました。");
    } catch {
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null, error: "比較画像の保存に失敗しました。もう一度プレビューを作成してからお試しください。", errorScope: "save" }));
      notify("error", "比較画像の保存に失敗しました。");
    }
  }, [notify, state.comparisonUrl]);

  const shareFinal = useCallback(async () => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "共有を準備しています...", error: null, errorScope: null, canCancel: false }));
    const fileName = makeExportFileName();
    try {
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const didShare = await shareImage(blob, fileName);
      if (!didShare) {
        await exportImage(canvas, fileName);
        notify("info", "このブラウザでは共有に対応していないため、画像を保存しました。");
      } else {
        notify("success", "共有を開始しました。");
      }
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null, error: null, errorScope: null }));
    } catch (error) {
      if (isShareCancel(error)) {
        setState((current) => ({ ...current, isProcessing: false, processingMessage: null }));
        notify("info", "共有をキャンセルしました。");
        return;
      }
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null, error: "共有に失敗しました。共有が使えない場合は画像保存をお試しください。", errorScope: "share" }));
      notify("error", "共有に失敗しました。画像保存をお試しください。");
    }
  }, [notify]);

  const cancelProcessing = useCallback(() => {
    userCancelRef.current = true;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setState((current) => ({
      ...current,
      isProcessing: false,
      processingMessage: null,
      canCancel: false,
      error: null,
      errorScope: null,
    }));
    notify("info", "処理をキャンセルしました。");
  }, [notify]);

  const actions = useMemo(
    () => ({
      loadFile,
      updateQuad,
      applyCorrection,
      renderFinal,
      saveFinal,
      saveComparison,
      shareFinal,
      cancelProcessing,
      setPreprocessMode,
      setEnhancementEngine: (enhancementEngine: EnhancementEngine) =>
        setState((current) => ({ ...current, enhancementEngine, aiConsent: enhancementEngine === "ai" ? current.aiConsent : false, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setAiConsent: (aiConsent: boolean) => setState((current) => ({ ...current, aiConsent, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setAiAccessCode: (aiAccessCode: string) => setState((current) => ({ ...current, aiAccessCode, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setPreset: (preset: EnhancementPreset) => setState((current) => ({ ...current, preset, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setBrightIntensity: (brightIntensity: BrightIntensity) => setState((current) => ({ ...current, brightIntensity, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setDeviceEnhanceQuality: (deviceEnhanceQuality: DeviceEnhanceQuality) => setState((current) => ({ ...current, deviceEnhanceQuality, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setOutputMode: (outputMode: OutputMode) => setState((current) => ({ ...current, outputMode, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setCropSettings: (cropSettings: CropSettings) => setState((current) => ({ ...current, cropSettings, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setUpscale: (upscale: boolean) => setState((current) => ({ ...current, upscale, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      setEyeClarity: (eyeClarity: EyeClarityLevel) => setState((current) => ({ ...current, eyeClarity, finalUrl: null, comparisonUrl: null, processingSizes: null, error: null, errorScope: null })),
      clearError: () => setState((current) => ({ ...current, error: null, errorScope: null })),
      clearNotice: () => setState((current) => ({ ...current, notice: null })),
    }),
    [applyCorrection, cancelProcessing, loadFile, renderFinal, saveComparison, saveFinal, setPreprocessMode, shareFinal, updateQuad],
  );

  return { state, actions };
}

function makeComparison(before: HTMLCanvasElement, after: HTMLCanvasElement): string {
  const width = after.width * 2;
  const height = after.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return after.toDataURL("image/jpeg", 0.92);
  ctx.fillStyle = "#fbfbfa";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(before, 0, 0, after.width, after.height);
  ctx.drawImage(after, after.width, 0);
  ctx.fillStyle = "rgba(24,24,27,0.72)";
  ctx.fillRect(0, 0, width, 52);
  ctx.fillStyle = "#ffffff";
  ctx.font = "26px Arial";
  ctx.fillText("Before", 24, 36);
  ctx.fillText("After", after.width + 24, 36);
  return canvas.toDataURL("image/jpeg", 0.9);
}


async function renderEnhancedCanvas(
  target: HTMLCanvasElement,
  engine: EnhancementEngine,
  preset: EnhancementPreset,
  deviceEnhanceQuality: DeviceEnhanceQuality,
  upscale: boolean,
  accessCode: string,
  brightIntensity: BrightIntensity,
  aiAbortRef: MutableRefObject<AbortController | null>,
): Promise<EnhancedRenderResult> {
  if (engine === "ai") return renderAIEnhancedCanvas(target, accessCode, preset, brightIntensity, aiAbortRef);
  if (engine === "device-ai") {
    const canvas = await enhanceOnDevice(target, { preset, quality: deviceEnhanceQuality, scale: upscale ? 2 : 1, brightIntensity });
    return { canvas, sizeLog: { input: canvasSize(target), final: canvasSize(canvas) } };
  }
  const canvas = renderLocalEnhancedCanvas(target, preset, brightIntensity);
  return { canvas, sizeLog: { input: canvasSize(target), final: canvasSize(canvas) } };
}

function renderLocalEnhancedCanvas(target: HTMLCanvasElement, preset: EnhancementPreset, brightIntensity: BrightIntensity): HTMLCanvasElement {
  return applyEnhancementPreset(target, preset, { brightIntensity });
}

async function renderAIEnhancedCanvas(
  target: HTMLCanvasElement,
  accessCode: string,
  preset: EnhancementPreset,
  brightIntensity: BrightIntensity,
  aiAbortRef: MutableRefObject<AbortController | null>,
): Promise<EnhancedRenderResult> {
  const input = canvasSize(target);
  const blob = await canvasToBlob(target, "image/jpeg", 0.92);
  const controller = new AbortController();
  aiAbortRef.current = controller;
  const timeout = window.setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const result = await enhanceWithAI(blob, { accessCode: accessCode.trim() || undefined, signal: controller.signal });
    const upscaled = await blobToCanvas(result.blob);
    const aiOutput = canvasSize(upscaled);
    const finalCanvas = applyEnhancementPreset(upscaled, preset, { brightIntensity, aiPostProcess: true });
    const sizeLog: ProcessingSizeLog = { input, aiOutput, final: canvasSize(finalCanvas) };
    return { canvas: finalCanvas, sizeLog };
  } finally {
    aiAbortRef.current = null;
    window.clearTimeout(timeout);
  }
}

async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return imageToCanvas(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 20));
}

function getEnhanceErrorScope(engine: EnhancementEngine): ErrorScope {
  if (engine === "ai") return "enhance-ai";
  if (engine === "device-ai") return "enhance-device";
  return "enhance-local";
}

function isShareCancel(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "NotAllowedError");
}

function getSafeDeviceQuality(target: HTMLCanvasElement, quality: DeviceEnhanceQuality, upscale: boolean): DeviceEnhanceQuality {
  if (quality !== "max" || !upscale) return quality;
  const projectedEdge = Math.max(target.width, target.height) * 2;
  const projectedPixels = target.width * target.height * 4;
  if (projectedEdge > 3400 || projectedPixels > 10000000) return "high";
  return quality;
}
