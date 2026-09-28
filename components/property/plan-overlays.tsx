"use client";

import type { AddressPin } from "@/lib/workspace";
import { overlayHitText, usePointLookup, type OverlaysResponse } from "@/lib/property/fetch";
import { AUP_HOME, OVERLAY_NOTE, OVERLAY_STATUS } from "@/lib/property/copy";
import { SourceChip, StatusPill, type PillStatus } from "@/components/source-chip";
import { ExtLink, GroupHeading, Note, StateLine, SubHeading } from "./primitives";

/** Overlay status → pill icon; the words stay the council's (OVERLAY_STATUS). */
const PILL: Record<string, PillStatus> = { inside: "inside", near: "within", outside: "outside", within: "within", none: "clear", unavailable: "unavailable" };

/**
 * TRI-128 / TRI-150 — "Council plan records at this point": Unitary Plan
 * overlays as the council publishes them, each row a StatusPill (icon +
 * verbatim word) so meaning never rests on colour. Descriptive only.
 */
export function PlanOverlays({ pin }: { pin: AddressPin }) {
  const overlays = usePointLookup<OverlaysResponse>(pin, "/api/point-overlays");
  return (
    <>
      <GroupHeading testId="epistemic-plan">Council plan records at this point</GroupHeading>
      <SubHeading>Plan overlays — Auckland Unitary Plan</SubHeading>
      {overlays === null && <StateLine muted>Checking the Unitary Plan overlays…</StateLine>}
      {overlays === "error" && <StateLine>The council plan services could not be reached — no overlay was checked.</StateLine>}
      {overlays && overlays !== "error" && (
        <div data-testid="plan-overlays">
          <ul className="divide-y divide-hairline/60">
            {overlays.layers.map((l) => (
              <li key={l.key} className="py-1.5" data-testid="overlay-row">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="text-body text-ink/80">
                    {l.label}
                    <span className="ml-1 font-mono text-micro text-ink/50">{l.chapter}</span>
                  </span>
                  <StatusPill status={PILL[l.status] ?? "info"} text={OVERLAY_STATUS[l.status] ?? l.status} />
                </div>
                {l.hits.length > 0 && (
                  <ul className="mt-0.5">
                    {l.hits.map((h, i) => (
                      <li key={i} className="text-label leading-snug text-ink/70">
                        {overlayHitText(h)}
                        <ExtLink href={h.document_url ?? AUP_HOME} className="ml-1.5 text-micro">
                          {h.document_url ? "chapter ↗" : "AUP ↗"}
                        </ExtLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <Note>{OVERLAY_NOTE}</Note>
          <div className="mt-1 flex justify-end">
            <SourceChip source="Auckland Unitary Plan overlays · Auckland Council" asOf={overlays.updated ?? overlays.retrieved_at.slice(0, 10)} quality="exact" geometry="address point" />
          </div>
        </div>
      )}
    </>
  );
}
