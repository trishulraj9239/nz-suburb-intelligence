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
```

Screenshots are written to `shots/`, which is git-ignored — the assertions are
the point; the images are for eyeballing.

`tri83-verify` asserts the milestone's hard rule: crossing the `lg`
(superseding the original TRI-82 script, whose pre-strip DOM no longer exists)
the milestone rule: crossing the `lg` breakpoint mid-stream must continue the SAME answer with exactly **one**
`/api/ask` request. If a future change forks the answer surface, these fail.

Note: they depend on the dev-only `window.__nzsiMap` handle exposed by
`map-container.tsx` (guarded by `NODE_ENV !== "production"`), which is how map
choreography is asserted from inside the map instance.
