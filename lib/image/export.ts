export function makeExportFileName(prefix = "instant-photo-remaster"): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${date}-${time}.jpg`;
}

export async function exportImage(canvas: HTMLCanvasElement, fileName = makeExportFileName()): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });

  if (!blob) {
    throw new Error("画像を書き出せませんでした。");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return blob;
}

export async function shareImage(blob: Blob, fileName: string): Promise<boolean> {
  if (!navigator.canShare || !navigator.share) return false;
  const file = new File([blob], fileName, { type: "image/jpeg" });
  if (!navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], title: "Instant Photo Remaster" });
  return true;
}
