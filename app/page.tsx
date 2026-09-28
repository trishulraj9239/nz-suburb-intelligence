import { TopBar } from "@/components/top-bar";
import { MapContainer } from "@/components/map-container";
import { ContextPanel } from "@/components/context-panel";
import { AnswerStrip } from "@/components/answer-strip";
import { QuestionChips } from "@/components/question-chips";
import { WorkspaceProvider } from "@/lib/workspace";
import type { Metadata } from "next";
import { buildSearch, hasUrlState, parseUrlState } from "@/lib/url-state";
import { shareCard } from "@/lib/share-card";

/**
 * TRI-153 — a pasted link previews honestly: the title, description and OG
 * image come from the URL state (suburb / compare / question) and from the
 * same public rows the profile shows. Preferences are not in the URL, so they
 * cannot reach a preview. No state → the plain product card.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ["sa2", "compare", "q"]) {
    const v = sp[k];
    if (typeof v === "string") qs.set(k, v);
  }
  const state = parseUrlState(`?${qs.toString()}`);
  const image = `/api/og${buildSearch(state)}`;
  if (!hasUrlState(state)) {
    return { openGraph: { images: [{ url: image, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", images: [image] } };
  }
  const card = await shareCard(state).catch(() => null);
  const title = card ? (card.kind === "question" ? `“${card.title}” — NZ Suburb Intelligence` : `${card.title} — NZ Suburb Intelligence`) : "NZ Suburb Intelligence";
  const description = card?.subtitle ?? "Natural-language suburb comparison over New Zealand open government data.";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/**
 * Single-workspace layout (UI spec decision #1). Desktop: persistent map left,
 * context panel right (panel widens in compare mode). Mobile (TRI-37): the map
 * fills the area and the context panel is a draggable bottom sheet that snaps
 * between peek / half / full (see ContextPanel) — so reading never squeezes the
 * map out of reach, and the map stays one swipe away.
 *
 * TRI-145: `h-dvh` (not 100vh) so the sheet never sits under a phone browser's
 * toolbar; the starter chips are desktop-only over the map and live inside the
 * sheet's empty state on phones.
 */
export default function Home() {
  return (
    <WorkspaceProvider>
      <div className="flex h-dvh flex-col">
        <TopBar />
        {/* Desktop answer frame (TRI-83) — self-hides below lg, where the
            answer is a tab inside the bottom sheet instead. */}
        <AnswerStrip />
        <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="relative min-h-0 flex-1 lg:border-r lg:border-hairline">
            <MapContainer />
            {/* Browse-mode empty state (TRI-93) — desktop only; self-hides once a question exists. */}
            <QuestionChips variant="starter" />
          </section>
          <ContextPanel />
        </main>
      </div>
    </WorkspaceProvider>
  );
}
