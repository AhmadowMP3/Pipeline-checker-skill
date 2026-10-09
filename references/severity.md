# Severity rubric & finding format

Assign severity by **user impact**, not by how the bug was found. When torn between two levels, pick the higher and justify it in `actual`.

## Levels

| Level | Rule | Typical signals |
|---|---|---|
| `critical` | A core flow can't be completed, money/data is wrong or lost, or there is a security hole | Signup/login/checkout fails; cart/order totals wrong; "Saved" but value gone after reload; probe `UNPROTECTED` or `ROLE_BYPASS` on an endpoint returning or changing user/admin data; customer can open admin pages; secret in JS bundle; CORS `reflects-origin-with-credentials` |
| `high` | A main feature or connection is broken but the core flow survives | Form submit → 5xx; cart quantity update fails; integration SDK errors; `STALE_ACCEPTED` after logout; protected page reachable after logout; `UNPROTECTED_LIKELY` / `ROLE_BYPASS_LIKELY` (until confirmed); admin change not reflected on the storefront |
| `medium` | Works but wrong, misleading or degraded | Broken internal link (status ≥ 400 with `linkedFrom`); uncaught `pageErrors` that don't break a flow; missing loading/empty/error states; misleading copy; load > 3000 ms; CLS > 0.25; mobile layout broken; external link 4xx |
| `low` | Polish and hygiene | Console warnings; axe violations on non-core pages; missing alt/labels; missing security headers; `x-powered-by`; missing robots/sitemap |

Adjustments:
- axe `critical` on a page used by a core journey → `medium`; elsewhere `low`.
- Missing env var (`preflight.env.missing`): `high` if a core journey fails because of it, else `low` + `suspected`.
- `challenge: true` pages are **not** findings — they mean the sweep was blocked (note it in `meta.notes`).
- Bugs only an admin can trigger by entering bad data (e.g. admin edit accepts a negative price that then flows into customer totals): one level below the customer-facing equivalent — `high` instead of `critical`.
- CLS / timing: report only if the value repeats (two sweeps or a re-check); single outliers are noise.
- Intended errors (401 on wrong password, 409 "out of stock", 400 validation with a clear message) are **not** findings.

## Confidence

- `confirmed` — reproduced twice (Phase 6 re-check) or deterministic script evidence (probe status, 404 link).
- `flaky` — seen once, not reproduced. Keep it; never critical.
- `suspected` — inferred from code or indirect evidence. Say what would confirm it.

## Dedupe

- Same error signature on many pages → one finding, `occurrences` = count, up to 5 pages listed in `actual`.
- Same failing endpoint from several journeys → one finding.
- Broken link in shared nav/footer → one finding naming the layout/nav component.

## Finding format (`findings[]`)

```json
{
  "id": "PC-003",
  "severity": "critical",
  "title": "Customers can read every order via the admin orders API",
  "category": "security",
  "role": "customer",
  "where": { "page": "-", "request": "GET /api/admin/orders" },
  "repro": ["Log in as a normal customer", "Open /api/admin/orders in the same browser"],
  "expected": "403 Forbidden",
  "actual": "200 with all customers' orders, emails and totals",
  "evidence": { "screenshots": [], "console": [], "network": ["GET /api/admin/orders → 200 [{\"id\":1,\"email\":\"<redacted>\"…}]"] },
  "suspect": { "file": "app.mjs", "line": 210, "reason": "route uses requireAuth but no admin role check" },
  "confidence": "confirmed",
  "occurrences": 1
}
```
Rules: `id` = `PC-` + 3 digits in severity order; `title` = symptom in user terms (≤ 70 chars); `role` = the role the bug was observed as; `repro` from a fresh browser, naming the role/account; evidence never contains cookies, tokens, passwords, personal data or env values (`<redacted>`); `suspect` required for critical/high when source is available — omit `line` rather than guess.

## Top-level `findings.json`

```json
{
  "meta": {
    "base": "http://localhost:4000", "runId": "2026-10-09_2215", "target": "local", "scope": "full", "browser": "builtin",
    "startedAt": "…", "finishedAt": "…",
    "profile": { "summary": "Small online shop with an admin panel", "types": ["ecommerce"], "roles": ["guest", "customer", "admin"] },
    "phases": { "recon": "done", "preflight": "done", "sweep": "done", "journeys": "partial", "connections": "done", "triage": "done" },
    "notes": ["J6 Checkout blocked by CAPTCHA"]
  },
  "coverage": { "pagesSwept": 42, "journeys": [{ "id": "J1", "name": "Add to cart", "role": "customer", "status": "passed" }] },
  "findings": [],
  "leftovers": []
}
```
Phase status: `done | partial | skipped | failed` — `partial` means some planned checks didn't run (blocked journeys, challenged sweep, failed script); a journey step done through the API instead of the UI is still `done`, with a note. Journey status: `passed | failed | blocked | skipped` — a journey that completes but surfaces any finding of medium or worse is `failed` (note the finding ids).

Field conventions:
- `coverage.pagesSwept` = unique URLs crawled across all sweeps (not page × viewport × role records).
- `leftovers` = plain strings, one per item: `"<type> <id/title> — <why it couldn't be removed>"`.
- `occurrences` = number of distinct pages/requests where the same root cause showed up.
