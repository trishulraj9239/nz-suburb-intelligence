"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small ⓘ popover for section headings that need context (extracted from
 * profile-panel in TRI-59 so hazard/planning surfaces can reuse it).
 * Positions below the anchor with no collision detection — avoid using it at
 * the very bottom of a scrolling panel or the mobile bottom sheet's last row.
 */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <span ref={boxRef} className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-hairline text-[9px] font-semibold normal-case text-ink/55 transition-colors hover:border-harbour hover:text-harbour"
      >
        i
      </button>
      {open && (
        <span className="absolute left-0 top-6 z-30 block w-64 rounded-lg border border-hairline bg-surface p-3 text-[11px] font-normal normal-case leading-snug tracking-normal text-ink/85 shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}
