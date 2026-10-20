# Akeem Adeyemi's portfolio

A minimal, text-first software engineering portfolio built with Next.js, TypeScript, and Tailwind CSS. Its centered vertical reading column is inspired by limistah.dev and covers frontend, backend, and mobile work.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. `npm run build` uses Webpack with Tailwind's official PostCSS plugin; `npm run lint` checks application code. `npm run build:turbopack` is retained for retesting the default bundler. Turbopack's CSS worker currently fails to bind its local evaluation port in this agent environment, including after an elevated retry.

## Content

Edit `app/portfolio-data.ts` for the introduction, contact URLs, projects, work history, skills, and education. Content is reconciled from owner-supplied resumes and verified project material; provenance is recorded in `CONTENT_SOURCES.md`. All projects, including the three retained projects from the earlier portfolio, appear in one list. Project links render only when a real URL is available; private repositories are omitted.

Add an optional project `image` and descriptive `imageAlt`, with the image saved in `public/projects/`, to display an image in that project's detail view. This can be a logo or an appropriate screenshot; record its source and whether it is a screenshot in `PROJECT_ASSETS.md`. Public interface screenshots of Alluring Aura Scent and QuikCity are documented there. `detailHeadings` labels the existing description paragraphs without duplicating their content.

Update page metadata in `app/layout.tsx` when changing the profile. Additional recent projects can be added without changing the layout.

## Interactions and layout

- Native vertical scrolling with a sticky header, active-section highlighting, and anchors that clear the header.
- Text-first project rows; activation opens a centered native dialog on desktop and a bottom sheet below 640px. The header remains visible while detail content scrolls.
- Work experience opens details on click or keyboard activation.
- Escape and the close control dismiss dialogs and return focus to their trigger.
- No hover takeover or horizontal carousel interrupts reading.
- Theme follows the system initially. The theme control cycles through system, light, and dark and saves the choice locally when storage is available.

All UI styling uses Tailwind utilities. `app/globals.css` contains only Tailwind setup and the dark-mode variant.

## Writing

`/writing` lists published posts newest first. Each post opens at `/writing/<slug>`. Until the first real post is added, the index shows a simple empty state.

Articles live in `content/drafts/` or `content/posts/` as Markdown with YAML frontmatter. `app/writing/posts.ts` validates and loads them; `app/writing/article-body.ts` is the shared production/test renderer, using `react-markdown` with `remark-gfm` and raw HTML disabled. The layout supplies the title, author, dates, summary, and image, using Tailwind utilities.

Required fields: URL-safe unique `slug`, `title`, `summary`, `author`, and explicit boolean `draft`. An optional local `image` under `/writing/` requires `imageAlt`, positive `imageWidth` and `imageHeight`. Optional `screenshots` entries provide a local `src`, `label`, `alt`, `width`, and `height` for the shared gallery. The first Markdown heading must match the title. Published articles require a quoted `date` in `YYYY-MM-DD` format; optional `modified` must not predate publication. Do not assign a publication date while a draft awaits approval.

`content/posts/building-alluring-aura-scent.md` was approved on 18 October 2026 and is published at `/writing/building-nextjs-ecommerce-app`. Drafts and `.notes.md` editorial files never enter the public index, article routes, or sitemap. After owner approval, move the article to `content/posts/`, set `draft: false`, and set the actual publication date. There is no public draft-preview bypass. Optional `topics` strings drive automatic Read next recommendations: up to three other published articles, ordered by shared topics then publication date. The section stays hidden when no other article exists.

Article metadata uses the same frontmatter as the visible page: title, description, author, canonical URL, Open Graph/Twitter image and article dates, plus escaped `BlogPosting` JSON-LD. Set the real `SITE_URL` before a deployment build; previews remain noindex. Run `npm run check:writing` for content, publication, metadata, schema, and safe-rendering checks (Node.js 22.18+). After publishing, run `node scripts/check-article.mjs http://localhost:3000 <slug> https://your-domain.example` against the production build to verify the rendered article and metadata.

## Public résumé and assets

The homepage serves `public/akeem-adeyemi-resume.pdf`, a two-page résumé generated from confirmed portfolio content. It contains public professional contacts and omits the phone number from the original documents. To regenerate, install ReportLab and Pillow in your Python environment, then run:

```sh
node scripts/export-resume-data.mjs
python3 scripts/generate-resume.py
python3 scripts/generate-brand-assets.py
```

The PDF script uses ReportLab and bundled Ubuntu fonts; the sharing assets use Pillow and the locally licensed Cabinet Grotesk font. These are development tools, not application runtime dependencies. Generated social images and the A monogram icon replace starter branding.

## Deployment configuration

Set `SITE_URL` to the final public origin, such as `https://your-domain.example`, before building for production. `.env.example` documents the setting. No domain is assumed or registered by this project.

The article route's production file trace includes published posts only. `next.config.ts` excludes `content/drafts/` and top-level editorial Markdown files from the server artifact; they remain available in the source repository for local review.

Until the setting exists, metadata marks the site noindex, robots disallows crawling, and the sitemap contains no URLs. With it set, canonical URLs, robots, and the sitemap use that origin. Only published posts enter the sitemap. Open Graph and Twitter cards have local image assets and route-specific titles/descriptions.

Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before deployment. Start the built app, then run `npm run check:site -- http://localhost:3000` for read-only integration checks against its HTML, compiled CSS, assets, résumé, metadata, Writing, and draft exclusion. See `LAUNCH_REVIEW.md` for verified checks and remaining owner decisions.

No CMS, newsletter, search, comments, RSS, or analytics integration is included. These can be considered separately with the owner's approval.

## Design guidance

Project-local Impeccable and Vercel Web Design Guidelines skills live in `.agents/skills/`. They are development tooling, excluded from application linting. `PRODUCT.md` records confirmed requirements and content gaps. The development-only surface brief is in `.impeccable/surfaces/`; the finished design is documented in `DESIGN.md`.

## Reviewing the e-commerce drafts

`content/DRAFT_REVIEW.md` indexes the follow-ups: IndexedDB and public caching are approved and published in the application; six other articles remain drafts. Run `node scripts/check-draft-examples.mjs` to check draft exclusion, snippet syntax, and selected local example behavior. This does not run a hosted deployment, charge a payment, or send email. Publication remains per-article after owner review and the relevant verification.

### Article formatting checks

Use standard Markdown or GitHub-flavoured Markdown: headings below the page title, paragraphs, emphasis, links, images, nested/ordered/task lists, quotes, fenced code, tables, and footnotes. Raw HTML, MDX components, and math syntax are not supported. Close every code fence and leave blank lines around block elements. Tables and code blocks scroll within the reading column and support keyboard focus.

Run `npm run check:writing` after editing any article. It renders every published post and draft through the actual shared article renderer, checks heading/table/code output, rejects unclosed fences and unsupported HTML, and runs a formatting regression fixture. `npm run build` runs these checks automatically first. Before publication, also inspect the article at desktop and mobile widths, including tables, code, and images; automated checks do not prove every possible future layout is correct.

### Required editorial reviews

Before presenting any draft as ready, complete the reader review, senior engineering review, and factual/best-practices review in that order, then run the existing example/rendering/metadata checks. See [the review process and article-by-article results](content/WRITING_REVIEW.md). Automated checks do not assess writing quality or certify external integrations. Keep owner approval and any live-rehearsal requirements separate from editorial pass results.
