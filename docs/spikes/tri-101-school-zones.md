# TRI-101 spike — school enrolment zones: licence, geometry, in-zone design

**Date:** 2026-09-28 · **Timebox:** 1.5 h · **Status:** findings + recommendation, awaiting sign-off (licence + approach)

## What exists (verified)

| Source | Licence | Vintage | Format | Notes |
|---|---|---|---|---|
| **MOE "Enrolment Scheme Master"** via data.govt.nz / Education Counts (`Enrolmentschememaster.zip`, 12.4 MB) | **CC BY 3.0 NZ** (data.govt.nz catalogue entry) | **14 July 2026** ("ESmaster v14072026B", end of Term 2 2026; catalogue metadata last touched 2025-10-14) | **MapInfo native TAB** (`.TAB/.DAT/.MAP/.ID/.IND`), NZ projection per the TAB header; **1,325 zone polygons** nationally | Fields: `SchoolID`, `PolyID`, `PolyName`, `Office`, `ApprovalDate`, `EffectiveDate`, `INSTTYPE`. The Readme lists per-release edits (new / amended / redrawn / "written description only" zones). The download is behind Cloudflare: a plain `curl` gets 403; a browser User-Agent + Referer works. |
| Eagle Technology ArcGIS Hub "NZ School Enrolment Zones" | Eagle's terms of use — **not open** | fresher (2026-09-16) | FeatureServer | **Do not ingest** (ticket decision stands). |

MOE's own caveat, verbatim from the dataset page: the polygons *"do not have a high degree of spatial resolution nor vertical alignment integrity"* and *"should not be used to perform spatial queries with other datasets"*. Some schemes are **"written description only"** (no polygon at all — e.g. Paeroa College, Havelock North High School, Ormiston Junior College in this release); those cannot be answered spatially and must say so.

`SchoolID` is the MOE school number, so it joins the existing `schools.moe_number` directly.

## Geometry handling

No GDAL on the ETL machine and MapInfo TAB is binary, so the file cannot be read with the project's JS-only ETL toolchain as-is. Two workable options:

1. **`gdal-async` npm package** (prebuilt GDAL binaries for Node; MapInfo driver included). One ETL script reads the TAB, reprojects to WGS84, simplifies lightly (the source is coarse anyway) and writes GeoJSON — same pattern as the hazard/consents ETLs. Recommended.
2. Ask MOE / Education Counts for the shapefile the Readme says they produce for the "Network GIStool" — not published; not reliable.

Size estimate: 1,325 polygons nationally, Auckland ≈ 300–350 zones, well under 10 MB as simplified GeoJSON; **trivial for the DB** (a `school_zones` table with `moe_number`, `poly_name`, `effective_date`, `approval_date`, `inst_type`, `geom`).

## In-zone capability (design)

- **RPC** `school_zones_at_point(lng, lat)` → zones whose polygon contains the point, joined to `schools` on `moe_number` (name, type, year levels, authority, roll), plus the point's **distance to each zone boundary** (`ST_Distance` to the exterior ring).
- **Honesty rules (from the ticket, made concrete):**
  - Every result is **indicative**: header copy *"Indicative, from the Ministry's July 2026 zone file — the school's own zone page is authoritative."* Confidence `medium`.
  - A point **within 50 m of a zone boundary** renders *"on or near the boundary of <school>'s zone — check with the school"* and does **not** pick a side.
  - Schemes that are **written description only** render *"<school> has an enrolment scheme with no published map — check the school's zone page."*
  - No zone at the point → *"No published enrolment-zone polygon contains this point"* (which is normal: most schools have no scheme).
  - Vintage shown as the file date (14 July 2026) and refreshed when MOE re-issues the zip (irregular cadence; check the catalogue monthly).
- **Surface:** a `Schools` group in the "This property" panel between *Public records* and *Area-level models* (it is a Ministry record, but a coarse one → its own header "Ministry enrolment zones — indicative"), rows per zoned school; the existing "Nearest school … not necessarily zoned" line links to it.
- **NL:** "which schools is 42 Ponsonby Rd zoned for?" → `zone_*` rows (categorical, exempt from figure binding), the answer repeats "indicative" and the boundary caveat.
- **Eval:** three questions (a zoned house, a near-boundary point, an address with no zones).

## Recommendation

Proceed with **ingest of the MOE zip only** (CC BY 3.0 NZ) using `gdal-async` in the ETL, with the indicative / boundary / written-description copy above. Effort: ~half a day including the RPC, panel group, NL rows and eval. **Sign-off needed on:** (1) accepting CC BY 3.0 NZ alongside the CC BY 4.0 sources (attribution line: "Ministry of Education enrolment scheme data, CC BY 3.0 NZ"); (2) adding a native dependency (`gdal-async`) to the ETL toolchain; (3) the 50 m boundary rule.

Nothing has been ingested. The zip sits in `tmp/school-zones/` (gitignored) for inspection.
