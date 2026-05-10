"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { imageToCanvas, loadImageFile, resizeForProcessing } from "@/lib/image/canvas";
import { cropInnerPhoto } from "@/lib/image/crop";
import { detectInstantPhotoFrame } from "@/lib/image/detectFrame";
import { enhanceOnDevice } from "@/lib/image/deviceEnhance";
import { applyEnhancementPreset } from "@/lib/image/enhance";
import { enhanceWithAI } from "@/lib/image/aiEnhance";
import { canvasToBlob, exportImage, makeExportFileName, shareImage } from "@/lib/image/export";
import { perspectiveTransform } from "@/lib/image/perspective";
import { upscaleImage } from "@/lib/image/upscale";
import type { CropSettings, DetectionResult, EnhancementEngine, EnhancementPreset, OutputMode, Quad } from "@/lib/image/types";
import { DEFAULT_CROP_SETTINGS } from "@/lib/image/types";

type ProcessorState = {
  originalUrl: string | null;
  correctedUrl: string | null;
  finalUrl: string | null;
  comparisonUrl: string | null;
  sourceSize: { width: number; height: number } | null;
  quad: Quad | null;
  detection: DetectionResult | null;
  preset: EnhancementPreset;
  enhancementEngine: EnhancementEngine;
  aiConsent: boolean;
  aiAccessCode: string;
  outputMode: OutputMode;
  cropSettings: CropSettings;
  isProcessing: boolean;
  processingMessage: string | null;
  error: string | null;
  canShare: boolean;
  upscale: boolean;
};

const initialState: ProcessorState = {
  originalUrl: null,
  correctedUrl: null,
  finalUrl: null,
  comparisonUrl: null,
  sourceSize: null,
  quad: null,
  detection: null,
  preset: "natural",
  enhancementEngine: "local",
  aiConsent: false,
  aiAccessCode: "",
  outputMode: "frame",
  cropSettings: DEFAULT_CROP_SETTINGS,
  isProcessing: false,
  processingMessage: null,
  error: null,
  canShare: false,
  upscale: true,
};

export function useImageProcessor() {
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const correctedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const finalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<ProcessorState>(initialState);

  const loadFile = useCallback(async (file: File) => {
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "画像を読み込んでいます...", error: null }));
    try {
      const image = await loadImageFile(file);
      const raw = imageToCanvas(image);
      const resized = resizeForProcessing(raw).canvas;
      const detection = detectInstantPhotoFrame(resized);
      sourceCanvasRef.current = resized;
      correctedCanvasRef.current = null;
      finalCanvasRef.current = null;
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
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isProcessing: false,
        processingMessage: null,
        error: error instanceof Error ? error.message : "画像の読み込みに失敗しました。",
      }));
    }
  }, []);

  const updateQuad = useCallback((quad: Quad) => {
    setState((current) => ({ ...current, quad, correctedUrl: null, finalUrl: null, comparisonUrl: null }));
    correctedCanvasRef.current = null;
    finalCanvasRef.current = null;
  }, []);

  const applyCorrection = useCallback(async () => {
    const source = sourceCanvasRef.current;
    if (!source || !state.quad) return;
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "台形補正中です...", error: null }));
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
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isProcessing: false,
        processingMessage: null,
        error: error instanceof Error ? error.message : "台形補正に失敗しました。四隅の位置を少し内側に調整してください。",
      }));
    }
  }, [state.quad]);

  const renderFinal = useCallback(async () => {
    const corrected = correctedCanvasRef.current;
    if (!corrected) return;
    if (state.enhancementEngine === "ai" && !state.aiConsent) {
      setState((current) => ({ ...current, error: "AI高画質化を実行するには、写真をサーバーへ送信することへの同意が必要です。" }));
      return;
    }
    setState((current) => ({
      ...current,
      isProcessing: true,
      processingMessage:
        state.enhancementEngine === "ai"
          ? "AI補正中です。少し時間がかかります..."
          : state.enhancementEngine === "device-ai"
            ? "スマホ内で高画質化しています..."
            : "補正画像を作成しています...",
      error: null,
    }));
    await yieldToBrowser();
    try {
      const target = state.outputMode === "inner" ? cropInnerPhoto(corrected, state.cropSettings) : corrected;
      const finalCanvas = await renderEnhancedCanvas(target, state.enhancementEngine, state.preset, state.upscale, state.aiAccessCode);
      finalCanvasRef.current = finalCanvas;
      setState((current) => ({
        ...current,
        finalUrl: finalCanvas.toDataURL("image/jpeg", 0.92),
        comparisonUrl: makeComparison(corrected, finalCanvas),
        isProcessing: false,
        processingMessage: null,
        canShare: typeof navigator !== "undefined" && "share" in navigator,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isProcessing: false,
        processingMessage: null,
        error:
          state.enhancementEngine === "ai"
            ? "AI補正に失敗しました。ローカル補正をお試しください。"
            : error instanceof Error
              ? error.message
              : "補正画像の作成に失敗しました。別の画像または出力設定をお試しください。",
      }));
    }
  }, [state.aiAccessCode, state.aiConsent, state.cropSettings, state.enhancementEngine, state.outputMode, state.preset, state.upscale]);

  const saveFinal = useCallback(async () => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;
    setState((current) => ({ ...current, isProcessing: true, processingMessage: "保存しています...", error: null }));
    try {
      await exportImage(canvas);
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null }));
    } catch {
      setState((current) => ({ ...current, isProcessing: false, processingMessage: null, error: "保存に失敗しました。ブラウザのダウンロード許可を確認してください。" }));
    }
  }, []);

  const saveComparison = useCallback(async () => {
    if (!state.comparisonUrl) return;
    const image = new Image();
    image.src = state.comparisonUrl;
    await image.decode();
    const canvas = imageToCanvas(image);
    await exportImage(canvas, makeExportFileName("instant-photo-comparison"));
  }, [state.comparisonUrl]);

  const shareFinal = useCallback(async () => {
    const canvas = finalCanvasRef.current;
    if (!canvas) return;
    const fileName = makeExportFileName();
    const blob = await exportImage(canvas, fileName);
    try {
      await shareImage(blob, fileName);
    } catch {
      setState((current) => ({ ...current, error: "共有を完了できませんでした。画像はダウンロード済みです。" }));
    }
  }, []);

  const actions = useMemo(
    () => ({
      loadFile,
      updateQuad,
      applyCorrection,
      renderFinal,
      saveFinal,
      saveComparison,
      shareFinal,
      setEnhancementEngine: (enhancementEngine: EnhancementEngine) =>
        setState((current) => ({ ...current, enhancementEngine, aiConsent: enhancementEngine === "ai" ? current.aiConsent : false, finalUrl: null, comparisonUrl: null })),
      setAiConsent: (aiConsent: boolean) => setState((current) => ({ ...current, aiConsent, finalUrl: null, comparisonUrl: null })),
      setAiAccessCode: (aiAccessCode: string) => setState((current) => ({ ...current, aiAccessCode, finalUrl: null, comparisonUrl: null })),
      setPreset: (preset: EnhancementPreset) => setState((current) => ({ ...current, preset, finalUrl: null, comparisonUrl: null })),
      setOutputMode: (outputMode: OutputMode) => setState((current) => ({ ...current, outputMode, finalUrl: null, comparisonUrl: null })),
      setCropSettings: (cropSettings: CropSettings) => setState((current) => ({ ...current, cropSettings, finalUrl: null, comparisonUrl: null })),
      setUpscale: (upscale: boolean) => setState((current) => ({ ...current, upscale, finalUrl: null, comparisonUrl: null })),
      clearError: () => setState((current) => ({ ...current, error: null })),
    }),
    [applyCorrection, loadFile, renderFinal, saveComparison, saveFinal, shareFinal, updateQuad],
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
  upscale: boolean,
  accessCode: string,
): Promise<HTMLCanvasElement> {
  if (engine === "ai") return renderAIEnhancedCanvas(target, accessCode);
  if (engine === "device-ai") return enhanceOnDevice(target, { preset, scale: upscale ? 2 : 1 });
  return renderLocalEnhancedCanvas(target, preset, upscale);
}

function renderLocalEnhancedCanvas(target: HTMLCanvasElement, preset: EnhancementPreset, upscale: boolean): HTMLCanvasElement {
  const enhanced = applyEnhancementPreset(target, preset);
  return upscale ? upscaleImage(enhanced, 2) : enhanced;
}

async function renderAIEnhancedCanvas(target: HTMLCanvasElement, accessCode: string): Promise<HTMLCanvasElement> {
  const blob = await canvasToBlob(target, "image/jpeg", 0.92);
  const result = await enhanceWithAI(blob, { accessCode: accessCode.trim() || undefined });
  return blobToCanvas(result.blob);
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
