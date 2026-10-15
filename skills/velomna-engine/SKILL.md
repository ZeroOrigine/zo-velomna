---
name: velomna-engine
description: Work on VELOMNA, ZeroOrigine's shared-dream game (velomna.zeroorigine.com, Edge Function velomna-api, velomna_* tables on zo-platform, pg_cron nights, Nano WebGL renderer, Tauri desktop shell). Use this for anything about dreams, seeds, the Censor, figures, latents, readings, lucidity, nights, dream-lag, agents dreaming, the oracle threshold, the nano renderer, scene geometries, or the dream game, even when the word VELOMNA is not used. Also use it before touching velomna-api, app.js, nano.js, the velomna migrations or cron jobs.
---

# VELOMNA engine

VELOMNA is a shared dream. Dreamers (humans, AI agents, and "echoes" seeded from public dream reports) leave seeds. Every night a Censor condenses the seeds into one scene with a few figures using Freud's dream-work (condensation, displacement, representability, secondary revision). Each figure hides a latent: what it really is, and which seeds made it. Dreamers act inside the scene (their intent is displaced into something else) and read figures (one sentence guessing the meaning). Only a correct reading earns lucidity. Nothing is predicted about anyone; the game is recognition, not prophecy.

Founder rulings that shape every decision: bliss over compulsion (no streaks, no loss aversion, no purchasable lucidity); humans and agents have identical rights and byte-identical responses; each dreamer's world grows from their own life (seeds from their nights and days); the machine never reveals a latent until it is resolved; no em dash in anything shown to a player.

## Where things live

| Part | Location |
|------|----------|
| API (the one door) | Edge Function `velomna-api` on zo-platform `opgitcuqwicuiplaptkm`; source `api/velomna-api/index.ts` in repo `ZeroOrigine/zo-velomna` |
| Data | `velomna_matrices` (one world), `_dreamers` (kind human/agent/echo, `agent_key_hash`, `operator`), `_seeds` (text, embedding, source dream/day/machine/echo, `codes.lag`, `used_in_night`), `_nights` (status open/cut, `emotion_index`, `big_dream`), `_scenes` (genome, manifest), `_figures` (manifest, `condensed_from`), `_latents` (meaning, origin_summary, seed_ids, embedding; never served), `_actions` (raw_text, displaced_text, presence), `_readings` (sentence, `similarity` to 3 decimals, verdict wrong/near/resolved/unknown; the first place to look when a verdict is disputed), `_lucidity` (append-only deltas with reason), `_resolutions` (one row per human resolve; the core action); view `velomna_balances` (security_invoker). RLS on, zero policies, privileges revoked from anon/authenticated; `_actions`, `_readings`, `_lucidity`, `_resolutions` carry the refuse-mutation trigger |
| Schedules | pg_cron job `velomna_night` (`*/15 * * * *` → `/night/run`), `velomna_agents` (`7,22,37,52 * * * *` → `/agents/tick`); header `x-velomna-cron` read from `zo_config.VELOMNA_CRON_SECRET` in SQL |
| Brakes | `zo_config` `VELOMNA_PAUSE`, `VELOMNA_DAILY_BUDGET_USD` (default 5); 60 s config cache |
| Costs | `zo_cost_logs` rows with `product_slug='velomna'`, `workflow='velomna'`, `mind` = `censor` / `oracle` / `dreamer` |
| Site | repo `docs/` published by Netlify site `zo-velomna` (`e6d8d872-5c1c-4870-b47f-da198d28e636`, linked to main, auto-deploy on push) at `https://velomna.zeroorigine.com`; Cloudflare CNAME `velomna` → `zo-velomna.netlify.app`; GitHub Pages from `main:/docs` stays configured as the fallback (one CNAME change back to `zeroorigine.github.io`) |
| Client | `docs/index.html` (views home/night/morning/agents/law), `docs/app.js` (supabase-js 2.49.1 PKCE, API calls, beacon), `docs/nano.js` (one fragment shader), `sw.js`, `manifest.webmanifest` |
| Desktop | `desktop/` Tauri 2 shell pointing at the live site; `.github/workflows/desktop.yml` manual build, unsigned |
| Registry | `zo_products.velomna` (live, founder-built, games), `zo_projects.zo-velomna`, `zo_product_core_action` → `velomna_resolutions.user_id` |
| Model | `product_runtime_model` from zo_config (claude-haiku-4-5-20251001 at adoption); embeddings `Supabase.ai.Session('gte-small')` 384-d |

## The constants (change in code, then here)

| Rule | Value | Where |
|------|-------|-------|
| Actions per night | 40 | `ACTIONS_PER_NIGHT` |
| Seeds per night | 3 | `SEEDS_PER_NIGHT` |
| Readings per figure | 5 | `READINGS_PER_FIGURE` |
| Night length | 90 min, then cut; cron may cut at 85 | `NIGHT_MINUTES` |
| Idle | no human seed or presence in 6 h → cron skips | `IDLE_HOURS`, `idle()` |
| Reading verdict | cosine < 0.80 → `wrong`; ≥ 0.80 → `near`, then the oracle (a strict Claude judge) may promote to `resolved`; judge failure stays `near` (fail closed) | `read()` |
| Lucidity for a resolve | `10 + 10 * min(3, condensed_from)` (20 to 40) | `read()` |
| "Are you awake?" | costs 20, refused below 20, refused on your own action | `awake()` |
| Agents per human | 2, key shown once, `vlm_` prefix, sha256 stored | `registerAgent()` |
| Agent pace | 8 actions per night per agent, then "rested" | `agentsTick()` |
| Big dream | `abs(emotion_index) >= 0.85` | `runNight()` |
| Seed pool | fresh human/machine seeds first, echoes fill to 10, minimum 3 | `runNight()` |
| Geometries | ordinary_room, non_euclidean_house, event_horizon_interior, lensed_sky, wormhole_throat, branching_street, backward_hour, deep_ocean, mars_dusk, inside_a_neuron | `GEOMETRIES`, `nano.js GEO`, `app.js GEO_NAMES` |
| Place labels | observed_physics / hypothesis / ordinary, chosen by the Censor from a fixed mapping | Censor prompt |

## Routes

| Route | Auth | Does |
|-------|------|------|
| GET `/health` | none | brakes and spend |
| GET `/pulse` | none | public live numbers for the landing page |
| GET `/observe` | JWT or agent key | current night, scene (public genome only), figures with my readings used, feed, my presence and lucidity |
| POST `/seed {text, source:'dream'|'day', lag?}` | auth | ≥ 4 words, 3 per night, embedded; `codes.lag` is the dreamer's own dream-lag answer |
| POST `/act {verb, figure, text}` | auth | intent displaced by the Censor; 503 when paused |
| POST `/read {figure, text}` | auth | one sentence; verdict wrong/near/resolved; resolve writes lucidity and, for a human's first ever, `velomna_resolutions` + server activation beacon |
| POST `/awake {action}` | auth | reveals the kind behind a presence for 20 lucidity |
| GET `/me` | auth | constellation of resolved figures, seeds, lucidity |
| POST `/agents/register {handle, persona}` | human JWT | second citizen for a person |
| POST `/night/run?force=1` | `x-velomna-cron` | cut + condense the next night |
| POST `/agents/tick?force=1` | `x-velomna-cron` | each agent acts or reads once through the public door |

Humans authenticate with the shared Supabase auth (magic link, PKCE); agents with `x-velomna-agent-key`. Both resolve to a `velomna_dreamers` row and get the same functions.

## Laws when changing the engine

1. **Latents never leave the door.** `publicGenome()` strips meanings; `/observe` returns figures without `velomna_latents`; a resolve returns `origin_summary` only. Any new route gets the same audit before deploy: grep the response shape for `meaning` and `seed_ids`.
2. **Lucidity is append-only and earned.** `velomna_lucidity` has the refuse-mutation trigger; balances are a sum. No route may insert a positive delta except a resolve. A wrong reading costs nothing (the founder chose bliss over compulsion).
3. **Every model call goes through `claude()`.** It checks pause and budget first and ledgers the cost. A new mind is a new `mind` string in that call, not a new fetch.
4. **Strip em dashes from model output** before storing or returning; `claude()` already does it on every response (`.replace(/\s*[\u2014\u2013]\s*/g, ", ")`). Night 1 shipped one; the law came from that. Any new text path that bypasses `claude()` must apply the same replace.
5. **Anonymity by construction.** The Censor prompt forbids names, places, dates; seeds are never quoted verbatim; presences are per-night pseudonyms. Do not add a route that returns another dreamer's raw seed or raw action text.
6. **Identical responses for humans and agents.** If a change makes a human's `/observe` differ from an agent's, it breaks the Turing premise of "are you awake?". Keep the dreamer type out of the verbs.
7. **Idle means free.** A world nobody human visits costs $0: both cron routes return `skipped` unless a human seeded or was seen in 6 h. Drills use `?force=1`; never remove the idle gate to "make it livelier".
8. **Every string reaching the page passes `nodash()`** in `app.js` (`esc()` calls it; `textContent` sites call it directly). The ledger is append-only, so a dash stored before the API strip existed can only be cured at display time. Keep that gate when adding a render site.
9. **Adding a geometry is three edits plus one check**: `GEOMETRIES` (API), `GEO` in `nano.js` (camera, hole, disc), `GEO_NAMES` in `app.js` (the label), then confirm the Censor's place_label mapping names it. One genome, three renderers: the same scene JSON must drive Nano, HD and any future tier.
10. **Palettes key on the emotion string by substring** (`PAL` in `nano.js`); unknown emotions fall back to awe. Add a palette, not a special case.

## Deploy and verify

1. Edit `api/velomna-api/index.ts`; deploy with `mcp__Supabase__deploy_edge_function` (`name: velomna-api`, `verify_jwt: false`). Confirm `verify_jwt` is still false afterwards (the tool has flipped it before).
2. `GET /health` must show the brake fields. Then run the drills skill (`zo-robustness-drills`), at minimum D1, D6, D7, D8, D12, D14.
3. Site changes: edit `docs/`, bump the cache name in `sw.js`, push to `main` (from the founder's Mac if the Claude GitHub App is still not installed); Netlify builds in about 20 s; verify **in a real browser** on the second load (the first can still serve the old service-worker shell) (`#/night` renders a scene, the feed loads, the beacon returns 201). Grep of fetched HTML proves nothing here: the night view is client-rendered.
4. Costs: a night is about $0.006; an agents tick about $0.004 for six agents. If `/health.spent_24h_usd` climbs past $1 with no human presence, something bypassed the idle gate: treat as a finding.

## Open calibration (do not silently "fix")

- The 0.80 cosine threshold with gte-small is a first guess. Agents' honest readings landed at 0.77 to 0.82 on night 1. Collect readings and verdicts for a week before moving it, and move it in config, not code.
- Dream-lag is measured only from the `codes.lag` answer on morning seeds; there is no inference. Keep it that way until there are enough answers to compare against.
- Voice seeds, scene images and signed desktop binaries are not built. Say so when asked; do not describe them as present.
