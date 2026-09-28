"use client";

import type { AddressPin } from "@/lib/workspace";
import type { SuburbStats } from "@/lib/property/fetch";
import { RecordsGroup } from "./records-group";
import { BlockStats } from "./block-stats";
import { PlanOverlays } from "./plan-overlays";
import { PointHazards } from "./point-hazards";
import { DriveTimes } from "./drive-times";
import { Nearby } from "./nearby";
import { LinkOuts } from "./link-outs";

/**
 * TRI-133 / TRI-150 — "This property (public records)": the address-level
 * surface, now a composition of one component per epistemic group, in the
 * same order as before, each headed so a reader can never mistake one level
 * for another:
 *   Public records about the land   — LINZ title & land, building outlines
 *   This block, beside this suburb  — the SA1's census row
 *   Council plan records            — Unitary Plan overlays
 *   Area-level models at this point — council hazard layers (verbatim caveat
 *                                     top and foot) and drive times
 *   Nearby, as the crow flies       — straight-line park / stop / schools
 *   Not held by this app            — the link-outs, with reasons
 * No aggregate, score, badge or colour implies a verdict on the property.
 * Everything else on the profile is the area's; this block never repeats an
 * area figure as if it were the property's.
 */
export function PropertyPanel({ pin, suburb }: { pin: AddressPin; suburb?: SuburbStats }) {
  return (
    <section data-testid="address-facts" className="rounded-card border border-hairline bg-canvas/60 p-3">
      <h3 className="font-display text-h3 font-semibold text-ink">
        This property
        <span className="ml-1.5 font-mono text-micro font-normal text-ink/50">public records &amp; point checks · not a property assessment</span>
      </h3>
      <RecordsGroup pin={pin} />
      <BlockStats pin={pin} suburb={suburb} />
      <PlanOverlays pin={pin} />
      <PointHazards pin={pin} />
      <DriveTimes pin={pin} />
      <Nearby pin={pin} />
      <LinkOuts label={pin.label} />
    </section>
  );
}
