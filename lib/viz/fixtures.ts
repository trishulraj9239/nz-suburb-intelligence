import type { RegionalStat } from "@/lib/suburb-data";

/** Illustrative data for the /dev/primitives gallery (TRI-147). Not real suburbs. */
export const RENT_STAT: RegionalStat = { metric_key: "rent_median_weekly", as_of_date: "2026-04-01", min: 430, p25: 590, median: 650, p75: 740, max: 1500 };
export const AGE_STAT: RegionalStat = { metric_key: "median_age", as_of_date: "2023-03-07", min: 22, p25: 33, median: 37, p75: 41, max: 58 };
export const FLOOD_STAT: RegionalStat = { metric_key: "flood_plain_pct", as_of_date: "2026-01-01", min: 0, p25: 2, median: 6, p75: 14, max: 61 };

export const rentFmt = (v: number) => `$${Math.round(v).toLocaleString()}/wk`;
export const pctFmt = (v: number) => `${v.toFixed(1)}%`;
export const ageFmt = (v: number) => `${v.toFixed(1)} yrs`;

export const RENT_SERIES = [
  { asOf: "2024-04-01", value: 620 },
  { asOf: "2024-07-01", value: 630 },
  { asOf: "2024-10-01", value: 640 },
  { asOf: "2025-01-01", value: 660 },
  { asOf: "2025-04-01", value: 690 },
  { asOf: "2025-07-01", value: 700 },
  { asOf: "2025-10-01", value: 695 },
  { asOf: "2026-01-01", value: 705 },
  { asOf: "2026-04-01", value: 710 },
];
export const CENSUS_SERIES = [
  { asOf: "2013-03-05", value: 1890 },
  { asOf: "2018-03-06", value: 2010 },
  { asOf: "2023-03-07", value: 2220 },
];
export const TENURE = [
  { label: "Owned or partly owned", pct: 48.8 },
  { label: "Held in a family trust", pct: 7 },
  { label: "Not owned (rented or other)", pct: 44.2 },
];
export const TENURE_AKL = [
  { label: "Owned or partly owned", pct: 52 },
  { label: "Held in a family trust", pct: 11 },
  { label: "Not owned (rented or other)", pct: 37 },
];
export const ETHNICITY = [
  { label: "European", pct: 82.2, refPct: 54 },
  { label: "Māori", pct: 9.6, refPct: 12 },
  { label: "Pacific Peoples", pct: 2.7, refPct: 16 },
  { label: "Asian", pct: 13.7, refPct: 31 },
];
