"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";

/**
 * One anchored popover for the whole app (TRI-145, Phase A) — replaces the
 * hand-rolled `mousedown`-outside popovers (InfoTip, Places, Budget) and
 * hosts the phone "You" menu and the map Layers dock.
 *
 * Behaviour (dependency-free, per the design decision):
 *  - renders inside the caller's `relative` wrapper, below the anchor by
 *    default; flips above it when there is not enough room below
 *    (`side="auto"`), which is what the old InfoTip lacked at the foot of the
 *    sheet;
 *  - Escape closes (handled on the dialog so a nested popover — Places inside
 *    the You menu — closes innermost first); pointerdown outside closes; on
 *    close, focus returns to the anchor so keyboard users are not stranded;
 *  - initial focus goes to the first focusable child (or the dialog itself);
 *  - no focus trap — these are lightweight, non-modal dialogs, so tabbing out
 *    of one simply closes it.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  side = "auto",
  align = "end",
  width = "w-80",
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  side?: "bottom" | "top" | "auto";
  align?: "start" | "end";
  width?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"bottom" | "top">(side === "top" ? "top" : "bottom");

  // Flip when the popover would run off the bottom of the viewport.
  useLayoutEffect(() => {
    if (!open || side !== "auto") return;
    const anchor = anchorRef.current;
    const el = ref.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const need = el.offsetHeight + 12;
    const below = window.innerHeight - a.bottom;
    setPlacement(below < need && a.top > need ? "top" : "bottom");
  }, [open, side, anchorRef]);

  const close = (returnFocus: boolean) => {
    onClose();
    if (returnFocus) anchorRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    (first ?? el)?.focus({ preventScroll: true });

    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    // Escape while focus sits on the anchor (dialog open but not focused).
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (anchor && anchor.contains(document.activeElement)) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation(); // innermost dialog wins; the document fallback sees defaultPrevented
    close(true);
  };
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next) return; // focus left the document (tab switch) — keep the dialog
    if (ref.current?.contains(next) || anchorRef.current?.contains(next)) return;
    onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={`absolute z-40 ${width} max-w-[calc(100vw-1.5rem)] rounded-card border border-hairline bg-surface p-3 text-body text-ink shadow-pop outline-none ${
        placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
      } ${align === "end" ? "right-0" : "left-0"} ${className}`}
    >
      {children}
    </div>
  );
}
