"use client";

import { useRef, useState } from "react";
import { Popover } from "./popover";

/**
 * Small ⓘ popover for section headings that need context (extracted from
 * profile-panel in TRI-59). Since TRI-145 it sits on the shared Popover, so it
 * flips upward at the foot of a scrolling panel, closes on Escape, and returns
 * focus — and it works on touch (a tap, not a hover).
 */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-block align-middle">
      <button
        ref={anchorRef}
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-hairline text-micro font-semibold normal-case tracking-normal text-ink/60 transition-colors hover:border-harbour hover:text-harbour"
      >
        i
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label={label} align="start" width="w-72">
        <p className="text-label font-normal normal-case leading-snug tracking-normal text-ink/85">{text}</p>
      </Popover>
    </span>
  );
}
