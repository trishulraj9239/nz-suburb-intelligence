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

## Address link-outs (TRI-132) — manual checks

The "At this address" block ends with **Also check — not held by this app**:
seven facts buyers ask for that exist behind a search box but are not openly
licensed (or are restricted by law). Each row says what it is, where it is
published, and one line on why it is not in the app. No target accepts an
address in its URL, so a copy-address button stands in for a deep link.
Nothing in this block is fetched, cached or proxied.

| Ask | Expect |
|---|---|
| `What is the capital value of 42 Ponsonby Road?` | deterministic: "I don't hold capital value, land value and rates for 42 Ponsonby Road, and I won't guess. Auckland Council publishes rating valuations per property on its own site only …" with the council URL; no figure, no rows |
| `Have there been any EQC insurance claims at 42 Ponsonby Road?` | link-out to the Natural Hazards Portal map, with the Terms-of-Use reason |
| `Can I get fibre broadband at 42 Ponsonby Road?` | link-out to the National Broadband Map |
| `What does the LIM say about 42 Ponsonby Road?` | link-out to the council LIM order page; "authoritative property record … not open data" |
| `Were the renovations at 42 Ponsonby Road consented?` | link-out to the council property file; area-level consents are not offered as a substitute |
| `Who owns 42 Ponsonby Road?` | link-out to the LINZ order page; "owner names are restricted by law and are never requested" |
| `How many building consents were issued in Ponsonby last year?` | still answered from the SA2 consents rows — the link-out only takes over when a street address is named or the planner already declined |

Automated: `node scripts/test/tri132-verify.mjs` (dev server on :3000).

## Property panel composition (TRI-133) — manual checks

With a pinned address the profile opens with **This property** — public
records & point checks — composed of three groups whose headers state the
epistemic level: **Public records about the land** (LINZ title & land),
**Area-level models at this point** (council hazard layers with the verbatim
caveat at the top and the foot, drive times), and **Not held by this app**
(the link-outs). The area banner sits UNDER the panel and says everything
below it describes the area. Sections whose tickets have not shipped are
absent, never "N/A". Nothing in the panel is a score, badge or verdict.

| Ask / do | Expect |
|---|---|
| pin `42 Ponsonby Rd` (desktop) | order top-to-bottom: This property panel → banner → Grey Lynn East header; three group headers present |
| same at 390 px | the mobile sheet's Profile tab shows the same component in the same order; the desktop answer strip is not mounted |
| `What do the public records say about 42 Ponsonby Road?` | LINZ record rows (title type, land area, title number) reported as records; ownership stated as not public |
| `Is 42 Ponsonby Road a good buy?` | refuses — no recommendation, no score; points at the records and the area profile |
| hover a confidence chip | one-sentence explanation of the level ("Exact value from the source", …) |

Automated: `node scripts/test/tri133-verify.mjs` (dev server on :3000).

## Built form at the address (TRI-127) — manual checks

Under **Public records about the land** the panel gains **Built form — LINZ
building outlines**: buildings on the section (outlines whose point-on-surface
is inside the rating unit), roof footprint (outline ∩ unit), site coverage
against the unit's LINZ area, the outline capture years, and a 256 px aerial
thumbnail from the LINZ basemap at z18 with the pin marked and the aerial
layer's name and years in the caption. Copy: "Roof outlines from LINZ aerial
imagery; not floor area, not a consent record." Confidence `medium`.

| Ask / do | Expect |
|---|---|
| pin `42 Ponsonby Rd` | Buildings on the section, roof footprint m², site coverage %, "Outlines captured 20xx", thumbnail captioned "LINZ aerial basemap · Auckland 0.075m Urban Aerial Photos (2024-2025) · CC BY 4.0", GeoMaps link |
| `How much of the section at 42 Ponsonby Road is built on, and how many buildings are there?` | rows "At 42 Ponsonby Road…: buildings on the section", "roof footprint", "site coverage"; the answer cites each, says roof outlines not floor area, gives the capture years |
| `Is there room to add a second dwelling at 42 Ponsonby Road?` | reports the same measured rows and says plainly that whether anything can be built is a planning / consent question it does not answer — no "yes" or "no" |
| LINZ down | "LINZ could not be reached — building outlines were not checked" |

Automated: `node scripts/test/tri127-verify.mjs` (dev server on :3000).

## Unitary Plan overlays at the address (TRI-128) — manual checks

A new group **Council plan records at this point** carries **Plan overlays —
Auckland Unitary Plan**: ten operative overlays checked live against the
council's own services (special character, heritage extent + scheduled
place, notable trees + groups, aircraft and port noise, regional + local
volcanic viewshafts, Waitākere Ranges). Polygon overlays read inside / on or
near the boundary (≤ 5 m) / outside; point overlays read within 30 m / none.
Hits show the council's decoded name, schedule item and a chapter link.
Copy is descriptive only. Confidence `high` (operative record).

| Ask / do | Expect |
|---|---|
| pin `42 Ponsonby Rd` | Special Character Areas Overlay: **inside** — "Business Ponsonby Road" with a chapter link; the other nine rows read outside / none |
| `Is 42 Ponsonby Road in a special character area under the Unitary Plan?` | row "At 42 Ponsonby Road…: special character areas overlay (Unitary Plan chapter D18) — inside: Business Ponsonby Road"; the answer says inside, names it, cites it, and does not say what may or may not be done |
| `Are there any heritage listings, notable trees or noise overlays affecting 42 Ponsonby Road?` | one row per overlay; each reported in its own words; no verdict |
| council service down | that row reads "council service unavailable — not checked", never "outside" |

Automated: `node scripts/test/tri128-verify.mjs` (dev server on :3000).

## Extended hazards at the address (TRI-129) — manual checks

**Area-level models at this point** grows from five to thirteen council
layers: flood prone area (with the record's modelled 100-year ponding depth),
flood sensitive area (model type / rainfall event / climate-adjusted flag),
shallow and large-scale landslide **susceptibility** (a class of terrain,
worded "terrain more/less prone … per the council's regional model —
susceptibility, not occurrence", never "risk"), the ASCIE coastal-erosion
susceptibility lines for 2050 / 2080 / 2130 (RCP8.5, within 20 m of the
mapped landward limit), and tsunami evacuation zones (zone colour). Each row's
vintage is the service's last edit (hover the "layer" tag). The verbatim
caveat stays at the top and the foot; the foot also states the HAIL gap and
links the council Flood Viewer and GeoMaps. No score, ever.

| Ask / do | Expect |
|---|---|
| pin `42 Ponsonby Rd` | thirteen rows; shallow landslide "Low" with the "terrain less prone…" line; tsunami "outside"; flood prone "outside"; ASCIE lines "none within 20 m" |
| `GET /api/point-hazards?lng=174.8318&lat=-36.8489` (Mission Bay) | flood prone **inside** with "modelled 100-year ponding depth 0.52 m"; tsunami **Yellow** |
| `Is 42 Ponsonby Road prone to landslides?` | both landslide rows cited with their class and the susceptibility wording; no "risk", no verdict; caveat at the end |
| `Is 42 Ponsonby Road in a tsunami evacuation zone or a flood prone area?` | both rows reported in their own words (outside / outside); caveat |
| a council service down | that row reads "council service unavailable — not checked" |

Automated: `node scripts/test/tri129-verify.mjs` (dev server on :3000).

## This block beside this suburb (TRI-130) — manual checks

A new group **This block, beside this suburb — about the ~N people counted
in this block at Census 2023** shows the SA1 (statistical block) containing
the address next to the suburb (SA2) figure, both columns labelled: people
counted, median age, households renting, median household income, NZDep2023
decile (the index's native block level), the four largest ethnicity shares,
overseas-born, separate houses, one-person households, average bedrooms.
Suppressed cells read **"not published for this block"** — never zero, never
the suburb value; a measure the app does not hold at suburb level reads
"not held at suburb level". Live from the Stats NZ and Healthspace mirrors;
nothing loaded. No verdict language anywhere.

| Ask / do | Expect |
|---|---|
| pin `42 Ponsonby Rd` | block SA1 7005116 (Grey Lynn East): people counted, median age, renting %, income, NZDep decile beside the suburb's; the random-rounding note under the table |
| `What is the block around 42 Ponsonby Road like — how many people live there, what is the median age, and how many rent?` | block rows ("At 42 Ponsonby Road…: this block (SA1 7005116, N people counted…)") beside the Grey Lynn East rows; the answer gives both, names which is which, never merges |
| `What is the deprivation decile of the block at 42 Ponsonby Road, and how does it compare with the suburb?` | block NZDep2023 decile and the suburb decile, both cited, described as information not a verdict |
| a block with suppressed cells (try a rural pin) | "not published by Stats NZ for this block: …" row; the answer says so and does not substitute the suburb figure |

Automated: `node scripts/test/tri130-verify.mjs` (dev server on :3000).

## Nearby from the address (TRI-131) — manual checks

A new group **Nearby, as the crow flies — straight-line from the address
point · not a walk or a drive**: nearest council park or reserve (distance
to the polygon edge, 0 m when the pin is inside one), nearest rapid-transit
stop (train / busway / ferry, council RTN stops, 2022), and the nearest
primary, intermediate and secondary school by MOE type. Every row is a
straight-line distance with the place's name and detail; confidence
`derived`. Copy: "Nearest school is proximity only: not necessarily zoned".
Supermarkets, cafés and bus stops are deliberately absent (TRI-19 /
TRI-102).

| Ask / do | Expect |
|---|---|
| pin `42 Ponsonby Rd` | five rows with metres / km and names; the note under them; a "computed" confidence chip |
| `What's near 42 Ponsonby Road — the nearest park, train or busway station, and primary school?` | rows "At 42 Ponsonby Road…: nearest council park or reserve — <name>, straight-line distance as the crow flies (… m; not a walk or a drive)" etc.; the answer names each, gives the distance, says straight-line, says the school is not necessarily zoned |
| `How long would it take to walk from 42 Ponsonby Road to Grey Lynn Park?` | still the commute path (a routed walking time, typical, no live traffic) — nearby rows do not replace it |

Automated: `node scripts/test/tri131-verify.mjs` (dev server on :3000).

## Address shortlist UI (TRI-141) — manual checks

The workspace now holds a **shortlist of pins** (oldest first, capped at the
compare limit; Home clears them). Each searched address stays on the map with
its label. With two or more pins their areas join the Compare set: a column
per SA2, **headed by the address** and sub-headed "area: <suburb>"; two
addresses in one SA2 share a column with the note *"both addresses are in
the same statistical area, so area figures are identical"*. Above the area
columns, **At each address** shows the full "This property" panel per pin,
side by side and visibly separate from the area rows. Pins carry no data of
their own; no per-address score exists anywhere.

| Do | Expect |
|---|---|
| search `42 Ponsonby Rd`, then `22 Cardiff Road Pakuranga` | two pins on the map; "Compare (2)" tab; two columns headed by the two addresses with "area: Grey Lynn East" / "area: Pakuranga Central"; two "This property" panels above |
| then search `1/22 Cardiff Road Pakuranga` | three pins; still two columns; the Pakuranga column lists both addresses and the same-area note |
| click a different suburb on the map | the profile banner/facts follow the selection (no address shown for an area it isn't in); the pins stay on the map |
| Home | pins, compare and selection cleared |

Automated: `node scripts/test/tri141-verify.mjs` (dev server on :3000).

## Mobile shell (TRI-146, design phase A) — manual checks

The phone shell (below 1024 px) is a one-row top bar — Home · NZSI · the ask
box · a **"You"** button holding persona, Places, Budget, Sign in and Theme —
over a full-height map, with the bottom sheet's pinned header (grab handle,
suburb/address search, tabs) and a scrolling body. The map's shading, hazard
layers and legend live in one **Layers** button bottom-left above the sheet;
the starter questions live inside the sheet's empty state. Everything is on
the token type scale (nothing below 12 px), 40 px touch targets, safe-area
padding, and the theme follows the phone's setting until you toggle it.

| Do (390 × 844) | Expect |
|---|---|
| open the app | one-row header; the sheet at half height with the search box and "Try one" chips plus the "Try asking" questions; no chips over the map |
| tap **You** | persona toggle, Places, Budget, Sign in, Theme in one dialog; Escape (or tapping outside) closes it and focus returns to the button |
| focus the grab handle, press ArrowUp / Home / End | the sheet grows / snaps to peek / snaps to full; the handle announces "Panel height, peek/half/full" |
| type in the search at peek | the sheet grows so the list is never clipped; ArrowDown + Enter picks the highlighted option |
| tap **Layers** | shade-by select, hazard toggles (44 px rows), the legend and the verbatim hazard caveat; a compact legend pill sits beside the button while shading is on |
| ask a question | the tabs appear as real tabs (Answer / Profile / …); ArrowLeft/Right moves between them |
| switch the phone to dark mode | the app follows; the toggle in You still overrides |

Automated: `node scripts/test/mobile-shell-verify.mjs` (dev server on :3000) and `npm run test:unit`.

## Primitives gallery (TRI-147, design phase B) — manual checks

Nothing in the product changes in this phase; the kit lives at
`http://localhost:3000/dev/primitives` (dev only — 404 in production) and
shows every primitive × every status, light beside dark.

| Look at | Expect |
|---|---|
| Bullet bar rows | the grey band is the Auckland interquartile range, the tick the median, the teal bar the suburb; est./approx are hollow, computed dashed |
| any "suppressed" / "unavailable" row | a full-length hatched track with the reason in words — never a short or empty bar |
| Slope chart | dots joined by straight segments with the census years beneath; no curve |
| Stacked 100 % | the thin bar under it is Auckland in the same category order and colours |
| Layer bullets | "N of M layers above the Auckland median" badge; grey ramp only, no red |
| Dot plot | drive ● cycle ■ walk ▲ on one 0–120 min axis; beyond 90 min the row says "cycle/walk > 90 min" or "not walkable" instead of pinning a dot |
| Dot strip | lettered dots (T / M / C); the estimated one is tinted, "best" has a thin outer ring |
| Chips | source · vintage · [geometry] · quality; only the quality word is coloured; hover shows "Confidence: …" |
| the Housing card at the bottom | a headline sentence, one hoisted chip, rows that line up on one axis; on a phone the chart drops under the label/value line |

Automated: `node scripts/test/tri-design-verify.mjs` (dev server on :3000) — 390 and 1440,
both themes, screenshots in `shots/primitives-*.png`.

## Profile on the kit (TRI-148, design phase C) — manual checks

Open a suburb (e.g. **Ponsonby West**) and read the Profile tab top to bottom.

| Look at | Expect |
|---|---|
| header | name, "+ Compare", SA2 · km², a "renter view" / "buyer view" pill (and the budget chip when a budget is set), CBD distance with a *computed* mark |
| KPI cards | the persona's five figures, each with a bullet on the Auckland axis and "Auckland median X" beneath |
| card order | Renting: Housing · Getting around · People · Hazard screen · Planning · Schools; Buying: Housing · Planning · Hazard screen · People · Getting around · Schools |
| Housing | headline "Rent Nth percentile of Auckland"; the bond median row with the sparkline and a year-back delta; ONE "Rent quartiles" range row on the same axis; census rent indented; tenure / dwelling types / bedrooms as stacked bars with the thin Auckland bar beneath |
| a suppressed row (try a rural SA2) | a full-length hatched track and the reason in words, never an empty gap |
| Hazard screen | "N of M layers above the Auckland median" as one line; every layer says "Auckland median X"; the verbatim caveat; grey bullets only; liquefaction classes as one single-hue bar |
| Getting around | drive ● cycle ■ walk ▲ on one 0–120 min axis for the CBD and the Airport; your saved places as rows tagged "your place"; with none saved, a hatched row and **Add a place** that opens Places |
| People | population and age as census slope charts; ethnicity as separate bars with an Auckland tick; NZDep as a ten-cell strip labelled "least deprived … most deprived" with "2018 4 → 2023 5" in words |
| Schools | a table from 1024 px, a list on phones; straight-line rows carry a hatched "straight line" tag |
| phone (390 px) | label and value on one line, the chart beneath, chips right-aligned; nothing under 12 px; no sideways scroll |

Automated: the profile section of `node scripts/test/tri-design-verify.mjs` (both widths, both themes,
buyer re-order) plus tri106 / tri112 / tri122–133 / tri141.

## Compare on the kit (TRI-149, design phase D) — manual checks

Pin two or three suburbs with "+ Compare" (or answer a compare question) and open **Compare (N)**.

| Look at | Expect |
|---|---|
| header | one card per suburb with its letter (A/B/C) and hue, the address head where one is pinned, CBD distance, and ✕ to remove |
| any row | the metric label, lettered dots on the Auckland axis (grey band = interquartile range, tick = median), a value per suburb with its letter; "best" only where the registry has a direction, and never when tied; "unjudged" on deprivation, consents, hazards |
| an estimated value | its dot is tinted, not solid, and the value carries an est./approx mark |
| **Only differences** | rows within 10 percentile points (10 min drive / 15 min cycle-walk) disappear and the label says how many; a row where one suburb has no value never disappears |
| Getting around | rows are trips (Drive/Cycle/Walk to CBD, Drive to Airport, your saved places), dots are suburbs on a 0–120 min axis |
| Hazard screen | grey dots only, the verbatim caveat under the card title, no "best" |
| Percentile overview | collapsed by default; judged metrics only, lower-is-better rows say so; hazards / deprivation / consents absent |
| phone (390 px) | per-address facts as one full-width card at a time with a tab pager; rows stack label → strip → values; no sideways scroll |

Automated: the compare section of `node scripts/test/tri-design-verify.mjs`, plus tri83 and tri141.

## "This property" panel on the grammar (TRI-150, design phase E) — manual checks

Search an address (e.g. **42 Ponsonby Rd**) and read the panel above the banner.

| Look at | Expect |
|---|---|
| the six group headings | Public records about the land · This block, beside this suburb · Council plan records at this point · Area-level models at this point · Nearby, as the crow flies · Not held by this app — 13 px semibold, in that order |
| a hazard or overlay row | the layer name, then a pill with an icon and the council's own words (inside ■ · within 20 m ◆ · outside □ · none within 20 m ◇ · not in the assessed area – · unavailable hatched · checking… …) — never a colour verdict |
| every chip | source · vintage · **geometry** (address point / rating unit / SA1 block) · quality |
| the models group | the "Area-level model — not a property assessment…" sentence at the top and again at the foot |
| block rows | label, then "this block" and "this suburb" mono columns; suppression reads as words |
| phone (390 px) | the same panel, full width, nothing under 12 px, no sideways scroll |

Automated: tri122 / 123 / 126–133 / 141 unchanged, plus the property section of `tri-design-verify.mjs`.

## Design system — how to read the new surfaces (TRI-145, phases B–F)

**The regional axis.** Every scalar row draws the same axis: a faint line from the lowest to the
highest Auckland suburb (fenced at Tukey limits so one outlier cannot squash it), a grey band for the
interquartile range (p25–p75), a tick at the Auckland median, and this suburb's marker. A marker
inside the band is "typical"; one past either end of the band is in the top or bottom quarter. The
percentile sentence beside the value says the same thing in words.

**The status vocabulary.** Every figure carries one of: `exact` (the source's own value), `est.`
(estimated or mapped across boundaries — drawn as an outlined / tinted marker), `approx` (affected
by suppression, rounding or inheritance — outlined), `computed` (worked out here, e.g. a distance —
dashed), `not published` (the source suppressed it — a full-length hatched track and the reason in
words, never an empty gap) and `not available` (a service could not be reached — hatched). Hover
any mark for the sentence; the legend under Compare spells them out.

**Colour is never a verdict.** Teal marks metrics the registry judges (a direction exists); ink marks
information-only metrics (deprivation, hazards, consents, composition). Hazards sit on a grey ramp.
Amber appears only on citation chips. Compare's suburbs are orange / sky-blue / green with a letter
inside, so colour is never the only cue.

| Try | Expect |
|---|---|
| open **Waiheke East** (an island) and read Getting around | the walk / cycle dots to the CBD are absent and the row says "cycle/walk > 90 min" or "not walkable" — a far trip is stated, never pinned to the end of the axis |
| open a rural SA2 with few bonds (e.g. **Kaukapakapa**) | the rent row is a hatched track with "fewer than 5 bonds in the quarter" |
| hover an outlined marker | the tooltip reads "Confidence: Estimated — derived or mapped across boundaries" |
| ask "Which suburbs have the lowest median weekly rent?" on a phone | amber citation chips ≥ 24 px tall, result pills 40 px tall, the Results tab's table with 40 px rows |

Automated: `npm run test:design` (dev server on :3000) and `npm run test:phone`.

## Saved-suburbs shortlist (TRI-99) — manual checks

| Do | Expect |
|---|---|
| open a suburb, tap the star beside its name | the star fills; the label reads "Remove … from your shortlist" |
| star a second suburb, press Home | a "Saved 2 · on this device" strip above "Try one" with both chips |
| tap **Compare these** | Compare (2) opens with both |
| reload the tab | the strip is still there; the star is filled on a saved suburb |
| look at the URL, and at the Share link | the shortlist is never in it |
| on a phone, open **You** | the same strip sits above Sign in |

Automated: `node scripts/test/tri99-verify.mjs`.

