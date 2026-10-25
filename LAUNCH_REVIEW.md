# Launch preparation - 18 October 2026

## Production deployment — 24 October 2026

- The production Vercel project `portfolio-2-0` is connected to `akimzzy/portfolio-2.0` on `main`; pushes to `main` trigger production deployments. Its initial deployment used commit `692a80c` (`Prepare portfolio for Vercel deployment`).
- Production `SITE_URL` is `https://ake-em.com`.
- Cloudflare DNS has DNS-only records for the apex and `www`, both targeting Vercel. Vercel reports valid domain configuration and serves the apex over HTTPS; `www.ake-em.com` redirects to the apex with HTTP 308.
- Public browser checks confirmed HTTP redirects to HTTPS, canonical URLs for the home and an article, `index, follow` metadata, `robots.txt`, and the sitemap with all eleven published articles. `npm run check:site -- http://127.0.0.1:3001` also passes against the production build locally.
- Search Console ownership, sitemap submission, and live rich-result validation remain owner-side post-launch tasks; they were not represented as completed.

## Implemented

- Alluring Aura Scent and QuikCity have real public-interface screenshots. Their source and capture context are in `PROJECT_ASSETS.md`.
- The four main products have labelled case-study paragraphs covering scope, contribution, engineering, and supported outcomes. Facts remain grounded in the existing sources.
- A reviewed, two-page public résumé is available at `/akeem-adeyemi-resume.pdf`. It uses confirmed portfolio content and public professional contacts; the original phone number is excluded.
- The first Alluring Aura Scent article was approved and published in the application on 18 October 2026, at `/writing/building-nextjs-ecommerce-app`. Its source in `content/posts/` includes Akeem's own account of the business need, hosting tradeoffs, catalogue caching, and post-launch feedback. Its e-commerce title and summary now feed a validated Markdown pipeline with canonical/social metadata, author/date display, a public storefront sharing image, and BlogPosting structured data. Drafts remain excluded.
- Local Open Graph/Twitter cards, image descriptions, a monogram favicon, and an Apple icon replace starter branding.
- Route-specific titles, descriptions, canonical configuration, robots, and a published-post sitemap are ready for `SITE_URL`. Until a public origin is supplied, previews remain noindex and have no sitemap URLs.
- Saved theme preference is applied before the page paints; browser theme colors follow the selected theme. The skip link focuses main content, and keyboard tab order wraps within project/experience dialogs.
- Scroll tracking measures header size only when it changes, rather than writing layout styles during each scroll update.

## Verification

- Production build passes using Webpack and Tailwind's official PostCSS plugin. Turbopack's CSS worker fails with a local port-binding permission panic in this agent environment, including an elevated retry. `build:turbopack` remains available for retesting elsewhere.
- Integration checks verify compiled Tailwind classes and font mapping, home and Writing metadata, social images, icons, optimized screenshots, the exact reviewed PDF download, unpublished draft exclusion, and preview robots/sitemap behavior.
- Initial measured production payloads: approximately 33 KB uncompressed HTML, 35 KB CSS, and 45 KB résumé. These are asset sizes, not Lighthouse or real-user Core Web Vitals scores.
- PDF pages were rendered and visually checked for wrapping, spacing, links, and page breaks. It contains two pages and no phone number.
- Public pages for Alluring Aura Scent and QuikCity were inspected directly. Airbone Edu Consult and Dafrigroup render through web inspection. HTTP checks returned 200 for the invoice app, vendor app, Crestbase, and the Airbone/Dafrigroup repositories. Invoice's GitHub repository was verified as Public in a logged-out browser. LinkedIn may require sign-in; those URLs remain owner-supplied public professional destinations.
- Browser checks cover keyboard activation, skip navigation, modal focus and dismissal, theme persistence, sticky navigation, real screenshots, and mobile layouts. Physical iPhone/Android hardware and real screen-reader speech have not been tested.

## Article verification

### Pre-deployment article review — 19 October 2026

- All eleven articles in `content/posts/` are approved and published in the application. There are no unfinished article drafts. “Published” here means included in this app's public article routes; the site has not yet been deployed to its public domain.
- The full review record covers reader comprehension, senior-engineering correctness, factual/best-practices checks, and each article's verification limits. The optional Supabase/Hyperdrive path in the Cloudflare guide received its scoped live rehearsal before approval.
- `npm run check:writing`, `node scripts/check-draft-examples.mjs`, `npm run lint`, the production Webpack build, and the local HTTP integration check pass. The HTTP check covers all eleven article routes, internal destinations/anchors, draft exclusion, metadata, assets, robots, and sitemap. Its reading-time assertion now checks the stable accessible label.
- The only writing backlog item is a proposal to inspect the encrypted secret-sharing project; it is not an unfinished article and is not a launch dependency.

- `npm run check:writing` passes: explicit draft status, valid publication dates, metadata/schema consistency, single-title Markdown rendering, and disabled raw HTML/unsafe links.
- A temporary, locally published fixture passed HTTP checks for the rendered title/description, canonical origin, Open Graph/Twitter image, byline, single h1, BlogPosting JSON-LD, index inclusion, sitemap inclusion, and exclusion of the real draft. The fixture was removed afterwards.
- Historical first-article check (18 October 2026): the initial Alluring Aura Scent article was published in the application. The current status of all eleven articles is recorded above. A public domain has not been supplied. Live Rich Results validation and Search Console checks require deployment to the final origin.

## Dependency audit

`npm audit --omit=dev` reports zero vulnerabilities in deployed dependencies. The full audit reports five high-severity entries along one development-only chain: `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch` -> `braces`.

The underlying [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. It concerns recursive brace-pattern processing. This portfolio does not expose the linter to visitor-supplied patterns. No breaking force-fix or Next.js downgrade was applied; recheck the advisory when updating development dependencies.

## Owner decisions remaining

1. Optionally supply approved admin/vendor screenshots and further outcomes or metrics. These are improvements, not prerequisites for the current site to function.
2. Verify the domain in Google Search Console or another search service and submit `https://ake-em.com/sitemap.xml` if desired. Public crawling and ranking timelines are controlled by those services.

## Article gallery and recommendations

- Alluring Aura Scent now shows ten owner-supplied mobile screenshots in both project and article galleries. The shared gallery keeps portrait and landscape captures in suitable fixed-height frames, and the full-screen viewer uses the available width for landscape images. Responsive browser checks confirmed the page remains 390px wide on a 390px viewport after scrolling; hidden captions stay within their figures.
- Read next prioritises shared topics, then recency, excludes the current article and drafts, and stays hidden when no other post is published. Unit checks cover ranking/limits; a temporary local published fixture confirmed the section appears automatically and was removed.
- The follow-up series plan is recorded in `WRITING_IDEAS.md`; no additional articles or links to nonexistent pages were published.

## Functional bug review — 19 October 2026

- Fixed background document scrolling from Page Down while the article image viewer was open. The viewer now takes a body scroll lock and restores the prior lock state, preserving a parent project dialog’s lock. Browser checks verified standalone/nested Escape dismissal and focus restoration.
- Fixed stale sticky article-title visibility after client navigation between articles. Navigation now resets per article, reattaches its observer when the title changes, and uses the combined site-header/article-toolbar height for the visibility handoff.
- Updated obsolete reading-time wording in the site integration checks, which had stopped the broader suite before later checks ran. Extended route/link/anchor and draft-exclusion checks to every current/future article.
- Dependency audit: five high-severity entries originate from `braces@3.0.3` through the development-only Next ESLint dependency chain (`eslint-config-next` → plugin → fast-glob → micromatch → braces). Advisory GHSA-vfj7-8cjw-p6xm lists no patched version as checked today. npm proposes downgrading the Next lint configuration to 14.2.35; that is not a compatible routine fix for this Next 16 project. No forced downgrade or unsupported override was applied. This remains an upstream tooling issue; no visitor-supplied glob-pattern path was found in the application.

## Gallery refresh and release review — 25 October 2026

- Replaced the superseded Alluring Aura captures with the ten owner-approved phone mockups. The article and project use the same sequence; the article's social image now points to the home screenshot directly, avoiding a duplicate file. Superseded captures were removed from the production asset set.
- Portrait and landscape screenshots use separate gallery frames so desktop captures can use the available width. All source images retain their full aspect ratios.
- `npm run lint`, `npx tsc --noEmit`, `npm run check:writing`, and `SITE_URL=https://ake-em.com npm run build` pass. `npm run check:site -- http://127.0.0.1:43128` passes against the production build, covering all eleven article routes, internal links, current screenshot assets, metadata, the résumé, robots, and sitemap.
- The game documents under `docs/games/` remain future-feature notes only; no game code or product structure was added.
