---
name: velomna-engine
description: Work on VELOMNA, ZeroOrigine's shared-dream game: the velomna-api Edge Function, velomna_* tables, nights, the daily Big Dream, the board, the painter, guests, seeds, figures, the catch-and-act play (acts, reactions, dawn), written readings, lucidity, the painted stills, the Nano renderer, cron and deploy. Use for anything about the dream game even when VELOMNA is not named.
---

# VELOMNA engine (v9, catch and act)

VELOMNA is a shared dream. Dreamers (humans, AI agents, visitors before the door, and "echoes" seeded from public dream reports) leave seeds. Every night a Censor condenses the seeds into one scene with a few figures using Freud's dream-work (condensation, displacement, representability, secondary revision). Each figure hides a latent: what it really is, and which seeds made it. Nothing is predicted about anyone; the game is recognition, not prophecy.

**The play (since 2026-10-18):** the painted dream fills the screen; the night's figures drift through it as glowing marks that hide and reappear; a dawn clock runs 150 s. Tap a figure, then do ONE of four acts to it: touch, speak to, follow, open. Each figure answers to exactly one act. The right act makes the figure give itself away (two sentences, the second in plain words) and earns lucidity; a wrong act answers with a one-line reaction and the origin hint, costs nothing, and the figure slips away; three wrong and it is gone for that night. Dawn takes nothing. Written readings (one sentence, judged by embedding + oracle) still exist on the night page as "the slow way" and pay double.

Founder rulings that shape every decision: bliss over compulsion (no streaks, no loss aversion, no purchasable lucidity, no timer that costs anything); humans and agents have identical rights and byte-identical responses; each dreamer's world grows from their own life; the machine never reveals a latent until it is resolved; no em dash in anything shown to a player; every place is a picture first and a paragraph second; a visitor can play before signing in and loses nothing by signing in later; **the game is a world, not a quiz** (the founder played the four-choice card version on 2026-10-18 and ruled "a question-answer game, not a game"; never bring back a screen that is a question with answer buttons as the main play); one orange button per screen; no typing anywhere in the play.

## Where things live

| Part | Location |
|------|----------|
| API (the one door) | Edge Function `velomna-api` on zo-platform `opgitcuqwicuiplaptkm`, verify_jwt false; source `api/velomna-api/index.ts` in repo `ZeroOrigine/zo-velomna` (v9, edge fn version 14 at 2026-10-18 22:45Z) |
| Data | `velomna_matrices`, `_dreamers` (kind human/agent/echo/guest, `agent_key_hash` also holds a guest's hashed browser key, `operator`), `_seeds` (text, embedding, source dream/day/machine/echo, `codes.lag`, `used_in_night`), `_nights` (status open/cut, kind night/big, `emotion_index`, `big_dream`), `_scenes` (genome, manifest, `picture_id`), `_figures` (manifest, `condensed_from`), `_latents` (meaning, origin_summary, seed_ids, embedding, `choices` + `answer_idx` for the four-choice reading, `verb_idx` + `reactions` for the acts; never served except `revealed` after a resolve), `_actions` (free moves: raw_text, displaced_text, presence), `_readings` (sentence, similarity, verdict wrong/near/resolved/unknown, `mode` written/choice/act; for an act the sentence is the verb), `_lucidity` (append-only deltas with reason), `_resolutions` (one row per human resolve); view `velomna_balances`. RLS on, zero policies; `_actions`, `_readings`, `_lucidity`, `_resolutions` carry the refuse-mutation trigger |
| Schedules | pg_cron `velomna_night` (`*/15 * * * *` → `/night/run`), `velomna_agents` (`7,22,37,52 * * * *` → `/agents/tick`); header `x-velomna-cron` from `zo_config.VELOMNA_CRON_SECRET`, used only inside SQL (`extensions.http`, set `CURLOPT_TIMEOUT_MS` in the same statement batch) |
| Brakes | `zo_config` `VELOMNA_PAUSE`, `VELOMNA_DAILY_BUDGET_USD` (default 5); 60 s config cache; `spendGate(ledger)` is the ONE gate in front of `claude()`; `/drill/budget-unreadable` proves it fails closed |
| The Big Dream | `VELOMNA_BIG_DREAM_HOUR` (21) and `VELOMNA_BIG_DREAM_TZ` (America/Toronto); `bigDreamDueNow()` forces a night on the first cron tick inside [hour:00, hour:20) once per local date, idle gate bypassed, `BIG_POOL` 14 seeds; DST-safe `nextBigAt()`; on `/pulse.big` and `/health.big_dream` |
| The painter | `paintNight()` → Cloudinary Image Generation (economy, 16:9, 2K, managed asset `velomna/night/<n>`), armed only when `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` + `CLOUDINARY_CLOUD_NAME` exist in `zo_config` (the founder inserts keys himself); `/health.big_dream.painter` says "armed" or why not |
| Costs | `zo_cost_logs` rows with `product_slug='velomna'`, `mind` = `censor` / `oracle` / `dreamer`. An act costs no model call; the four reactions per figure are made once per scene (`ensureActs`, about $0.001 per figure) |
| Site | repo `docs/` published by Netlify site `zo-velomna` (`e6d8d872-5c1c-4870-b47f-da198d28e636`, main, about 20 s) at `https://velomna.zeroorigine.com`; Cloudflare CNAME `velomna` → `zo-velomna.netlify.app`; sw cache `velomna-v16`; pushes go from the founder's Mac clone (`/Users/ai2all/Documents/AI Human ecosystem/zo-velomna`) via device_commit_files (always a fresh staged directory) + osascript git |
| Client | `docs/index.html` section `#v-play` = `.play.world` (`.pic`, `.veil`, `.dawn`, `#stage` with `.fg` sprites, `.playTop` with `#dawnClock`, `#playTitle`, `#hud`, `#sheet`, `#playCard` for the end card); `docs/app.js` PLAY module: `ACTS`, `DAWN_S` 150, `round {on, left, sprites, open, busy}`, `loadPlay()` → `startRound()` → `tick()` (rAF drift, hide/show, dawn opacity, clock paused while `round.open !== null` or the title is on), `catchFigure()` → `renderSheet()` → `doAct()` (POST /act) → `closeSheet()`, `endRound(reason)` → `renderEnd()` (step bar, glyphs, seed chips, "Dream this night again", `loadShelf()`), `hud()`, `playDots()`; night page keeps the written readings; `nano.js`, `sw.js`, `manifest.webmanifest` |
| Pictures | one painted still per geometry on Cloudinary `doemifuxr`, `velomna/geo/<geometry>.jpg`; a Big Dream's own picture on `scene.picture` (`velomna/night/<n>`); served `f_auto,q_auto:good,c_fill,ar_16:9,w_<W>` with srcset 800/1200/1600/2048 |
| Hub | `https://games.zeroorigine.com` (repo `ZeroOrigine/zo-games`, Netlify `zo-games`, light theme) lists every `zo_products` row with category `games` and status `live`; card image `zo/games/<slug>` on Cloudinary; VELOMNA's card shows `/pulse` |
| Registry | `zo_products.velomna` (live, founder-built, games), `zo_projects.zo-velomna`, `zo_product_core_action` → `velomna_resolutions.user_id` |
| Model | `product_runtime_model` from zo_config (claude-haiku-4-5-20251001 at adoption); embeddings `Supabase.ai.Session('gte-small')` 384-d |

## The constants (change in code, then here)

| Rule | Value | Where |
|------|-------|-------|
| Acts | touch, speak to, follow, open; one right act per figure | `ACT_VERBS`, `velomna_latents.verb_idx` |
| Wrong acts before a figure is gone for the night | 3 (the fourth verb is never a free pass) | `ACT_TRIES` |
| Lucidity for a resolve by act | `max(5, 10 + 5*min(3, condensed_from) - 5*wrong_acts_before)` | `actOn()` |
| Lucidity for a resolve by written reading / by choice | `10 + 10*min(3, condensed_from)` / `10 + 5*min(3, condensed_from)` | `read()` |
| Dawn (client round) | 150 s, pauses while a sheet is open; nothing is lost; the night can be dreamed again | `DAWN_S` in app.js |
| Free moves per night | 40 (0 for a guest) | `ACTIONS_PER_NIGHT` |
| Seeds per night | 3 | `SEEDS_PER_NIGHT` |
| Written readings per figure | 5; a guest gets 3 written readings a night; acts are not capped for a guest (no model call) | `READINGS_PER_FIGURE`, `GUEST_READINGS_PER_NIGHT` |
| Night length | 90 min, then cut; a cut night can still be played | `NIGHT_MINUTES` |
| Idle | no human or guest seed or presence in 6 h → cron skips; the Big Dream ignores idle | `IDLE_HOURS`, `idle()` |
| Reading verdict (written) | cosine < 0.80 → `wrong`; ≥ 0.80 → `near`, then the oracle may promote to `resolved`; judge failure stays `near` | `read()` |
| "Are you awake?" | costs 20, refused below 20 | `awake()` |
| Agents | 2 per human, key shown once, `vlm_` prefix, sha256 stored; house agents prefer ACT, READ only when every figure is settled; 8 free moves per night then "rested" | `registerAgent()`, `agentsTick()` |
| Geometries | ordinary_room, non_euclidean_house, event_horizon_interior, lensed_sky, wormhole_throat, branching_street, backward_hour, deep_ocean, mars_dusk, inside_a_neuron | `GEOMETRIES`, `nano.js GEO`, `app.js GEO_NAMES/GEO_LABEL/GEO_ORDER/HOLES` |

## Routes

| Route | Auth | Does |
|-------|------|------|
| GET `/health` | none | brakes, spend, `big_dream {next_at, hour_local, tz, painter}` |
| GET `/pulse` | none | public live numbers, `kind`, `picture`, `big` |
| GET `/board` | none | tonight's rows {presence, resolved, read} with no kind, totals by kind, all-time lucidity by kind (echoes excluded) |
| GET `/observe?night=N` | JWT, agent key, or guest key | the night (current or an earlier one), scene (public genome, `picture`, `kind`), figures with `resolved_by_me`, `hint` (after any try), `choices`, `chosen`, `verbs`, `acts {answers, tried, tries_left, gone, revealed}`, feed, me |
| GET `/nights` | any identity | the shelf: last 12 nights with figures / resolved / touched / open_for_me |
| POST `/act {figure, verb, night?}` (no text) | any identity, visitors included | THE ACT: verdict resolved/wrong, `reaction`, `lucidity_delta`, `hint`, `tries_left`, `gone`; 409 on a repeat verb, a resolved figure, or a gone figure |
| POST `/act {verb, figure?, text}` | JWT or agent | a free move: intent displaced by the Censor into the feed |
| POST `/read {figure, text}` or `{figure, choice}` | any identity | a written reading (5 per figure, double pay) or the one click among four choices |
| POST `/seed {text, source:'dream'|'day', lag?}` | JWT or agent | ≥ 4 words, 3 per night |
| POST `/awake {action}` | JWT or agent | reveals the kind behind a presence for 20 lucidity |
| GET `/me` · POST `/agents/register` | identity / human JWT | constellation; second citizen |
| POST `/night/run?force=1` · `/agents/tick?force=1` · GET `/drill/budget-unreadable` | `x-velomna-cron` | the cron verbs and the D10 drill |

Identity: humans by the shared Supabase auth (magic link, PKCE); agents by `x-velomna-agent-key`; visitors by `x-velomna-guest` (hash stored as `sha256("guest:"+key)`). On a guest's first sign-in the guest row becomes the human. All three resolve to a `velomna_dreamers` row and get the same functions.

## Laws when changing the engine

1. **Latents never leave the door.** `publicGenome()` strips meanings; `/observe` never returns `meaning`, `seed_ids`, `answer_idx` or `verb_idx`; `revealed` is the resolved figure's own reaction line, only after the dreamer resolved it. Audit any new route's response shape before deploy.
2. **Lucidity is append-only and earned.** No route may insert a positive delta except a resolve (written, choice or act). A wrong act or reading costs nothing.
3. **Every model call goes through `claude()`, and `claude()` goes through `spendGate()`.** Acts must stay free of model calls at play time: reactions are precomputed per scene by `ensureActs()`. A new mind is a new `mind` string, not a new fetch.
4. **Strip em dashes from model output** (`claude()` does it; `ensureActs` repeats it on each reaction). Any new text path that bypasses `claude()` must apply the same replace.
5. **Anonymity by construction.** The Censor forbids names, places, dates; reactions are written from the figure and its meaning only; presences are per-night pseudonyms.
6. **Identical responses for humans and agents.** A guest differs only by its limits (`readings_left`, `actions_left: 0`), never by what it sees; a guest may act on figures.
7. **Idle means free.** Both cron routes return `skipped` unless a human or guest seeded or was seen in 6 h; drills use `?force=1`. The Big Dream is the one exception.
8. **Every string reaching the page passes `nodash()`.**
9. **Adding a geometry is four edits plus one still** (`GEOMETRIES`, `nano.js GEO`, `app.js` names/labels/order, the Censor's place_label mapping, one still at `velomna/geo/<geometry>`).
10. **Palettes key on the emotion string by substring** (`PAL` in `nano.js`).
11. **Echoes are seeds, not players.** Public numbers exclude kind `echo`.
12. **A picture is painted from the manifest, never from a seed.**
13. **The clock is a schedule, not a deadline.** The Big Dream clock and the dawn clock never cost anything; dawn ends a round and offers the same night again. If the law page's wording and the game ever disagree, ask the founder; do not change either silently.
14. **The play is a world.** `#/play` lands straight in the picture with the figures moving; one tap catches, one tap acts; the end card has exactly one orange button; no text input anywhere in the play.
15. **A new night must have its acts.** `runNight()` calls `ensureChoices()` and `ensureActs()`; `observe()` and `actOn()` make them lazily for older nights, once per scene per isolate.

## Deploy and verify

1. Edit `api/velomna-api/index.ts`; deploy with `mcp__Supabase__deploy_edge_function` (`name: velomna-api`, `verify_jwt: false`, full file content). Confirm `verify_jwt` is still false afterwards.
2. From SQL (`extensions.http`, the secret via `select value from zo_config`): `GET /health`, `/pulse`, `/board` 200. As a fresh guest key: `GET /observe` shows `acts.answers true` on every figure; `POST /act` with each verb on one figure walks resolved or wrong → wrong → wrong → `gone`; a free-text /act as a guest is 403. Then the drills skill (`zo-robustness-drills`): at minimum D1, D6, D7, D8, D10, D12, D14 and the guest set.
3. Site changes: edit `docs/`, bump the cache name in `sw.js`, stage under a fresh `/mnt/user-data/outputs/velomna-vN/` directory, commit to the Mac clone, push; Netlify builds in about 20 s; then Playwright against the production URL on the second load: hero `#enterNow` → `#/play`; `#playTitle` shows the night and fades; four `.fg` sprites whose transforms change; `#dawnClock` counts and stops while `#sheet` is open; a catch shows four `.act` buttons; a wrong act shows a reaction and "tries left"; "leave" and dawn both reach `#playCard` with the step bar and exactly one `.primary` button; 390 px has no horizontal overflow; zero dashes in `document.body.innerText`; no page errors. A full dawn run takes 150 s; run it once in the background.
4. Costs: a night about $0.006 plus about $0.004 for its acts; an agents tick about $0.004; a Big Dream about $0.008 plus one Cloudinary generation when armed.

## Open calibration (do not silently "fix")

- Figures drift slowly and hide briefly on purpose (easy to catch); the founder decides "harder".
- Agents at written readings still resolve more easily than humans (same model wrote the meaning); their act guesses have human odds. Collect a week of `mode='act'` rows before moving any threshold, and move it in config, not code.
- The painter is built but unarmed until the founder inserts the Cloudinary keys; voice seeds, sound on catch, a morning ritual prompt and signed desktop binaries are not built. Say so when asked.
