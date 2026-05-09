"use client";

import { useState } from "react";

type Props = {
  before: string | null;
  after: string | null;
};

export function BeforeAfterSlider({ before, after }: Props) {
  const [position, setPosition] = useState(50);

  return (
    <section className="mx-auto max-w-xl px-5">
      <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-soft">
        <h2 className="text-lg font-bold text-ink">Before / After</h2>
        <div className="relative mt-4 overflow-hidden rounded-[8px] bg-zinc-100">
          {before && after ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={after} alt="補正後" className="block w-full select-none" draggable={false} />
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={before} alt="補正前" className="h-full max-w-none select-none object-cover" style={{ width: `${10000 / position}%` }} draggable={false} />
              </div>
              <div className="absolute bottom-0 top-0 w-1 bg-white shadow" style={{ left: `${position}%` }} />
            </>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 text-center text-sm leading-6 text-zinc-500">補正プレビューを作成すると比較できます。</div>
          )}
        </div>
        <input type="range" min={5} max={95} value={position} onChange={(event) => setPosition(Number(event.target.value))} className="mt-4 w-full accent-ink" disabled={!before || !after} />
      </div>
    </section>
  );
}
