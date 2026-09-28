/**
 * Fixed category orders and colours for composition bars (TRI-147). The
 * brief's rule: the same category is always the same colour and in the same
 * position, on every surface. Compositions stay single-hue (opacity steps of
 * harbour, mirroring the map's quintile ramp) — composition is information,
 * never a good/bad reading. Categorical suburb/mode colours are Okabe-Ito.
 */

const STEP_ALPHAS = [0.86, 0.68, 0.5, 0.36, 0.24, 0.14];

export const stepColor = (i: number) => `color-mix(in srgb, var(--harbour) ${Math.round(STEP_ALPHAS[Math.min(i, STEP_ALPHAS.length - 1)] * 100)}%, transparent)`;

/** Category order per composition metric; unknown labels go after these, in source order. */
export const COMPOSITION_ORDER: Record<string, string[]> = {
  tenure: ["Owned or partly owned", "Held in a family trust", "Not owned (rented or other)"],
  dwelling_type: ["Separate house", "Joined dwelling", "Other private dwelling"],
  bedrooms: ["One bedroom", "Two bedrooms", "Three bedrooms", "Four bedrooms", "Five or more bedrooms"],
  zoning_share: [],
};

export function orderCategories<T extends { label: string }>(key: string, cats: T[]): T[] {
  const order = COMPOSITION_ORDER[key] ?? [];
  return [...cats].sort((a, b) => {
    const ia = order.indexOf(a.label);
    const ib = order.indexOf(b.label);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** Compare-view suburb letters and travel modes: Okabe-Ito, never used for hazards. */
export const CAT_COLOR = {
  a: "var(--cat-a)",
  b: "var(--cat-b)",
  c: "var(--cat-c)",
  drive: "var(--cat-e)",
  cycle: "var(--cat-c)",
  walk: "var(--cat-a)",
} as const;

/** Hazard neutral ramp positions. */
export const HZ = {
  track: "var(--hz-2)",
  marker: "var(--hz-5)",
  tick: "var(--hz-4)",
} as const;
