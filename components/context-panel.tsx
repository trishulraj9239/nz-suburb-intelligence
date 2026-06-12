"use client";

import { useState } from "react";
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

/** Right pane: picker on top, then profile / compare tabs. */
export function ContextPanel() {
  const { selected, select, compare } = useWorkspace();
  const [tab, setTab] = useState<"profile" | "compare">("profile");
  const showCompareTab = compare.length >= 2;
  const activeTab = tab === "compare" && showCompareTab ? "compare" : "profile";

  return (
    <div className="flex h-full flex-col gap-4">
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
    </div>
  );
}
