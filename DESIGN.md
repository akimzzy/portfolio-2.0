---
name: Akeem Adeyemi Portfolio
description: A restrained, readable personal engineering portfolio.
colors:
  link-light: "#355f9c"
  link-light-hover: "#203f6d"
  link-dark: "#9aaed7"
  link-dark-hover: "#c5d3ee"
  page-light: "#f8f8f5"
  page-dark: "#0d0e0c"
  dialog-dark: "#161713"
  ink-light: "#292d25"
  ink-dark: "#edeee8"
  muted-light: "#686d63"
  muted-dark: "#a4a89c"
  focus-light: "#5277ae"
  focus-dark: "#a9bddf"
  selection: "#dce5f2"
  white: "#fff"
  divider-light: "rgb(0 0 0 / 0.07)"
  project-divider-light: "rgb(0 0 0 / 0.06)"
  divider-dark: "rgb(255 255 255 / 0.07)"
  experience-light: "rgb(0 0 0 / 0.025)"
  experience-light-hover: "rgb(0 0 0 / 0.05)"
  experience-dark: "rgb(255 255 255 / 0.035)"
  experience-dark-hover: "rgb(255 255 255 / 0.065)"
  control-dark-hover: "rgb(255 255 255 / 0.05)"
  backdrop: "rgb(0 0 0 / 0.5)"
typography:
  title:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.01em"
  introduction:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "28px"
  body:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
  entry-title:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
  supporting:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "24px"
  section-label:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.06em"
  metadata:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  wordmark:
    fontFamily: "var(--font-portfolio-sans), sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "-0.025em"
rounded:
  control: "4px"
  entry: "8px"
  dialog: "12px"
  circular: "3.40282e+38px"
spacing:
  one: "4px"
  one-half: "6px"
  two: "8px"
  three: "12px"
  four: "16px"
  five: "20px"
  six: "24px"
  seven: "28px"
  eight: "32px"
  eleven: "44px"
  twelve: "48px"
  fourteen: "56px"
  sixteen: "64px"
components:
  text-link:
    textColor: "{colors.link-light}"
    rounded: "{rounded.control}"
    typography: "{typography.supporting}"
  text-link-hover:
    textColor: "{colors.link-light-hover}"
  text-link-dark:
    textColor: "{colors.link-dark}"
  text-link-dark-hover:
    textColor: "{colors.link-dark-hover}"
  theme-control:
    textColor: "{colors.muted-light}"
    rounded: "{rounded.circular}"
    size: "44px"
  navigation:
    textColor: "{colors.muted-light}"
  project-row:
    padding: "24px 0"
  experience-entry:
    backgroundColor: "{colors.experience-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.entry}"
    padding: "16px"
    width: "100%"
  experience-entry-hover:
    backgroundColor: "{colors.experience-light-hover}"
  experience-entry-dark:
    backgroundColor: "{colors.experience-dark}"
    textColor: "{colors.ink-dark}"
  experience-entry-dark-hover:
    backgroundColor: "{colors.experience-dark-hover}"
  detail-dialog:
    backgroundColor: "{colors.page-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.dialog}"
    padding: "24px"
    width: "calc(100% - 2rem)"
  detail-dialog-dark:
    backgroundColor: "{colors.dialog-dark}"
    textColor: "{colors.ink-dark}"
---

# Design System: Akeem Adeyemi Portfolio

## Overview

**Creative North Star: "A readable personal engineering page"**

A restrained, text-first portfolio for Akeem Adeyemi. Small headings, a narrow reading column, quiet blue links, and native vertical flow let visitors explore engineering work at their own pace. The surface follows system light or dark preference, with a manual theme switch.

The owner selected https://limistah.dev/ as visual inspiration and confirmed its vertical layout. This provenance applies to composition and visual character, not the reference owner’s identity, biography, credentials, content, or portrait. Professional content comes from owner-supplied resumes and verified project material, as recorded in CONTENT_SOURCES.md. No portrait is supplied. Real public screenshots of Alluring Aura Scent and QuikCity are documented in PROJECT_ASSETS.md.

**Key Characteristics:**

- A small owner heading and generous section spacing.
- A centered reading column with simple project rows and softly filled experience entries.
- Off-white and near-black surfaces with quiet blue links.
- Predictable anchors, visible keyboard focus, and native detail dialogs.

## Colors

One quiet blue accent sits within subtly warm neutrals. Frontmatter records the exact source palette, including transparent overlays; light and dark values are paired roles, not separate visual identities.

### Primary

- **Quiet Blue** (`link-light`, `link-dark`) identifies text links and project detail triggers. Hover variants brighten or deepen the same accent and reveal the underline.
- **Focus Blue** (`focus-light`, `focus-dark`) provides the visible keyboard outline.

### Neutral

- **Off-white Paper** (`page-light`) is the light page and dialog surface.
- **Near-black Ground** (`page-dark`) is the dark page surface; **Raised Dark Surface** (`dialog-dark`) distinguishes the modal.
- **Warm Ink** (`ink-light`, `ink-dark`) carries primary text. **Muted Ink** (`muted-light`, `muted-dark`) carries supporting copy, dates, tags, and navigation.
- Transparent divider tokens provide minimal header, footer, and project separation. Experience and control overlays create state changes without new accent colors.
- Selection uses the selection token with light ink in both themes. White is used by the skip link; the backdrop dims the page beneath the dialog.

**The Quiet Accent Rule.** Reserve blue for links, project detail triggers, and keyboard focus; experience containers remain neutral.

## Typography

Cabinet Grotesk is the single UI and reading face, loaded from the unchanged local variable WOFF2 file through `next/font/local`. It covers headings, body text, and navigation. Code samples use the native monospace stack. Frontmatter gives the actual roles; there is no oversized display scale.

The owner name uses a compact 22px/28px title; dialog titles retain 24px/32px. The owner delegated the font choice after comparing the two fonts in Alluring Aura Scent; Cabinet Grotesk was selected as the single portfolio face. The introduction has a larger reading size, followed by body copy, restrained entry titles, supporting copy, and metadata. Section labels are uppercase with tracked letters and a compact 16px line height. Dark-mode role metadata, project tags, dates, and section labels use #8d9387; supporting prose retains the brighter muted ink. Navigation and contact text use the small text size with a compact line height (20px); supporting paragraphs use the supporting role’s looser line height. Project tags use metadata size with a line height (20px); dialog tags retain (24px). The About narrative retains a reading line height (28px). Dates use tabular numerals. Dialog summaries use standard text (16px) with a reading line height (28px).

**The Small Name Rule.** Keep the owner heading at the existing title scale; spacing and the introduction establish the hierarchy.

## Layout

The header, main, and footer share a centered outer box (688px maximum) with horizontal gutters (24px each), giving a maximum reading width (640px). The page uses ordinary vertical document flow. Projects are plain stacked rows; experience is a stacked list. Section spacing is (48px), with tighter internal margins (2–16px) so content groups read distinctly from section breaks; anchor targets clear the measured sticky header by 24px. Main top padding is (40px), increasing to (48px) at the small breakpoint. The introduction uses compact margins (4–12px); skills categories are separated by (8px). Bottom padding is (48px).

The small breakpoint is (40rem / 640px). On the home page below it, navigation shares one steady row with the theme control; the name stays out of the mobile header as the page scrolls. Above it, navigation and theme share one row; the name fades in as the About heading passes beneath the sticky header, and navigation shifts right to make room. Writing pages use the same single-row navigation and theme control, without an owner name in the header. Navigation links use small, softly filled active/hover states with a small dot below the current section; no outline or divider is added around each link. The footer retains the year without repeating the owner name. Header vertical padding changes from (8px) to (10px). Experience padding changes from (16px) to (20px). Footer content and contact links wrap naturally. The breakpoint does not turn the reading flow into a grid.

Interactive links and project triggers have a minimum height (44px); icon controls are (44px) square. Below 640px, details open as a full-width bottom sheet with rounded top corners (16px), a maximum height (90svh), 24px content padding, and bottom safe-area padding. The header stays visible while the body scrolls independently. From 640px, details remain a centered dialog with a maximum width (640px), viewport-relative width (`calc(100% - 2rem)`), maximum height (85svh), and 32px padding.

## Elevation & Depth

Page content stays flat. Soft neutral fills distinguish experience entries; fine dividers separate project rows and the page chrome. Only the native detail dialog uses the Tailwind extra-large shadow and a dark backdrop. The exact shadow and transition values live in the sidecar because they are outside the frontmatter schema. No transform animation or entry choreography is implemented; color state changes use the standard short transition (150ms).

**The Flat Reading Rule.** Use tonal fills and spacing for ordinary content; reserve raised depth for the dialog.

## Shapes

Text links and focusable text controls use small corners, experience entries use softly rounded corners, and the dialog uses the larger radius recorded in frontmatter. Theme and close controls are circular. Project rows are unboxed. The small arrow is a simple current-color line icon (14px); the theme icon is (16px), and the close icon is (20px). There is no portrait, decorative illustration, or image gallery. A real supplied detail image can use the existing rounded, contained, widescreen image slot.

## Components

### Navigation and text links

Quiet, readable anchor navigation. The header stays at the top while scrolling, on an opaque page-colored surface, above page content and below native dialogs. It contains About / Experience / Skills / Projects anchors and the theme switch. Writing pages use the same single-row navigation without an owner name. On the homepage, mobile navigation stays in one row and the name stays out of the header; on desktop, the name fades in as the About heading moves behind the sticky header and navigation glides right to make room. The current section uses a softly filled link with a small blue marker and `aria-current="location"`; Writing uses `aria-current="page"` on its routes. Highlighting follows scrolling, while explicit anchor navigation remains selected until the next scrolling interaction. The header's measured height plus 24px supplies anchor clearance, including when mobile navigation wraps. Inactive links gain a quiet background on hover. All focusable controls use an outline (2px) with offset (4px). The skip link becomes visible on keyboard focus.

Professional contact links use verified URLs. Project links render only when an actual URL is supplied; unavailable links are omitted.

### Theme control

A circular, neutral icon button cycles system → light → dark → system. It defaults to system preference and persists an explicit manual choice. Its accessible label announces the current and next theme. Hover adds the neutral control fill; keyboard focus uses the shared outline.

### Project rows

The full project row is a detail button, keeping a generous click target without extra space around the title. A small arrow accompanies the title; summary and muted, dot-separated technology tags sit below it with (4px) gaps. Rows have vertical padding (12px per side), summary size (13px) and line height (24px), and tag line height (20px). A fine lower divider separates rows, with no divider on the last item. The title wraps; there is no thumbnail in the list. All seven retained projects appear in one visible list, with current product contributions first and no Earlier projects disclosure or age tag.

### Experience entries

A full-width filled button contains the role title, a wrapping date, a smaller semibold role subtitle, summary, and an explicit View details cue. Dates align opposite the title when space permits. Hover deepens the same neutral fill. Activation opens the shared detail dialog. Empty experience data has a simple muted text fallback.

### Native detail dialog

An accessible `dialog` uses a labelled heading, a circular close button, summary, description, and muted tags. Main product descriptions use compact subsection headings to distinguish scope, contribution, and engineering. Projects add real product, vendor, LinkedIn, and repository links when provided; experience adds its period and supplied product links. The close button receives initial focus, Escape and backdrop clicks close the dialog, background scrolling is locked while it is open, and focus returns to the trigger. Tab and Shift+Tab wrap at the first and last controls, alongside native background inertness. Project and experience links live in the fixed dialog header, above the independently scrolling body. Alluring Aura Scent and QuikCity use horizontal screenshot galleries with a shared image height (224px mobile, 256px desktop) and intrinsic image proportions. Native scrolling, partial next-image previews, and previous/next controls below the images provide navigation. Labels, instructions, and range/count remain available to assistive technology without extra visible text. Images sit 8px apart with no background frames or letterboxing. Arrow keys and Home/End also navigate, with reduced-motion preferences respected. Alluring uses mobile captures; QuikCity mixes desktop and mobile views. Gallery keyboard focus participates in the dialog focus trap.

The introduction's contact row includes a Download résumé link with the same text-link styling and touch target. Social cards and the AA favicon use the licensed Cabinet Grotesk face and existing neutral/blue palette; they add no new decoration to the reading page.

## Do's and Don'ts

### Do:

- Do preserve the narrow vertical reading flow and compact name heading.
- Do use muted text for metadata and blue for actionable project titles and links.
- Do retain visible keyboard focus and generous touch targets.
- Do follow system theme by default and honor an explicit manual choice.
- Do keep professional claims traceable to the owner's supplied material.

### Don't:

- Don’t introduce a large hero, decorative numbering, or a default screenshot card gallery.
- Don’t turn experience hover into a takeover; activation opens details.
- Don’t invent a portrait, work history, credentials, screenshots, or working URLs.
- Don’t import the reference owner’s identity or content.

### Supporting copy scale

Project and experience summaries, detail descriptions and subtitles, About copy, and skill rows use 13px regular text with 24px leading. Experience role subtitles retain 13px semibold with 20px leading. Titles, section headings, the introduction lead, and 12px metadata retain their hierarchy.

### Full-screen image viewing

Screenshot buttons open a native full-screen dialog above the project details. Images retain their proportions; mobile images can scroll vertically at full width. Horizontal native swipe, previous/next buttons, and Left/Right/Home/End keys navigate the collection. A close button and Escape return focus to the selected thumbnail. A small image label and position count are the only supporting text. All native scrollbars are hidden via Tailwind utilities on the root and descendants; native scrolling remains enabled.

### Article product screenshots

Articles can reuse the project screenshot gallery. Alluring Aura Scent shows five portrait captures (storefront, catalogue, product details, categories, search) at their intrinsic proportions, with horizontal scrolling and the existing full-screen viewer. A brief caption explains enlargement. Social metadata uses the mobile storefront capture and its actual dimensions.

Article footers show up to three published recommendations as plain title/summary links, prioritising shared topics and then recency. The section is omitted when there are no other published articles.

### Consolidated introduction and contact actions

About now anchors to the introduction, first in navigation. The lead names web apps, mobile apps, command-line tools, and backend systems, followed by one compact paragraph about engineering experience. The separate career-transition story is removed; Education remains its own compact section below skills. GitHub, LinkedIn, Email, and Download résumé are square-cornered filled links with consistent 16px SVG icons, 44px minimum height, and 8px gaps. They form two columns on mobile and wrap in a row on desktop.

The introduction lead is a short sentence at 13px semibold with 20px leading, matching experience role typography rather than display copy.

The role/location line uses 13px regular with 20px leading. A 24px gap separates identity from the 13px semibold introduction sentence, whose 24px leading matches adjacent prose. The lead emphasizes delivering products rather than repeating the engineering job title.

### Engineering hiring emphasis

The introduction explicitly includes backend systems. The four main product summaries expose verified engineering contributions: transactional stock and payment verification, settlement and payout workflows, encrypted secret sharing and entitlements, and recurring billing migration. Experience follows those four products; the other three projects remain fully visible in More projects below Experience. Scroll tracking maps More projects to the Projects navigation item. Substantive introduction copy, project/experience summaries, and dialog descriptions use 14px regular with 24px leading; introductory emphasis, role subtitles, and section labels retain 13px, and metadata retains 12px.

### Writing type scale

Writing index and article page titles use the homepage’s 22px semibold, 28px leading, and -0.01em tracking. Index introductions, post summaries, article summaries, related-post summaries, and unavailable-post descriptions use 13px regular with 24px leading. Author and date metadata use 12px with 20px leading. Linked article titles stay 16px medium, matching project titles. Long-form article prose remains 16px with 28px leading, with 20px semibold section headings for reading hierarchy.

### Article reading hierarchy refinement

Article titles have their own reading scale: 24px semibold/32px leading on mobile and 28px/36px on desktop. The summary is a 17px/28px lead with stronger contrast than metadata, above 16px/28px body prose. Author/date metadata is 13px/20px. Writing index supporting text stays compact. The article gallery hint sits to the left of the arrow controls in one aligned footer row; the hint can wrap on narrow screens while controls keep 44px targets. Other project galleries do not gain extra hint text.

### Article return navigation

The All writing link lives in a sticky article navigation row below the measured site header. It begins in normal document flow and pins when scrolled past. The row uses the page background to keep text legible over scrolling prose, retains a 44px link target, and ends with the article. Its offset updates with the header’s responsive height.

### Reading-time metadata

The Writing list places a muted “N min read” label beside the publication date. Article headers repeat the same estimate beside the author/date. Estimates derive from the current Markdown body, including code text, at 200 word units per minute, rounded up with a one-minute minimum. Link destinations, image markup, and code-fence labels are excluded. The accessible label identifies the value as estimated; no new badge, border, or callout is added.
