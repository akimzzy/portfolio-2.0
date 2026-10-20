# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Akeem Adeyemi's personal software engineering portfolio. Visitors should be able to understand the engineer's work, browse projects and experience, and find contact links.

## Capabilities and Constraints

- The owner builds across frontend, backend, and mobile applications; do not present the portfolio as backend-only.
- Use Next.js, TypeScript, and Tailwind CSS. All UI styling must use Tailwind utilities.
- Follow system light/dark preference by default, with an optional manual switch.
- Keep the shared header visible while scrolling and indicate the current section. Anchor navigation must clear the header at every screen size.
- Projects need accessible detail views, with GitHub and live URLs when provided.
- Public product links can demonstrate employer and client work. Clearly describe Akeem's contribution; repository links are optional and private repositories stay omitted.
- Work experience opens details on activation; it must not use a hover takeover.
- A dedicated Writing page lists build stories, implementation challenges, and lessons learned, with individual article URLs. Only owner-authored posts are published.
- A downloadable public résumé uses the confirmed portfolio content. Public project screenshots can be captured independently; private app screens need owner-approved examples.
- Discuss additional features with the owner before implementing them. Writing extras such as subscriptions, comments, RSS, and search are not yet approved.
- On 16 October 2026, the owner explicitly chose to replace the former three-row horizontal layout with the vertical layout of the supplied reference.

## Brand Commitments

- Name: Akeem Adeyemi.
- Typography: Cabinet Grotesk for the portfolio UI, headings, and reading text; native monospace for code.
- Role: Software engineer, covering frontend, backend, and mobile.
- Minimal, understated presentation, small name heading, limited borders, and hierarchy through spacing and typography.
- The owner selected https://limistah.dev/ as the current visual reference and confirmed adoption of its vertical layout.

## Evidence on Hand

`app/portfolio-data.ts` contains content reconciled from four owner-supplied resumes, the previous portfolio, and verified project source. It includes real professional contact links, four employment entries, Alluring Aura Scent, QuikCity, Onboardbase and Buzthrive contributions, skills, education, and three retained projects from the previous portfolio. The owner removed Speed Typer and Slider Template and requested that all seven retained projects appear together without an Earlier projects group. The owner confirmed Adventlabs as February–August 2026 and Alluring Aura Scent's completion. See `CONTENT_SOURCES.md` for provenance. Do not invent project stacks, dates, metrics, links, screenshots, or credentials.

## Open Decisions

The primary visitor audience has not been explicitly specified. The owner may supply additional recent projects and approved private admin/vendor screenshots. Public Alluring Aura Scent and QuikCity screenshots are available. Domain/hosting selection and approval of the first article draft remain owner decisions; additional repository links are optional.

## Product Principles

- Let visitors read and explore at their own pace.
- Represent breadth of engineering work clearly.
- Prefer accessible, predictable interactions over surprise.
- Keep professional claims traceable to the owner's supplied material.
