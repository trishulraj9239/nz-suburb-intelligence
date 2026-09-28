import type { CardKey } from "@/lib/sections";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Section header glyphs (TRI-148) — the only place a section hue appears. */
export function CardIcon({ card }: { card: CardKey }) {
  const common = { viewBox: "0 0 24 24", className: "h-5 w-5", "aria-hidden": true as const, ...P };
  switch (card) {
    case "housing":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
          <path d="M10 21v-6h4v6" />
        </svg>
      );
    case "planning":
      return (
        <svg {...common}>
          <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case "hazards":
      return (
        <svg {...common}>
          <path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          <path d="M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          <path d="M3 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15.5 14.5a5 5 0 0 1 6 5" />
        </svg>
      );
    case "commute":
      return (
        <svg {...common}>
          <path d="M4 16V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
          <path d="M3 16h18v3H3z" />
          <circle cx="7.5" cy="19.5" r="1.5" />
          <circle cx="16.5" cy="19.5" r="1.5" />
          <path d="M7 12h10" />
        </svg>
      );
    case "schools":
      return (
        <svg {...common}>
          <path d="M2 9l10-5 10 5-10 5z" />
          <path d="M6 11.5V17c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" />
          <path d="M22 9v6" />
        </svg>
      );
  }
}
