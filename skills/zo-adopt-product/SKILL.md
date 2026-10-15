---
name: zo-adopt-product
description: Adopt a founder-built product (a game, tool, or site built outside the pipeline) into the ZeroOrigine ecosystem so it is registered, hosted, brake-protected and measurable like a pipeline birth. Use this whenever Jagdish says "deploy on our ecosystem", "adopt this", "add it as a product", "register it in zo_products", "put it on zeroorigine", or asks to host anything under a *.zeroorigine.com subdomain, even if he does not say the word adopt. Also use it when a product needs a schema on zo-platform, an Edge Function, a pg_cron job, a GitHub repo in the ZeroOrigine org, or a Netlify/GitHub Pages site.
---

# Adopt a product into ZeroOrigine

An adoption is a birth without the pipeline. The ecosystem's gates (served, brakes, beacons, books) only see what is registered the ecosystem's way, so a product that merely "works" is invisible and ungoverned. The job is to make it a citizen: same registry rows, same cost ledger, same secrets discipline, same proof standard as a pipeline birth. VELOMNA (2026-10-15) is the reference adoption; every trap below was hit there.

## Non-negotiables (why they exist)

1. **No credential ever enters the session.** Tokens live in `zo_config`. Anything that needs a token (GitHub API, Cloudflare, Supabase management, Netlify) is called **from inside Postgres** with `extensions.http()` or `net.http_post()` reading the token in SQL: `(select value from public.zo_config where key='GITHUB_TOKEN')`. The session sees the response, never the key. Never `select value from zo_config` for a secret into the transcript. Rule 342: do not probe for Supabase credentials; the connector's state is the answer.
2. **Fail closed.** Any brake, gate or budget that cannot be read refuses, it does not allow. An unreadable cost ledger means no permission to spend.
3. **Verify in a real browser, not with grep.** Client-rendered pages pass `curl | grep` while the layout is mangled (#4528) and fail it while the page is fine. DOM measurement or a screenshot is the acceptance.
4. **No celebration without a URL** that loads over HTTPS with a valid cert.
5. **Product copy carries no em dash.** Strip U+2014 and U+2013 from everything a model writes (`.replace(/\s*[\u2014\u2013]\s*/g, ", ")`).
6. **One product at a time.** Finish the adoption end to end before touching another.

## The sequence

Do these in order. Each step names the trap that makes the order matter.

### 1. Name and slug
- Slug: lowercase letters only, no hyphen. Beacons, cost logs, cron secrets, table prefixes and the `*.zeroorigine.com` host all key on it, and a hyphenated slug broke `registry_drift` once (`renewalradar-ce` vs `renewalradarce`).
- Check collisions: `select slug,name from zo_products where slug ilike '%<x>%' or name ilike '%<x>%'`, a web search for the name, and the `.com`.

### 2. Data layer on zo-platform (project `opgitcuqwicuiplaptkm`)
Apply one migration named `<slug>_alpha_schema` via `mcp__Supabase__apply_migration`:
- Tables prefixed `<slug>_`. `enable row level security` on every table, **zero policies** (the Edge Function uses the service role; nothing else should read).
- Ledger-shaped tables (actions, readings, balances, resolutions) get an **append-only trigger**: a `<slug>_refuse_mutation()` function that raises on UPDATE and DELETE, `for each row`. Lucidity, credits, anything with money or score: append and derive, never update.
- Secrets are generated **in the database**: `insert into zo_config(key,value) values ('<SLUG>_CRON_SECRET', encode(gen_random_bytes(24),'hex'))`. Never generate a secret in the session.
- Brakes as config rows: `<SLUG>_PAUSE='false'`, `<SLUG>_DAILY_BUDGET_USD='5'`.
- Apply a **second** migration `<slug>_brakes_and_privileges` with `revoke all on <each table/view> from anon, authenticated`. Keep it separate: the migration tool cancels any statement set that contains `drop trigger` / `revoke` alongside creates ("destructive" classifier), so destructive statements go alone.
- A view that must respect RLS of the caller is `security_invoker = true`.

### 3. The one door: an Edge Function
Deploy `<slug>-api` with `mcp__Supabase__deploy_edge_function`, `verify_jwt: false` (the function does its own auth: Supabase JWT for humans, `x-<slug>-agent-key` for agents). Every adoption's function has these parts:
- `cfg(key)` reading `zo_config` with a 60 s cache (a pause lands within a minute).
- `paused()` and `budgetLeft()` reading the brakes; `budgetLeft` sums `zo_cost_logs.cost_usd` for `product_slug=<slug>` over 24 h and returns `ok:false` on a read error.
- `claude()` that checks both brakes **before** calling the model, reads `ANTHROPIC_API_KEY` and `product_runtime_model` from `zo_config`, and writes every call to `zo_cost_logs` with `product_slug`, tokens and `cost_usd`.
- Public routes (`/health` showing `paused`, `spent_24h_usd`, `daily_cap_usd`; `/pulse`), authenticated routes, and cron routes guarded by header `x-<slug>-cron` compared to `<SLUG>_CRON_SECRET`.
- Paid verbs return 503 while paused; cheap writes (a seed, a save) still work, so a pause never loses a person's input.
- **Check `verify_jwt` after every redeploy.** The deploy tool has silently flipped it to true before; a product that authenticates itself then 401s everything.

### 4. Schedules: pg_cron + pg_net, secret read in SQL
```sql
select cron.schedule('<slug>_night', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://opgitcuqwicuiplaptkm.supabase.co/functions/v1/<slug>-api/night/run',
    headers := jsonb_build_object('content-type','application/json',
      'x-<slug>-cron', (select value from public.zo_config where key='<SLUG>_CRON_SECRET')),
    body := '{}'::jsonb)
$$);
```
The endpoint decides whether work is due (age of the current cycle, idle detection). A frequent cron that mostly returns `{skipped: ...}` is cheaper than a clever schedule and makes every skip reason visible. Add `?force=1` handling for drills.

### 5. Repo in the ZeroOrigine org
- Create via `extensions.http()` from Postgres with `GITHUB_TOKEN` from `zo_config` (POST `https://api.github.com/orgs/ZeroOrigine/repos`).
- If the Claude GitHub App is not installed on the org, the session cannot push. Do **not** build a relay that persists a token (the classifier refuses it, correctly). Push from the founder's Mac over the device bridge: `git` there uses the osxkeychain credential. Ask once, then run it.
- `.github/` is protected from remote writes. Place workflows in `ci/` and `git mv` them on the Mac only on the founder's explicit order.
- Git lock files in a connected folder need delete permission (`device_request_delete_permission`) or `git commit` leaves `.lock` files that break the next command.
- GitHub may commit a `CNAME` itself when Pages is configured: `git pull --rebase` before pushing.

### 6. Hosting
Netlify is the fleet standard (team `ispeedbiz`; the registry, `registry_drift` and the security sweep all key on `netlify_site_id`). Link the site to the repo so a push is a deploy, all from Postgres with `NETLIFY_API_TOKEN`:
- Create the site, then PATCH `/sites/{id}` with `{"repo":{"provider":"github","repo":"ZeroOrigine/<repo>","repo_url":"https://github.com/ZeroOrigine/<repo>","private":false,"branch":"main","cmd":"","dir":"<publish dir>","installation_id":119043933}}` (119043933 is Netlify's GitHub App installation on the org; every fleet site uses it). The link itself triggers a build; POST `/sites/{id}/builds` forces one.
- Custom domain: PATCH `{"custom_domain":"<slug>.zeroorigine.com"}` **before** flipping DNS, then Cloudflare CNAME `<slug>` → `<site>.netlify.app`, proxied **off** (Netlify's Let's Encrypt needs to see the host). Cloudflare record comments max 100 characters.
- Certificate: wait for DNS to propagate (about a minute at TTL 300) **before** asking for the cert. A POST `/sites/{id}/ssl` fired early returns `null` and the dashboard then shows "could not provision"; the cure is the dashboard's "Verify DNS configuration" then "Provision certificate" (or POST `/ssl` again once `http://<host>` answers from Netlify). GET `/ssl` must read `state: issued` before the host is called live.
- HTTPS during the window between CNAME flip and cert issue fails with a SAN mismatch. Keep the window short: domain set, DNS flipped, cert requested, verified, in one sitting.
- If Netlify refuses with `Skipped due to account credit usage exceeded`, do not wait for the cycle: host from the repo on **GitHub Pages** (`main:/docs`) and point Cloudflare at `zeroorigine.github.io`; keep the Netlify site and move back when credits exist (VELOMNA did exactly this, both directions, on one day). Pages specifics: POST `/repos/ZeroOrigine/<repo>/pages` `{source:{branch:'main',path:'/docs'}}`; PUT `{cname}` **alone** (204), then `https_enforced:true` in a later PUT once the cert state is `approved`; `docs/.nojekyll`.
- Either way: a service worker shell needs its cache name bumped on every shell change, and the first reload after a deploy can still serve the old shell. Verify on the second load.

### 7. Shared auth and beacon
- Add `https://<slug>.zeroorigine.com/**` to the shared Supabase auth redirect allowlist **additively** (read the current list, append, PATCH via the management API from Postgres). Overwriting the list logs every other product out of magic links.
- Client uses supabase-js with `flowType:'pkce'` (the auth flow law).
- Add the product to the branded `send-email` hook allowlist so the magic link says the product's name.
- Mount a beacon: insert into `zo_product_metrics` `{product_slug, event:'page_view', path, is_probe:false, source:'browser'}`. It returns 401 `beacon_slug_exists` until the `zo_products` row exists (step 8), so run the beacon check after registration, not before.
- Activation beacon from the **server** when the core action completes the first time for a user.

### 8. Registry (the trap-laden step)
The ecosystem refuses a `zo_projects` row created directly at `launched` (birth-start gate) and refuses an update whose metadata already claims adoption. Order:
1. `insert into zo_config(key,value) values ('zo_adoption_grant','<slug>')`.
2. Insert the `zo_projects` row at a pre-launch status with `origin='founder-built'` and metadata **without** `adopted_at`/`adopted_by` (the guard reads those as "already adopted" and refuses).
3. Update the row to `launched`; the guard consumes the grant and stamps adoption itself.
4. Insert `zo_products` (`slug`, `name`, `status='live'`, `origin='founder-built'`, `category`, `url`, `github_repo`, `netlify_site_id`).
5. Insert `zo_product_core_action` (`product_slug`, the table and column that proves one person completed the core action, `measurable=true`). Without it the served gate (REC #324) can never count this product.
6. Verify the grant is gone: `select count(*) from zo_config where key='zo_adoption_grant'` must be 0. If the MCP refuses the delete, run it in the Supabase SQL editor in the founder's Chrome.

### 9. Proof, then paper
- `/health` 200 with brake fields; beacon insert 201; HTTPS loads with a valid cert; the core action walked once through the real UI by the founder (a non-synthetic person: the served gate excludes unverified accounts).
- Run the robustness drills (`zo-robustness-drills` skill) before calling it done.
- Write `notes/ADOPTION-<date>.md` in the repo (what was done, founder actions left), prepend the COORDINATION.md entry, and a one-line CLAUDE.md note. The next session starts blind without these.

## What to hand back to the founder
A short list of only the things the machine cannot do: pay (Netlify credits, a domain), sign in (GitHub App install, a magic link click), sign binaries, and the first human play. Everything else is yours.
