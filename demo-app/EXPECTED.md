# Expected pipeline-check results — ShopNest (BUGS=1)

Expected profile: **ecommerce** (high) — Product/cart/wishlist/orders; roles guest, customer, admin; admin panel at /admin.
Seed credentials (recon should find them in app.mjs and propose them for config.roles): admin@shopnest.test, customer@shopnest.test.

| # | Bug | Severity | Category | Role | Suspect | Should be found by |
|---|---|---|---|---|---|---|
| 1 | Changing cart quantity fails: PUT /api/cart/:id → 500 "Cannot create property 'qty' on number" | high | connection | customer | app.mjs — PUT /api/cart/:productId | Journey (cart) |
| 2 | GET /api/admin/users returns all users' emails with no login | critical | security | guest | app.mjs — /api/admin/users | probe anon `UNPROTECTED` |
| 3 | Settings shows "Saved!" but name reverts after reload | critical | functional | customer | app.mjs — POST /api/profile | Journey persistence check |
| 4 | "Help" nav link → /hlp → 404 on every page | medium | content | guest | views.mjs — layout nav | Sweep (404 + linkedFrom), 1 finding |
| 5 | /about throws TypeError (window.analytics undefined) | medium/low | functional | guest | views.mjs — about() | Sweep pageErrors |
| 6 | Product images without alt; search input without label | low (medium: core journey page) | accessibility | guest | views.mjs — productCard/products | Sweep axe |
| 7 | Logout doesn't invalidate the session | high | security | customer | app.mjs — POST /api/logout | probe `--stale-check` |
| 8 | Customer can read every order (emails, totals) via GET /api/admin/orders | critical | security | customer | app.mjs — /api/admin/orders (requireAuth only) | probe customer `ROLE_BYPASS` |
| 9 | Cart subtotal ignores quantity (2 × $25 shows $25; order charged $25) | critical (high acceptable) | functional | customer | app.mjs — cartView subtotal | Journey totals math |

Unplanned real bugs present in BOTH variants (valid findings, not false positives):
- Admin product edit (PUT /api/admin/products/:id) accepts negative / non-numeric price and stock — high
- Signup treats emails case-sensitively (duplicate accounts) — medium
- Malformed JSON body → 500 with raw parser message — medium/low

Acceptable extra findings (true, low): missing security headers, `X-Powered-By: Express`, no robots.txt/sitemap.

Must NOT be reported as bugs: out-of-stock 409 on Ceramic Mug, wrong-password 401, admin page 403 for customers, wishlist (works), admin product create/edit/delete (works; price edit reflects in shop).

Pass criteria:
- Profile = ecommerce with an admin panel; admin + customer roles requested/used.
- All 9 found, severity within ±1 where noted, suspect file correct.
- Zero false positives at critical/high.
- BUGS=0: none of the 9 planted bugs reported; only the unplanned real bugs above (no false positives).
