import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { parseUrlState } from "@/lib/url-state";
import { shareCard, type CardBullet } from "@/lib/share-card";
import { TOKENS } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * TRI-153 — GET /api/og?sa2=&compare=&q=  → a 1200×630 share card.
 *
 * The same grammar as the app: a figure is a marker on the Auckland axis
 * (interquartile band, median tick), every figure names its source, vintage
 * and quality, a suppressed figure is a hatched track with the reason. The
 * query is the URL state (lib/url-state.ts) and nothing else — persona,
 * budget, saved places and address pins can never appear here because the
 * parser never reads them. Rendered on the server, no client dependency.
 * Satori (next/og) draws flexbox only: every box is display:flex.
 */

const C = TOKENS.color.light;
const AXIS_W = 640;
const CAT = [TOKENS.cat.a, TOKENS.cat.b, TOKENS.cat.c];

function Bullet({ b, dots }: { b: CardBullet; dots?: { letter: string; pct: number | null; name: string }[] }) {
  const x = (p: number) => Math.round((AXIS_W * (2 + (p * 96) / 100)) / 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>
        <div style={{ display: "flex", fontSize: 26, color: C.ink, opacity: 0.85 }}>{b.label}</div>
        {!dots && <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color: C.ink, fontFamily: "monospace" }}>{b.value ?? "—"}</div>}
      </div>
      {b.pct === null ? (
        <div style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 14 }}>
          <div style={{ display: "flex", width: AXIS_W, height: 14, borderRadius: 7, border: `2px dashed ${C.ink}`, opacity: 0.35 }} />
          <div style={{ display: "flex", fontSize: 18, color: C.ink, opacity: 0.6, fontFamily: "monospace" }}>not published · {b.reason}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          <div style={{ display: "flex", position: "relative", width: AXIS_W, height: 22 }}>
            <div style={{ display: "flex", position: "absolute", left: x(0), top: 10, width: x(100) - x(0), height: 2, backgroundColor: C.hairline }} />
            {b.p25 !== null && b.p75 !== null && (
              <div style={{ display: "flex", position: "absolute", left: x(b.p25), top: 6, width: Math.max(4, x(b.p75) - x(b.p25)), height: 10, borderRadius: 5, backgroundColor: C.hairline }} />
            )}
            {b.median !== null && <div style={{ display: "flex", position: "absolute", left: x(b.median) - 1, top: 1, width: 3, height: 20, backgroundColor: C.ink, opacity: 0.45 }} />}
            {!dots && (
              <div style={{ display: "flex", position: "absolute", left: x(b.pct) - 4, top: 0, width: 8, height: 22, borderRadius: 2, backgroundColor: b.quality === "exact" ? C.harbour : C.surface, ...(b.quality === "exact" ? {} : { border: `3px solid ${C.harbour}` }) }} />
            )}
            {dots?.map((d, i) =>
              d.pct === null ? null : (
                <div key={i} style={{ display: "flex", position: "absolute", left: x(d.pct) - 14, top: -3, width: 28, height: 28, borderRadius: 14, backgroundColor: CAT[i], border: `2px solid ${C.ink}`, alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: C.ink }}>
                  {d.letter}
                </div>
              ),
            )}
          </div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 18, color: C.ink, opacity: 0.6, fontFamily: "monospace" }}>
            {Math.round(b.pct)}th percentile of Auckland · median {b.medianText} · {b.source} · {b.asOf} · {b.quality}
          </div>
        </div>
      )}
    </div>
  );
}

export async function GET(req: NextRequest) {
  const state = parseUrlState(req.nextUrl.search);
  const card = await shareCard(state);
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: C.canvas, padding: "44px 64px 40px", color: C.ink, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, opacity: 0.65 }}>
          <div style={{ display: "flex", width: 16, height: 16, borderRadius: 8, backgroundColor: C.harbour }} />
          NZ Suburb Intelligence
          {card.kind === "suburb" && <div style={{ display: "flex", marginLeft: 6 }}>· suburb profile</div>}
          {card.kind === "compare" && <div style={{ display: "flex", marginLeft: 6 }}>· comparison</div>}
          {card.kind === "question" && <div style={{ display: "flex", marginLeft: 6 }}>· a question, answered with citations</div>}
        </div>
        <div style={{ display: "flex", fontSize: card.kind === "question" ? 42 : 52, fontWeight: 700, lineHeight: 1.1, marginTop: 12, maxHeight: card.kind === "question" ? 240 : 120, overflow: "hidden" }}>{card.title}</div>
        <div style={{ display: "flex", fontSize: 22, opacity: 0.7, marginTop: 6, maxHeight: 60, overflow: "hidden" }}>{card.subtitle}</div>
        {card.kind === "suburb" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", marginTop: 4 }}>
            {card.bullets.map((b, i) => (
              <Bullet key={i} b={b} />
            ))}
          </div>
        )}
        {card.kind === "compare" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
            <Bullet b={{ ...card.bullets[0], label: "Median rent (new tenancies)" }} dots={card.dots} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 22, fontSize: 24 }}>
              {card.dots.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", width: 26, height: 26, borderRadius: 13, backgroundColor: CAT[i], border: `2px solid ${C.ink}`, alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>{d.letter}</div>
                  <div style={{ display: "flex" }}>{d.name}</div>
                  <div style={{ display: "flex", fontFamily: "monospace", fontWeight: 600 }}>{d.value ?? "not published"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {(card.kind === "question" || card.kind === "home") && <div style={{ display: "flex", flex: 1 }} />}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, opacity: 0.55, fontFamily: "monospace" }}>
          <div style={{ display: "flex" }}>nz-suburb-intelligence.vercel.app</div>
          <div style={{ display: "flex" }}>open government data · area-level, not property advice</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
