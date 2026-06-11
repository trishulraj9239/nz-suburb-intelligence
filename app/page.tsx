import { TopBar } from "@/components/top-bar";
import { MapContainer } from "@/components/map-container";
import { ContextPanel } from "@/components/context-panel";
import { WorkspaceProvider } from "@/lib/workspace";

/**
 * Single-workspace layout (UI spec decision #1): persistent map on the left,
 * context panel (picker · profile · compare) on the right, shared selection
 * state across map, panel, and the top-bar Compare counter.
 */
export default function Home() {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen flex-col">
        <TopBar />
        <main className="flex min-h-0 flex-1">
          <section className="relative min-h-0 flex-1 border-r border-hairline">
            <MapContainer />
          </section>
          <aside className="flex w-full max-w-md shrink-0 flex-col overflow-hidden bg-surface p-5">
            <ContextPanel />
          </aside>
        </main>
      </div>
    </WorkspaceProvider>
  );
}
