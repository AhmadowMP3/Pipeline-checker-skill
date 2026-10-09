# Landing page / portfolio / marketing site playbook

## Signals
Few routes, no auth or models; sections like hero, features, pricing, testimonials, contact; form handlers (Formspree, Netlify forms, `/api/contact`), analytics, Calendly embeds.

## Journeys
**Guest**
- Every CTA and nav link (including in-page anchors) goes where its label promises.
- Contact/lead/newsletter forms: empty submit → validation; valid submit (`qa+pc-<runId>@example.com`) → success message AND the request succeeded (network 2xx) — a success message on a failed request is **high**.
- Pricing: amounts consistent between cards, toggles (monthly/yearly) recompute, CTAs carry the chosen plan.
- Mobile 390×844: hero readable, menu works, no horizontal scroll, tap targets usable.
- Speed: load < 3 s, CLS < 0.1 preferred; heavy images flagged.
- Legal: privacy/terms links work; cookie banner works and declining actually blocks non-essential trackers (check network).
- SEO/social: title, description, OG image, favicon.

## Domain bug checklist
| Bug | Severity |
|---|---|
| Lead form shows success but request failed | high |
| CTA links to wrong/404 destination | high |
| Pricing mismatch between toggle states/cards | medium |
| Horizontal scroll / broken layout on mobile | medium |
| Trackers fire after cookie consent declined | medium |
| Missing OG image/description | low |

## Data & safety notes
Deployed: one test lead submission only, after approval; tell the user so they can ignore it in their inbox/CRM.
