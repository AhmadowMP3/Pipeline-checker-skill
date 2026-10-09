# Phase 5 — Connections

The UI can look fine while the wiring underneath is wrong. This phase checks the wiring directly, per role.

## 1. Anonymous API probe

```bash
node "$SKILL_DIR/scripts/probe.mjs" --base <base> --app-map <runDir>/app-map.json --out <runDir> [--allow-writes]
```
`--allow-writes`: local always; deployed only per `safety.md`.

## 2. Role probes (local, cookie sessions)

For each role in `config.roles`:
```bash
node "$SKILL_DIR/scripts/session.mjs" --base <base> --config .pipeline-check/config.json --role customer --out <runDir>
node "$SKILL_DIR/scripts/probe.mjs" --base <base> --app-map <runDir>/app-map.json --out <runDir> --cookie-file <runDir>/.sessions/customer.cookie --as-role customer --allow-writes
```
With a session cookie, `probe.mjs` only ever sends write methods (POST/PUT/PATCH/DELETE) to **other roles'** endpoints (to prove a role bypass). It never calls the session role's own write endpoints, so it won't mutate that user's data — those are covered by Phase 4 journeys, which is where a failing own-role write (e.g. cart update → 500) must be caught. `SKIPPED_WRITE` counts differ between runs with and without `--allow-writes`; that's expected.

`--allow-writes` with the highest role (usually admin) is a no-op: it has no foreign-role endpoints. Admin write validation (bad prices, negative stock, malformed JSON bodies) is tested in the admin journeys.

Run the **stale-session check last** for one non-admin role (it logs that session out):
```bash
node "$SKILL_DIR/scripts/probe.mjs" --base <base> --app-map <runDir>/app-map.json --out <runDir> --cookie-file <runDir>/.sessions/customer.cookie --as-role customer --stale-check --label customer-stale
```
`session.mjs` exit 1 (no cookies) → the app keeps tokens in localStorage: do the role checks in the browser instead — logged in as the lower role, call admin endpoints with `javascript_tool` (`await fetch('/api/admin/…').then(r => r.status)`).

**Deployed:** scripts can't hold sessions. In the browser, signed in (by the user) as the lower role: open admin page URLs directly and `fetch` admin API endpoints with `javascript_tool` (GET only, unless approved). Logout check: note a protected API URL, log out via the UI, re-request it.

## 3. Interpreting results

| Result | Meaning | Default severity |
|---|---|---|
| `UNPROTECTED` (anon) on endpoint returning/changing user or admin data | Missing auth | critical |
| `UNPROTECTED` on a harmless endpoint marked auth | app-map may be wrong — re-read the code | verify first |
| `UNPROTECTED_LIKELY` / `ROLE_BYPASS_LIKELY` | Validation ran before auth/role check — reached the handler | high; confirm with a valid body on local → critical if it succeeds |
| `ROLE_BYPASS` | Lower role reached a higher-role endpoint | critical |
| `AUTH_REJECTED` on own-role endpoint | Session not accepted — check `session.mjs landedOn`, or the endpoint's role mapping | verify first |
| `SERVER_ERROR` | Crash instead of 401/403/clean error | medium (high if a journey hits it) |
| `REDIRECT_REVIEW` | Protected endpoint redirected somewhere that isn't a login page (`/`, `/dashboard`) — usually a denial, sometimes a bypass. Check `location` and follow it in the browser | verify first |
| `SKIPPED_RISKY` | Path looks side-effecting (cron, seed, reset, send, webhook, purge, migrate, import, sync, logout…) — not called. Pass `--allow-risky` only on local and only if you understand what it triggers | — |
| `SKIPPED_NO_SAMPLE` | Deployed target and the endpoint needs a record id or creates data: set `sample` in app-map to a **run-created** record, or leave it to the journeys | — |
| `NOT_FOUND` for a mapped endpoint | Recon mistake or mis-mounted route — check code | verify first |
| CORS `reflects-origin-with-credentials` / `wildcard-with-credentials` | Any site can make authenticated calls | critical |
| CORS `reflects-any-origin` | Fine for public APIs; `low` if API is private | low |
| `STALE_ACCEPTED` | Logout doesn't invalidate the session server-side | high |
| `staleError` | Couldn't run the check — say why in notes. `logout rejected (403/419)` usually means CSRF protection: verify logout in the browser instead; never report `STALE_ACCEPTED` from such a run | — |

## 4. Page-level role matrix

Using the role sweeps (`sweep-<role>.json`) and browser checks:
- Guest → customer pages: must redirect to login (`finalUrl`) or 401/403.
- Customer → admin pages: must redirect/deny. A 200 page **showing admin content** = critical. (Check the screenshot or text — some apps return 200 with an "access denied" message, which is fine.)
- Customer A → customer B's records (if `customer2` exists, local): create as A, open/fetch as B. Success = critical (IDOR).

## 5. Persistence truth

For the main model of each site type, after a UI save `fetch` its API with `javascript_tool` and compare. Mismatch = critical.

## 6. Third-party integrations

- Client SDK loads without failed requests or console errors.
- Payments: test mode only; checkout session created without 4xx/5xx.
- Email/SMS: only to `qa+pc-…@example.com`; verify the app reports success and the server didn't 5xx. You can't verify inbox delivery — say so.
- Webhooks: POST `{}` to the webhook endpoint (local, or deployed with approval). 2xx for an unsigned payload = high.
- Realtime: the websocket/SSE request succeeds (101/200) and stays up ~10 s.

## 7. Secrets exposure

`sweep-*.json → secrets[]`: each hit is critical (`security`), evidence = script URL + 8-char preview; suspect = where the value enters client code (e.g. a `NEXT_PUBLIC_`/`VITE_` secret).

## 8. Cleanup

Delete `<runDir>/.sessions/` at the end (script sessions stay valid on apps whose logout is broken). Delete every created record (UI preferred, API otherwise), re-check each is gone, restore any value you changed (display name, admin price edits on pre-existing products — which you shouldn't have touched on deployed). Leftovers → `leftovers`.
