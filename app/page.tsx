import { TopBar } from "@/components/top-bar";
import { MapContainer } from "@/components/map-container";
import { ContextPanel } from "@/components/context-panel";
import { WorkspaceProvider } from "@/lib/workspace";

/**
 * Single-workspace layout (UI spec decision #1). Desktop: persistent map left,
 * context panel right (panel widens in compare mode). Mobile (TRI-37): map
 * stacks above a scrollable panel — no horizontal squeeze.
 */
export default function Home() {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen flex-col">
        <TopBar />
        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="relative h-[42vh] shrink-0 border-b border-hairline lg:h-auto lg:min-h-0 lg:flex-1 lg:border-b-0 lg:border-r">
            <MapContainer />
          </section>
          <ContextPanel />
        </main>
      </div>
    </WorkspaceProvider>
  );
}
