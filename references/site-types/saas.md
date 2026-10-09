# SaaS / dashboard playbook

## Signals
Models: User, Organization/Workspace/Team, Membership, Invite, Project/Board/Document, Subscription/Plan, ApiKey, AuditLog. Routes: /dashboard, /app, /settings, /billing, /team, /projects. Integrations: Stripe Billing, auth providers, email.

## Journeys
**Guest** — landing → pricing → signup CTA works; docs/help links.
**Customer (member/owner)**
- Signup → email verification (blocked if real email needed) → onboarding steps complete; skipping onboarding doesn't break the app.
- Create workspace/project → core object CRUD (the thing the product is for) → search/filter → share/collaborate if offered.
- Invite a teammate (`qa+pc-<runId>+2@example.com`) → invite shows pending → revoke.
- Roles inside the workspace: member can't do owner-only actions (delete workspace, billing).
- Billing/plan page loads; upgrade flow in test mode (local); plan limits enforced (create beyond limit → upgrade prompt, not crash).
- Settings: profile, password change (local), notification preferences persist; API keys created/revoked; data export downloads.
**Admin** → `admin.md` (users, orgs, plans, impersonation if any — impersonation must be logged/visible).

## Domain bug checklist
| Bug | Severity |
|---|---|
| Data from another workspace visible (tenant leak) | critical |
| Member can perform owner/admin actions | critical |
| Plan limits not enforced / enforced wrongly | high |
| Onboarding loop or dead end | high |
| Invite link reusable after revoke / accepts wrong email | high |
| Deleted object still appears in search/recent | medium |
| Dashboard numbers don't match underlying data | high |
| Settings don't persist | high |

## Data & safety notes
Never invite real emails. Deployed: no plan changes, no member removals of real users.
