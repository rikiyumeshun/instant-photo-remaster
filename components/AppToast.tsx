"use client";

import { useEffect } from "react";
import type { Notice } from "@/lib/image/types";

type Props = {
  notice: Notice | null;
  offset?: boolean;
  onClose: () => void;
};

const styles: Record<Notice["kind"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function AppToast({ notice, offset, onClose }: Props) {
  useEffect(() => {
    if (!notice) return undefined;
    const duration = notice.kind === "error" || notice.kind === "warning" ? 7000 : 5000;
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [notice, onClose]);

  if (!notice) return null;
  const ariaLive = notice.kind === "error" || notice.kind === "warning" ? "assertive" : "polite";

  return (
    <div aria-live={ariaLive} role="status" className={`fixed inset-x-4 z-30 mx-auto max-w-xl ${offset ? "bottom-20" : "bottom-4"}`}>
      <div className={`flex items-start gap-3 rounded-[8px] border px-4 py-3 text-sm font-semibold leading-6 shadow-soft ${styles[notice.kind]}`}>
        <p className="min-w-0 flex-1">{notice.message}</p>
        <button type="button" onClick={onClose} className="shrink-0 rounded-[6px] px-2 text-xs font-bold">
          閉じる
        </button>
      </div>
    </div>
  );
}
