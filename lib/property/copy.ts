/**
 * TRI-150 — every fixed string the "This property" panel shows, verbatim from
 * the address epic (TRI-123/126/127/128/129/130/131/132/133). The panel's
 * wording is frozen: change a sentence here only with the ticket that
 * re-verifies it, and never on one surface alone.
 */

export const FLOOD_VIEWER_URL = "https://experience.arcgis.com/experience/cbde7f2134404f4d90adce5396a0a630";
export const GEOMAPS_URL = "https://geomapspublic.aucklandcouncil.govt.nz/viewer/index.html";
export const AUP_HOME = "https://unitaryplan.aucklandcouncil.govt.nz/";

export const HAIL_NOTE = "Contaminated land (HAIL) status is not openly published — a LIM report is the only source.";
export const BUILT_FORM_NOTE = "Roof outlines from LINZ aerial imagery; not floor area, not a consent record.";
export const BLOCK_NOTE =
  "Census 2023 counts for the statistical block (SA1) containing the address — an area, not the property. Small-area cells are random-rounded to base 3 and suppressed when small; \"not published for this block\" is Stats NZ's suppression, never a zero. NZDep2023 is the index's native block level: information, not a verdict.";
export const OVERLAY_NOTE =
  "Operative overlays as published by the council; descriptive only — what an overlay allows is set out in its chapter. Designations and consent history are not open data (see the LIM link-out).";
export const RECORDS_NOTE = "Public records about the land, not a valuation or an inspection. Ownership is not public data — a lawyer can obtain the full title.";

export const TITLE_TYPE_NOTE: Record<string, string> = {
  Freehold: "Fee simple: the owner holds the land and buildings outright.",
  "Cross lease": "Owners jointly own the land and lease their own flat's footprint from each other; changes to the building can need the other lessees' consent.",
  "Unit Title": "Ownership of a unit within a body corporate development, with shared common property and body corporate rules and levies.",
  Leasehold: "The land is leased from a separate owner for a term; ground rent applies and the lease has an expiry.",
};

/** Point-hazard status words (TRI-123/129). */
export const STATUS_WORDS: Record<string, string> = {
  inside: "inside",
  outside: "outside",
  within: "within 20 m",
  clear: "none within 20 m",
  unavailable: "council service unavailable — not checked",
  "not assessed": "not in the assessed area",
  pending: "checking… (slow council layer)",
};

/** Plan-overlay status words (TRI-128). */
export const OVERLAY_STATUS: Record<string, string> = {
  inside: "inside",
  near: "on or near the boundary",
  outside: "outside",
  within: "within 30 m",
  none: "none within 30 m",
  unavailable: "council service unavailable — not checked",
};

// Fixed destinations, identical to the commute anchors the suburb matrix uses
// (migration 0006): CBD = Britomart, airport = terminal drop-off.
export const FIXED_DESTINATIONS = [
  { id: "cbd", label: "Auckland CBD", lng: 174.7691, lat: -36.8442 },
  { id: "airport", label: "Auckland Airport", lng: 174.78675, lat: -37.00436 },
];
export const AUTO_ROUTED_ANCHORS = 3;
