import { TopBar } from "@/components/top-bar";
import { MapContainer } from "@/components/map-container";

/**
 * App shell (M1): a thin top bar over a two-pane body — empty map on the left,
 * context panel on the right. Static placeholders only; data views, the SA2
 * overlay, and any LLM feature are later milestones.
 */
export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <TopBar />

      <main className="flex min-h-0 flex-1">
        {/* Left: empty map container */}
        <section className="relative min-h-0 flex-1 border-r border-hairline">
          <MapContainer />
        </section>

        {/* Right: context panel */}
        <aside className="flex w-full max-w-sm shrink-0 flex-col gap-4 overflow-y-auto bg-surface p-5">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Context
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              Suburb profiles and comparisons appear here once data lands.
            </p>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas p-4">
            <p className="text-sm text-ink/70">
              Search a suburb or ask a question in the bar above to get started.
            </p>
          </div>

          <div className="mt-auto border-t border-hairline pt-3 font-mono text-[11px] text-ink/50">
            M1 · scaffold shell · no data yet
          </div>
        </aside>
      </main>
    </div>
  );
}
