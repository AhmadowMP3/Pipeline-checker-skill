# Phase 1 — Recon: understand the product, then map it

Two goals, in order:
1. **Understand what this product is and who uses it** — like a new QA hire on day one.
2. Build a truthful `app-map.json` — pages, API endpoints, auth, roles, integrations, env vars, journeys.

Read code; don't run anything yet. Prefer Grep/Glob over reading whole files.

## 1. Profile the product

Gather evidence from:
- **Domain models** (Prisma/Drizzle schema, ORM models, migrations, TS types): `Product`, `Variant`, `Cart`, `Wishlist`, `Order`, `Coupon` → ecommerce; `Workspace`, `Team`, `Subscription`, `Invite` → saas; `Listing`, `Seller`, `Offer` → marketplace; `Booking`, `Slot`, `Availability` → booking; `Post`, `Article`, `Category`, `Comment` → content; `Follow`, `Like`, `Message` → social; `Course`, `Lesson`, `Enrollment` → lms.
- **Routes and nav labels**: `/cart`, `/wishlist`, `/checkout`, `/shop` vs `/dashboard`, `/projects`, `/billing` vs `/book`, `/blog`.
- **Landing copy & README**: what does the product promise users?
- **Integrations**: Stripe Checkout + products → ecommerce; Stripe Billing/subscriptions → saas; calendar libs → booking.

Classify into one or more site types (`ecommerce | saas | marketplace | booking | content | social | lms | landing`) with confidence and evidence. A store with a blog is `["ecommerce", "content"]`. Nothing fits → describe it in your own words and derive journeys from its models and nav.

Then load `references/site-types/<type>.md` for each type found — they define the journeys and the domain bugs to hunt.

## 2. Roles and the admin panel

- Roles: look for `role`/`isAdmin`/`is_staff`/`permissions` fields, role enums, policy files, middleware like `requireAdmin`, `@staff_member_required`, `can:`, `authorize`. Typical: `guest`, `customer`/`user`, `admin`; sometimes `seller`, `instructor`, `editor`, `owner/member`.
- Admin panel: `/admin`, `/dashboard/admin`, `/backoffice`, `app/(admin)/**`, separate `admin/` app, Django admin, Filament/Nova (Laravel), ActiveAdmin (Rails). Record path, file, and **how it is guarded** (or that it isn't).
- Mark every route/endpoint with `auth` and, where only one role may use it, `role` (e.g. `"role": "admin"`). Endpoints that touch admin/other users' data with no visible role check are prime suspects for Phase 5.

**Ask for access.** If there are roles beyond guest, ask once, e.g.:
> "I found an **admin panel** at `/admin` (guarded in `middleware.ts`). To test it as an admin:
> - local: add admin test credentials to `.pipeline-check/config.json → roles.admin` (I found `admin@shop.test` in `prisma/seed.ts` — use that?),
> - deployed: sign in as admin in your Chrome when I get to the admin journeys.
> Same for a normal customer account (`roles.customer`) — or I can sign up a fresh test customer on local."

Seed files with test credentials (`seed.*`, `fixtures/*`, `db/seeds.rb`, factories) are a valid source on local — propose them; write them to config only after the user agrees.

Roles already in `config.json` may be stale (in-memory apps, reset databases): verify every role with `session.mjs` before use; on local, recreate a failing test account through signup and update the config.

For each `config.roles` entry, take the field and submit selectors from the login page's actual markup (prefer `#id` or `input[name=…]`), then confirm with `session.mjs` — `landedOn` should not be the login page and `cookies` should be ≥ 1.

## Code comments are hints, not findings

Comments like `// TODO: add auth`, `// BUG`, `// FIXME: total is wrong` tell you where to look. They are not evidence. Every finding still needs runtime proof (journey, sweep or probe output). A comment that claims a bug which doesn't reproduce is not a finding.

## 3. Stack, pages and API

| Signal | Stack | Pages | API |
|---|---|---|---|
| `next` + `app/` | Next.js App Router | `app/**/page.*` (folder = path; `(group)` ignored; `[id]` dynamic) | `app/**/route.*` exported `GET`/`POST`/… |
| `next` + `pages/` | Next.js Pages Router | `pages/**` except `_app`, `_document`, `api/` | `pages/api/**` (`req.method` branches) |
| `react-router`/`@tanstack/react-router` | React SPA | router config / `<Route path>` / `src/routes/**` | separate backend (`VITE_API_URL`, axios baseURL) |
| `vue-router`/`nuxt` | Vue / Nuxt | router `routes` / `pages/**/*.vue` | `server/api/**` |
| `@sveltejs/kit` | SvelteKit | `src/routes/**/+page.svelte` | `src/routes/**/+server.*` |
| `express`/`fastify`/`hono`/`koa` | Node server | handlers sending HTML | `app.get/post/put/patch/delete('/api/…')`, `router.*`, mounts via `app.use('/api', router)` |
| `manage.py` | Django | `urls.py` → views/templates | DRF ViewSets/APIViews, `router.register` |
| `artisan` | Laravel | `routes/web.php` | `routes/api.php` (`/api` prefix) |
| `Gemfile` + rails | Rails | `config/routes.rb` (`resources` = 7 routes) | `namespace :api` |

Monorepo (`apps/*`, `turbo.json`, `pnpm-workspace.yaml`) → map web and API apps separately.

## 4. Auth, integrations, env

- Auth library and the login/signup/**logout** routes and API. Record `auth.logout = {method, path}` — `probe.mjs --stale-check` needs it.
- Where the session lives: cookie (scripts can use it) vs. localStorage token (probe role checks must then run in the browser via `javascript_tool` `fetch`).
- Integrations: `stripe`, `@supabase/*`, `firebase`, `resend`/`nodemailer`/`@sendgrid`, `twilio`, AI SDKs, `@aws-sdk/*`, `cloudinary`/`uploadthing`, `pusher`/`socket.io`, maps, analytics; webhook handlers.
- Env var **names** referenced in code (`process.env.X`, `import.meta.env.X`, `os.environ`, `env('X')`) — list in `env.referenced` only the ones the app **needs**: skip vars with a fallback in code (`process.env.PORT ?? 4000`, `|| 'default'`, `getenv('X', 'default')`), since preflight reports every listed name missing from `.env*` files. Stripe mode from key prefix (`sk_test_`/`sk_live_`) — record the mode, never the key.

## 5. Samples for dynamic routes

For `/products/[id]` find a real id in seed files, or leave `sample` out and fill it after a journey creates or reveals a record.

## 6. Journeys

Combine: (a) the playbook journeys for each site type, (b) the admin playbook (`references/admin.md`) if an admin panel exists, (c) anything unique to this product. Each journey:
```json
{ "id": "J4", "name": "Add to cart, change quantity, check totals", "type": "ecommerce", "role": "customer", "steps": ["…"], "writes": true }
```
Order: guest journeys → customer journeys → admin journeys → cross-role checks.

## 7. Output and confirmation

Write `<runDir>/app-map.json` (shape in SKILL.md), then show the user:

```
This looks like: an online store (ecommerce, high — Product/Cart/Order models, /cart, Stripe Checkout) with a blog (content, medium).
Roles: guest · customer (signup or roles.customer) · admin (/admin, guarded by requireAdmin)
Stack: Next.js 15 + Prisma/Postgres + next-auth + Stripe (test mode)
Pages 18 · API endpoints 26 (19 auth, 7 admin-only) · Env vars 9 (missing: RESEND_API_KEY)

Journeys:
 J1  guest     Browse, search, filter, open product
 J2  guest     Add to cart as guest → asked to log in at checkout?
 J3  customer  Sign up / log in / log out
 J4  customer  Cart: add, change qty, remove, totals math         writes
 J5  customer  Wishlist: add, remove, move to cart, persists       writes
 J6  customer  Checkout (Stripe test) → order in history           writes
 J7  admin     Products: create, edit price/stock, delete           writes
 J8  admin     Orders list and status change                        writes
 J9  cross     Customer blocked from admin pages and APIs
Is my understanding right? Add, remove or reorder before I start?
```
Wait for the answer. Corrections to the profile change which playbooks you load.
