"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { useIsLg } from "@/lib/use-is-lg";
import { SuburbSearch } from "./suburb-search";
import { ProfilePanel } from "./profile-panel";
import { ComparePanel } from "./compare-panel";
import { AnswerThread } from "./answer-thread";

const EXAMPLES: { sa2: string; name: string }[] = [
  { sa2: "130400", name: "Ponsonby West" },
  { sa2: "126801", name: "Takapuna Central" },
  { sa2: "166000", name: "Pukekohe Central" },
];

const PANEL_MIN = 320;
const panelMax = () => Math.round(window.innerWidth * 0.6); // keep ≥40% map

// Mobile bottom-sheet snap points (heights). "peek" is a fixed strip showing the
// grab handle + search; "half"/"full" are fractions of the available map area.
/** Right-pane views. "answer" exists only below lg — on desktop the answer is
 *  the full-width strip (TRI-83), so the tab set differs by frame. */
type Tab = "answer" | "profile" | "compare";

type Snap = "peek" | "half" | "full";
const SNAP_ORDER: Snap[] = ["peek", "half", "full"];
const PEEK_PX = 104;
const HALF_FRAC = 0.5;
const FULL_FRAC = 0.92;
const TAP_SLOP = 6; // px of travel below which a pointer gesture counts as a tap

/**
 * Right pane. Desktop (≥lg): an <aside> in the row, user-resizable via the
 * left-edge handle (drag, clamped to 60vw; double-click resets). Compare mode
 * auto-widens when no manual width is set.
 *
 * Mobile (<lg): a draggable bottom sheet over the full-screen map (TRI-37).
 * Drag the grab handle to snap between peek / half / full, or tap it to cycle
 * up. Everything (search, answer, tabs, profile) scrolls together inside the
 * sheet, so nothing gets shoved out of reach and the map is always a swipe away.
 */
export function ContextPanel() {
  const { selected, select, compare, question, currentTurn } = useWorkspace();
  const [tab, setTab] = useState<Tab>("profile");
  const isLg = useIsLg();

  // --- Desktop resize state ------------------------------------------------
  const [userWidth, setUserWidth] = useState<number | null>(null);
  const dragging = useRef(false);

  const onHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture unsupported for this pointer type — window-level move still works
    }
    e.preventDefault();
  }, []);
  const onHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const w = Math.min(Math.max(window.innerWidth - e.clientX, PANEL_MIN), panelMax());
    setUserWidth(w);
  }, []);
  const onHandlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // no capture held
    }
  }, []);

  // --- Mobile sheet state --------------------------------------------------
  const [snap, setSnap] = useState<Snap>("half");
  const [dragH, setDragH] = useState<number | null>(null); // live height while dragging
  const [areaH, setAreaH] = useState(0); // measured height of the map/sheet area
  const sheetDrag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const areaRO = useRef<ResizeObserver | null>(null);

  // Measure the sheet's parent (the <main> content box) so snap heights track
  // the real available space (topbar can wrap to two rows on phones).
  const sheetRef = useCallback((el: HTMLElement | null) => {
    areaRO.current?.disconnect();
    const parent = el?.parentElement;
    if (!parent) return;
    const measure = () => setAreaH(parent.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    areaRO.current = ro;
  }, []);
  useEffect(() => () => areaRO.current?.disconnect(), []);

  const snapHeight = useCallback(
    (s: Snap) => {
      const ph = areaH || (typeof window !== "undefined" ? window.innerHeight * 0.7 : 600);
      if (s === "peek") return PEEK_PX;
      return Math.round(ph * (s === "half" ? HALF_FRAC : FULL_FRAC));
    },
    [areaH],
  );

  const nearestSnap = useCallback(
    (h: number): Snap =>
      SNAP_ORDER.reduce((best, s) =>
        Math.abs(snapHeight(s) - h) < Math.abs(snapHeight(best) - h) ? s : best,
      ),
    [snapHeight],
  );

  // Surfacing a result shouldn't leave the reader stuck at "peek". Adjust during
  // render on change (React's "store previous value" pattern) rather than in an
  // effect, so there's no cascading-render lint nor a post-commit flash.
  const surfacedKey = selected ?? question ?? null;
  const [prevSurfacedKey, setPrevSurfacedKey] = useState<string | null>(null);
  if (surfacedKey !== prevSurfacedKey) {
    setPrevSurfacedKey(surfacedKey);
    if (surfacedKey && snap === "peek") setSnap("half");
  }

  const onSheetPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      sheetDrag.current = {
        startY: e.clientY,
        startH: dragH ?? snapHeight(snap),
        moved: false,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // window-level move still works
      }
      e.preventDefault();
    },
    [dragH, snap, snapHeight],
  );
  const onSheetPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = sheetDrag.current;
      if (!d) return;
      const delta = d.startY - e.clientY; // up = grow
      if (Math.abs(delta) > TAP_SLOP) d.moved = true;
      const h = Math.min(Math.max(d.startH + delta, PEEK_PX), snapHeight("full"));
      setDragH(h);
    },
    [snapHeight],
  );
  const onSheetPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = sheetDrag.current;
      sheetDrag.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no capture held
      }
      if (!d) return;
      if (!d.moved) {
        // tap → cycle up to the next snap (wraps full → peek)
        setSnap((s) => SNAP_ORDER[(SNAP_ORDER.indexOf(s) + 1) % SNAP_ORDER.length]);
      } else if (dragH !== null) {
        setSnap(nearestSnap(dragH));
      }
      setDragH(null);
    },
    [dragH, nearestSnap],
  );

  // --- Shared content ------------------------------------------------------
  const showCompareTab = compare.length >= 2;
  const showAnswerTab = !isLg && !!question;

  // TRI-84: an answer that pins suburbs used to leave the user staring at the
  // Profile tab (the compare set changed with nothing on screen to show it).
  // meta.intent — captured since TRI-82 — now steers the view. Adjusted during
  // render via the "store previous value" pattern, never setState-in-effect.
  const intentKey = currentTurn ? `${currentTurn.key}:${currentTurn.intent ?? ""}` : null;
  const [prevIntentKey, setPrevIntentKey] = useState<string | null>(null);
  if (intentKey !== prevIntentKey) {
    setPrevIntentKey(intentKey);
    if (currentTurn) {
      if (currentTurn.intent === "compare" && compare.length >= 2) setTab("compare");
      else if (!isLg) setTab("answer");
    }
  }

  const available: Tab[] = [
    ...(showAnswerTab ? (["answer"] as const) : []),
    "profile",
    ...(showCompareTab ? (["compare"] as const) : []),
  ];
  const activeTab: Tab = available.includes(tab) ? tab : "profile";

  const tabLabel = (t: Tab) =>
    t === "answer" ? "Answer" : t === "profile" ? "Profile" : `Compare (${compare.length})`;

  const tabsEl = available.length > 1 ? (
    <div className="flex gap-1 rounded-lg border border-hairline bg-canvas p-0.5">
      {available.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === t ? "bg-surface text-ink shadow-sm" : "text-ink/55 hover:text-ink"
          }`}
        >
          {tabLabel(t)}
        </button>
      ))}
    </div>
  ) : null;

  const bodyEl =
    activeTab === "answer" ? (
      // Same body as the desktop strip; only the cap number differs — it comes
      // from the sheet's live snap height rather than a viewport fraction.
      <AnswerThread maxHeight={`${Math.max(140, (dragH ?? snapHeight(snap)) - 210)}px`} />
    ) : activeTab === "compare" ? (
      <ComparePanel />
    ) : selected ? (
      <ProfilePanel sa2={selected} />
    ) : (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink/60">
          Click a suburb on the map or search above to open its profile.
        </p>
        <div className="rounded-lg border border-hairline bg-canvas p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Try one</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button
                key={e.sa2}
                type="button"
                onClick={() => select(e.sa2)}
                className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs text-ink transition-colors hover:border-harbour"
              >
                {e.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

  // --- Mobile: bottom sheet ------------------------------------------------
  if (!isLg) {
    const height = dragH ?? snapHeight(snap);
    return (
      <aside
        ref={sheetRef}
        // Marks this as covering the map: fitPadding() measures the real box
        // (TRI-85) instead of guessing a viewport fraction, so map fits stay
        // correct at every snap and mid-drag.
        data-nzsi-occludes=""
        style={{ height }}
        className={`absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-hairline bg-surface shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.35)] ${
          dragH === null ? "transition-[height] duration-200 ease-out" : ""
        }`}
      >
        {/* Grab handle — drag to snap, tap to cycle up */}
        <div
          role="button"
          aria-label={`Resize panel (currently ${snap}) — drag up or down, or tap to expand`}
          tabIndex={0}
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 active:cursor-grabbing"
        >
          <span className="h-1.5 w-10 rounded-full bg-ink/20" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
          <SuburbSearch />
          {tabsEl}
          {bodyEl}
        </div>
      </aside>
    );
  }

  // --- Desktop: resizable aside --------------------------------------------
  // TRI-87: 52rem was a single number for both 2- and 3-way comparisons, so a
  // third column squeezed. Auto-width now scales with the set (still clamped to
  // 60vw, so the map keeps at least 40% and narrow laptops fall back to the
  // panel's own horizontal scroll rather than crushing the map).
  const compareWidthClass = compare.length >= 3 ? "lg:w-[60rem]" : "lg:w-[46rem]";

  const sizeStyle =
    userWidth !== null
      ? { width: userWidth, maxWidth: "60vw", flex: "none" as const }
      : undefined;

  return (
    <aside
      style={sizeStyle}
      className={`relative flex min-h-0 w-full flex-1 flex-col gap-4 bg-surface p-4 lg:flex-none lg:p-5 ${
        activeTab === "compare" ? `${compareWidthClass} lg:max-w-[60vw]` : "lg:w-full lg:max-w-md"
      }`}
    >
      {/* Resize handle (desktop only). TRI-87: the drag has always worked but
          nothing advertised it — a persistent grip sits at the midpoint and
          strengthens on hover, so the affordance is discoverable without
          adding chrome. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel (double-click to reset)"
        title="Drag to resize · double-click to reset"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onDoubleClick={() => setUserWidth(null)}
        className="group absolute inset-y-0 left-0 z-20 hidden w-1.5 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-harbour/40 active:bg-harbour/60 lg:flex lg:items-center"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none -ml-[3px] flex h-10 w-2 items-center justify-center rounded-full border border-hairline bg-surface shadow-sm transition-colors group-hover:border-harbour"
        >
          <span className="h-4 w-px bg-ink/25 transition-colors group-hover:bg-harbour" />
        </span>
      </div>
      <SuburbSearch />
      {tabsEl}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{bodyEl}</div>
    </aside>
  );
}
