# Akeem Adeyemi — Portfolio

A personal portfolio for Akeem Adeyemi, a senior full-stack software engineer in Lagos, Nigeria. It presents selected products, work experience, skills, résumé, and engineering articles.

Built with Next.js, React, TypeScript, and Tailwind CSS. The site includes responsive project details, a writing section, accessible navigation, and a theme that follows the visitor’s system preference.

## Run locally

Requirements: Node.js 22.18 or newer and npm.

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To create a production build locally:

```sh
npm run build
npm start
```

## Checks

```sh
npm run lint
npx tsc --noEmit
npm run check:writing
```

`npm run build` also runs the writing-content checks. To check a running production build:

```sh
npm run check:site -- http://localhost:3000
```

## Content

- Update profile details, projects, experience, skills, and education in `app/portfolio-data.ts`.
- Update page metadata in `app/layout.tsx` and the site description in `app/site-config.ts` when profile details change.
- Add published articles to `content/posts/` as Markdown. Keep unpublished editorial material in `content/drafts/`.
- Article metadata and formatting requirements are documented in `content/WRITING_PATTERN.md`; the required review process is in `content/WRITING_REVIEW.md`.
- Record project image sources and descriptions in `PROJECT_ASSETS.md`. Portfolio screenshots and article images live under `public/`.
- `CONTENT_SOURCES.md` records the sources used to verify portfolio facts.

Run `npm run check:writing` after changing an article. Only articles marked as published are rendered as public pages or included in the sitemap.

## Deployment

The production origin is `https://ake-em.com`. Set `SITE_URL=https://ake-em.com` in the Vercel project's **Production** environment variables. Leave it unset for Preview deployments so they remain noindex and have an empty sitemap. For local development, the variable can be left empty or set in `.env.local`.

Copy `.env.example` to `.env.local` for local configuration. Then run the production checks above. Canonical URLs, robots rules, social metadata, and the sitemap use this origin.

## Résumé and social images

The public résumé is available at `/akeem-adeyemi-resume.pdf`. Its source data and generation scripts are in `scripts/`. To regenerate the résumé or social images, install the Python packages ReportLab and Pillow, then run:

```sh
node scripts/export-resume-data.mjs
python3 scripts/generate-resume.py
python3 scripts/generate-brand-assets.py
```

## Project notes

- `PRODUCT.md` describes the portfolio’s goals and content requirements.
- `DESIGN.md` documents the visual system and interaction decisions.
- `LAUNCH_REVIEW.md` records deployment readiness checks and remaining setup.
