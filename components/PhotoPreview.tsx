type Props = {
  src: string | null;
  label: string;
  emptyText?: string;
  dimensions?: { width: number; height: number } | null;
  dimensionNote?: string | null;
};

export function PhotoPreview({ src, label, emptyText = "画像を選択するとここに表示されます。", dimensions, dimensionNote }: Props) {
  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="overflow-hidden rounded-[8px] border border-zinc-200 bg-white shadow-soft">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-base font-bold text-ink">{label}</h2>
          {dimensions ? (
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              {dimensions.width} × {dimensions.height}px
              {dimensionNote ? ` · ${dimensionNote}` : ""}
            </p>
          ) : null}
        </div>
        <div className="grid min-h-80 place-items-center bg-zinc-100 p-3">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={label} className="max-h-[68vh] w-auto rounded-[4px] object-contain shadow-lg" />
          ) : (
            <p className="px-6 text-center text-sm leading-6 text-zinc-500">{emptyText}</p>
          )}
        </div>
      </div>
    </section>
  );
}
