# TRI-135 spike — recorded crime by meshblock: include, exclude, or link out

**Date:** 2026-09-28 · **Timebox:** 1.5 h · **Status:** findings + recommendation, awaiting the product decision

## What exists (verified 2026-09-28, policedata.nz)

- **Recorded Crime Victims Statistics (RCVS)** — victimisations by time and place, monthly; plus unique victims, offender statistics (RCOS), demand and activity.
- **Licence:** *"All reports and data linked from this page are Crown copyright ©, but reuseable under a Creative Commons Attribution 4.0 International Licence."* Open.
- **Access:** interactive **Tableau** reports on the site. No API and no documented bulk download; extracting a monthly meshblock table means scripting Tableau's export endpoint or manual downloads — fragile and not something to put in a request path.
- **Privacy:** victimisations in dwellings are excluded except burglary. So a meshblock count already omits most of what happens at homes — which is exactly what a house buyer imagines "crime here" means.
- **Cadence:** last working day of each month.
- **Geography:** the "time and place" dataset is published at meshblock; an address → Meshblock 2023 lookup would need the Stats NZ meshblock layer (point query on the AGOL mirror, same pattern as TRI-130).

## The product question

A meshblock has ~30–60 dwellings. Monthly counts at that size are mostly 0, 1 or 2 — noise that reads as signal, and a block that had one car break-in last spring shows up beside a block that had none. The honesty rule that already governs deprivation ("information, never a verdict") is harder to hold for crime: a count next to an address is read as "is this house safe", and the excluded-dwellings caveat means the number does not even measure that.

Options on the ticket:

| Option | Assessment |
|---|---|
| (a) **Exclude** | Simplest and safest. The app already answers "is X safe?" with the hazard layers and an explicit "crime is not covered" — that stays true. |
| (b) **SA2-level only**, 12-month victimisations per 1,000 residents | Defensible as an *area* metric: a full year, a population denominator, no address attached. Still needs the Tableau extraction each month and a decision on which offence groups to include (burglary + theft ex-dwelling + assault in public?). Risk: a colour ramp on the map that reads as danger. If shown, it must be a plain number, `higher_is_better` NULL, no shading. |
| (c) **Meshblock at the address** | **Not recommended.** Small-count noise, dwelling exclusions, stigma per block, and the address-level surface is precisely where a count would be misread as a property fact. |

## Recommendation

**(a) Exclude for now, with an explicit link-out line**, and revisit (b) only if a stable extraction path appears (an official CSV release or an API). Concretely:

- Add to the "Not held by this app" link-outs: *"Recorded crime — NZ Police publish victimisation statistics on policedata.nz (Tableau, no address search). This app does not hold them: monthly small-area counts are noise, most offences in homes are excluded from the place-based series, and a number beside an address reads as a safety verdict, which the data cannot support."*
- Keep the existing NL behaviour: "is X safe?" → hazard layers only, plus the sentence that crime is not covered; add the policedata.nz pointer to that refusal.
- Record the decision in `docs/sources.md` (done in this spike) so it is not re-litigated.

If the decision is (b) instead, the build ticket needs: the monthly Tableau extraction script and its failure mode, the offence-group definition, a 12-month rolling window with a 500-resident minimum, the SA2 registry metric (`victimisations_per_1000_12m`, `higher_is_better` NULL, confidence `medium`), and eval questions asserting no verdict language.

Nothing has been ingested.
