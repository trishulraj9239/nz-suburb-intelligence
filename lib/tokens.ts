/**
 * Design tokens — the single source of truth (TRI-145, Phase A).
 *
 * `scripts/tokens/emit-css.mjs` reads this file and writes `app/tokens.css`
 * (`:root`, `[data-theme="dark"]`, and the Tailwind v4 `@theme inline` block).
 * Nothing else in the app declares a colour, a font size below the scale, or a
 * radius: components use the generated utilities (`bg-canvas`, `text-label`,
 * `rounded-card`, `bg-cat-a`, …). A future share/OG route reads this same
 * object, which is why it is TypeScript data, not CSS.
 *
 * Rules the tokens encode (from the visual-system brief):
 *  - amber is reserved for the citation live-wire, never general UI;
 *  - hazards use a NEUTRAL ramp (`hz`), never red–green;
 *  - categorical colours (compare suburbs, modes) are Okabe-Ito (`cat`);
 *  - map hazard LAYER hues are per-layer identifiers, not a severity ramp;
 *  - the smallest text is `micro` = 12 px; nothing renders smaller.
 */

export const TOKENS = {
  color: {
    light: {
      canvas: "#f4f6f5",
      ink: "#13212e",
      surface: "#ffffff",
      hairline: "#e2e7e6",
      harbour: "#0e6e73",
      /** Citation live-wire only. */
      amber: "#e9a23b",
      /** Links and small interactive text (was referenced as `text-accent` but never defined). */
      accent: "#0c6166",
      /** Letter inside a filled Okabe-Ito dot — the hues are theme-invariant, so is the ink on them. */
      "mark-ink": "#13212e",
    },
    dark: {
      canvas: "#0e1822",
      ink: "#e6ecee",
      surface: "#16222e",
      hairline: "#26333e",
      harbour: "#169aa0",
      amber: "#f2b65c",
      accent: "#62c9ce",
      "mark-ink": "#13212e",
    },
  },

  /** Okabe-Ito — categorical only (compare suburbs a/b/c, travel modes). Same in both themes. */
  cat: {
    a: "#e69f00", // orange
    b: "#56b4e9", // sky blue
    c: "#009e73", // bluish green
    d: "#f0e442", // yellow
    e: "#0072b2", // blue
    f: "#d55e00", // vermilion
    g: "#cc79a7", // reddish purple
  },

  /** Hazard neutral ramp, 1 = lightest. No hue: exposure is information, never a verdict. */
  hz: {
    light: ["#e6eae9", "#c9d0ce", "#9fa9a7", "#6f7c7a", "#3f4b4a"],
    dark: ["#243039", "#34424c", "#4d5d68", "#6e8290", "#97aab7"],
  },

  /** Map hazard LAYER identifiers (one hue per layer; the legend swatch and the fill). */
  layer: {
    flood: "#2f6db6",
    coastal: "#6d5bb8",
    coastal_slr1m: "#9b8ed6",
    liquefaction: "#b0803a",
    heritage: "#7a5c3e",
  },

  /** Six muted section hues — used ONLY on a section card's header icon. Data colours stay semantic. */
  section: {
    light: { housing: "#0e6e73", planning: "#5b6b8a", hazards: "#6f7c7a", people: "#7a5c8a", commute: "#8a6a3a", schools: "#3d7a5b" },
    dark: { housing: "#169aa0", planning: "#8fa0c4", hazards: "#97aab7", people: "#b294c4", commute: "#c4a06a", schools: "#6cb08a" },
  },

  /** Type scale: [font-size, line-height]. `micro` (12 px) is the floor. */
  text: {
    micro: ["0.75rem", "1rem"],
    label: ["0.8125rem", "1.125rem"],
    body: ["0.875rem", "1.25rem"],
    value: ["0.9375rem", "1.25rem"],
    h3: ["1rem", "1.375rem"],
    h2: ["1.25rem", "1.5rem"],
    kpi: ["1.375rem", "1.625rem"],
  },

  radius: {
    control: "0.5rem",
    card: "0.75rem",
    sheet: "1rem",
    chip: "9999px",
  },

  shadow: {
    card: "0 1px 2px rgb(0 0 0 / 0.06)",
    pop: "0 8px 24px -8px rgb(0 0 0 / 0.25)",
    sheet: "0 -8px 24px -12px rgb(0 0 0 / 0.35)",
  },

  /** Stacking order, documented here; used as Tailwind z-10/20/30/40 literals in components. */
  z: { map: 0, overlay: 10, notice: 20, sheet: 30, popover: 40 },

  /** Mobile bottom-sheet snap points. */
  sheet: { peekPx: 104, halfFrac: 0.5, fullFrac: 0.92 },

  /** Fonts come from next/font in app/layout.tsx; these are the CSS variables it defines. */
  font: {
    display: "var(--font-space-grotesk)",
    sans: "var(--font-ibm-plex-sans)",
    mono: "var(--font-ibm-plex-mono)",
  },
} as const;

export type ThemeName = "light" | "dark";
export type SectionKey = keyof typeof TOKENS.section.light;
export type CatKey = keyof typeof TOKENS.cat;
