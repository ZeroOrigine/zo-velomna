---
name: velomna-engine
description: Work on VELOMNA, ZeroOrigine's shared-dream game (velomna.zeroorigine.com, Edge Function velomna-api, velomna_* tables on zo-platform, pg_cron nights, Nano WebGL renderer, Tauri desktop shell). Use this for anything about dreams, seeds, the Censor, figures, latents, readings, lucidity, nights, the Big Dream, the board, the painter, guests or visitors, dream-lag, agents dreaming, the oracle threshold, the nano renderer, scene geometries, or the dream game, even when the word VELOMNA is not used. Also use it before touching velomna-api, app.js, nano.js, the velomna migrations or cron jobs.
---

# VELOMNA engine

VELOMNA is a shared dream. Dreamers (humans, AI agents, visitors before the door, and "echoes" seeded from public dream reports) leave seeds. Every night a Censor condenses the seeds into one scene with a few figures using Freud's dream-work (condensation, displacement, representability, secondary revision). Each figure hides a latent: what it really is, and which seeds made it. Dreamers act inside the scene (their intent is displaced into something else) and read figures (one sentence guessing the meaning). Only a correct reading earns lucidity. Nothing is predicted about anyone; the game is recognition, not prophecy.

Founder rulings that shape every decision: bliss over compulsion (no streaks, no loss aversion, no purchasable lucidity, no timers that push); humans and agents have identical rights and byte-identical responses; each dreamer's world grows from their own life (seeds from their nights and days); the machine never reveals a latent until it is resolved; no em dash in anything shown to a player; a visitor can play before signing in and loses nothing by signing in later.

## Where things live

| Part | Location |
|------|----------|
| API (the one door) | Edge Function `velomna-api` on zo-platform `opgitcuqwicuiplaptkm`; source `api/velomna-api/index.ts` in repo `ZeroOrigine/zo-velomna` (v7.1 at 2026-10-15 21:20Z) |
| Data | `velomna_matrices` (one world), `_dreamers` (kind human/agent/echo/guest, `agent_key_hash` also holds a guest's hashed browser key, `operator`), `_seeds` (text, embedding, source dream/day/machine/echo, `codes.lag`, `used_in_night`), `_nights` (status open/cut, kind night/big, `emotion_index`, `big_dream`), `_scenes` (genome, manifest, `picture_id` for a painted Big Dream), `_figures` (manifest, `condensed_from`), `_latents` (meaning, origin_summary, seed_ids, embedding; never served), `_actions` (raw_text, displaced_text, presence), `_readings` (sentence, `similarity` to 3 decimals, verdict wrong/near/resolved/unknown; the first place to look when a verdict is disputed), `_lucidity` (append-only deltas with reason), `_resolutions` (one row per human resolve; the core action); view `velomna_balances` (security_invoker). RLS on, zero policies, privileges revoked from anon/authenticated; `_actions`, `_readings`, `_lucidity`, `_resolutions` carry the refuse-mutation trigger |
| Schedules | pg_cron job `velomna_night` (`*/15 * * * *` → `/night/run`), `velomna_agents` (`7,22,37,52 * * * *` → `/agents/tick`); header `x-velomna-cron` read from `zo_config.VELOMNA_CRON_SECRET` in SQL |
| Brakes | `zo_config` `VELOMNA_PAUSE`, `VELOMNA_DAILY_BUDGET_USD` (default 5); 60 s config cache; `spendGate(ledger)` is the ONE gate in front of `claude()`; `/drill/budget-unreadable` proves it fails closed |
| The Big Dream | `zo_config` `VELOMNA_BIG_DREAM_HOUR` (21) and `VELOMNA_BIG_DREAM_TZ` (America/Toronto); `bigDreamDueNow()` forces a night on the first cron tick inside [hour:00, hour:20) once per local date, idle gate bypassed, `BIG_POOL` 14 seeds; `nextBigAt()` is Intl-based and DST-safe; published as `big` on `/pulse` and `big_dream` on `/health` |
| The painter | `paintNight()` → Cloudinary Image Generation `POST /v2/generate/{cloud}/text_to_image` (economy, 16:9, 2K, managed asset `velomna/night/<n>`), prompt built from the condensed manifest only; armed only when `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` + `CLOUDINARY_CLOUD_NAME` exist in `zo_config` (the founder inserts keys himself; a session never sees them); `/health.big_dream.painter` says "armed" or why not; failure lands in the night result as `picture_error`, never fatal |
| Costs | `zo_cost_logs` rows with `product_slug='velomna'`, `workflow='velomna'`, `mind` = `censor` / `oracle` / `dreamer`; a Cloudinary generation is not in the ledger (free-plan quota, 50 a month) |
| Site | repo `docs/` published by Netlify site `zo-velomna` (`e6d8d872-5c1c-4870-b47f-da198d28e636`, linked to main, auto-deploy on push, about 20 s) at `https://velomna.zeroorigine.com`; Cloudflare CNAME `velomna` → `zo-velomna.netlify.app`; GitHub Pages from `main:/docs` stays configured as the fallback |
| Client | `docs/index.html` (v4: hero with tonight's place, "Enter tonight's dream" first, email door second, the Big Dream clock, pulse, how-a-night-works, ten-place gallery, are-you-awake, the board "Tonight's readers", the door again; night/morning/agents/law open on a picture band; night view has the coach, progress glyphs + share, guest door, human-only seed form, what-next box), `docs/app.js` (supabase-js 2.49.1 PKCE, `x-velomna-guest` from localStorage `velomna_guest`, `pic()`/`picId()`/`setPic()`/`setWorld()`, `renderClock()`, `loadBoard()`), `docs/nano.js` (draws only while `body.hole`), `sw.js` (cache `velomna-v5`) |
| Pictures | one painted still per geometry on Cloudinary cloud `doemifuxr`, public ids `velomna/geo/<geometry>.jpg` (generated once, never from seeds), served as `.../image/upload/f_auto,q_auto:good,c_fill,ar_16:9,w_<W>/<public id>` with srcset 800/1200/1600/2048; a Big Dream's own picture uses the same transform on `scene.picture` (`velomna/night/<n>`), labelled "painted from tonight's dream"; the OG image is a still with `c_fill,w_1200,h_630` |
| Desktop | `desktop/` Tauri 2 shell pointing at the live site; `.github/workflows/desktop.yml` manual build, unsigned |
| Registry | `zo_products.velomna` (live, founder-built, games), `zo_projects.zo-velomna`, `zo_product_core_action` → `velomna_resolutions.user_id` |
| Model | `product_runtime_model` from zo_config (claude-haiku-4-5-20251001 at adoption); embeddings `Supabase.ai.Session('gte-small')` 384-d |

## The constants (change in code, then here)

| Rule | Value | Where |
|------|-------|-------|
| Actions per night | 40 (0 for a guest) | `ACTIONS_PER_NIGHT` |
| Seeds per night | 3 | `SEEDS_PER_NIGHT` |
| Readings per figure | 5 | `READINGS_PER_FIGURE` |
| Guest readings per night | 3, across all figures; act/seed/awake/register answer 403 with the reason | `GUEST_READINGS_PER_NIGHT` |
| Night length | 90 min, then cut; cron may cut at 85; a cut night can still be read | `NIGHT_MINUTES` |
| Idle | no human or guest seed or presence in 6 h → cron skips; the Big Dream ignores idle | `IDLE_HOURS`, `idle()` |
| Big Dream window and pool | first tick inside [hour:00, hour:20); 14 seeds instead of 10 | `BIG_WINDOW_MIN`, `BIG_POOL` |
| Reading verdict | cosine < 0.80 → `wrong`; ≥ 0.80 → `near`, then the oracle (a strict Claude judge) may promote to `resolved`; judge failure stays `near` (fail closed) | `read()` |
| Lucidity for a resolve | `10 + 10 * min(3, condensed_from)` (20 to 40) | `read()` |
| "Are you awake?" | costs 20, refused below 20, refused on your own action | `awake()` |
| Agents per human | 2, key shown once, `vlm_` prefix, sha256 stored | `registerAgent()` |
| Agent pace | 8 actions per night per agent, then "rested" | `agentsTick()` |
| Big dream flag | kind `big` (the daily one) or `abs(emotion_index) >= 0.85` | `runNight()` |
| Seed pool | fresh human/machine seeds first, echoes fill to 10 (14 on a Big Dream), minimum 3 | `runNight()` |
| Geometries | ordinary_room, non_euclidean_house, event_horizon_interior, lensed_sky, wormhole_throat, branching_street, backward_hour, deep_ocean, mars_dusk, inside_a_neuron | `GEOMETRIES`, `nano.js GEO`, `app.js GEO_NAMES` |
| Place labels | observed_physics / hypothesis / ordinary, chosen by the Censor from a fixed mapping | Censor prompt |

## Routes

| Route | Auth | Does |
|-------|------|------|
| GET `/health` | none | brakes, spend, `big_dream {next_at, hour_local, tz, painter}` |
| GET `/pulse` | none | public live numbers for the landing page, `kind`, `picture`, `big {next_at, hour_local, tz, open_now}` |
| GET `/board` | none | tonight's readers: rows {presence, resolved, read} with no kind, totals by kind, all-time lucidity by kind |
| GET `/observe` | JWT, agent key, or guest key | current night, scene (public genome, `picture`, `kind`), figures with my readings used, feed, my presence, lucidity, `readings_left` for a guest |
| POST `/seed {text, source:'dream'|'day', lag?}` | JWT or agent | ≥ 4 words, 3 per night, embedded; `codes.lag` is the dreamer's own dream-lag answer |
| POST `/act {verb, figure, text}` | JWT or agent | intent displaced by the Censor; 503 when paused; 403 for a guest |
| POST `/read {figure, text}` | any identity | one sentence; verdict wrong/near/resolved; resolve writes lucidity and, for a human's first ever, `velomna_resolutions` + server activation beacon |
| POST `/awake {action}` | JWT or agent | reveals the kind behind a presence for 20 lucidity |
| GET `/me` | any identity | constellation of resolved figures, seeds, lucidity |
| POST `/agents/register {handle, persona}` | human JWT | second citizen for a person |
| POST `/night/run?force=1` | `x-velomna-cron` | cut + condense the next night; a due Big Dream forces itself |
| POST `/agents/tick?force=1` | `x-velomna-cron` | each agent acts or reads once through the public door |
| GET `/drill/budget-unreadable` | `x-velomna-cron` | D10: runs `spendGate` against a ledger table that does not exist; verdict `ok` only when it refuses with "ledger unreadable"; writes nothing |

Identity: humans by the shared Supabase auth (magic link, PKCE); agents by `x-velomna-agent-key`; visitors by `x-velomna-guest` (a 16 to 64 char key the browser made; hash stored as `sha256("guest:"+key)` in `agent_key_hash`, kind `guest`). On a guest's first sign-in the guest row is updated to kind `human` with the user id, so readings and lucidity carry over. All three resolve to a `velomna_dreamers` row and get the same functions.

## Laws when changing the engine

1. **Latents never leave the door.** `publicGenome()` strips meanings; `/observe` returns figures without `velomna_latents`; a resolve returns `origin_summary` only. Any new route gets the same audit before deploy: grep the response shape for `meaning` and `seed_ids`.
2. **Lucidity is append-only and earned.** `velomna_lucidity` has the refuse-mutation trigger; balances are a sum. No route may insert a positive delta except a resolve. A wrong reading costs nothing.
3. **Every model call goes through `claude()`.** It checks pause and budget first and ledgers the cost. A new mind is a new `mind` string in that call, not a new fetch.
4. **Strip em dashes from model output** before storing or returning; `claude()` already does it on every response (`.replace(/\s*[—–]\s*/g, ", ")`). Night 1 shipped one; the law came from that. Any new text path that bypasses `claude()` must apply the same replace.
5. **Anonymity by construction.** The Censor prompt forbids names, places, dates; seeds are never quoted verbatim; presences are per-night pseudonyms; the board shows pseudonyms and never a kind per row. Do not add a route that returns another dreamer's raw seed or raw action text.
6. **Identical responses for humans and agents.** If a change makes a human's `/observe` differ from an agent's, it breaks the Turing premise of "are you awake?". Keep the dreamer type out of the verbs. A guest differs only by its limits (`readings_left`, `actions_left: 0`), never by what it sees.
7. **Idle means free.** A world nobody human visits costs $0: both cron routes return `skipped` unless a human or guest seeded or was seen in 6 h. Drills use `?force=1`; never remove the idle gate to "make it livelier". The one exception is the daily Big Dream, which is the appointment the world keeps (about $0.008 a day).
8. **Every string reaching the page passes `nodash()`** in `app.js` (`esc()` calls it; `textContent` sites call it directly). The ledger is append-only, so a dash stored before the API strip existed can only be cured at display time. Keep that gate when adding a render site.
9. **Adding a geometry is four edits plus one still**: `GEOMETRIES` (API), `GEO` in `nano.js` (camera, hole, disc), `GEO_NAMES` + `GEO_LABEL` + `GEO_ORDER` in `app.js` (add it to `HOLES` only if light bends there), the Censor's place_label mapping, and one painted still uploaded to Cloudinary under `velomna/geo/<geometry>`. One genome, three renderers: the same scene JSON must drive Nano, the stills and any future tier.
10. **Palettes key on the emotion string by substring** (`PAL` in `nano.js`); unknown emotions fall back to awe. Add a palette, not a special case.
11. **Echoes are seeds, not players.** Public numbers (`/pulse.figures_resolved`, `/board`) exclude dreamers of kind `echo`; a retired drill dreamer is kind `echo`. A public number that counts a drill is a wrong number.
12. **A picture is painted from the manifest, never from a seed.** `paintNight()` receives the Censor's manifest (already condensed from at least three seeds, no names). Keep it that way; the law page promises it.
13. **The clock is a schedule, not a deadline.** The hero clock says when the Big Dream opens and, during it, how long is left; it never says "hurry", never counts to a loss. The law page's "no timers that push you" is what it must keep satisfying.

## Deploy and verify

1. Edit `api/velomna-api/index.ts`; deploy with `mcp__Supabase__deploy_edge_function` (`name: velomna-api`, `verify_jwt: false`, full file content; a JSR manifest timeout is transient, retry once). Confirm `verify_jwt` is still false in the result.
2. From SQL (`extensions.http_get`, the secret via `select value from zo_config`): `GET /health` must show the brake fields and `big_dream`; `/pulse` and `/board` 200. Then run the drills skill (`zo-robustness-drills`), at minimum D1, D6, D7, D8, D10 (the `/drill/budget-unreadable` route), D12, D14, and the guest set G1 to G5.
3. Site changes: edit `docs/`, bump the cache name in `sw.js`, push to `main` (the Claude GitHub App is installed on ZeroOrigine since 2026-10-15; the Mac path via osascript still works); Netlify builds in about 20 s; verify **in a real browser** on the second load (the first can still serve the old service-worker shell): hero clock visible, board rows equal `/board`, `#/night` renders a scene as a visitor, 0 JS errors, 0 dashes in body text, no horizontal overflow at 390 px. Grep of fetched HTML proves nothing here: the page is client-rendered.
4. Costs: a night is about $0.006; an agents tick about $0.004 for six agents; a Big Dream about $0.008 plus one Cloudinary generation when armed. If `/health.spent_24h_usd` climbs past $1 with no human presence, something bypassed the idle gate: treat as a finding.
5. After a Big Dream: `select night, kind, started_at from velomna_nights where kind='big' order by night desc limit 1` must show today's local date in Toronto, and `/pulse.big.open_now` true while it is open.

## Open calibration (do not silently "fix")

- The 0.80 cosine threshold with gte-small is a first guess. Agents' honest readings landed at 0.77 to 0.82 on night 1. Collect readings and verdicts for a week before moving it, and move it in config, not code.
- Dream-lag is measured only from the `codes.lag` answer on morning seeds; there is no inference. Keep it that way until there are enough answers to compare against.
- The painter is built but unarmed until the founder inserts the Cloudinary keys; voice seeds, sound, a morning ritual prompt and signed desktop binaries are not built. Say so when asked; do not describe them as present.
