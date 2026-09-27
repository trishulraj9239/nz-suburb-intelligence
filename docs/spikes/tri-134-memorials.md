# TRI-134 spike — title memorials (easements, covenants, caveats): feasibility + honesty design

**Date:** 2026-09-28 · **Timebox:** 2 h · **Status:** feasible as a LIVE per-title lookup; build ticket recommended, awaiting sign-off

## Findings (verified against the LINZ Data Service, 2026-09-28)

The ticket's fear — 45.9M memorial rows — only applies to a bulk load. Per title, the Full Landonline tables answer a WFS filter in **~0.14 s**, so memorials can be read live for the titles the property chain (TRI-126) already resolves at the pin, exactly like the title and built-form checks. **Nothing needs loading.**

The join chain, all CC BY 4.0 and keyed with the existing `LINZ_LDS_API_KEY`:

| Step | Table | Filter / fields | Example (42 Ponsonby Road, title 932002) |
|---|---|---|---|
| 1 | **Title Memorial** `table-52006` | `ttl_title_no = '<title>' AND curr_hist_flag = 'CURR'` → `act_tin_id_orig`, `mmt_code`, `status`, `text_type` | 2 rows (one CURR `mmt_code 507`, one HIST `506`) |
| 2 | **Title Instrument** `table-52012` | `id = <act_tin_id_orig>` → `trt_grp`, `trt_type`, `status`, `lodged_datetime` | id 20289083 → `TINT / ENC`, REGD, lodged 2025-12-02 |
| 3 | **Transaction Type** `table-52009` (lookup, ~400 rows, cache a day) | `grp + type` → `description` | `ENC` = "Encumbrance" |

Cross-check: **Title Instrument Title** `table-52013` (`ttl_title_no` → `tin_id`) lists the same instrument ids, so either path works.

`mmt_code` has no published lookup on the LDS (only Action / Coordinate / Observation types are there), so the memorial code alone is **not** enough to classify — the instrument's `trt_type` is, and it is the right key because it is the registered dealing type.

## Classification (from the Transaction Type descriptions)

| Class shown | `trt_type` codes (non-exhaustive; classify by description regex, keep the list in code) |
|---|---|
| Easement | `E`, `EI`, `TE`, `EAST`, `SEAS`, `HCEC`, `PAE`, `CCOC` (right of way consent) |
| Covenant | `COV`, `LCOV`, `SCOV`, `FC`, `C240`, `C642`, `CONO` (consent notice) |
| Caveat | the caveat dealing (`X` family; `PWX` = partial withdrawal) |
| Encumbrance / land charge / bond | `ENC`, `SLC`, `BON`, `BLR` (building line restriction) |
| Lease | `LEAS`, `LC`, `RL`, `PL`, `FLPS`/`FLPX` (the cross-lease flat plan itself) |
| Notice / other | `NOT`, `GN`, `NC`, statutory notices |
| **Mortgage — classified and DROPPED** | `M`, `MM`, `MVM`, `VM`, `TM`, `TSMM`, `MP`, `CNMG`, `MFL`, `MEM` and every "Discharge/Partial discharge of mortgage" |

Discharges, withdrawals, cancellations and surrenders (`D*`, `P*`, `W*`, `S*`, `R*` families) are **not** counted as live encumbrances; only `curr_hist_flag = 'CURR'` memorials whose instrument is a grant/creation count. Where the description is ambiguous the row falls into "other registered dealing" and is still counted, never dropped silently.

## Honesty design

- **Counts by class only, never text:** *"2 easements · 1 land covenant · 1 encumbrance registered on this title"*. The memorial text is not in these tables and is never requested; owner names never appear (the no-ownership titles layer stays the only title source).
- **Mortgages are never surfaced** — they reveal the owner's finances. Dropped after classification; the copy says so: *"Mortgages are not shown."*
- Copy: *"Memorials registered on the title as at <LDS publish week>; read the title for their content — a lawyer can obtain it."* Confidence `high` (exact register counts). Source chip: *"Toitū Te Whenua LINZ · Landonline title memorials (no text, no ownership) · CC BY 4.0"*.
- Multiple titles at a point (cross lease, unit title) → counts per title, listed, never summed into one.
- Service failure → *"LINZ land records could not be reached — memorials not checked"*, never "none".

## Recommendation

**Build ticket (live lookup, no ingest):** extend `lib/property-facts.ts` with a `memorials` step (three WFS calls per title, cached with the title), add a "Registered on the title" block under *Public records about the land*, NL `record_memorial_*` categorical rows, eval (a freehold with an easement, a cross lease, a no-memorial title). ~half a day. **Sign-off needed on:** the mortgage-drop rule and the class list above.
