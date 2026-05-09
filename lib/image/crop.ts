import type { CropSettings } from "./types";
import { getCanvasContext } from "./canvas";

export function cropInnerPhoto(source: HTMLCanvasElement, settings: CropSettings): HTMLCanvasElement {
  const x = Math.round(source.width * settings.side);
  const y = Math.round(source.height * settings.top);
  const width = Math.max(1, Math.round(source.width * (1 - settings.side * 2)));
  const height = Math.max(1, Math.round(source.height * (1 - settings.top - settings.bottom)));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = getCanvasContext(output);
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  return output;
}
