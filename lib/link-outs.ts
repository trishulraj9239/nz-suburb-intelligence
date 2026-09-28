/**
 * TRI-132 — the facts about a property that this app DELIBERATELY does not
 * hold, and where to get each one.
 *
 * Every entry is a public fact buyers ask for that exists somewhere with a
 * search box but is NOT openly licensed (or is restricted by law). The honest
 * move is to say so, in one line, and send the user to the source — never to
 * scrape it, cache it, proxy it, or quietly leave it out. The reasons below
 * are the licence findings from the 2026-09-27 audit (see docs/sources.md,
 * "Deliberately not ingested (address level)"); if a source opens up, the
 * item moves to an ingest ticket, it does not get fetched from here.
 *
 * Address prefill: each target was tested 2026-09-28; none accepts the
 * address in its URL (all are search boxes on the page), so the panel offers
 * a copy-address button instead of a fake deep link.
 */

export interface LinkOut {
  key: string;
  /** What the fact is, as the buyer would name it. */
  what: string;
  /** Where it is published (the site's own name). */
  where: string;
  url: string;
  /** One line on why the app does not hold it. Shown verbatim in the UI. */
  reason: string;
  /** Question phrasings that mean this item; used by /api/ask. */
  pattern: RegExp;
}

export const LINK_OUTS: LinkOut[] = [
  {
    key: "valuation",
    what: "Capital value, land value and rates",
    where: "Auckland Council rates & valuation search",
    url: "https://www.aucklandcouncil.govt.nz/en/property-rates-valuations/find-property-rates-valuation.html",
    reason:
      "Auckland Council publishes rating valuations per property on its own site only; it has not opted into LINZ's open valuation roll, and the council's valuation service is marked not for supply — so nothing here is ingested, cached or proxied.",
    pattern:
      /\b(capital value|land value|rateable value|rating valuation|\bCV\b|\bLV\b|\bRV\b|council rates|the rates (on|for|at)|rates bill|how much (are|is) the rates|valuations?)\b/i,
  },
  {
    key: "prices",
    what: "Sales history and price estimates",
    where: "homes.co.nz, OneRoof or TradeMe Property",
    url: "https://homes.co.nz/",
    reason:
      "No open source publishes sales; the estimates on listing sites are proprietary models. The only price signal here is suburb-level rent from MBIE bond data.",
    pattern:
      /\b(worth|sale price|sold for|last sold|sales? history|price estimate|estimated value|asking price|market value|house price|property value|what (would|does|did) .* (cost|sell)|how much (is|was|would|does|did) .* (cost|sell|worth|go for)|homes estimate|ranged? estimate)\b/i,
  },
  {
    key: "claims",
    what: "Natural hazard insurance claims",
    where: "Natural Hazards Portal map",
    url: "https://www.naturalhazardsportal.govt.nz/map/",
    reason:
      "Settled EQCover claims since 1997 are searchable per address in the portal's own interface, under its Terms of Use; there is no open dataset or API.",
    pattern: /\b(eqc|eqcover|toka t[uū] ake|insurance claims?|hazard claims?|claims? history|natural hazards? (portal|claims?)|been claimed)\b/i,
  },
  {
    key: "broadband",
    what: "Fibre and broadband availability",
    where: "National Broadband Map",
    url: "https://broadbandmap.nz/",
    reason: "The National Broadband Map's data and API are available by arrangement, not under an open licence.",
    pattern: /\b(fibre|fiber|broadband|internet (speed|connection|available)|ufb|hyperfibre|wireless broadband)\b/i,
  },
  {
    key: "lim",
    what: "LIM report",
    where: "Auckland Council — order a LIM",
    url: "https://www.aucklandcouncil.govt.nz/en/buying-property/order-property-report/order-lim.html",
    reason:
      "A LIM is the authoritative property record for hazards, consents and contaminated-land (HAIL) status; those per-property records are not open data.",
    pattern: /\b(lim report|\bLIM\b|land information memorandum|contaminated|\bHAIL\b)\b/i,
  },
  {
    key: "consents",
    what: "Building consents and the property file",
    where: "Auckland Council — order a property file",
    url: "https://www.aucklandcouncil.govt.nz/en/buying-property/order-property-report/order-property-file.html",
    reason:
      "Per-property consent history sits in the council's paid property file; the Stats NZ consents this app holds are area-level counts, never per address.",
    pattern: /\b(property file|building consents? (for|at|on) (the|this|that|\d)|consented|unconsented|unpermitted|permitted works?|code compliance)\b/i,
  },
  {
    key: "title-order",
    what: "Full title, memorials and owners",
    where: "LINZ — search and order a land record",
    url: "https://www.linz.govt.nz/products-services/land-records/search-and-order-digital-land-record",
    reason:
      "Owner names are restricted by law and are never requested by this app; easements, covenants and caveats are on the ordered title, which a lawyer or the LINZ site provides for a fee.",
    pattern: /\b(who owns|owner|owners|owned by|ownership|memorials?|easements?|covenants?|caveats?|mortgage)\b/i,
  },
];

/** The first link-out whose phrasing the question uses, or null. */
export function matchLinkOut(question: string): LinkOut | null {
  return LINK_OUTS.find((l) => l.pattern.test(question)) ?? null;
}

/** Does the question carry a street address (a street number plus text)? */
export function mentionsAddress(question: string): boolean {
  return /\b\d+[a-z]?(\/\d+[a-z]?)?\s+[A-Za-z]/.test(question);
}

/**
 * The deterministic answer for a question the app will not answer from data:
 * what is not held, why, and where it is. No model wording, no guess.
 */
export function linkOutAnswer(lo: LinkOut, address: string | null): string {
  const at = address ? ` for ${address}` : "";
  // Lower-case a leading capital unless it is an acronym ("LIM report").
  const what = lo.what.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
  return `I don't hold ${what}${at}, and I won't guess. ${lo.reason} It is searchable at ${lo.where}: ${lo.url}`;
}
