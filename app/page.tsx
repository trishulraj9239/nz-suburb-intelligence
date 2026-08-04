import { TopBar } from "@/components/top-bar";
import { MapContainer } from "@/components/map-container";
import { ContextPanel } from "@/components/context-panel";
import { AnswerStrip } from "@/components/answer-strip";
import { WorkspaceProvider } from "@/lib/workspace";

/**
 * Single-workspace layout (UI spec decision #1). Desktop: persistent map left,
 * context panel right (panel widens in compare mode). Mobile (TRI-37): the map
 * fills the area and the context panel is a draggable bottom sheet that snaps
 * between peek / half / full (see ContextPanel) — so reading never squeezes the
 * map out of reach, and the map stays one swipe away.
 */
export default function Home() {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen flex-col">
        <TopBar />
        {/* Desktop answer frame (TRI-83) — self-hides below lg, where the
            answer is a tab inside the bottom sheet instead. */}
        <AnswerStrip />
        <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="relative min-h-0 flex-1 lg:border-r lg:border-hairline">
            <MapContainer />
          </section>
          <ContextPanel />
        </main>
      </div>
    </WorkspaceProvider>
  );
}
