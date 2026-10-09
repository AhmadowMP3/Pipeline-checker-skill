# Admin panel playbook

Load when recon found an admin area. Test it like a new store manager / operator who must be able to run the business with it.

## Access

- Local: `config.roles.admin` (sweep with `--role admin`, browse signed in with those credentials).
- Deployed: the user signs in as admin in their browser; never ask for the password.
- Also confirm the admin login itself: wrong password → clear error; non-admin account → denied (not a blank or crashing page).

## Discover every admin feature

From the admin nav and code (admin routes, `role: "admin"` endpoints), list each **resource** (products, orders, users, posts, bookings, coupons, settings…) and its **actions** (list, search/filter, create, edit, delete, bulk actions, status changes, exports, uploads). Each resource × action is a check.

## Checks per resource

1. **List** — loads, paginates, search/filter works, empty state, sorting.
2. **Create** — required-field validation, success, appears in list, **appears on the public side** if it's public (product in shop, post on blog).
3. **Edit** — change a visible field (price, title, stock, status) → saved after reload → **reflected on the public/customer side** (open the storefront page in the same session or as guest).
4. **Delete** — confirmation, gone from list, gone from public side (and not left in carts/wishlists in a broken state — open them to check).
5. **Status changes** (order → shipped, post → published, user → banned) → visible to the affected user.
6. **Uploads** (images/files) — valid image works and displays; wrong type/oversized file rejected with a message.
7. **Exports** — file downloads and isn't empty.

## Cross-role effects (the most valuable checks)

- Admin changes price → storefront shows new price → cart total uses the new price.
- Admin sets stock 0 → product shows "out of stock", add-to-cart blocked.
- Admin unpublishes/deletes → guest gets a friendly 404, not a crash.
- Admin bans/disables a user → that user can't log in / is logged out.

## Access control (pair with connections.md §2–4)

- Every admin page as guest and as customer → denied.
- Every admin API as customer → `ROLE_ENFORCED`.
- Admin-only fields not exposed in public APIs (e.g. product cost price, user emails in public endpoints).

## Deployed safety (strict)

- Only touch records the run created (`[PC-<runId>]` titles), created as drafts/hidden where the admin allows it.
- Never edit or delete real products, orders, users, posts or settings. Never change payment, shipping, tax, email or store-wide settings. Never trigger bulk emails/exports of customer data.
- Status-change checks only on run-created records (e.g. a test order you placed on local — on deployed, skip).
- Everything goes through the write gate in one approval message.
