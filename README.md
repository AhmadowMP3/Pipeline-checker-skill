# Pipeline Check — a QA skill for Claude Code

Test your website or web app **like a real human user** before your users do.

`pipeline-check` is a [Claude Code](https://claude.com/claude-code) skill. Point it at your app and it:

1. **Understands what your product is** — reads your code to work out whether it's an online store, SaaS, marketplace, booking app, blog, social network, course platform or landing page, and who uses it (guest, customer, admin).
2. **Crawls every page** on desktop and mobile — console errors, failed requests, broken links and images, accessibility (axe), load time, layout shift, leaked secrets in JS bundles.
3. **Runs real user journeys in a browser** — tailored to your site type: add to cart, change quantity, check the totals math, wishlist, checkout (test mode), admin product edits showing up in the shop, and "it said *Saved!* — is it still there after a reload?"
4. **Checks the connections** — API endpoints without auth, customers reaching admin APIs, logout that doesn't really log out, risky CORS, third-party integrations.
5. **Writes a prioritized report** — `report.html` + `report.md` with a health score, severity (critical → low), repro steps, evidence, and the **suspected file:line in your code**.

It **reports; it never edits your code**.

## Install

Requirements: [Claude Code](https://claude.com/claude-code), Node.js ≥ 21, Git.

```bash
git clone https://github.com/AhmadowMP3/Pipeline-checker-skill.git ~/.claude/skills/pipeline-check
cd ~/.claude/skills/pipeline-check/scripts
npm install
npx playwright install chromium
```

On Windows (PowerShell), clone into `$HOME\.claude\skills\pipeline-check` instead.

Restart Claude Code; `pipeline-check` appears in your skills list.

## Use

Open your web project in Claude Code and run:

```
/pipeline-check http://localhost:3000
```

or just ask: *"QA my site"*, *"test my app like a user"*, *"find bugs before launch"*.

Options:

| Option | Meaning |
|---|---|
| `--scope full` (default) / `--scope quick` | Everything, or crawl + login + the single most important journey per site type |
| `--focus J1,J4` | Run only these journeys |
| `--browser builtin` / `--browser chrome` | Claude's built-in browser (default for localhost) or your own Chrome via Claude in Chrome (default for deployed sites) |

The skill first shows you what it thinks your app is and the journeys it plans to run, and asks before using any test account.

Output goes to `<your-project>/.pipeline-check/runs/<timestamp>/` (add `.pipeline-check/` to your `.gitignore`; the skill offers to).

### Test accounts

To test logged-in and admin areas on localhost, put **test** credentials in `<your-project>/.pipeline-check/config.json`:

```json
{
  "roles": {
    "customer": { "url": "/login", "fields": { "#email": "customer@shop.test", "#password": "local-test-pw" }, "submit": "button[type=submit]" },
    "admin":    { "url": "/login", "fields": { "#email": "admin@shop.test", "#password": "local-admin-pw" }, "submit": "button[type=submit]" }
  }
}
```

The skill can also find seed accounts in your project and propose them.

## Safety

Built to be run against your own apps, including production:

- **Credentials are only ever typed on local targets** (`localhost`, `127.0.0.1`, `*.localhost`, `*.test`). On a deployed site you sign in yourself in your browser; the scripts refuse to log in there.
- **Write gate on deployed sites:** before changing anything it lists every planned write and waits for your approval, and only touches records it created (`[PC-<run>]` test data), then cleans up.
- **API probes never guess record ids or create data on deployed sites**, and never call side-effecting endpoints (`cron`, `seed`, `reset`, `send`, `webhook`, …).
- The crawler never follows logout/delete/refund/approve-style links.
- No CAPTCHA/2FA bypassing, no load testing. Env var values, cookies and secrets are never written to reports.

## What's inside

```
SKILL.md              the orchestrator Claude follows (7 phases)
references/           playbooks loaded per phase: recon, journeys, connections, admin, safety, severity
references/site-types per-site-type playbooks (ecommerce, saas, marketplace, booking, content, social, lms, landing)
scripts/              Node + Playwright evidence collectors: new-run, preflight, sweep, session, probe, report
templates/            HTML report template
demo-app/             "ShopNest" — a small shop with 9 planted bugs to try the skill on
```

## Try it on the demo shop

```bash
cd ~/.claude/skills/pipeline-check/demo-app
npm install
node server.mjs            # http://localhost:4000, planted bugs ON  (BUGS=0 for the clean version)
```

Then, in Claude Code with `demo-app` open: `/pipeline-check http://localhost:4000`. `demo-app/EXPECTED.md` lists what it should find — don't peek before the run.

## Development

```bash
cd scripts && npm test        # 44 tests (needs Chromium)
cd demo-app && npm test       # demo app tests
```

## Limitations

- Needs your source code for the best results (recon reads it); works best on your own projects.
- Can't verify email/SMS delivery, and stops at CAPTCHAs/2FA (hands them to you).
- The Claude-in-Chrome (deployed site) path is the least battle-tested — please open an issue with what you find.

## License

[MIT](LICENSE)
