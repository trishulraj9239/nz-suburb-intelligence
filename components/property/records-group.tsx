"use client";

import type { AddressPin } from "@/lib/workspace";
import { usePointLookup, type BuiltFormResponse, type PropertyFactsResponse } from "@/lib/property/fetch";
import { BUILT_FORM_NOTE, GEOMAPS_URL, RECORDS_NOTE, TITLE_TYPE_NOTE } from "@/lib/property/copy";
import { AerialThumb } from "@/components/aerial-thumb";
import { SourceChip } from "@/components/source-chip";
import { ExtLink, FactRow, GroupHeading, Note, StateLine, SubHeading } from "./primitives";

/**
 * TRI-126 / TRI-127 / TRI-150 — "Public records about the land": the LINZ
 * title & land record and the building outlines on the rating unit. Chips
 * carry the tested geometry ("rating unit"). Wording unchanged.
 */
export function RecordsGroup({ pin }: { pin: AddressPin }) {
  const property = usePointLookup<PropertyFactsResponse>(pin, "/api/property-facts");
  const built = usePointLookup<BuiltFormResponse>(pin, "/api/built-form");
  const imageryCaption = built && built !== "error" && built.imagery ? `LINZ aerial basemap · ${built.imagery.title} · CC BY 4.0` : "LINZ aerial basemap · CC BY 4.0 · imagery date not reported for this point";
  return (
    <>
      <GroupHeading testId="epistemic-records">Public records about the land</GroupHeading>
      <SubHeading>Title &amp; land — LINZ public records</SubHeading>
      {property === null && <StateLine muted>Reading the LINZ land records…</StateLine>}
      {(property === "error" || (property && property.unavailable)) && <StateLine testId="property-unavailable">LINZ could not be reached — the title was not checked.</StateLine>}
      {property && property !== "error" && !property.unavailable && property.units.length === 0 && (
        <StateLine testId="property-none">No rating unit or title is linked to this point in LINZ&apos;s public records.</StateLine>
      )}
      {property && property !== "error" && !property.unavailable && property.units.length > 0 && (
        <div data-testid="property-facts">
          {property.units.map((u) => (
            <div key={u.source_id} className="border-b border-hairline/60 py-1.5 last:border-b-0">
              <FactRow label="Title type" value={u.title_type ?? "—"} testId="title-type" />
              {u.title_type && TITLE_TYPE_NOTE[u.title_type] && <Note className="mt-0.5">{TITLE_TYPE_NOTE[u.title_type]}</Note>}
              {u.area_m2 != null && <FactRow className="mt-1" label="Rating unit land area" value={`${u.area_m2.toLocaleString()} m²`} />}
              {u.legal_description && (
                <p className="mt-1 text-label leading-snug text-ink/65">
                  <span className="text-ink/50">Legal description</span> {u.legal_description}
                </p>
              )}
            </div>
          ))}
          {property.titles.map((t) => (
            <div key={t.title_no} className="py-1.5 text-label leading-snug text-ink/70">
              <span className="font-mono text-ink/85">Title {t.title_no}</span>
              {t.type ? ` · ${t.type}` : ""}
              {t.issue_date ? ` · issued ${t.issue_date}` : ""}
              {t.status && t.status !== "LIVE" ? ` · ${t.status.toLowerCase()}` : ""}
              {t.estate_description &&
                t.estate_description.split(/\r?\n/).map((line, i) => (
                  <span key={i} className="block text-ink/60">
                    {line}
                  </span>
                ))}
            </div>
          ))}
          <Note>{RECORDS_NOTE}</Note>
          <div className="mt-1 flex justify-end">
            <SourceChip source="LINZ Property Boundaries + Titles" asOf={property.retrieved_at.slice(0, 10)} quality="exact" geometry="rating unit" />
          </div>
        </div>
      )}

      <SubHeading>Built form — LINZ building outlines</SubHeading>
      {built === null && <StateLine muted>Reading the LINZ building outlines…</StateLine>}
      {(built === "error" || (built && built.unavailable)) && <StateLine testId="built-form-unavailable">LINZ could not be reached — building outlines were not checked.</StateLine>}
      {built && built !== "error" && !built.unavailable && built.none && (
        <StateLine testId="built-form-none">No rating unit at this point in LINZ&apos;s records, so there is nothing to measure outlines against.</StateLine>
      )}
      {built && built !== "error" && !built.unavailable && !built.none && (
        <div data-testid="built-form" className="flex flex-wrap items-start gap-3">
          <div className="min-w-[180px] flex-1">
            <FactRow label="Buildings on the section" value={built.building_count} testId="building-count" />
            {built.footprint_m2 != null && <FactRow className="mt-1" label="Roof footprint" value={`${built.footprint_m2.toLocaleString()} m²`} />}
            {built.site_coverage_pct != null && <FactRow className="mt-1" label="Site coverage" value={`${built.site_coverage_pct}%`} testId="site-coverage" />}
            {/* LINZ tags most houses "Unknown"; only a real use or name is worth a line. */}
            {built.outlines.some((o) => o.name || (o.use && o.use !== "Unknown")) && (
              <p className="mt-1 text-label leading-snug text-ink/65">
                {built.outlines
                  .filter((o) => o.name || (o.use && o.use !== "Unknown"))
                  .map((o) => [o.name, o.use !== "Unknown" ? o.use : null].filter(Boolean).join(" · "))
                  .join("; ")}
              </p>
            )}
            <Note>
              {BUILT_FORM_NOTE}
              {built.outlines_captured ? ` Outlines captured ${built.outlines_captured}.` : ""}
            </Note>
            <div className="mt-1 flex justify-end">
              <SourceChip source="LINZ Building Outlines" asOf={built.retrieved_at.slice(0, 10)} quality="est." geometry="rating unit" />
            </div>
          </div>
          <div>
            <AerialThumb lng={pin.lng} lat={pin.lat} caption={imageryCaption} />
            <ExtLink href={GEOMAPS_URL} className="mt-0.5 inline-block text-micro">
              Auckland Council GeoMaps ↗
            </ExtLink>
          </div>
        </div>
      )}
    </>
  );
}
