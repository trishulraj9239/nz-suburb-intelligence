/**
 * Persona configuration (TRI-58, Phase 3 M12).
 *
 * A persona is pure config — ordered section keys, metric weights, a prompt
 * descriptor — never a code fork. Adding a third persona (e.g. "investor")
 * must require nothing beyond a new entry in PERSONAS: every consumer
 * iterates Object.values(PERSONAS) or indexes
 * `PERSONAS[key] ?? PERSONAS[DEFAULT_PERSONA]`; nothing anywhere switches on
 * "renter" | "buyer" literals. If a third persona's label makes the top-bar
 * segmented control overflow ~360px-wide phones, collapse it to a <select> —
 * not needed at two.
 *
 * Weights are transparent emphasis for the NL layer (stated in answers),
 * never inputs to a computed composite score — the app refuses those.
 *
 * Section keys are metric_definitions.dimension values. `hazard` and
 * `planning` are pre-listed for M14/M15; until those metrics load, the
 * profile simply has no rows for them and skips the sections. Dimensions
 * missing from a persona's sectionOrder still render (appended in registry
 * order) — personas reorder, they never hide data.
 */

export interface PersonaConfig {
  key: string;
  /** Toggle text — keep short, the top bar wraps on phones. */
  label: string;
  /** Profile/Compare section order, by metric dimension. */
  sectionOrder: string[];
  /**
   * metric_key the map shades by default for this persona. Applied only when
   * the key exists in the live registry — a forward-declared key (e.g. a
   * Phase 3 metric not yet loaded) falls back to no shading.
   */
  defaultMapMetric: string;
  /**
   * metric_key -> relative emphasis (1 = neutral) for the NL layer. Keys may
   * be forward-declared before their metrics load; unknown keys are inert.
   */
  metricWeights: Record<string, number>;
  /** One sentence interpolated into the plan + answer system prompts. */
  promptDescriptor: string;
  /**
   * TRI-106 — metric_keys shown as headline tiles above the profile, in order.
   * Pure config like everything else here: a third persona picks its own five
   * without touching a component. Scalar metrics only. A key missing from the
   * live registry, or with no value for this suburb, is skipped — the grid
   * shrinks rather than rendering an empty tile.
   */
  kpiTiles: string[];
}

export const SECTION_LABELS: Record<string, string> = {
  people: "People",
  housing: "Housing",
  deprivation: "Deprivation",
  commute: "Getting around",
  hazard: "Hazard screen",
  planning: "Planning",
};

/** Section-heading ⓘ explainer copy, keyed by dimension (rendered via InfoTip). */
export const SECTION_EXPLAINERS: Record<string, string> = {
  hazard:
    "Shares of this area's land inside Auckland Council hazard model layers (flood plain 1% AEP, coastal storm-tide inundation, overland flow paths, liquefaction vulnerability). Layers have different vintages and are separate models — they never combine into one risk score. Area-level model — not a property assessment. Check the council Flood Viewer and a LIM report for any specific property. Source: Auckland Council open data (CC BY 4.0).",
  planning:
    "Auckland Unitary Plan base zoning (July 2026) and the Historic Heritage Overlay. The zoning mix shows shares of this area's land by zone bucket; intensification capacity is the Mixed Housing Urban + Terrace Housing & Apartment share of residential-zoned land — a development-capacity indicator, not a forecast. Source: Auckland Council Plans and Places (CC BY 4.0).",
  commute:
    "Typical times from a representative point in this area, routed on OpenStreetMap roads by openrouteservice — no live traffic, so peak-hour drives will usually take longer. Walking times may use ferry links. Routing: openrouteservice · © OpenStreetMap contributors (ODbL).",
  deprivation:
    "NZDep2018 (University of Otago) measures relative socioeconomic deprivation of small areas — not of individual people. It combines nine Census 2018 variables: income, benefit receipt, employment, qualifications, home ownership, family structure, overcrowding, internet access, and living conditions. Decile 1 = the least deprived 10% of NZ areas; decile 10 = the most deprived 10%. It describes access to resources across areas and carries no judgment about residents or an area's worth.",
};

export const DEFAULT_PERSONA = "renter";

export const PERSONAS: Record<string, PersonaConfig> = {
  renter: {
    key: "renter",
    label: "Renting",
    sectionOrder: ["housing", "commute", "people", "deprivation", "hazard", "planning"],
    defaultMapMetric: "rent_median_weekly", // MBIE bond series (M13) — fresher than the census rent
    kpiTiles: [
      "rent_median_weekly",
      "commute_cbd_drive_min",
      "nzdep_decile",
      "population",
      "median_household_income",
    ],
    metricWeights: {
      median_rent_weekly: 2,
      commute_cbd_drive_min: 1.5,
      commute_cbd_cycle_min: 1.25,
      rent_median_weekly: 2, // MBIE bond series, M13
      rent_trend_12m_pct: 1.5,
    },
    promptDescriptor:
      "The user is a renter: prioritise current rents, rent trend, and commute times; long-horizon ownership metrics (zoning, consents) matter less.",
  },
  buyer: {
    key: "buyer",
    label: "Buying",
    sectionOrder: ["housing", "planning", "hazard", "people", "deprivation", "commute"],
    defaultMapMetric: "consents_per_1000_dwellings", // M15 — live since TRI-73
    kpiTiles: [
      "intensification_capacity_indicator",
      "consents_per_1000_dwellings",
      "consents_new_dwellings_12m",
      "median_household_income",
      "rent_median_weekly",
    ],
    // TRI-74 re-tune: every weighted metric now exists in the live registry.
    // The rate (per-1000) carries the comparison weight; the raw 12m count
    // stays lightly emphasised (big suburbs would otherwise dominate).
    metricWeights: {
      median_household_income: 1.25,
      zoning_share: 1.5, // M14
      intensification_capacity_indicator: 1.5, // M14
      flood_plain_pct: 1.5, // M14
      consents_per_1000_dwellings: 1.5, // M15 — the comparable rate
      consents_new_dwellings_12m: 1.25, // M15 — absolute volume, size-biased
      rent_median_weekly: 0.75,
    },
    promptDescriptor:
      "The user is a prospective buyer: prioritise zoning and intensification capacity, consenting activity (prefer the per-1,000-dwellings rate when comparing suburbs), and hazard exposure alongside housing stock; current rent levels matter less.",
  },
};

export function personaConfig(key: string | null | undefined): PersonaConfig {
  return (key != null && PERSONAS[key]) || PERSONAS[DEFAULT_PERSONA];
}

/** Sort rank for a dimension under a sectionOrder; unlisted dimensions rank last. */
export function sectionRank(sectionOrder: string[], dimension: string): number {
  const i = sectionOrder.indexOf(dimension);
  return i === -1 ? sectionOrder.length : i;
}

/** Stable re-sort by persona section, preserving registry order within sections. */
export function orderBySection<T>(
  items: T[],
  dimOf: (item: T) => string,
  sectionOrder: string[],
): T[] {
  return [...items].sort(
    (a, b) => sectionRank(sectionOrder, dimOf(a)) - sectionRank(sectionOrder, dimOf(b)),
  );
}

export function isPersonaKey(key: unknown): key is string {
  return typeof key === "string" && key in PERSONAS;
}
