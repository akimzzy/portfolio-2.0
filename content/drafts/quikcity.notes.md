# QuikCity article brief

Editorial notes only; not an article or a publication-ready draft.

## Proposed reader outcome

Understand how a customer ordering flow through WhatsApp connects to vendor operations, using QuikCity as a concrete case study. Keep this separate from a general WhatsApp API tutorial unless verified implementation details support that scope.

## Confirmed context

From the owner-confirmed portfolio data and CONTENT_SOURCES.md:

- Akeem started, designed, built, and launched QuikCity.
- Customers order through WhatsApp without downloading a dedicated customer app.
- Vendors use app.quikcity.co.
- Monnify virtual accounts support payments, vendor settlements, and rider payouts.
- More than 30 vendors joined; over 100 customer interactions were recorded. These are not order/customer counts or independently measured results.
- Courier/package delivery was added alongside food ordering.

## Owner account supplied — 19 October 2026

The owner described limited local access/visibility for smaller eateries, familiar WhatsApp use, optional web ordering, WhatsApp notifications for vendors and riders, and customers initiating orders via WhatsApp. The availability wording about popular delivery platforms was ambiguous; the draft describes a perceived local gap without asserting that competing services were absent.

The principal difficulties were vendor trust because the platform receives payment before the vendor, customer acquisition within a genuinely serviceable area, local rider readiness, and funding constraints on simultaneous expansion. The approximately five-minute statement is treated as a rider-availability ambition, not a measured dispatch result or end-to-end delivery promise. The draft avoids demographic assumptions about who cooks, general African WhatsApp adoption statistics, and unverified claims about advertising targeting capabilities.

## Draft scope and evidence boundary

The article is a product case study, not a WhatsApp integration, payment-security, or dispatch tutorial. Existing owner-confirmed portfolio facts support ownership, Monnify integration and adoption figures; the new firsthand account supports motivations and operational difficulties. The lunch/nearby-neighbourhood examples are illustrative, not reported incidents. No API, automation, settlement timing, revenue, conversion rate, refund flow, or operational guarantee is inferred.

Public web check: the customer URL resolves with the title QuikCity | Order Food on WhatsApp; the text extractor returned no body. The vendor URL could not be accessed by that tool. Neither result is claimed as an end-to-end product test. The vendor URL and functionality are supported by the owner's account and existing portfolio evidence.

## Review results

1. Reader: standalone opening explains the local problem, ownership, customer and vendor surfaces. Concrete examples connect ordering with fulfilment; no other article is required. Kept a case-study title and scope rather than promising implementation instructions.
2. Senior engineer: checked proportionality and separation of interface, payment handling, trust, coverage and actual fulfilment capacity. No invented architecture or guaranteed notification/payment behaviour. Rider readiness and delivery duration remain distinct. Removed a sentence attributing an unsupplied personal change of thinking.
3. Facts/practices: mapped each personal and product claim to the supplied account or existing owner-confirmed sources. Retained customer interactions as interactions, not orders. Narrowed competitive and geographic claims and kept hypothetical examples clearly illustrative. Repeated reader review after corrections. No code integration tests are warranted by this prose-only product story.

## Review gate

Draft created from the supplied account. Reader, senior-engineer and factual reviews completed with the corrections recorded above. Rendering, metadata and draft-exclusion checks must pass before presenting it. Keep private until owner approval.

## Screenshot and final approval review — 19 October 2026

Visually inspected the four existing project screenshots and reused them via the article gallery metadata. Labels distinguish public customer pages and vendor introduction from any authenticated app or chat transcript. Reused the desktop hero, unchanged, for sharing metadata. Read the draft end to end again: cut the repeated access sentence and redundant final recap.

Reader pass: clear opening, locally explained product surfaces, illustrative examples and a specific operational takeaway; screenshots support the product context without interrupting the narrative. Senior-engineer pass: scoped as a product case study, with no invented automation, dispatch, payment verification or delivery guarantees; target rider readiness remains separate from total delivery time. Factual pass: narrative checked against the supplied account and confirmed portfolio facts, screenshots checked visually against their labels and source ledger. Marketing imagery is illustrative evidence of the interface, not evidence of delivery performance or settlement correctness. No new external API claims were introduced. Remains private for approval.

## Owner approval — 19 October 2026

Approved after the screenshot and final review pass; article moved to ../posts/building-quikcity-around-whatsapp.md with its publication date. Historical private-draft notes above describe the earlier review state.

## Customer-link update — 20 October 2026

Added the customer site and direct customer-order WhatsApp link to the published case study. Verified that the live site's **Buy food** action and FAQ/footer point to the same ordering number, +234 704 850 5626. The separate +234 814 811 0894 number is support, so it is not used as the order link. Re-read the paragraph for clarity and checked that the new links do not imply a delivery-time or payment guarantee.
