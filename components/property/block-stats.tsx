"use client";

import type { AddressPin } from "@/lib/workspace";
import { fmtDec, fmtInt, fmtMoney, fmtNum, fmtPct, usePointLookup, type BlockStatsResponse, type SuburbStats } from "@/lib/property/fetch";
import { BLOCK_NOTE } from "@/lib/property/copy";
import { SourceChip } from "@/components/source-chip";
import { GroupHeading, Note, StateLine } from "./primitives";

/**
 * TRI-130 / TRI-150 — "This block, beside this suburb": the SA1's own census
 * row next to the suburb's, two mono columns. Suppression reads as words,
 * never a zero; NZDep stays information. Chips carry "SA1 block".
 */
export function BlockStats({ pin, suburb }: { pin: AddressPin; suburb?: SuburbStats }) {
  const blk = usePointLookup<BlockStatsResponse>(pin, "/api/block-stats");
  const rows: { label: string; block: string | null; suburb: string | null | undefined }[] =
    blk && blk !== "error" && !blk.unavailable && !blk.none
      ? [
          { label: "People counted", block: fmtInt(blk.population), suburb: fmtInt(suburb?.population ?? null) },
          { label: "Median age", block: fmtNum(blk.median_age), suburb: fmtNum(suburb?.median_age ?? null) },
          { label: "Households renting", block: fmtPct(blk.renting_pct), suburb: fmtPct(suburb?.renting_pct ?? null) },
          { label: "Median household income", block: fmtMoney(blk.median_household_income), suburb: fmtMoney(suburb?.median_household_income ?? null) },
          { label: "NZDep2023 decile (1 least – 10 most deprived)", block: fmtDec(blk.nzdep_decile), suburb: fmtDec(suburb?.nzdep_decile ?? null) },
          ...blk.ethnicity.map((e) => ({ label: `${e.label} (ethnicity)`, block: fmtPct(e.pct), suburb: fmtPct(suburb?.ethnicity?.[e.label] ?? null) })),
          { label: "Overseas-born", block: fmtPct(blk.overseas_born_pct), suburb: undefined },
          { label: "Separate houses", block: fmtPct(blk.separate_house_pct), suburb: fmtPct(suburb?.separate_house_pct ?? null) },
          { label: "One-person households", block: fmtPct(blk.one_person_household_pct), suburb: undefined },
          { label: "Average bedrooms", block: fmtNum(blk.avg_bedrooms), suburb: undefined },
        ]
      : [];
  return (
    <>
      <GroupHeading testId="epistemic-block" note={blk && blk !== "error" && !blk.unavailable && !blk.none && blk.population !== null ? `about the ${blk.population.toLocaleString()} people counted in this block at Census 2023` : undefined}>
        This block, beside this suburb
      </GroupHeading>
      {blk === null && <StateLine muted>Reading the block&apos;s census row…</StateLine>}
      {(blk === "error" || (blk && blk.unavailable)) && <StateLine>The Stats NZ mirror could not be reached — the block was not checked.</StateLine>}
      {blk && blk !== "error" && !blk.unavailable && blk.none && <StateLine testId="block-none">No census block (SA1) at this point.</StateLine>}
      {rows.length > 0 && (
        <div data-testid="block-stats">
          <div className="flex items-baseline justify-end gap-3 font-mono text-micro text-ink/50">
            <span className="w-20 text-right">this block</span>
            <span className="w-20 text-right">this suburb</span>
          </div>
          <ul className="divide-y divide-hairline/60">
            {rows.map((r) => (
              <li key={r.label} className="flex items-baseline justify-between gap-3 py-1" data-testid="block-row">
                <span className="text-body text-ink/80">{r.label}</span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span data-col="block" className={`w-20 text-right font-mono ${r.block === null ? "text-micro leading-snug text-ink/50" : "text-body font-medium text-ink"}`}>
                    {r.block ?? "not published for this block"}
                  </span>
                  <span data-col="suburb" className={`w-20 text-right font-mono ${r.suburb == null ? "text-micro leading-snug text-ink/50" : "text-body text-ink/70"}`}>
                    {r.suburb === undefined ? "not held at suburb level" : r.suburb === null ? "not published" : r.suburb}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Note>
            {BLOCK_NOTE}
            {suburb ? ` Suburb column: ${suburb.name}.` : ""}
          </Note>
          <div className="mt-1 flex flex-wrap justify-end gap-x-3 gap-y-0.5">
            <SourceChip source="Stats NZ 2023 Census (SA1)" asOf="2023-03-07" quality="exact" geometry="SA1 block" />
            <SourceChip source="NZDep2023 (SA1)" asOf="2023" quality="exact" geometry="SA1 block" />
          </div>
        </div>
      )}
    </>
  );
}
