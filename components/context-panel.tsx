"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useWorkspace } from "@/lib/workspace";
import { SuburbSearch } from "./suburb-search";
import { ProfilePanel } from "./profile-panel";
import { ComparePanel } from "./compare-panel";
import { AnswerPanel } from "./answer-panel";

const EXAMPLES: { sa2: string; name: string }[] = [
  { sa2: "130400", name: "Ponsonby West" },
  { sa2: "126801", name: "Takapuna Central" },
  { sa2: "166000", name: "Pukekohe Central" },
];

const lgQuery = "(min-width: 1024px)";
const subscribeLg = (cb: () => void) => {
  const mq = window.matchMedia(lgQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsLg = () =>
  useSyncExternalStore(subscribeLg, () => window.matchMedia(lgQuery).matches, () => false);

const PANEL_MIN = 320;
const panelMax = () => Math.round(window.innerWidth * 0.6); // keep ≥40% map

// Mobile bottom-sheet snap points (heights). "peek" is a fixed strip showing the
// grab handle + search; "half"/"full" are fractions of the available map area.
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
  const { selected, select, compare, question } = useWorkspace();
  const [tab, setTab] = useState<"profile" | "compare">("profile");
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
  const activeTab = tab === "compare" && showCompareTab ? "compare" : "profile";

  const tabsEl = showCompareTab ? (
    <div className="flex gap-1 rounded-lg border border-hairline bg-canvas p-0.5">
      {(["profile", "compare"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === t ? "bg-surface text-ink shadow-sm" : "text-ink/55 hover:text-ink"
          }`}
        >
          {t === "profile" ? "Profile" : `Compare (${compare.length})`}
        </button>
      ))}
    </div>
  ) : null;

  const bodyEl =
    activeTab === "compare" ? (
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
          <AnswerPanel />
          {tabsEl}
          {bodyEl}
        </div>
      </aside>
    );
  }

  // --- Desktop: resizable aside --------------------------------------------
  const sizeStyle =
    userWidth !== null
      ? { width: userWidth, maxWidth: "60vw", flex: "none" as const }
      : undefined;

  return (
    <aside
      style={sizeStyle}
      className={`relative flex min-h-0 w-full flex-1 flex-col gap-4 bg-surface p-4 lg:flex-none lg:p-5 ${
        activeTab === "compare" ? "lg:w-[52rem] lg:max-w-[60vw]" : "lg:w-full lg:max-w-md"
      }`}
    >
      {/* Resize handle (desktop only) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel (double-click to reset)"
        title="Drag to resize · double-click to reset"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onDoubleClick={() => setUserWidth(null)}
        className="absolute inset-y-0 left-0 z-20 hidden w-1.5 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-harbour/40 active:bg-harbour/60 lg:block"
      />
      <SuburbSearch />
      <AnswerPanel />
      {tabsEl}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{bodyEl}</div>
    </aside>
  );
}
