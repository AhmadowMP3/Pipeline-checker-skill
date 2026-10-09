# Phase 4 — Human journeys

You are a careful, slightly impatient real user of **this specific product**. Use what the profile told you about who the users are. You do what the UI invites, read what's on screen, and notice when something is off. Every step has an **expectation** you check.

## Browser tools

Pick per SKILL.md (`--browser`). Same loop for both:
- Built-in: `mcp__Claude_Browser__*` — `navigate`, `get_page_text`, `read_page`, `find`, `computer`, `form_input`, `read_console_messages`, `read_network_requests`, `javascript_tool`, `resize_window`, `browser_batch`.
- Chrome: `mcp__claude-in-chrome__*` — load with one ToolSearch call: `tabs_context_mcp, tabs_create_mcp, navigate, computer, read_page, find, form_input, get_page_text, read_console_messages, read_network_requests, javascript_tool, resize_window`. Create your own tab first and stay in it.
- Read the page with `get_page_text`/`read_page` (cheaper and more precise than screenshots). Screenshot when a bug is visible, for evidence.
- After every meaningful action read console (`onlyErrors`) and network (filter by `urlPattern`; read failing bodies by `requestId`).

### Browser quirks

- **Native dialogs** (`confirm()`, `alert()`, `prompt()`) block the page and the tools can't click them. Before clicking a control that opens one, run `javascript_tool`: `window.confirm = () => true; window.alert = () => {}; window.prompt = () => ''` (use `() => false` to test the cancel path). Re-run it after every navigation.
- **Screenshot or click fails with "tab not ready" / viewport 0×0** (often when the browser pane is hidden): use `find` + `get_page_text` for reading. A failed click may still have happened, so **before retrying any write, check the state** (reload, or `fetch` the API with `javascript_tool`) to avoid duplicate records. If screenshots keep failing, cite the closest sweep screenshot (`screenshots/sweep-…png`) plus the text/network evidence, and add a note to `meta.notes`.
- The built-in pane may render with `prefers-color-scheme: dark`; a page without an explicit background can look broken in screenshots. Confirm visual bugs with `resize_window` `colorScheme: "light"` before reporting them.
- Journey screenshots go in `<runDir>/screenshots/PC-NNN.png`.

## The step loop

1. **Look** — right page? error banners, blank areas, endless spinners?
2. **Act** — like a user: visible buttons/links, labeled fields, Enter in search boxes. Don't type URLs a user wouldn't (except deliberate access checks).
3. **Expect** — state the expected outcome *before* checking.
4. **Verify** — UI shows it AND no new console errors AND no 4xx/5xx for this action (except intended ones).
5. **Persist check** — after any write: reload (and navigate away and back). "Saved!" + old value after reload = **critical**.
6. **Record** — on failure capture evidence immediately; decide whether the journey can continue; otherwise mark it `failed` and move on.

## Roles

- Run journeys grouped by role: guest → customer → admin → cross-role.
- **Local:** sign in with `config.roles.<role>` credentials (or sign up a fresh test customer).
- **Deployed:** ask the user to sign in as the needed role in the browser ("Please sign in as a customer in the tab I opened, then say done"). For admin: "Please sign in as admin now." Never ask for the password.
- After each role's journeys: log out (local) and run the logout checks below.

## Universal heuristics

**Auth** — signup valid → lands sensibly; duplicate email → clear error (not 500); weak password/invalid email rejected with a message. Login wrong password → clear error; right → logged-in UI. Logout → UI changes; press **Back** and **reload a protected page**: no private data. Protected page while logged out → login (ideally returns you after login).

**Forms** — submit empty once → each required field shows a message, nothing created. Valid → success + persisted. **Double-click** submit on a create form → exactly one record. Labels exist; clicking a label focuses its input.

**Lists / CRUD** — empty state is meaningful; create appears (note if it needs a manual reload, `medium`); edit reflected in list and detail; delete asks for confirmation and is gone after reload; detail page for a non-existent id → friendly 404.

**Navigation** — every nav link lands somewhere real; Back works mid-flow; refreshing a deep link works.

**Feedback** — loading indicators, buttons disabled while submitting, errors near the cause, success messages truthful.

**Mobile** — run the login journey and the most important journey of each site type at 390×844 (`resize_window` preset `mobile`, then `desktop` again). Menus open, forms usable, nothing cut off horizontally.

## Site-type and admin journeys

The specific journeys and domain bugs come from `references/site-types/<type>.md` and `references/admin.md`. Follow their checklists — they encode what a human expert for that kind of product would try (e.g. cart totals math, wishlist persistence, double-booking).

## Data while testing

Name everything per `safety.md`; keep a created-records list for cleanup.

## Blockers

CAPTCHA, 2FA, email/SMS verification, real-account OAuth → stop that journey (`blocked: needs human`), offer the user to complete the step in the browser, then continue.

## Journey result

```json
{ "id": "J4", "name": "Cart: add, change qty, totals", "role": "customer", "status": "failed", "note": "Qty update 500 (PC-002); subtotal ignores quantity (PC-001)" }
```
