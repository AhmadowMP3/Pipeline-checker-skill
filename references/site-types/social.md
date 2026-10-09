# Social / community playbook

## Signals
Models: Profile, Post, Comment, Like/Reaction, Follow, Notification, Message, Report/Block, Group. Routes: /feed, /u/[handle], /notifications, /messages. Realtime: websockets/SSE, push.

## Journeys
**Guest** — public profiles/posts visibility matches the product's promise; private content hidden.
**Customer** — edit profile (avatar upload, bio) persists; create post (text, image) → appears in own profile and followers' feed; like/unlike (count updates once, not twice on double-click); comment; follow/unfollow (counts consistent); notifications appear for interactions (needs `customer2`); DM thread (if any) private; report and block (blocked user's content hidden, can't message).
**Cross-user (customer2, local)** — A's private post invisible to B; B can't edit/delete A's post (UI + API); blocking works both ways as designed.
**Admin/moderator** → `admin.md` (remove content, ban user → user logged out).

## Domain bug checklist
| Bug | Severity |
|---|---|
| Private content visible to others | critical |
| Edit/delete someone else's post | critical |
| Blocked user can still interact | high |
| Like/follow counts drift or double | medium |
| Notifications missing or for wrong user | medium |
| Feed shows deleted content | medium |

## Data & safety notes
Deployed: never post publicly, follow or message real users without approval.
