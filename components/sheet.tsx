"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { TOKENS } from "@/lib/tokens";

export type Snap = "peek" | "half" | "full";
export const SNAP_ORDER: Snap[] = ["peek", "half", "full"];
export const PEEK_PX = TOKENS.sheet.peekPx;
const HALF_FRAC = TOKENS.sheet.halfFrac;
const FULL_FRAC = TOKENS.sheet.fullFrac;
const TAP_SLOP = 6; // px of travel below which a pointer gesture counts as a tap

/**
 * The phone bottom sheet (TRI-145, Phase A; mechanics lifted from
 * context-panel.tsx where they lived since TRI-37/TRI-79/TRI-85).
 *
 *  - Controlled: the caller owns `snap` (it still runs the "peek → half when
 *    something surfaces" rule during render).
 *  - The pinned header (grab handle + whatever the caller passes, typically
 *    search + tabs) never scrolls and is the whole drag surface — a finger
 *    anywhere on it drags; taps on buttons/inputs inside it are left alone.
 *  - The body scrolls on its own, so tabs stay reachable at every snap.
 *  - Keyboard: the handle is a `slider` over the three snaps — ArrowUp/PageUp
 *    grow, ArrowDown/PageDown shrink, Home = peek, End = full, Enter/Space
 *    cycles up (the old tap behaviour).
 *  - Safe area: bottom padding honours the home indicator; the height
 *    transition is off under `prefers-reduced-motion`.
 *  - `children` is a render prop receiving the live height, so the Answer tab
 *    can cap its scroll box without the caller reading DOM.
 *
 * Marked `data-nzsi-occludes` so the map's fitPadding() measures it (TRI-85).
 */
export function BottomSheet({
  snap,
  onSnap,
  header,
  label,
  children,
}: {
  snap: Snap;
  onSnap: (s: Snap) => void;
  header: ReactNode;
  label: string;
  children: (height: number) => ReactNode;
}) {
  const [dragH, setDragH] = useState<number | null>(null);
  const [areaH, setAreaH] = useState(0);
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const ro = useRef<ResizeObserver | null>(null);

  // Measure the parent (the <main> content box) so snap heights track the real
  // available space; constant until measured so server and first client render
  // agree (TRI-79).
  const sheetRef = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    const parent = el?.parentElement;
    if (!parent) return;
    const measure = () => setAreaH(parent.clientHeight);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(parent);
    ro.current = obs;
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);

  const snapHeight = useCallback(
    (s: Snap) => {
      const ph = areaH || 600;
      if (s === "peek") return PEEK_PX;
      return Math.round(ph * (s === "half" ? HALF_FRAC : FULL_FRAC));
    },
    [areaH],
  );
  const nearest = useCallback(
    (h: number): Snap => SNAP_ORDER.reduce((best, s) => (Math.abs(snapHeight(s) - h) < Math.abs(snapHeight(best) - h) ? s : best)),
    [snapHeight],
  );

  const isInteractive = (t: EventTarget | null) =>
    !!(t as HTMLElement | null)?.closest?.("button, input, select, textarea, a, [role=tab], [role=option]");

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (isInteractive(e.target)) return; // let buttons/inputs in the header work normally
      drag.current = { startY: e.clientY, startH: dragH ?? snapHeight(snap), moved: false };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // window-level move still works
      }
      e.preventDefault();
    },
    [dragH, snap, snapHeight],
  );
  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const delta = d.startY - e.clientY; // up = grow
      if (Math.abs(delta) > TAP_SLOP) d.moved = true;
      setDragH(Math.min(Math.max(d.startH + delta, PEEK_PX), snapHeight("full")));
    },
    [snapHeight],
  );
  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no capture held
      }
      if (!d) return;
      if (!d.moved) onSnap(SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length]);
      else if (dragH !== null) onSnap(nearest(dragH));
      setDragH(null);
    },
    [dragH, nearest, onSnap, snap],
  );

  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SNAP_ORDER.indexOf(snap);
    let next: Snap | null = null;
    if (e.key === "ArrowUp" || e.key === "PageUp") next = SNAP_ORDER[Math.min(i + 1, SNAP_ORDER.length - 1)];
    else if (e.key === "ArrowDown" || e.key === "PageDown") next = SNAP_ORDER[Math.max(i - 1, 0)];
    else if (e.key === "Home") next = "peek";
    else if (e.key === "End") next = "full";
    else if (e.key === "Enter" || e.key === " ") next = SNAP_ORDER[(i + 1) % SNAP_ORDER.length];
    if (!next) return;
    e.preventDefault();
    onSnap(next);
  };

  const height = dragH ?? snapHeight(snap);

  return (
    <aside
      ref={sheetRef}
      aria-label={label}
      data-nzsi-occludes=""
      style={{ height }}
      className={`absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-sheet border-t border-hairline bg-surface shadow-sheet ${
        dragH === null ? "transition-[height] duration-200 ease-out motion-reduce:transition-none" : ""
      }`}
    >
      {/* Pinned header: the whole strip drags; the handle is the keyboard control. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex shrink-0 cursor-grab touch-none flex-col gap-2 px-4 pb-2 active:cursor-grabbing"
      >
        <div
          role="slider"
          aria-label="Panel height"
          aria-valuemin={0}
          aria-valuemax={SNAP_ORDER.length - 1}
          aria-valuenow={SNAP_ORDER.indexOf(snap)}
          aria-valuetext={snap}
          aria-orientation="vertical"
          tabIndex={0}
          onKeyDown={onHandleKey}
          className="flex min-h-7 items-center justify-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-harbour"
        >
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-ink/25" />
        </div>
        {header}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children(height)}
      </div>
    </aside>
  );
}
