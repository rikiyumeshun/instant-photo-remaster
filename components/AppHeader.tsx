export function AppHeader() {
  return (
    <header className="px-5 pb-4 pt-7 sm:pt-10">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold tracking-wide text-accent">Instant Photo Remaster</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight text-ink sm:text-5xl">
          白枠フォトを、
          <br />
          雰囲気そのまま綺麗に。
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-700">
          スマホで撮ったインスタント写真を、自動で傾き補正・色補正・高画質化風に整えます。
        </p>
        <a href="./privacy/" className="mt-4 inline-flex min-h-10 items-center rounded-[8px] border border-zinc-300 bg-white px-3 text-sm font-bold text-ink">
          Privacy
        </a>
      </div>
    </header>
  );
}
