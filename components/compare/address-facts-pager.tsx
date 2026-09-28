"use client";

import { useId, useRef, useState } from "react";
import type { SuburbProfile } from "@/lib/suburb-data";
import type { AddressPin } from "@/lib/workspace";
import { useIsLg } from "@/lib/use-is-lg";
import { AddressFacts } from "@/components/address-facts";
import { DOT_IDS } from "@/lib/compare";
import { Letter } from "./compare-header";

/**
 * TRI-141 / TRI-149 — per-address facts, ABOVE the area rows and visibly
 * separate from them: these are point checks and public records for each
 * pinned address, not area figures. Desktop keeps one column per suburb;
 * phones get a snap-scrolling strip of full-width cards with a tablist pager,
 * so an 825-line panel never has to squeeze into a third of 390 px. Exactly
 * one of the two layouts is mounted.
 */
export function AddressFactsPager({ profiles, pinsFor }: { profiles: SuburbProfile[]; pinsFor: (sa2: string) => AddressPin[] }) {
  const lg = useIsLg();
  const [page, setPage] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const idp = useId();
  const groups = profiles.map((p, i) => ({ id: DOT_IDS[i], p, pins: pinsFor(p.suburb.sa2_code) })).filter((g) => g.pins.length > 0);
  if (!groups.length) return null;
  const go = (i: number) => {
    setPage(i);
    const el = stripRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };
  return (
    <div className="mb-1" data-testid="compare-address-facts">
      <p className="mb-1 font-display text-label font-semibold text-ink/70">
        At each address <span className="ml-1.5 font-mono text-micro font-normal text-ink/45">public records &amp; point checks · not area figures</span>
      </p>
      {lg ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${profiles.length}, minmax(0, 1fr))` }}>
          {profiles.map((p, i) => (
            <div key={p.suburb.sa2_code} className="flex min-w-0 flex-col gap-2">
              {pinsFor(p.suburb.sa2_code).map((a) => (
                <AddressFacts key={a.label} pin={a} />
              ))}
              {pinsFor(p.suburb.sa2_code).length === 0 && <p className="rounded-card border border-dashed border-hairline p-3 text-label text-ink/50">No address pinned in {profiles[i].suburb.name}</p>}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Address facts by suburb" className="mb-2 flex flex-wrap gap-1.5">
            {groups.map((g, i) => (
              <button key={g.p.suburb.sa2_code} type="button" role="tab" id={`${idp}-tab-${i}`} aria-selected={page === i} aria-controls={`${idp}-panel-${i}`} onClick={() => go(i)} className={`inline-flex h-10 items-center gap-1.5 rounded-control border px-3 text-label ${page === i ? "border-harbour bg-harbour/10 text-ink" : "border-hairline bg-surface text-ink/70"}`}>
                <Letter id={g.id} /> {g.pins.length > 1 ? `${g.pins.length} addresses` : g.pins[0].label}
              </button>
            ))}
          </div>
          <div ref={stripRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1" onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== page) setPage(i); }}>
            {groups.map((g, i) => (
              <div key={g.p.suburb.sa2_code} role="tabpanel" id={`${idp}-panel-${i}`} aria-labelledby={`${idp}-tab-${i}`} className="flex w-full shrink-0 snap-start flex-col gap-2">
                {g.pins.map((a) => (
                  <AddressFacts key={a.label} pin={a} />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
