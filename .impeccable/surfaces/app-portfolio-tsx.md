---
version: 1
slug: "app-portfolio-tsx"
primary_target: "app/portfolio.tsx"
related_targets: ["app/layout.tsx"]
---

# Portfolio home

Scope: replace the home composition. Visitor mode: Read / Experience. Build directly from the user-approved rendered reference; no generated comp is needed to select a different look.

## Direction contract

THESIS: A readable personal engineering page. Replace the earlier horizontal dashboard with a narrow vertical column that visitors can scan and read at their own pace.

OWN-WORLD: Match the restrained text-first character of https://limistah.dev/: near-black dark surface, off-white light surface, blue links, compact sans-serif headings, generous section spacing, quiet list rows. No large hero, decorative numbering, or default screenshot card gallery.

STORY: Learn who Akeem is, see breadth across frontend/backend/mobile, browse all seven retained projects in one visible list, read work history and skills, open a project for evidence, and follow real contact URLs.

FIRST VIEWPORT: A small navigation strip aligned to a centered 640px reading column; below it a 24px name, engineering scope, a short 18px introduction, secondary biography, inline socials, and the beginning of Projects. Mobile keeps this reading order with wrapped navigation.

FORM: User-pinned reference overrides the optional exploration assignment. User confirmed adoption of the vertical layout through the structured question. seed:19f67d1db55cf360. Signature interaction: native anchored navigation and explicit, keyboard-accessible project details, with no hover takeover interrupting reading.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Evidence and open content

Project and experience detail views use a shared native dialog: a full-width bottom sheet below 640px, with a fixed header and scrollable body; a centered modal from 640px. Mobile bottom padding respects the device safe area. Close, Escape, backdrop dismissal, focus containment, and focus restoration apply to both forms.

The shared header stays at the top during scrolling. Its measured height supplies anchor clearance. Current-section highlighting follows manual scrolling and honors explicit navigation near the footer, where multiple short sections can share the same final scroll position.

Reference inspected in a browser on desktop and mobile. Profile, work history, skills, education and product contributions come from owner-supplied resumes and verified project material; Invoice app, Airbone Edu Consult, and Dafrigroup come from the previous portfolio. Speed Typer and Slider Template were removed at the owner's request. See CONTENT_SOURCES.md. Public Alluring Aura Scent and QuikCity screenshots are captured and documented in PROJECT_ASSETS.md. A public résumé is generated from confirmed content. Portraits and private admin/vendor screenshots are not supplied. Do not copy the reference owner's identity, biography, articles, seniority, affiliations, or portrait.
