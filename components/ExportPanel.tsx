"use client";

type Props = {
  disabled?: boolean;
  canShare?: boolean;
  onSave: () => void;
  onSaveComparison: () => void;
  onShare: () => void;
  errorMessage?: string | null;
};

export function ExportPanel({ disabled, canShare, onSave, onSaveComparison, onShare, errorMessage }: Props) {
  return (
    <section className="mx-auto max-w-xl px-5 pb-10">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <h2 className="text-lg font-bold text-ink">保存</h2>
        {errorMessage ? <div className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700">{errorMessage}</div> : null}
        <div className="mt-4 grid gap-3">
          <button type="button" disabled={disabled} onClick={onSave} className="min-h-14 rounded-[8px] bg-ink px-5 py-4 text-base font-bold text-white disabled:opacity-50">
            補正後画像を保存
          </button>
          <button type="button" disabled={disabled} onClick={onSaveComparison} className="min-h-14 rounded-[8px] border border-zinc-300 bg-white px-5 py-4 text-base font-bold text-ink disabled:opacity-50">
            比較画像を保存
          </button>
          <button type="button" disabled={disabled} onClick={onShare} className="min-h-14 rounded-[8px] border border-zinc-300 bg-mist px-5 py-4 text-base font-bold text-ink disabled:opacity-50">
            {canShare ? "共有" : "共有用に保存"}
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600">画像処理はブラウザ内で行われます。選択した写真は外部サーバーに送信されません。</p>
      </div>
    </section>
  );
}
