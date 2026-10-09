# E-commerce playbook

## Signals
Models: Product, Variant/SKU, Category, Cart/CartItem, Wishlist, Order/OrderItem, Coupon/Discount, Address, Review. Routes: /shop, /products, /product/[slug], /cart, /wishlist, /checkout, /orders, /account. Integrations: Stripe/PayPal/Shopify/Paddle checkout, shipping/tax APIs.

## Journeys
**Guest**
- Browse home → category → product; search with a real product name, a typo, and gibberish; filters and sorting change results correctly; pagination.
- Product page: images load, price/currency formatting, variant selection (size/color) changes price/stock/image, out-of-stock state.
- Add to cart as guest → does the cart persist through login? (merge or loss — losing the cart is `high`).
- Wishlist as guest → asks to log in (or local wishlist) — no crash.

**Customer**
- Cart: add → appears with right price; add the **same product again** → quantity 2 (not two lines unless intended); change quantity via the control; set 0 / negative / huge / more than stock; remove; empty-cart state.
- **Totals math**: line total = price × qty; subtotal = Σ line totals; discounts, shipping, tax applied once; recompute after every change; displayed totals == totals in API response. Any mismatch = **critical**.
- Coupon: valid code applies once; invalid/expired → clear message; can't stack the same code twice; removing coupon restores total.
- Wishlist: add, remove, move to cart, persists after reload and after logout/login; adding twice doesn't duplicate.
- Checkout (local, provider test mode): address validation, shipping options, success card → order confirmation → order appears in order history with correct items/totals → cart emptied → stock decremented. Decline card → clear error, no order, cart intact.
- Order history and order detail; reorder if offered.
- Account: addresses CRUD, profile update persists.

**Admin** → `admin.md`, plus: product CRUD with variants and images, stock edits, order list/detail/status change, coupons CRUD; **price change reflects on storefront and in carts**.

## Domain bug checklist
| Bug | Severity |
|---|---|
| Totals wrong (qty ignored, discount applied twice, tax on wrong base, rounding off by cents) | critical |
| Order placed but not in history / wrong items or totals | critical |
| Can buy out-of-stock or more than stock; stock goes negative | high |
| Cart lost on login/refresh | high |
| Quantity update fails / allows 0 or negative | high |
| Coupon reusable/stackable when it shouldn't be | high |
| Wishlist duplicates or lost after logout/login | medium |
| Price shown differs between listing, product page and cart | high |
| Variant selection doesn't change price/stock | medium |
| Search returns nothing for exact product names | medium |
| Currency formatting inconsistent | low |

## Data & safety notes
Payments only in provider test mode on local. Deployed: cart/wishlist actions only (no orders) unless the user explicitly approves a test order and the store is in test mode. Remove everything from cart/wishlist at cleanup.
