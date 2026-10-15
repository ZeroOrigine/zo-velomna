---
name: zo-robustness-drills
description: Prove a ZeroOrigine product, Edge Function, database guard, cron job or brake actually holds by drilling it live against production with rollback, recording ok / fail / unknown for each drill. Use this whenever Jagdish asks for "robust", "unshakable", "bulletproof", "verify before done", "test it live", "drill", "prove the guard", "make sure nothing can break it", or before declaring any adoption, migration, trigger, RLS policy, budget cap, pause flag or cron job finished. Also use it after any deploy that touches auth, money, append-only ledgers or secrets, even when nobody asked for tests.
---

# Robustness drills

A fixture proves the shape you thought of. A drill finds the shape you did not. Every serious defect in this ecosystem was found by running the thing in production after its tests were green: the checkout that was dead on every product, the beacon behind a login, the watcher that would have re-paid for a corpse, the auditor fetching a route that never existed. So a thing is robust when its drills pass, not when its code reads well.

## The three verdicts

Every drill ends in exactly one of:
- `ok`: the guard refused (or allowed) what it should, and the evidence is recorded (the error text, the status code, the row count).
- `fail`: the guard let something through, or allowed what it must refuse.
- `unknown`: the drill could not run. **Unknown is never ok.** An empty table, a missing fixture row, a 404 on the endpoint, a timeout: these are "I could not look", and "I could not look" must never be recorded as "I looked and it was fine" (Rule 14). Report it as a blocker to finishing.

A drill that passes vacuously is the most dangerous outcome because it looks like success. VELOMNA's D6 ("update velomna_resolutions ALLOWED") was a false alarm the other way: the table was empty, so a row-level trigger had nothing to refuse and the UPDATE "succeeded" on zero rows. Both directions of vacuity come from the same cause: the drill did not touch a real row.

## Method

1. **Drill against production, inside a transaction that rolls back.** For database guards, `begin; <attempt>; rollback;` or raise inside a `do $$ ... exception when others then raise notice ... $$` block that reports the error it caught. Nothing persists; the guard's refusal is the evidence.
2. **A row-level trigger needs a row.** Insert a drill row first (inside the same transaction), then attempt the UPDATE/DELETE against it, then roll back. Assert that the attempt raised, not that it affected 0 rows.
3. **Check the body, never the status alone.** An error can arrive as HTTP 200 with an error body; a 503 can be the correct, healthy answer (a paused engine). Record what the response said.
4. **Drill both directions.** A refusal drill (wrong key gets 401) and an allow drill (right key gets 200) on the same door, or you have proven only that the door is locked, not that it opens.
5. **One drill, one claim.** "Append-only ledger" is four drills: UPDATE refused, DELETE refused, INSERT allowed, the trigger exists on every ledger table (count them; name them).
6. **Tear down what you created.** Drill users, drill dreamers, drill seeds: delete them, then query for residue and report `residue: 0`. Where a drill identity must persist (a daily drill), make it unreachable from outside: a flag column plus a constraint that locks the drill prefix to the flag in both directions.
7. **Never drill with a secret in the transcript.** Read secrets in SQL (`(select value from zo_config where key=...)`) or call the endpoint from Postgres with `net.http_post`. A drill that pastes a key into the session has created the leak it was testing for.
8. **A sensor aimed at nothing must not sound like a sensor that saw nothing wrong.** When a drill reads "could not reach", "no rows", "blind", treat it as a finding about the drill, not a green.
9. **Verify surfaces in a real browser.** For anything rendered client-side, grep of fetched HTML is not a drill (#4528). Take a screenshot or measure the DOM.
10. **Fixed-size source windows drift.** A drill that asserts "the next 40 lines contain X" silently checks the wrong code once a line is added above. Slice by the enclosing function or block.

## The standard catalogue

Run every row that applies. Name each drill in the report with its verdict and evidence.

| # | Drill | Attempt | Expected |
|---|-------|---------|----------|
| D1 | Health | GET `/health` | 200, body carries the brake fields (`paused`, `spent_24h_usd`, `daily_cap_usd`) |
| D2 | Anonymous read | `select` on each product table as `anon` (set role, or REST with the anon key) | permission denied / empty under RLS with zero policies |
| D3 | Append-only UPDATE | insert a drill row, `update` it, rollback | raises from `<slug>_refuse_mutation` |
| D4 | Append-only DELETE | same row, `delete` | raises |
| D5 | Trigger inventory | count triggers named `*_refuse_mutation*` on ledger tables | equals the number of ledger tables; list them |
| D6 | Cron secret | call the cron route with no header, a wrong header, the right header (from SQL) | 401, 401, 200 |
| D7 | Agent key | wrong `x-<slug>-agent-key`, revoked key, valid key | 401, 401, 200 with identical body shape to a human's |
| D8 | Pause brake | set `<SLUG>_PAUSE=true`, wait 60 s (config cache), call a paid verb and the cron route, then restore | 503 on the verb, `{skipped: paused}` on cron, `/health.paused=true`; after restore all 200 |
| D9 | Budget brake | set `<SLUG>_DAILY_BUDGET_USD` below spend, call a paid verb, restore | the model call is refused before it is made; `zo_cost_logs` gains no row |
| D10 | Budget unreadable | revoke or rename the ledger view inside a transaction, call `budgetLeft`, rollback | `ok:false` (fail closed), not `ok:true` |
| D11 | Self-targeting | the action that must not target oneself (awake on own action, merge with self) | refused with the stated reason |
| D12 | Rate limits | the N+1th action/seed/reading | 429 with the limit named |
| D13 | Idle gate | cron with no human activity, then with `?force=1` | `{skipped: idle}`, then real work |
| D14 | Output law | scan model outputs stored today for U+2014 / U+2013 | zero hits |
| D15 | Beacon | anonymous insert into `zo_product_metrics` with the slug; then with `is_probe:true` | 201; the probe flag cannot be set by anon |
| D16 | Secret residue | grep the repo, the site bundle and the transcript for `vlm_`, `sk-`, `ghp_`, `eyJ` | zero hits |
| D17 | Route truth | every URL a job or sensor fetches exists (curl each for non-404) | all real; a 404 is a BROKEN sensor, not a quiet one (#4605) |
| D18 | Cert and host | `https://<slug>.zeroorigine.com` loads with a valid cert, HSTS/https enforced | 200 over TLS; no mixed content |
| D19 | Residue | query for every drill identity created | 0 rows |

## Report format

```
DRILLS <product> <date>
D1 health            ok   200 {paused:false, spent_24h_usd:0.006, daily_cap_usd:5}
D3 append UPDATE     ok   raised: velomna_refuse_mutation (row inserted then rolled back)
D6 cron secret       ok   401 / 401 / 200
D9 budget brake      ok   "budget: $0.01 of $0 spent in 24h; refusing"; cost_logs unchanged (n=25 before, 25 after)
D10 budget unreadable unknown  could not revoke inside tx (insufficient privilege); NOT proven
D19 residue          ok   0 rows
Verdict: 17 ok, 0 fail, 2 unknown. Not finished until the unknowns are run.
```

A report with any `fail` or `unknown` ends with what blocks it, not with "done". Record the report in the repo under `notes/` and in COORDINATION.md; a drill nobody can find later did not happen.

## When a drill finds a false positive

Delete the finding, do not resolve it (it was never true), and write the reason the drill misfired next to the drill so the next run does not reproduce the misfire. VELOMNA D6 is the model: "empty table, row-level trigger; drill now inserts a row first."
