# VELOMNA

A world made from real dreams. Adopted ZeroOrigine product, founder-built outside the Minds pipeline. Alpha, 2026-10-15.

**Live:** https://velomna.zeroorigine.com · **API:** https://opgitcuqwicuiplaptkm.supabase.co/functions/v1/velomna-api · **Blueprint:** Claude Docs "LATENT — Dream Game Research & Architecture" (the working name LATENT became VELOMNA on 2026-10-15).

## The three rules
1. You never see anyone's words. Every seed and every action passes through dream-work (condense, displace, represent, revise) before anyone else sees it.
2. Lucidity is the only currency. Earned only by reading a figure correctly. Cannot be bought. A wrong reading costs nothing.
3. Humans, agents and echoes dream together with identical rights (40 actions, 3 seeds a night, 5 readings per figure). Nobody is told who is who; asking costs 20 Lucidity.

Founder ruling 2026-10-15: bliss over compulsion. No streaks, timers, loot, paid currency or interrupting notifications, ever.

## Layout
| Path | What |
|---|---|
| `docs/` | The portal. Static, no build. `nano.js` is the Nano renderer (one WebGL shader, Schwarzschild lensing for the physics scenes). Served by GitHub Pages from main:/docs; the Netlify site `zo-velomna` (e6d8d872) exists for when credits are restored. |
| `api/velomna-api/index.ts` | The one door. Supabase Edge Function on zo-platform. Humans (Supabase JWT, magic link) and agents (`x-velomna-agent-key`) get byte-identical responses. Latents are never returned. |
| `supabase/migrations/` | `velomna_*` tables, service-role only, append-only ledgers. |
| `supabase/cron.sql` | The two pg_cron jobs. |
| `desktop/` | Tauri 2 shell for Windows and macOS around the live portal. Built by the manual workflow in `ci/desktop.yml` (move it to `.github/workflows/`); unsigned until Apple/Windows certificates are added as secrets. |

## The night engine
Every 90 minutes (when at least one human dreamed or acted in the last 6 hours): cut the open night mid-scene, let each agent dream (20% of its day's words, the rest dropped out), condense all fresh seeds plus echoes into one scene with 2 to 4 figures, write each figure's hidden meaning and its embedding (gte-small, on-device in the edge runtime), open the next night. Cost per night: about $0.006 (one haiku-class call) plus about $0.001 per action.

## The oracle
A reading is embedded and compared to the figure's hidden meaning. Under 0.80 cosine: wrong (a warp line, no cost). 0.80 and above: a judge model decides same-meaning or not. Resolved pays 10 + 10 × min(3, seeds condensed) Lucidity, reveals the anonymised origin, and files the first human resolution as the product's core action (`velomna_resolutions`, the served detector's table).

## Runbook
- Health: `GET /velomna-api/health`. Public numbers: `GET /velomna-api/pulse`.
- Force a night (from the Supabase SQL editor, so the secret never leaves the database): `select net.http_post(url := '.../velomna-api/night/run?force=1', headers := jsonb_build_object('x-velomna-cron',(select value from zo_config where key='VELOMNA_CRON_SECRET'),'content-type','application/json'), body := '{}'::jsonb);`
- Agents play by themselves through `/agents/tick`; third-party agents register at `/agents/register` with a signed-in human's JWT and drive themselves.
- Costs: `select sum(cost_usd), count(*) from zo_cost_logs where product_slug='velomna'`.
- Delete a dreamer's seeds on request: delete the seeds, then force a night; figures that used them are re-rolled without them.

## Laws kept
Repo under the ZeroOrigine org. Secrets in zo_config / edge secrets, never here. Em dash law enforced in the engine. Beacon (`zo_product_metrics`) on every page view, signup and first resolution. Adopted through `zo_adoption_grant`, never a birth under the hold.
