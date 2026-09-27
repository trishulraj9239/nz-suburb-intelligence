# NL results-testing question set (TRI-81)

Twenty questions a real renter or buyer would actually type, for testing the
answer layer by hand — plus five folded into the automated suite
(`scripts/eval/questions.json`) so the highest-value ones can't regress silently.

**Every suburb named here was checked against `geographies` before being
written** — and check with a **partial** match, not an exact one.

Two earlier question sets were authored against names that don't exist in any
form — "Flat Bush" (TRI-74) and "Titirangi North" (TRI-89), both 0 rows on
`ilike '%…%'` — and in both cases the honest no-match looked like a bug until
the question was inspected.

But an exact-match check gives false negatives, which caught me out while
writing this file. SA2 names are finer-grained than the suburb names people
use, and they carry disambiguating suffixes:

| You'd type | The SA2s actually called |
|---|---|
| Avondale South | `Avondale South (Auckland)` — the suffix matters |
| Sunnynook | `Sunnynook North`, `Sunnynook South` — no plain "Sunnynook" |
| Massey | nine `Massey *` areas, but no "Massey East" |
| Takapuna | `Takapuna Central`, `Takapuna South`, `Takapuna West` |

The planner resolves suburbs with a partial match, so a question about
"Avondale" or "Takapuna" works and lands on one of these. Verify the same way:

```sql
select name from geographies
where geo_type = 'SA2' and is_active and name ilike '%avondale%';
```

Answers are judged on four things, in this order:

1. **Grounded** — every figure traces to a cited row.
2. **Framed** — vintage, source and any caveat stated (all-dwellings rent,
   consents-not-completions, hazard layers are area-level models).
3. **Honest about limits** — a trap is refused with the reason, and a
   near-miss says what it *can* answer.
4. **Transparent** — where a persona weighting or a saved preference shaped the
   emphasis, the answer says so.

---

## Renter — 10

| # | Question | What a good answer does |
|---|---|---|
| R1 | Which suburbs have the lowest median weekly rent? | Ranks with the metric named and vintage stated; doesn't imply a verdict about the places. |
| R2 | What's the rent in Avondale and how has it moved? | Latest MBIE bond median plus the 12-month change; flags that bond rents are new tenancies only. |
| R3 | Compare Mount Roskill North East and New Lynn Central South for renting. | Side-by-side on rent and commute; states which factors Renting mode weighted. |
| R4 | How long would I cycle from Ponsonby West to the CBD? | Uses the precomputed cycle time, labelled *typical, no live traffic*. |
| R5 | Cheapest rent near Takapuna? | Returns rent figures for profile-similar suburbs **and** says these are likeness matches, not the nearest by distance (TRI-109). |
| R6 | Suburbs under $600 a week within 30 minutes' drive of Penrose. | Ranks then filters by the routed constraint; names both the rent threshold and the drive cap. |
| R7 | How long is the drive from Manurewa East to work? | Resolves the saved workplace, **states the address it resolved to**, refuses cleanly if none is set. |
| R8 | Is Glen Eden North a good place to live? | No overall verdict. Gives the measured metrics and says what it doesn't cover. |
| R9 | What's the median rent for a two-bedroom apartment in Takapuna? | **Trap.** Gives the all-dwellings figure and says it can't be split by bedroom count. |
| R10 | Which suburbs have the best public transport to the city? | **Trap.** No PT data — says only drive/cycle/walk times exist. |

## Buyer — 10

| # | Question | What a good answer does |
|---|---|---|
| B1 | Where is the most new housing being consented? | Ranks on consents; states these are consents, not completions. |
| B2 | How much is being built in Milldale? | Trailing-12-month count **and** the per-1,000-dwellings rate, with the ~2-month lag noted. |
| B3 | Which suburbs have the most intensification capacity? | Frames it as a zoning capacity indicator, not a forecast. |
| B4 | How much of Papakura East is in a flood plain? | Cites the layer and its year, ends with the area-level caveat. |
| B5 | Compare Hobsonville Point Catalina Bay and Milldale for buying. | Buyer-weighted factors, each named; no combined score. |
| B6 | What's the deprivation score for Herne Bay? | States decile direction (1 = least deprived) and that it's informational, never a verdict. |
| B7 | Which suburbs look promising for long-term growth? | Open-ended: names the buyer weighting it applied, and what it lacks. |
| B8 | How many homes were built in Pukekohe Central last year? | **Trap.** Consents ≠ completions — gives consents and says which it measures. |
| B9 | What's the overall risk score for Titirangi East? | **Trap.** Deterministic refusal; lists the individual measured layers instead. |
| B10 | What did houses sell for in Grey Lynn West? | **Trap.** No sale-price data (licence-blocked); says what it does cover. |

---

## Folded into the automated suite

Five are in `scripts/eval/questions.json` as `q23`–`q27`. They were chosen for
being the ones most likely to regress quietly rather than loudly:

| Eval id | From | Why this one |
|---|---|---|
|  `q23-rent-similar` | R5 | Guards the TRI-107 fix and the TRI-109 honesty caveat in one question. Worded as "similar to" rather than "near" on purpose: the "near" phrasing is nondeterministic between two planner paths and one of them returns nothing (TRI-111), so it stays manual as R5. |
| `q24-commute-anchor-unset` | R7 | The wrong-origin failure mode: an unset saved place must refuse, never silently resolve to a suburb. |
| `q25-pt-trap` | R10 | Public transport is the most plausible thing to hallucinate — the data looks like it should exist. |
| `q26-consents-rate` | B2 | Covers count **and** rate plus the publication-lag framing; the rate mixes vintages, so its confidence cap matters. |
| `q27-sale-price-trap` | B10 | The licence-blocked gap. If this ever answers, the product has invented a market. |

The other fifteen stay manual: they're for reading, not scoring, and several
(B7, R8) are deliberately open-ended in a way the judge scores unreliably.

## Running them by hand

```bash
npm run dev
# then ask each question in the app, or:
curl -s localhost:3000/api/ask -H 'content-type: application/json' \
  -d '{"question":"Cheapest rent near Takapuna?","persona":"renter"}'
```

The app's own **"How this was matched"** disclosure shows the planner's reading
of each question — intent, metrics, places — which is usually enough to tell a
bad answer from a bad *question* without reading the server logs.

## Address search (TRI-122) — manual checks

The search box accepts a street address (anything with a digit, or three or
more words). The profile that opens is always the **containing SA2's**; the
address is a pin and a banner only.

| Type | Expect |
|---|---|
| `42 Ponsonby Rd` | one confident hit "42 Ponsonby Road, Ponsonby, Auckland → Ponsonby East"; profile opens with the banner "42 Ponsonby Road… sits in Ponsonby East. Everything below describes the area, not the property."; map flies to street level with a pin |
| `3/22 Cardiff Road Pakuranga` | unit-number form resolves (loaded by the TRI-138 changeset) → Pakuranga Central |
| `42 Ponsonbee Road` | misspelled road: either a confident fuzzy hit or a "Did you mean" list — never a silent wrong pick |
| `1 Lambton Quay Wellington` | "No Auckland address confidently matches … Auckland addresses only." |
| pick an address, then pick `Takapuna Central` by name | banner and pin disappear; a pin never claims an address sits in the wrong area |

Automated: `node scripts/test/tri122-verify.mjs` (dev server on :3000).

## Address tier 2 (TRI-123) — manual checks

After picking an address, the profile shows an **"At this address"** block
above the area sections: five council hazard layers checked at the point
(flood plain, overland flow within 20 m, coastal inundation now and +1 m,
liquefaction class), each in the layer's own words with the verbatim caveat,
and drive times **from** the address to the CBD, the airport and your first
saved anchors.

| Ask | Expect |
|---|---|
| `Is 42 Ponsonby Road in a flood plain?` | rows labelled "At 42 Ponsonby Road, Grey Lynn, Auckland: Flood plain (1% AEP) (2026 council layer) — outside …" plus the other layers; the answer reports each layer's status, cites each, ends with the caveat, no verdict |
| `How long is the drive from 42 Ponsonby Road to Auckland Airport?` | a routed drive time (or a labelled straight-line distance if routing is down) |
| `Is 999999 Nowhere Street in a flood plain?` | honest note: the address could not be resolved; no rows |
| pick an address, watch the "At this address" block | one line per layer; if a council service is down the line says "council service unavailable — not checked", never "outside" |

Automated: `node scripts/test/tri123-verify.mjs` (dev server on :3000).

## Address title & land (TRI-126) — manual checks

The "At this address" block gains **Title & land — LINZ public records**, read
live from LINZ (Property Boundaries by point, then the no-ownership Property
Titles layer): title type with a one-line neutral explainer, rating-unit land
area, legal description, title number and issue date, estate lines. Copy says
these are public records about the land, not a valuation, and that ownership
is not public data.

| Ask | Expect |
|---|---|
| `What type of title does 42 Ponsonby Road have, and how big is the section?` | rows "At 42 Ponsonby Road…: title type Freehold, legal description Lot 13 Sec 1 DP 242…" and "rating unit land area 1,362 m²", title 932002 issued 2020-02-26; the answer reports them as records, says ownership is not public, no price |
| `What is 42 Ponsonby Road worth?` | unsupported — valuations and prices are not held (see the link-out panel, TRI-132) |
| pin `3/22 Cardiff Road Pakuranga` | Freehold with an estate line showing the 1/11 share of the common lot — every unit/estate line listed, no "winner" picked |
| LINZ down | "LINZ could not be reached — the title was not checked", never "no title" |

Automated: `node scripts/test/tri126-verify.mjs` (dev server on :3000).
