# Browser verification scripts (M16)

Standalone Playwright scripts that assert the M16 shell's acceptance criteria.
They are **not** `node --test` unit tests (that's `quota-floor.test.mjs`) — each
drives the real app and throws on the first failed assertion.

They need a dev server on `:3000` and Playwright's msedge channel:

```bash
npm run dev                                  # in another shell
node scripts/test/tri83-verify.mjs           # answer strip + mobile tab, one body two frames
node scripts/test/tri85-verify.mjs           # geometry-derived map fit, controls, panel affordance
node scripts/test/tri104-verify.mjs     # Results tab + intent-driven choreography
node scripts/test/tri93-verify.mjs      # question chips: starters, follow-ups, persona
node scripts/test/tri106-verify.mjs     # persona KPI tiles + Auckland-median reference
node scripts/test/tri122-verify.mjs     # address search: hit → SA2 profile + pin + banner; honest no-match
node scripts/test/tri123-verify.mjs     # address tier 2: council hazard point checks + drive times from the pin
node scripts/test/tri126-verify.mjs     # title & land at the pin from LINZ public records (no ownership, no valuation)
node scripts/test/tri132-verify.mjs     # "Also check" link-outs: seven external sources with reasons, copy-address fallback
node scripts/test/tri133-verify.mjs     # property panel composition: epistemic headers, panel-above-banner order, both frames (1440 + 390)
node scripts/test/tri127-verify.mjs     # built form on the unit: count, roof footprint, site coverage, aerial thumbnail with imagery caption
node scripts/test/tri128-verify.mjs     # Unitary Plan overlays at the pin: ten rows, decoded council names on hits, chapter links, no advice
node scripts/test/tri129-verify.mjs     # extended hazards at the pin: flood prone depth, landslide susceptibility wording, ASCIE lines, tsunami zone, HAIL gap + map links
node scripts/test/tri130-verify.mjs     # this block (SA1) beside this suburb: Census 2023 + NZDep2023, suppression as 'not published', no verdicts
node scripts/test/tri131-verify.mjs     # nearby from the pin: nearest park, RTN stop, schools by level — straight-line, 'not necessarily zoned', derived
node scripts/test/tri153-verify.mjs     # share cards: /api/og PNGs for suburb / compare / question / garbage, og:image + og:title from the URL state, no preference leak (fetch-only)
node scripts/test/tri97-verify.mjs      # URL state: sa2/compare/q written by replaceState, restored with ONE /api/ask, no preference leaks, Share copies, Home clears
node scripts/test/tri141-verify.mjs     # shortlist UI: several pins on the map, address-headed compare columns, same-area note, per-address facts side by side
node scripts/test/mobile-shell-verify.mjs  # TRI-145 A: phone shell at 390×844 in light + dark — one-row header, You menu, slider sheet, tablist, Layers dock, combobox, 12px floor
node scripts/test/tri-design-verify.mjs    # TRI-147..151: primitives gallery, Profile, Compare, property panel, answer surfaces — 390 + 1440, light + dark (`npm run test:design`)
node scripts/test/run-phone.mjs            # TRI-151: replays tri122/123/126–132/141 at 390×844 via NZSI_VIEWPORT, paced 20 s apart (`npm run test:phone`)
npm run test:unit                        # node --test: tokens.css in sync with lib/tokens.ts, no sub-12px sizes, no hex outside the token files
```

Screenshots are written to `shots/`, which is git-ignored — the assertions are
the point; the images are for eyeballing.

The address-epic scripts read their viewport from `_viewport.mjs`: set
`NZSI_VIEWPORT=390x844` to replay any of them at phone width (that is all
`run-phone.mjs` does, in sequence).

`tri83-verify` asserts the milestone's hard rule: crossing the `lg`
(superseding the original TRI-82 script, whose pre-strip DOM no longer exists)
the milestone rule: crossing the `lg` breakpoint mid-stream must continue the SAME answer with exactly **one**
`/api/ask` request. If a future change forks the answer surface, these fail.

Note: they depend on the dev-only `window.__nzsiMap` handle exposed by
`map-container.tsx` (guarded by `NODE_ENV !== "production"`), which is how map
choreography is asserted from inside the map instance.
