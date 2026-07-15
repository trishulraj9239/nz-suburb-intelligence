# Linear automation

Two layers keep the Linear board in sync with reality after each production deploy.

## Layer 1 — Native status transitions (zero code)

Linear's GitHub integration moves `TRI-XX` issues on its own, because your branch
names and commits already reference them.

1. Linear → **Settings → Features → Integrations → GitHub** → connect, and pick
   the `trishulraj9239/nz-suburb-intelligence` repo.
2. Enable **Pull request automation**. Suggested mapping:
   - PR opened on a `…/tri-XX-…` branch → **In Progress**
   - PR merged to `main` → **Done**
3. (Optional) Turn on **link by commit** so commits with `TRI-XX` in the message
   also attach to the issue.

That alone closes tickets automatically. Layer 2 adds the screenshots + prose.

## Layer 2 — Deploy comment + screenshots (this folder)

`.github/workflows/linear-deploy-sync.yml` runs `scripts/linear/sync.mjs` when
Vercel reports a **successful production deployment**. The script:

- reads the deployed commit, pulls out every `TRI-XX`,
- screenshots the live deploy (light + dark) **only when `app/`, `components/`,
  or a `.css` file changed**,
- posts a first-person comment (embedding the shots) to each referenced ticket.

### One-time setup

1. **Create a personal Linear API key** — Linear → **Settings → Security & access
   → Personal API keys**. A *personal* key makes the comments appear as you.
2. **Add it to GitHub** — repo → **Settings → Secrets and variables → Actions →
   New repository secret**: name `LINEAR_API_KEY`.
3. **(Fallback URL, optional)** add a repo **variable** `PROD_URL` =
   `https://nz-suburb-intelligence.vercel.app` — used if Vercel doesn't report an
   `environment_url`.

### Knobs (env in the workflow)

| Variable          | Default | Effect                                                        |
| ----------------- | ------- | ------------------------------------------------------------- |
| `LINEAR_SET_DONE` | off     | `true` → also move issues to Done here (skip if Layer 1 does it) |
| `FORCE_SHOTS`     | off     | `true` → always attach screenshots, even for backend-only deploys |

### Test it without deploying

Actions tab → **Linear deploy sync** → **Run workflow** → optionally pass a SHA.
This uses the `workflow_dispatch` path and the same script.

### Extending the screenshots

`sync.mjs` captures the home workspace only (no clicks = reliable in CI). To add
profile/compare shots, drive the picker with Playwright the way the interactive
agent did: type into `input[aria-label="Find a suburb"]`, click the result, then
the `+ Compare` button. Keep waits generous — the map + Supabase fetches are async.
