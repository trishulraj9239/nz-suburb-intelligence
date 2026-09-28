"use client";

import { useCallback, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { useIsLg } from "@/lib/use-is-lg";
import { SuburbSearch } from "./suburb-search";
import { ProfilePanel } from "./profile-panel";
import { ComparePanel } from "./compare-panel";
import { AnswerThread } from "./answer-thread";
import { ResultsPanel, rankedRows } from "./results-panel";
import { QuestionChips } from "./question-chips";
import { ShortlistStrip } from "./shortlist-strip";
import { BottomSheet, type Snap } from "./sheet";
import { SegmentedTabs, TabPanel } from "./tabs";

const EXAMPLES: { sa2: string; name: string }[] = [
  { sa2: "130400", name: "Ponsonby West" },
  { sa2: "126801", name: "Takapuna Central" },
  { sa2: "166000", name: "Pukekohe Central" },
];

const PANEL_MIN = 320;
const panelMax = () => Math.round(window.innerWidth * 0.6); // keep ≥40% map

/** Right-pane views. "answer" exists only below lg — on desktop the answer is
 *  the full-width strip (TRI-83), so the tab set differs by frame. */
type Tab = "answer" | "profile" | "compare" | "results";

/**
 * Right pane. Desktop (≥lg): an <aside> in the row, user-resizable via the
 * left-edge handle (drag, clamped to 60vw; double-click resets). Compare mode
 * auto-widens when no manual width is set.
 *
 * Mobile (<lg): the BottomSheet (TRI-145) over the full-screen map — a pinned
 * header (handle, search, tabs) and a scrolling body, snapping between
 * peek / half / full. The one-frame invariant (M16) is unchanged: exactly one
 * of {desktop aside, sheet} is mounted, chosen by useIsLg.
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

  // --- Mobile sheet snap ---------------------------------------------------
  const [snap, setSnap] = useState<Snap>("half");

  // Surfacing a result shouldn't leave the reader stuck at "peek". Adjust during
  // render on change (React's "store previous value" pattern) rather than in an
  // effect, so there's no cascading-render lint nor a post-commit flash.
  const surfacedKey = selected ?? question ?? null;
  const [prevSurfacedKey, setPrevSurfacedKey] = useState<string | null>(null);
  if (surfacedKey !== prevSurfacedKey) {
    setPrevSurfacedKey(surfacedKey);
    if (surfacedKey && snap === "peek") setSnap("half");
  }

  // --- Shared content ------------------------------------------------------
  const showCompareTab = compare.length >= 2;
  const showAnswerTab = !isLg && !!question;
  // TRI-104: Results is the home for a rank answer, so it exists once one has
  // been given and persists while the user explores — it is not cleared by
  // opening a profile.
  const showResultsTab = rankedRows(currentTurn).length > 1;

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
      else if (currentTurn.intent === "rank") setTab("results");
      else if (!isLg) setTab("answer");
    }
  }

  const available: Tab[] = [
    ...(showAnswerTab ? (["answer"] as const) : []),
    "profile",
    ...(showCompareTab ? (["compare"] as const) : []),
    ...(showResultsTab ? (["results"] as const) : []),
  ];
  const activeTab: Tab = available.includes(tab) ? tab : "profile";

  const tabLabel = (t: Tab) =>
    t === "answer" ? "Answer" : t === "profile" ? "Profile" : t === "results" ? "Results" : `Compare (${compare.length})`;

  const idPrefix = isLg ? "panel" : "sheet";
  const tabsEl =
    available.length > 1 ? (
      <SegmentedTabs
        items={available.map((t) => ({ id: t, label: tabLabel(t) }))}
        value={activeTab}
        onChange={setTab}
        label="Panel views"
        idPrefix={idPrefix}
      />
    ) : null;

  const body = (answerMaxHeight: string) => (
    <TabPanel idPrefix={idPrefix} id={activeTab} className="flex min-h-0 flex-col gap-4">
      {activeTab === "answer" ? (
        // Same body as the desktop strip; only the cap number differs — it comes
        // from the sheet's live height rather than a viewport fraction.
        <AnswerThread maxHeight={answerMaxHeight} />
      ) : activeTab === "results" ? (
        <ResultsPanel />
      ) : activeTab === "compare" ? (
        <ComparePanel />
      ) : selected ? (
        <ProfilePanel sa2={selected} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink/65">Tap a suburb on the map or search above to open its profile.</p>
          <div className="rounded-card border border-hairline bg-canvas p-4">
            <div className="mb-4 empty:hidden">
              <ShortlistStrip />
            </div>
            <p className="text-micro font-semibold uppercase tracking-wider text-ink/55">Try one</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e.sa2}
                  type="button"
                  onClick={() => select(e.sa2)}
                  className="min-h-10 rounded-chip border border-hairline bg-surface px-3 text-label text-ink transition-colors hover:border-harbour"
                >
                  {e.name}
                </button>
              ))}
            </div>
            {/* Phones: the starter questions live here instead of over the map. */}
            <div className="mt-3 lg:hidden">
              <QuestionChips variant="starter-inline" />
            </div>
          </div>
        </div>
      )}
    </TabPanel>
  );

  // --- Mobile: bottom sheet ------------------------------------------------
  if (!isLg) {
    return (
      <BottomSheet
        snap={snap}
        onSnap={setSnap}
        label="Suburb panel"
        header={
          <>
            {/* Opening results at "peek" would clip the list under the sheet edge;
                the search asks the sheet to grow first. */}
            <SuburbSearch onOpen={() => setSnap((s) => (s === "peek" ? "half" : s))} />
            {tabsEl}
          </>
        }
      >
        {(height) => body(`${Math.max(140, height - 190)}px`)}
      </BottomSheet>
    );
  }

  // --- Desktop: resizable aside --------------------------------------------
  // TRI-87: 52rem was a single number for both 2- and 3-way comparisons, so a
  // third column squeezed. Auto-width now scales with the set (still clamped to
  // 60vw, so the map keeps at least 40% and narrow laptops fall back to the
  // panel's own horizontal scroll rather than crushing the map).
  const compareWidthClass = compare.length >= 3 ? "lg:w-[60rem]" : "lg:w-[46rem]";

  const sizeStyle = userWidth !== null ? { width: userWidth, maxWidth: "60vw", flex: "none" as const } : undefined;

  return (
    <aside
      style={sizeStyle}
      aria-label="Suburb panel"
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
          className="pointer-events-none -ml-[3px] flex h-10 w-2 items-center justify-center rounded-full border border-hairline bg-surface shadow-card transition-colors group-hover:border-harbour"
        >
          <span className="h-4 w-px bg-ink/25 transition-colors group-hover:bg-harbour" />
        </span>
      </div>
      <SuburbSearch />
      {tabsEl}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{body("min(46vh, 480px)")}</div>
    </aside>
  );
}
