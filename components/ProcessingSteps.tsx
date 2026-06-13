import type { PreprocessMode } from "@/lib/image/types";

type Props = {
  preprocessMode: PreprocessMode;
  hasImage: boolean;
  hasCorrected: boolean;
  hasFinal: boolean;
};

export function ProcessingSteps({ preprocessMode, hasImage, hasCorrected, hasFinal }: Props) {
  const steps =
    preprocessMode === "direct"
      ? [
          { label: "選択", done: hasImage },
          { label: "補正", done: hasFinal },
          { label: "保存", done: hasFinal },
        ]
      : [
          { label: "選択", done: hasImage },
          { label: "四隅", done: hasCorrected },
          { label: "補正", done: hasFinal },
          { label: "保存", done: hasFinal },
        ];

  return (
    <nav className="mx-auto max-w-xl px-5 py-4" aria-label="処理ステップ">
      <ol className={`grid gap-2 ${preprocessMode === "direct" ? "grid-cols-3" : "grid-cols-4"}`}>
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${step.done ? "bg-ink text-white" : "bg-zinc-200 text-zinc-600"}`}>
              {index + 1}
            </span>
            <span className="hidden text-sm font-semibold text-zinc-700 min-[380px]:inline">{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
