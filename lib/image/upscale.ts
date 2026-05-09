import { getCanvasContext } from "./canvas";

export function upscaleImage(source: HTMLCanvasElement, scale = 2): HTMLCanvasElement {
  const output = document.createElement("canvas");
  output.width = Math.round(source.width * scale);
  output.height = Math.round(source.height * scale);
  const ctx = getCanvasContext(output);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, output.width, output.height);

  // Future AI super-resolution can replace this function without changing UI flow.
  return lightSharpen(output);
}

function lightSharpen(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = getCanvasContext(source);
  const original = ctx.getImageData(0, 0, source.width, source.height);
  const blur = document.createElement("canvas");
  blur.width = source.width;
  blur.height = source.height;
  const blurCtx = getCanvasContext(blur);
  blurCtx.filter = "blur(0.8px)";
  blurCtx.drawImage(source, 0, 0);
  const blurred = blurCtx.getImageData(0, 0, blur.width, blur.height);

  for (let i = 0; i < original.data.length; i += 4) {
    original.data[i] = clampByte(original.data[i] + (original.data[i] - blurred.data[i]) * 0.18);
    original.data[i + 1] = clampByte(original.data[i + 1] + (original.data[i + 1] - blurred.data[i + 1]) * 0.18);
    original.data[i + 2] = clampByte(original.data[i + 2] + (original.data[i + 2] - blurred.data[i + 2]) * 0.18);
  }

  ctx.putImageData(original, 0, 0);
  return source;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
