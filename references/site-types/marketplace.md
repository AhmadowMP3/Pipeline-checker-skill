# Marketplace playbook

## Signals
Models: Listing/Offer, Seller/Vendor/Store, Buyer, Review/Rating, Conversation/Message, Payout, Dispute. Routes: /sell, /listings/new, /seller/dashboard, /messages, /store/[slug]. Integrations: Stripe Connect, image uploads, geolocation.

## Journeys
**Guest** — search/browse listings, filters (price, location, category), listing detail, seller profile.
**Buyer** — save/favorite listing; contact seller (message thread appears on both sides); buy/offer flow (test mode, local); leave a review after purchase only.
**Seller** — create listing with images → appears in search → edit price → mark sold/unpublish → disappears from search; seller dashboard stats; payout settings page loads (no real bank details ever).
**Cross-role** — buyer can't edit seller's listing (UI + API); seller can't review own listing; messages private to participants.
**Admin** → `admin.md` (listing moderation, user bans, disputes).

## Domain bug checklist
| Bug | Severity |
|---|---|
| User can edit/delete another seller's listing | critical |
| Messages visible to non-participants | critical |
| Sold/unpublished listing still purchasable | high |
| Review possible without purchase / on own listing | medium |
| Search filters return wrong items | medium |
| Image upload fails silently | medium |

## Data & safety notes
Never enter real bank/payout details. Deployed: no messages to real sellers.
