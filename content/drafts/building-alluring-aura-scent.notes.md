# Editorial evidence: Alluring Aura Scent

Draft updated on 18 October 2026 using Akeem's first-person answers in this chat and read-only inspection of the project source. This file is not article content or a public post.

## Owner account

- Business moved from social-media sales toward a physical store and a larger inventory; website intended to handle routine discovery and price enquiries while preserving DMs for personal help.
- Akeem owned planning, design, implementation, deployment, and handover.
- Resource optimisation and affordable hosting were the hardest part.
- AWS and Vercel were considered. Prior experience included AWS and DigitalOcean; Cloudflare was new. Workers free tier was the main selection reason, with a paid upgrade path.
- More than 5,000 products is the intended catalogue scale, not a verified current live count.
- Store is using the app. Admin has reported no issues so far; this is bounded owner-reported feedback, not a reliability guarantee.
- App-style notifications were requested and have not been implemented. Do not infer a particular push-notification implementation from the request.
- Manual ordering of products within category/brand was requested in the first week. Its implementation status was not supplied; the article describes the request only.
- No measured cost savings, request reductions, sales figures, or DM reductions were provided.

## Implementation cross-check

Source project: `/Users/akeem/projects/alluring-aura-scent`.

- README: storefront/admin scope, deployment stack, local catalogue, bounded session-memory caches for private order data, and server-authoritative mutation checks.
- `src/lib/admin-catalogue-sync.ts`: chunked/resumable initial catalogue, revision checks, separate catalogue/stock deltas, generation activation, and refresh failure handling.
- `src/lib/admin-sale-storage.ts`: IndexedDB catalogue and metadata storage.
- `src/modules/catalogue/public-cache.ts` and `public-product-cache.ts`: revision-keyed public data caching and Cloudflare R2-backed cache storage. Do not equate this with caching every HTTP response at the CDN.
- Catalogue worker endpoints: private, no-store admin responses.

## External fact check

[Official Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) checked on 18 October 2026: free tier available; Workers Paid has a $5 monthly minimum plus applicable additional usage charges. This is not the total application bill. Recheck before publication.

## Publication review

Review voice and factual accuracy with Akeem, approve publication, and choose a publication date. No additional personal story is required to make this draft complete. Keep `draft: true` and leave public posts unchanged until approved.

## Editorial review — 18 October 2026

- Removed commercial scope/agreement details from the article and these notes; retained only the public feature status.
- Removed exact platform prices, the pricing digression, the unmeasured-results disclaimer, and the broad “no issues” statement. The article makes no measured savings or reliability claim.
- Condensed repetitive setup and conclusion; replaced abstract slogans with specific store workflows.
- Clarified that the local dataset is a catalogue cache, not the whole business database, and that synchronisation continues after initial download.
- Added server-side search and pagination as valid architectural context, without claiming Akeem evaluated them during this build.
- Rechecked revision-based catalogue/stock synchronisation and public cache keys against the source. Kept server authority and private/public cache boundaries explicit.
- Preserved planned capacity wording and did not assign an implementation status to the product-ordering request.
- No application code, public post registration, or publication status changed.

## Publication preparation

- Title: “Building a Next.js E-commerce App: Alluring Aura Scent”. The title describes the subject and technology before the brand; it is not a claim of verified search volume or rankings.
- Summary names the e-commerce app, Cloudflare Workers, IndexedDB caching, and shared inventory. These terms also appear naturally in relevant headings and prose.
- Planned slug: `building-nextjs-ecommerce-app`. No public old URL exists, so no redirect is required.
- Markdown frontmatter is the source for the visible title/summary, author, social image, canonical metadata, and BlogPosting structured data. The renderer removes the Markdown h1 so the page supplies one title.
- Sharing image reuses the verified public storefront screenshot, with explicit dimensions and alternative text. No private admin screens are exposed.
- The post is still a draft, has no invented publication date, and remains excluded from public articles, index, and sitemap.
- Publication requires approval, the actual publication date, `draft: false`, and the real public `SITE_URL`. Search Console submission and Google's live Rich Results Test follow deployment; local checks do not establish search indexing or rankings.
- Editorial references checked: [Google title guidance](https://developers.google.com/search/docs/appearance/title-link), [description guidance](https://developers.google.com/search/docs/appearance/snippet), and [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article).

## Owner approval — 18 October 2026

The owner approved the revised article and publication preparation. The final article moved to `content/posts/building-alluring-aura-scent.md`, with `draft: false` and publication date `2026-10-18`. It is available in the application's Writing index and article route. Earlier draft-status notes above describe the review history, not the current publication state. Editorial notes remain private. External deployment and search indexing still require the final public origin.
