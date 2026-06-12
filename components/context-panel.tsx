"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
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

/**
 * Right pane (owns its <aside> so width can react to mode): picker, answers,
 * then profile / compare. Desktop: user-resizable via the left-edge handle
 * (drag, clamped to 60vw; double-click resets to auto). Compare mode
 * auto-widens when no manual width is set. Mobile: full-width lower half.
 */
export function ContextPanel() {
  const { selected, select, compare } = useWorkspace();
  const [tab, setTab] = useState<"profile" | "compare">("profile");
  const [userWidth, setUserWidth] = useState<number | null>(null);
  const dragging = useRef(false);
  const isLg = useIsLg();
  const showCompareTab = compare.length >= 2;
  const activeTab = tab === "compare" && showCompareTab ? "compare" : "profile";

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

  // Manual width wins on desktop; otherwise mode defaults apply via classes.
  const sizeStyle =
    isLg && userWidth !== null
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

      {showCompareTab && (
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
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {activeTab === "compare" ? (
          <ComparePanel />
        ) : selected ? (
          <ProfilePanel sa2={selected} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink/60">
              Click a suburb on the map or search above to open its profile.
            </p>
            <div className="rounded-lg border border-hairline bg-canvas p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
                Try one
              </p>
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
        )}
      </div>
    </aside>
  );
}
