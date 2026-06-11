# Spike: Stats NZ ADE API — Census 2023 at SA2 (TRI-15)

**Date:** 2026-06-11 · **Verdict: ✅ data is reachable in exactly the shape we need.**
Live-probed with the project's Stats NZ subscription key.

## API shape

- **Base URL:** `https://api.data.stats.govt.nz/rest`
- **Auth:** header `Ocp-Apim-Subscription-Key: <STATS_NZ_API_KEY>` (Azure APIM;
  401 without it). Key lives in `.env.local` / server env only.
- **Standard:** SDMX 2.1 REST. JSON via Accept headers:
  - structures: `application/vnd.sdmx.structure+json;version=1.0`
  - data: `application/vnd.sdmx.data+json;version=1.0`
- **Catalog size:** 911 dataflows; 335 Census-2023 (`CEN23_*`), grouped
  `CEN23_{DEP,ECI,EDU,FHH,HAD,HOU,INC,LOC,MAO,POP,TBT,TRA,WRK}_NNN`.
  Dataflow names state their geography levels, e.g. `(RC, TALB, SA2, Health)`.

## URL patterns (verified live)

```
# list all dataflows
GET /rest/dataflow/all/all/latest

# full structure of one dataflow (dimensions + codelists)
GET /rest/dataflow/STATSNZ/CEN23_TBT_008/1.0?references=all

# data: key is {TOPIC}.{GEO}.{YEAR} — empty segment = all values
GET /rest/data/STATSNZ,CEN23_TBT_008,1.0/rc.130400./all?dimensionAtObservation=AllDimensions
```

Verified result for that last query (Ponsonby West, SA2 `130400`):
population count **2023 = 2,154 · 2018 = 2,337 · 2013 = 2,265** — the
three-census time series arrives in a single call → `as_of_date` rows for free.

## The dataflows the M3 ETL needs

| Dataflow | Grain | Dimensions (key order) | Use |
|---|---|---|---|
| `CEN23_TBT_008` | individuals × SA2 | `CEN23_TBT_IND_003 . CEN23_TBT_GEO_006 . CEN23_YEAR_001` | population, median age, ethnicity, income |
| `CEN23_TBT_007` | households × SA2 | `CEN23_TBT_HOH_003 . CEN23_TBT_GEO_007 . CEN23_YEAR_001` | median rent, tenure, household income |
| `CEN23_TBT_005` | dwellings × SA2 | (same pattern, dwellings topic codelist) | dwelling type, occupancy |
| `CEN23_HOU_019` | rented households × SA2 | weekly rent × bedrooms × landlord | rent distribution (if needed beyond median) |
| `CEN23_POP_001` | individuals × SA2 | ethnicity L1 × age × gender | ethnicity/age breakdowns (long format) |

## Topic codes (the "variable names" this spike existed to find)

**Individuals (`CL_CEN23_TBT_IND_003`, 509 codes):**

| Code | Metric |
|---|---|
| `rc` | Census usually resident population count |
| `asMed` | Median age |
| `asTotal5Y` / `asTotalLG` | Age totals (5-year / life-cycle groups) |
| `egTotal` | Ethnicity (total responses) |
| `mdTotal` | Māori descent indicator |
| `ibmed` | Median ($) total personal income |
| `biTotal` | Birthplace NZ/overseas |

**Households (`CL_CEN23_TBT_HOH_003`, 87 codes):**

| Code | Metric |
|---|---|
| `wrmed` | **Median ($) weekly rent** |
| `wrTotal` / `wrTS` | Weekly rent totals / total stated |
| `thTotal` / `thTS` | Tenure of household totals |
| `himed` | Median ($) total household income |
| `slTotal` | Sector of landlord |
| `hcTotal` | Household composition |

**Geography (`CL_CEN23_TBT_GEO_006`, 4,423 codes):** mixes levels in one list —
SA2s are 6-digit codes (e.g. Ponsonby West `130400`, Grey Lynn Central `132800`,
Takapuna Central `126801`); 5-digit codes are higher levels (e.g. `51170`
"Ponsonby" is a larger area, `07605` is a local board). **ETL must filter to the
SA2 subset** — match against the LINZ/Stats SA2 boundaries list (TRI-16) rather
than trusting code length alone.

**Years (`CL_CEN23_YEAR_001`):** `2013`, `2018`, `2023`.

## Response quirks / ETL notes

1. Topic-total rows (e.g. `egTotal`) return the **total**; per-category
   breakdown rows (ethnic groups, tenure types) are separate codes under the
   same codelist — enumerate the codelist children rather than hardcoding.
2. Observation status codelist `CL_OBS_STATUS_CEN23` exists (4 codes) —
   suppressed/confidentialised cells (Stats NZ rounds to base 3 and suppresses
   small counts); ETL should record these as NULL + `confidence='low'`.
3. Structure responses are large (~1 MB per dataflow with `references=all`) —
   cache them in the ETL run, don't refetch per metric.
4. The full SA2 slice for one topic is one call:
   `/data/STATSNZ,CEN23_TBT_008,1.0/rc..2023` (geo segment empty) — then filter
   to Auckland SA2 ids locally. Test response size before committing to this
   vs per-SA2 calls.
5. Median topics (`asMed`, `wrmed`, `ibmed`, `himed`) are pre-computed by
   Stats NZ — exact census values → `confidence='high'`.

## Gateway gotchas (hit while building TRI-17 — encode in every client)

1. **Node/undici is blocked at the TLS layer.** Every request from Node's
   built-in `fetch` returns 500 — same URL, same headers succeed via curl.
   The ETL scripts shell out to `curl` for all HTTP.
2. **URL path limit ≈ 1 KB**: max ~40 `+`-joined geo codes per request
   (80 codes → `400 Bad Request - Invalid URL` from the IIS layer).
3. **National wildcard slices 500**: an empty GEO segment (all 4,423 areas)
   fails even for a single topic. Always constrain GEO explicitly.
4. Use the `/all` provider-ref suffix on data URLs (the verified shape).
5. Working ETL pattern: chunk the 633 Auckland SA2s × all topics per call —
   48 requests total, ~2 min, no throttling observed.
