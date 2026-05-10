"use client";

import { useRef } from "react";

type Props = {
  onSelect: (file: File) => void;
  disabled?: boolean;
};

export function ImageUploader({ onSelect, disabled }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleChange = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onSelect(file);
  };

  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            className="min-h-14 rounded-[8px] bg-ink px-5 py-4 text-base font-bold text-white disabled:opacity-50"
          >
            カメラで撮影
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => uploadRef.current?.click()}
            className="min-h-14 rounded-[8px] border border-zinc-300 bg-white px-5 py-4 text-base font-bold text-ink disabled:opacity-50"
          >
            画像をアップロード
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-600">JPEG、PNG、WebP、HEICに対応。20MBを超える画像は読み込みに時間がかかる場合があります。</p>
        <input ref={cameraRef} type="file" accept="image/*,.heic,.heif" capture="environment" className="hidden" onChange={(event) => handleChange(event.target.files)} />
        <input ref={uploadRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(event) => handleChange(event.target.files)} />
      </div>
    </section>
  );
}
