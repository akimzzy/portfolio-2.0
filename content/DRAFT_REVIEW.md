# E-commerce article review

Current status, 19 October 2026: all eleven written articles are approved and published in the application. No article drafts remain. The entries below preserve the historical review sequence; later publication updates supersede earlier pending gates. The encrypted-sharing topic is a proposal, not an unfinished draft.

The table below lists the e-commerce articles that went through the original review queue. Its old “Draft” label and review questions describe their state at that time; all are now published. The deployment article's later scoped live rehearsal is recorded in the final entries.

| Order | Article | Original review question |
| --- | --- | --- |
| 1 | [Building an IndexedDB catalogue that stays in sync](posts/indexeddb-catalogue-synchronisation.md) | Is the explanation of local catalogue synchronisation clear and faithful to the intended workflow? |
| 2 | [Keeping catalogue caches fresh in Next.js](posts/nextjs-catalogue-caching.md) | Are the cache boundaries and freshness limits understandable without reading article 1? |
| 3 | [Deploying Next.js to Cloudflare Workers with OpenNext](posts/deploy-nextjs-cloudflare-workers.md) | Can the account-backed example be reproduced with the stated versions/configuration before publication? |
| 4 | [Handling duplicate Paystack payment notifications](posts/duplicate-paystack-notifications.md) | Does the distinction between repeated notifications and a second actual payment read clearly? |
| 5 | [Keeping inventory consistent across online and in-store sales](posts/shared-inventory-online-instore.md) | Is the shortage policy accurately explained without implying every store should use it? |
| 6 | [Calculating naira prices without floating-point errors](posts/naira-prices-integer-kobo.md) | Are the unit, rounding, and bounds examples easy to follow? |
| 7 | [Importing a product catalogue from a spreadsheet](posts/spreadsheet-product-imports.md) | Does the preview-to-commit workflow explain both admin use and concurrent catalogue changes? |
| 8 | [Sending order emails with Resend: retries and recovery](posts/reliable-order-emails-resend.md) | Can a reader choose and reason about a scheduled sender or durable queue without depending on this project? |

## Checks completed

- Reconciled implementation claims with the relevant store modules and the owner's supplied account.
- Checked external API/platform behavior against primary documentation; links appear beside the relevant explanations.
- Verified all frontmatter through the existing article loader. The remaining deployment draft is excluded from the published article list and recommendations.
- Checked JavaScript, TypeScript, and JSON snippet syntax. Ran the pure arithmetic/allocation/cache-key examples and mocked email success/failure cases using `node scripts/check-draft-examples.mjs`.
- Reviewed each article independently for definitions, examples, scope, failure handling, and unsupported outcomes. No fabricated measurements, incidents, credentials, or private admin screenshots were added.

## Verification limits and publication gates

**Historical note:** The pending-draft and publication-gate statements below describe the original review queue and have been superseded. As of 19 October 2026, all eleven written articles are approved and published in the application; no article drafts remain. The deployment guide's scoped live rehearsal was completed before its publication. See `WRITING_REVIEW.md` for the current article-by-article evidence and limits. This file is retained as the review history, not the current status board.

The example checks do not constitute a live Cloudflare deployment, real Paystack payment, actual email delivery, or concurrent PostgreSQL integration test. The IndexedDB transaction excerpt was reviewed against the implementation/API, not exercised in a browser database by this check. SQL illustrates documented transactions or provides demo setup; it has not been run against a new hosted database here.

The deployment tutorial needs an account-backed rehearsal with its exact dependency set before publication. The other articles are implementation walkthroughs with bounded illustrative examples; their verification sections describe the corresponding integration checks rather than claiming they were all executed during drafting.

Review voice/accuracy one article at a time. On approval, resolve that article's remaining verification needs, choose its publication date, and move it to `content/posts/` with `draft: false`. Update the overview's relevant paragraph with a descriptive link only after the target exists. Sibling links remain optional depth, never prerequisites.

The shared engineering cover is an unchanged copy of the existing AA/Cabinet Grotesk sharing asset. It is a neutral draft cover, not a screenshot of a feature described by these articles.

## First article editorial pass — 19 October 2026

The IndexedDB draft was shortened around one admin catalogue workflow. Removed schema-version and image-cache digressions, repeated introductions, and abstract wording. Kept the data/cursor transaction example, defined generation and revision locally, and retained deletion, interrupted sync, stale-copy, and server-authority boundaries. Documentation links offer optional depth; no earlier article is required. It remains unpublished and awaits owner review. Other drafts are unchanged in this pass.

## IndexedDB workflow clarification — 19 October 2026

Reframed the first article around the owner's clarified benefit: persistent catalogue reuse across visits, local search/filter/order/display pagination, and smaller revision/change requests. Verified current constants: download chunks 15, visible list increments 25. Added the Refresh button, lifecycle-triggered checks, five-minute ordinary freshness threshold (not periodic polling), retry backoff, database revision/entity tracking, and explicit stale-data/rebuild boundaries. Replaced the lower-level chunk-writing excerpt with a short local-search example. Four managers and 5,000 products are illustrative scope, not measured usage. No publication or application-code change.

## Revision-check budget and concision pass — 19 October 2026

The first article now has a dedicated explanation of small revision responses versus actual database-query cost, versions maintained at write time, freshness reuse, sync coordination, manual refresh, and retry delays. Search/filter/scroll events must not produce per-interaction revision traffic. Added a Network-panel verification workflow and kept chunk-size tradeoffs explicit. Removed the product name and duplicate generalisation; the anonymous perfume-store example carries the context without any product or sibling-article prerequisite. Still unpublished.

## Approval and next article — 19 October 2026

Published the approved IndexedDB article with date `2026-10-19`, added a contextual link from the overview, and updated the overview's modification date. The next catalogue-caching draft received the same editorial pass: anonymous self-contained example, shorter key code, less infrastructure detail, explicit revision-query cost/freshness, and clear browsing-versus-checkout boundaries. Caching remains unpublished. The IndexedDB check interval is not presented as a storefront recommendation.

## Final caching editorial pass — 19 October 2026

Rechecked the result-cache and versioned Next.js cache modules. Defined server-side reuse in the opening, removed the unexplained reference to a different article's five-minute admin policy, clarified that stored-object expiry is distinct from deletion, and replaced selective-invalidation wording with the actual coarse catalogue/stock dependency groups. Explained global-stock-revision churn and already-open browser pages without implying new implemented features. Retained one key example and one stock-change scenario. Caching remains unpublished.

## Caching approval and deployment review — 19 October 2026

Published the approved caching article and linked it from the overview. Reviewed deployment for a complete independent path: defined bindings, retained essential configuration/SQL, removed named-product detours, clarified local versus deployed connections, added local environment setup, made deployment rebuild first, and bounded request-owned database client waits/cleanup. Rechecked official OpenNext, Supabase/Hyperdrive, and node-postgres guidance. The tutorial remains unpublished and still needs its account-backed rehearsal; syntax checks do not replace that verification.

## Deployment scope correction — 19 October 2026

Reworked the draft as a general OpenNext deployment path rather than a reconstruction of the store. Removed mandatory Tailwind, project-specific version pins, database requirements from prerequisites, and named-product context. Readers can deploy/verify a database-free app first, using App Router or Pages Router. Supabase/Postgres/Hyperdrive remain a complete optional example, with an explicit branch for MongoDB, Firebase/Firestore, another SQL provider, or no database. Existing styling/configuration choices are preserved. Runtime compatibility is not assumed for arbitrary packages. The optional database route and account-backed deployment still need rehearsal before publication.

## Deployment approval and payment review — 19 October 2026

The owner approved the deployment article editorially. It remains in drafts until the previously identified account-backed rehearsal is complete; no live deployment is claimed. Reviewed the next payment article against the verification, settlement, adapter, and webhook implementation and current Paystack/PostgreSQL documentation. Added a standalone bottle-purchase example, defined idempotency and local settlement, clarified units and server-created payment attempts, separated optional verification coordination from transactional correctness, and included finite-retry/reconciliation limits. The payment article remains unpublished for review. Its concurrency checklist is not a claim that hosted payment or database integration checks were executed here.

## Payment approval and inventory review — 19 October 2026

Published the approved payment article in the application with date `2026-10-19` and added a contextual link from the overview. No external site deployment occurred. Reviewed inventory against allocation helpers, stock constraints, online settlement, walk-in sale transactions, and current PostgreSQL documentation. Clarified available-for-allocation stock versus physical stock, online shortages versus walk-in rejection, and competing-transaction outcomes. Corrected the bundle section to an illustrative extension: the availability helper exists, but an integrated bundle checkout was not found. Retained transaction/retry requirements and a concrete database-test outcome without claiming those integration tests were run. Inventory remains a draft for owner review.

## Payment clarity and table-rendering correction — 19 October 2026

Revised the published payment article following owner feedback. The narrative now follows one order/reference, defines callback, webhook, attempt, transaction, and idempotency at their first useful appearance, and walks through simultaneous requests in order. Replaced abstract headings and the incomplete SQL sketch with concrete outcomes. Retained verification, additional-payment review, raw-body signature validation, durable acknowledgement, finite retries, and optional coordination boundaries. Added Markdown table parsing and responsive, keyboard-accessible table presentation across article pages, correcting the literal pipe-delimited text shown in the owner's screenshot. The inventory draft was not advanced or published in this pass.

## Inventory engineering and editorial review — 19 October 2026

Renamed the inventory draft and focused it on two sales competing for two bottles. Removed the bundle tutorial. Verified channel policies, fulfilment shortage checks, request identities, stock-adjustment fingerprints, and database constraints against the implementation. Made available-versus-physical stock, transaction atomicity, lock ordering, Read Committed assumptions, stronger-isolation retries, and uncertain-response recovery explicit. Distinguished recommended request-payload validation from guarantees actually shown by the walk-in implementation. Added conditional updates as a bounded alternative and a concrete two-connection test plan. Executed only the illustrative allocation examples and Markdown checks; no live concurrent database test is claimed. The article remains unpublished pending owner review.

## Inventory reader-comprehension pass — 19 October 2026

Read the inventory article as a first-time reader. Added the concrete stale-read/overwrite failure before introducing the solution. Defined transaction, row lock, movement, and deadlock at first use; clarified that the allocation helper only returns values. Replaced “acquisition orders” and fingerprint/claim shorthand with concrete actions. Removed the conditional-update detour and moved isolation details out of the main example. Made the distinction between coordinating writes and choosing a shortage policy explicit. Preserved transaction, retry, and implementation boundaries. The article remains a draft.

## Inventory approval and pricing review — 19 October 2026

Published the approved inventory article in the application, dated `2026-10-19`, and added contextual links from the overview and public-cache article. No external deployment occurred. Reviewed the pricing draft against the pricing helpers and stored money types. Reframed it around one three-item purchase, clarified the discount-down policy versus rounding the total, distinguished the illustrative parser from the actual form implementation, and completed the input-to-display example with exact integer formatting. Added boundary checks for formatting, parsing overflow, and zero discount. Pricing remains unpublished for owner review; deployment still awaits its live rehearsal.

## Portfolio-wide reader, engineering, and factual review — 19 October 2026

Reviewed all nine written articles in the requested order, corrected findings, and rechecked the affected explanations. The article-by-article results, source evidence, future review workflow, and remaining integration limits are recorded in `WRITING_REVIEW.md`. Publication states did not change. Removed the arbitrary 600-word test threshold; a short useful article does not need padding. Returned to this cross-article review instead of advancing the pricing draft to approval or moving to another article.

## Pricing approval — 19 October 2026

Published the approved pricing article in the application with date `2026-10-19`, preserving its reviewed body. Added one contextual optional link from the payment article’s amount-check example and updated publication checks. All three editorial passes and local examples were already complete. Imports and email remain private, reviewed drafts awaiting owner approval; deployment retains its live-rehearsal gate. No external deployment occurred.

## Final import review and approval — 19 October 2026

At the owner’s explicit direction, performed another reader, engineering, and factual pass, corrected remaining clarity issues, and published the import article dated `2026-10-19`. Defined SKU and atomicity, filled in the omitted example fields, explained changed-catalogue outcomes at commit, and supplied a concrete two-product/three-variant test expectation. Rechecked create-only/skip semantics and staged validation/commit against the implementation. Database integration checks remain instructions, not claimed executions. Added an optional overview link and updated publication checks. No external deployment occurred.

## Email architecture revision — 19 October 2026

Replaced the store-specific after()/manual-retry walkthrough with a general notification delivery guide. A scheduled outbox sender and an outbox-to-queue relay are concrete alternatives; after() is an optional immediate attempt with independent recovery. Added submission-gap recovery, consumer acknowledgement, token-protected claims, bounded retry ownership, provider error-code handling, and obsolete-message checks. Completed reader, senior-engineer, and factual reviews recorded in WRITING_REVIEW.md. Updated mocked sender checks; no live delivery infrastructure was exercised. Remains unpublished.

## Email approval and next brief — 19 October 2026

Published the approved general email guide in the application, dated 2026-10-19, and added contextual links from the overview and payment article. The Cloudflare deployment guide is the only remaining full draft and retains its live-rehearsal gate. QuikCity is next in the new-story backlog; confirmed facts and the proposed scope are recorded in quikcity.notes.md. No narrative or implementation details have been invented to fill its missing firsthand context.

## QuikCity case-study draft — 19 October 2026

Created drafts/building-quikcity-around-whatsapp.md from the owner’s new account and confirmed portfolio facts. Completed consumer, senior-engineer and factual reviews, with evidence and corrections in drafts/quikcity.notes.md. Focused the piece on familiar ordering, vendor trust, serviceable customer reach and local rider availability; no guessed WhatsApp/API or settlement tutorial. No new article was published. Deployment retains its live-rehearsal gate.

## QuikCity approval — 19 October 2026

The owner approved the reviewed article and screenshot gallery. Moved it to posts/building-quikcity-around-whatsapp.md with date 2026-10-19. It is included automatically in Writing and published-only recommendations. Nine articles are now published in the application; deployment remains private pending its live rehearsal. No external deployment is implied.

## Live recurring-billing migration draft — 19 October 2026

Created drafts/migrating-live-recurring-billing.md after the owner supplied the add-on/production-permissions context and explicitly requested general expert guidance. Recommendations cover preserved pricing/access, provider-owned history, scheduler handover, authorization readiness, stable attempts, controlled production pilots, rollback limits and reconciliation. Completed reader, senior-engineer and primary-source factual reviews; evidence and verification limits are in the companion notes. No live payment or migration was executed. Private pending review; deployment retains its separate rehearsal gate.

## Production-data migration scope correction — 19 October 2026

The owner requested a general guide rather than a billing migration article. Replaced that private draft with drafts/migrating-production-data-safely.md. It covers recovery preparation, maintenance versus online moves, compatibility, controlled copying, validation, writer handover, and rollback after new writes. Billing remains a brief real-world context and external-side-effect example. All three reviews were repeated; source notes record the scope change and test limits. Two drafts remain unpublished (this guide and deployment).

## Production migration practical pass — 19 October 2026

Revised the general migration draft into a concrete customer/order walkthrough after the owner accepted that improvement. Maintenance-window path first; online CDC as an alternative. Added go/no-go evidence and a return procedure that preserves the destination’s accepted changes, with a separate data-corruption boundary. Three reviews and local publishing/example checks completed. Remains private for owner review.

## Migration example restored — 19 October 2026

The owner clarified that broad migration guidance should retain Flutterwave-to-Paystack as its worked example. Replaced the customer-database walkthrough with subscription S-42 while keeping wider lessons for other production systems. Repeated reader, engineering and factual reviews; current evidence is appended to the companion notes. The draft remains private and has not been approved by this instruction.

## Migration destructive-risk review — 19 October 2026

Completed the requested sequential audit, with findings/fixes per section in migrating-production-data-safely.notes.md. Added missing safeguards and removed misleading concurrency/restore assumptions. Three review passes repeated; local article checks pass. The guide remains a recommended plan requiring datastore-specific rehearsal, not a certified execution script. No production data was touched; publication still awaits approval.

## Production migration publication — 19 October 2026

The owner approved the final reviewed production-data migration guide. Moved the unchanged article to posts/migrating-production-data-safely.md with publication date 2026-10-19. Ten articles are now published in the application; the deployment guide is the sole remaining private draft and retains its live-rehearsal gate. Earlier entries record historical review states. No production database operation or external site deployment was performed.

## Deployment final review and publication — 19 October 2026

The owner explicitly requested completion/publication within the portfolio and no further external account access or deployments. Completed the reader, senior-engineer and primary-source factual reviews without accessing accounts. Published posts/deploy-nextjs-cloudflare-workers.md, dated 2026-10-19, and linked it from the overview. The article preserves the optional Supabase example and explicitly identifies it as documentation-reviewed rather than live-tested. The earlier live-database rehearsal gate was superseded by the owner's instruction and bounded verification disclosure; no live database result is claimed. All eleven written articles are now published.

Corrections: supported compatibility date, static-asset caching rule, build versus runtime secrets, driver minimum, local direct connection versus deployed Hyperdrive, test-only SQL scope, statement/client timeout distinction and concrete JSON expectations. Local rendering/metadata/snippet/lint/build and site checks pass; desktop and 390px checks show no page-wide horizontal overflow. No external cleanup was performed; the earlier temporary demo is a separate outstanding cleanup item.


## Authorised live verification — 19 October 2026

The owner later authorised the scoped account-backed rehearsal. The separate demo now passes live homepage/assets/health checks and real Supabase/Hyperdrive product reads, changed-price visibility and restoration. Verified SELECT-only demo-table grants. Local database preview also passes using the documented session pooler and provider CA with certificate validation enabled. Corrected missing local binding initialization and conditional pg-cloudflare files in the published instructions. Repeated reader, senior-engineer and factual review; evidence, encountered failures, sources and test limitations are recorded in drafts/deploy-nextjs-cloudflare-workers.notes.md. No existing production data or connections were changed.
