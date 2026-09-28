import type { SectionKey } from "@/lib/tokens";
import { personaConfig, SECTION_LABELS } from "@/lib/persona";
import type { RegionalStat, ScalarValue, BreakdownValue } from "@/lib/suburb-data";
import { asOfLabel } from "@/components/source-chip";

/**
 * TRI-148 — the six profile cards and how registry dimensions map onto them.
 * Cards are a presentation grouping over `metric_definitions.dimension`:
 * People absorbs Deprivation (the NZDep strip is one row of the People card),
 * Schools is not a dimension at all (nearest schools by road), and any
 * dimension a future ETL adds that no card claims still renders — as a
 * generic card after the six, never hidden.
 */
export type CardKey = SectionKey;

export const CARD_DIMENSIONS: Record<CardKey, string[]> = {
  housing: ["housing"],
  planning: ["planning"],
  hazards: ["hazard"],
  people: ["people", "deprivation"],
  commute: ["commute"],
  schools: [],
};

export const CARD_TITLES: Record<CardKey, string> = {
  housing: SECTION_LABELS.housing,
  planning: SECTION_LABELS.planning,
  hazards: SECTION_LABELS.hazard,
  people: SECTION_LABELS.people,
  commute: SECTION_LABELS.commute,
  schools: "Schools nearby",
};

const DEFAULT_ORDER: CardKey[] = ["housing", "planning", "hazards", "people", "commute", "schools"];

export function cardForDimension(dim: string): CardKey | null {
  for (const k of Object.keys(CARD_DIMENSIONS) as CardKey[]) if (CARD_DIMENSIONS[k].includes(dim)) return k;
  return null;
}

/**
 * Persona order: each persona lists dimensions; a card takes the position of
 * the first of its dimensions in that list. Cards the persona never mentions
 * follow in default order; Schools is always last. Personas reorder, they
 * never hide data.
 */
export function cardOrder(persona: string | null | undefined): CardKey[] {
  const out: CardKey[] = [];
  for (const dim of personaConfig(persona).sectionOrder) {
    const c = cardForDimension(dim);
    if (c && !out.includes(c)) out.push(c);
  }
  for (const c of DEFAULT_ORDER) if (!out.includes(c) && c !== "schools") out.push(c);
  out.push("schools");
  return out;
}

/**
 * Rows a card is expected to carry. When the registry has no row for this
 * suburb the card still shows the label with a hatched track and the reason,
 * because an absent row here means the source suppressed it, and the brief's
 * rule is that suppression is drawn as long as a real bar, never as nothing.
 */
export const EXPECTED_ROWS: Record<string, { label: string; reason: string }> = {
  rent_median_weekly: { label: "Median rent (new tenancies)", reason: "fewer than 5 bonds in the quarter" },
  dwelling_damp_pct: { label: "Damp dwellings", reason: "fewer than 30 dwellings answered" },
  dwelling_mould_pct: { label: "Mouldy dwellings", reason: "fewer than 30 dwellings answered" },
  nzdep_decile: { label: "Deprivation decile", reason: "no NZDep coverage for this area" },
};

/** Breakdown keys that are exclusive compositions (one bar summing to 100 %). */
export const STACKED_BREAKDOWNS = new Set(["zoning_share", "dwelling_type", "tenure", "bedrooms", "liquefaction_share"]);

/** Rows folded into another primitive rather than drawn on their own. */
export const FOLDED_ROWS = new Set(["rent_lower_quartile_weekly", "rent_upper_quartile_weekly"]);

/**
 * When every row of a card shares a source, the chip hoists to the header
 * and the rows go chip-less; several vintages of one source hoist as a
 * range ("2025–2026"). Mixed sources keep their per-row chips.
 */
export function hoistChip(rows: { source: string; asOf: string }[]): { source: string; asOf: string; asOfText?: string } | null {
  if (rows.length < 2) return null;
  const sources = new Set(rows.map((r) => r.source));
  if (sources.size !== 1) return null;
  const dates = [...new Set(rows.map((r) => r.asOf))].sort();
  if (dates.length === 1) return { source: rows[0].source, asOf: dates[0] };
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))];
  return { source: rows[0].source, asOf: dates[dates.length - 1], asOfText: years.length === 1 ? asOfLabel(dates[dates.length - 1]) : `${years[0]}–${years[years.length - 1]}` };
}

export const scalarByKey = (scalars: ScalarValue[]) => new Map(scalars.map((s) => [s.def.metric_key, s]));
export const breakdownByKey = (breakdowns: BreakdownValue[]) => new Map(breakdowns.map((b) => [b.def.metric_key, b]));

export type StatFor = (key: string, asOf: string) => RegionalStat | undefined;
