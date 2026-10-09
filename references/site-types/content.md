# Content / blog / CMS playbook

## Signals
Models: Post/Article, Category/Tag, Author, Comment, Subscriber/Newsletter, Page. Routes: /blog, /posts/[slug], /category/[slug], /tag, /search, /rss.xml, /feed. Libraries: MDX, contentlayer, Sanity/Contentful/Strapi clients.

## Journeys
**Guest** — home → article list → article: images, code blocks, embeds render; next/previous and related links; categories/tags pages; search; pagination; RSS/Atom feed valid and links work; share links; newsletter signup (only `qa+pc-…` emails).
**Customer (commenter)** — post a comment → appears (or "awaiting moderation" message); edit/delete own comment; can't edit others'.
**SEO basics** (from sweep + page text) — each article has a unique `<title>`, meta description, canonical, Open Graph image; sitemap includes articles; no `noindex` on public pages; 404 page for unknown slugs.
**Admin/editor** → `admin.md` (draft → publish → visible; unpublish → 404; scheduled posts).

## Domain bug checklist
| Bug | Severity |
|---|---|
| Draft/unpublished content publicly reachable | high |
| Comment XSS (comment HTML rendered unescaped) — test with `<b>pc</b>` on local | critical |
| Broken images/embeds in articles | medium |
| Duplicate/missing titles and descriptions | low |
| Feed broken or links to wrong domain | medium |
| Search returns nothing for exact titles | medium |

## Data & safety notes
Deployed: no public comments without approval; delete test comments at cleanup.
