# Writing review process and current results

Current publication status, 19 October 2026: eleven approved articles are published in the application; no article drafts remain. The deployment example later received an authorised, scoped live rehearsal, recorded below and in its companion notes. Earlier review and publication gates are historical entries superseded by the later outcomes.

The earlier review below covered the then-current nine posts and is retained as the audit trail. The current public set contains eleven articles; the two later stories and their reviews are recorded in the history below.

## Required review order

Apply these passes to every draft and substantive revision, alongside the existing editorial, rendering, metadata, source, and example checks:

1. **Reader review.** Read from the title through the ending as someone arriving directly from search. State the intended audience and article type. Check the promised outcome, standalone context, first-use definitions, a coherent example, useful headings, length, and optional rather than required sibling links. Remove repetition and tangents. Do not add a word minimum.
2. **Senior engineering review.** Trace the example through its inputs, state changes, outputs, and failure paths. Check assumptions, transaction/concurrency boundaries, authorization, units, stale state, retries, operational cost, and recovery where relevant. Distinguish the actual implementation from an illustrative helper or a recommended improvement. Keep explanations proportionate to the problem; do not turn a focused article into a catalogue of every alternative.
3. **Factual and best-practices review.** Recheck the revised text against implementation evidence, the owner's account, and current primary documentation for external behavior. Verify arithmetic, commands, examples, terminology, runtime/version assumptions, and the scope of guarantees. Do not describe unexecuted checks as passed integration tests. If this pass changes the explanation materially, repeat the affected reader and engineering checks.
4. **Existing completion checks.** Run `npm run check:writing`, `node scripts/check-draft-examples.mjs`, lint when code changes, and relevant site/build checks. For every code example, say whether it is a complete file or a fragment, where it belongs, what existing code it assumes, and whether it is runnable on its own. Keep metadata and dates accurate, drafts private, and in-text links pointed at published targets. Check actual desktop/mobile output before publication. Owner approval remains a separate publication step.

A pass records that the article's claims are appropriately supported and bounded. It is not a claim that every described production integration has been executed during review. When a live result is essential to a tutorial's publication readiness, retain that separate gate explicitly rather than hiding it behind an editorial pass.

## Results after corrections

Audience: software engineers with basic application-development knowledge. Focused articles define their domain terms; none requires reading another post. The overview is a build story, deployment is a procedural tutorial, and the remaining posts are focused implementation walkthroughs.

| Article | Reader | Engineering | Facts / practices | Result and changes |
| --- | --- | --- | --- | --- |
| Building a Next.js E-commerce App: Alluring Aura Scent | Pass | Pass | Pass | Preserved first-person project story and owner-supplied motivations/feedback; shortened repeated learning summary. No measured savings, production count, or fixed hosting bill invented. Implementation claims checked against the store and existing provenance. |
| Building an IndexedDB catalogue that stays in sync | Pass | Pass | Pass | Defined cursor; made five-minute freshness behavior explicitly implementation-specific. Checked 15-record chunks, 25 visible records, persistent generations, revision/delta boundaries, retry policy, stale-data authority, and rebuild/account guidance. Local search example remains an illustration, not the entire sync engine. |
| Keeping catalogue caches fresh in Next.js | Pass | Pass | Pass | Defined revision and hit/miss; distinguished unavailable source data from a valid empty catalogue. Checked versioned keys, broad stock invalidation, lookup cost, promotion time boundaries, snapshot limitations, and R2 fallback versus HTTP caches. No promise of immediate updates to an open page. |
| Handling duplicate Paystack payment notifications | Pass | Pass | Pass | Kept one order/reference example; clarified returning a stored successful outcome before another provider call. Added the isolation assumption to concurrent processing. Checked signature, verification, additional-payment review, finite retries, transaction boundaries, and optional claim limits. |
| Keeping inventory consistent across online and in-store sales | Pass | Pass | Pass | Retained approved reader revision without unnecessary rewriting. Rechecked available versus physical quantities, partial online allocation versus walk-in rejection, atomic writes, lock order, uncertain-response recovery, and two-connection test expectations. Recommended guarantees remain distinct from source-proven behavior. |
| Deploying Next.js to Cloudflare Workers with OpenNext | Pass | Pass | Pass | Published on 19 October 2026. Base app and optional Supabase/Hyperdrive read path built, previewed, and deployed in an isolated demo. Later scoped live verification confirmed product reads, changed-price visibility with query caching disabled, restoration, read-only grants, and local TLS-verified preview. Limits and full corrective notes are recorded in the final entry and companion notes. |
| Calculating naira prices without floating-point errors | Pass | Pass | Pass | Checked the complete input/calculation/display flow, integer bounds, explicit discount-down policy, zero/full discounts, and database boundaries. Fixed strict input validation for trailing newline/whitespace. Executed exact-result, overflow, rejection, and maximum-value formatting examples. |
| Importing a product catalogue from a spreadsheet | Pass | Pass | Pass | Added a concrete create-only outcome, narrowed the illustrative table, defined staging, and stated existing-price/stock behavior. Corrected staged error reporting: field-invalid rows do not also undergo cross-row checks immediately. Verified server revalidation, owner/expiry checks, final transaction/table locks, and retry outcome against the parser/service. No parser-execution or hosted commit test is claimed. |
| Sending order emails with Resend: retries and recovery | Pass | Pass | Pass | Reframed as a standalone delivery design, with a receipt as the worked example rather than the store implementation as a requirement. Compared scheduled outbox sending and a durable queue/relay; made after() optional. Reviewed atomic intent, submission gaps, duplicate delivery, claim tokens, bounded retries, provider error codes, payload stability, and acceptance versus delivery. Executed mocked HTTP outcomes, not a scheduler, queue, or real delivery. |
| Building QuikCity: local food ordering through WhatsApp | Pass | Pass for case-study scope | Pass against owner-supplied facts | Standalone product story grounded in the new account and confirmed portfolio facts. Distinguished rider-readiness target from delivery performance; removed demographic/general market claims and unsupplied recollections. No API, automated dispatch, settlement timing or measured conversion claims. Approved and published on 19 October 2026. |
| Migrating production data safely: validation, cutover, and rollback | Pass | Pass for planning-guide scope | Pass for documented claims | General migration guidance uses Flutterwave-to-Paystack as the worked example. Checked preserved access, mapping, backfill/concurrent changes, scheduler handover, stable attempts, validation gates and post-cutover recovery. No live migration or restore claimed; approved and published on 19 October 2026. |

### QuikCity customer links — 20 October 2026

Reader pass: added direct paths from the case study to the customer ordering site and WhatsApp, so readers can try the two customer entry points described in the article. Engineering pass: these links document product entry points only and make no new claims about payment, dispatch, or fulfilment guarantees. Factual pass: checked the site's **Buy food** flow and its ordering contact against the public QuikCity site and project link constants; kept the customer ordering number (+234 704 850 5626) distinct from the site's support number. No other article claims changed.

## Pre-deployment review — 19 October 2026

Reconciled the full public set against `content/posts/`: all eleven articles are approved and marked published in the application; there are no remaining article drafts. The reader, senior-engineering, and factual/best-practices results above and in the later QuikCity/migration entries remain the content review record. This does not claim that every external provider or production integration described was exercised; each article's evidence limits are stated above.

`npm run check:writing`, `node scripts/check-draft-examples.mjs`, `npm run lint`, and the production Webpack build passed. The site integration check initially caught a missing accessible reading-time label in the searchable writing list; that label was restored. Its rerun is recorded after completion. Public launch is still gated on selecting the domain/host and setting `SITE_URL`; no external deployment has happened.

### Deployment guide usability pass — 19 October 2026

Re-read the deployment guide as a Next.js developer who has not used OpenNext. Added an at-a-glance map of project-root files versus router files, clear instructions for complete files versus snippets, a documented optional migration shortcut for existing projects, and explicit stop points for apps without a database. Clarified where `public/_headers` belongs; how to preserve existing `next.config`, `package.json`, and Wrangler settings; what `workers-demo` and secret placeholders mean; and that `wrangler.local.jsonc` is a credential-bearing, ignored preview copy. Added complete database-enabled Wrangler examples and a copy-ready Pages Router database endpoint alongside the App Router version.

Added an accessible Copy control to every fenced code block across the writing section, with copied/error feedback and manual-selection fallback. `npm run check:writing` verifies every rendered fence has one control associated with its own block; the local HTTP check verifies the deployment page's count matches its source examples. The exact manual deployment sequence remains the live-tested path; the official migration helper is identified as a separate shortcut that still needs preview verification.

### Cross-article code-example usability pass — 19 October 2026

Checked the other published technical articles for code examples that left file placement or execution context implicit. Clarified that the Naira examples are ordered JavaScript fragments, where to run them for a quick check, and where pricing logic belongs in an application. Marked the catalogue-key and inventory-allocation examples as fragments and described their server-side context and required inputs. Explained where local IndexedDB search runs after records load, and where the Resend function belongs in a server-only provider module, including API-key handling. Other articles with no code examples were found to describe architecture or procedures rather than require file edits; no artificial file layout was added to them. `npm run check:writing` and `npm run lint` pass.

## Evidence checked

- Owner's supplied project account and `CONTENT_SOURCES.md`: motivation, personal ownership, deployment choice, and reported operational feedback. These are firsthand statements, not independently measured outcomes.
- Store modules: catalogue sync/policy/storage; public catalogue/cache/revision; payment verification/adapter/webhook and order settlement; walk-in sales, inventory adjustments, fulfilment and schema constraints; pricing helpers; import parser/contracts/staging/commit; notification scheduling/delivery/eligibility/templates and verified webhook handling.
- [IndexedDB usage](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) and [browser storage/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html), [isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), and [numeric ranges](https://www.postgresql.org/docs/current/datatype-numeric.html).
- [Paystack verification](https://paystack.com/docs/payments/verify-payments/) and [webhooks](https://paystack.com/docs/payments/webhooks/).
- [OpenNext setup](https://opennext.js.org/cloudflare/get-started), [CLI configuration](https://opennext.js.org/cloudflare/cli), [Cloudflare Supabase/Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/), [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), and [node-postgres client options](https://node-postgres.com/apis/client).
- [JavaScript integer limits](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER), [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt), and [CSV parser controls](https://csv.js.org/parse/options/).
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [setup](https://resend.com/docs/send-with-nodejs), [webhooks](https://resend.com/docs/webhooks/introduction), and bundled Next.js `after` documentation.

## Publication and verification status

Following the owner’s pricing and import approvals on 19 October 2026, eight approved articles are published in the application. The email article was approved and published on 19 October 2026. Deployment is editorially approved but stays private until its account-backed deployment/database rehearsal is complete. No external site deployment, payment, database import, or email send occurred in this review.

Rendering/code checks validate local examples and the publishing machinery. Mock email responses do not verify provider delivery; sequential allocation examples do not test concurrent PostgreSQL transactions; documentation review does not establish a successful Cloudflare deployment. Keep those distinctions in future review reports.

### Pricing publication update — 19 October 2026

The owner approved the pricing article after the recorded reviews. Moved it to `content/posts/`, assigned its publication date, and linked it from the payment example. This changes publication status, not the earlier review results or verification limits. Desktop and 390px mobile checks confirmed the article loads, code blocks scroll within the reading column, and the page has no horizontal overflow. No further draft was published.

### Import final review and publication — 19 October 2026

The owner explicitly authorised a final correction pass followed by approval/publication. Reader, engineering, and factual passes completed again: clarified terminology and example setup, verified current skip/conflict and staging/commit behavior, and made expected database-test outcomes concrete without claiming to have executed them. Published the reviewed article in the application. Desktop and 390px mobile checks confirmed semantic table rows, contained horizontal table scrolling, and no page-wide overflow. Email and deployment remain private under their existing gates.

### Email scope correction and three-pass review — 19 October 2026

Reader pass: removed repeated opening and implementation-specific limitations from the main teaching path; defined outbox, dispatcher, acknowledgement, lease, jitter, and dead-letter queue locally. Added two concrete delivery paths and selection criteria, with routine receipts versus time-sensitive sign-in email illustrating why latency matters. No sibling article or named project is required.

Senior engineer pass: checked atomic notification intent, database-to-queue submission gaps, redelivery, persist-before-ack boundaries, ownership-token completion, lease expiry, stable payloads, bounded provider deduplication, obsolete work, retry ownership, exhausted-work recovery, and monitoring. Clarified that after() can be omitted and that neither a queue nor an outbox guarantees exactly-once email. The article teaches a recommended design; it does not claim the store implements all of it.

Factual/best-practices pass: checked official AWS outbox/SQS, Cloudflare delivery/retry, Next.js after(), PostgreSQL locking, and Resend idempotency/errors/setup/webhook documentation. Corrected error handling to retain provider error codes and retry headers, and distinguished request throttling from quota exhaustion and the two idempotency-conflict cases. Repeated reader/engineering review after those changes. Local example and production Markdown-rendering checks pass. No live queue, scheduled task, database concurrency test, or email send was performed. The article remains private pending owner approval.

### Email publication — 19 October 2026

The owner approved the revised guide. Published it with its approval date and added optional contextual links from the overview and payment article. Rechecked article rendering, metadata, published-only recommendations, draft privacy, and executable examples. Only the deployment article remains private, pending its live rehearsal. QuikCity is at evidence-gathering stage, not a reviewed article; its reader/engineering/factual passes will follow drafting from the owner’s missing account.

### QuikCity case-study review — 19 October 2026

Drafted after receiving the owner’s context. Reader review checked a clear local problem, independent context and concrete illustrative examples. Engineering review checked the separation of customer entry point, vendor operations, money handling and local fulfilment constraints without inventing implementation guarantees. Factual review checked each personal claim against the new account and existing confirmed portfolio facts; narrowed ambiguous competitive-coverage wording and excluded unsupported statistics or demographic assumptions. The case study is not an integration tutorial. Full source boundaries and corrections are in drafts/quikcity.notes.md. Draft remains private; no new owner approval is implied.

### QuikCity screenshots and final review — 19 October 2026

Reused four visually inspected project captures and the existing accessible gallery/viewer. Added an unchanged desktop hero copy for sharing metadata; labelled public vendor introduction accurately. Repeated the reader, senior-engineer and factual reviews and shortened duplicate framing and the closing recap. No new implementation or market claims were introduced; screenshots do not imply verified operations. Rendering/metadata, example and lint checks completed. The article remains private pending the owner’s next approval.

### QuikCity publication — 19 October 2026

The owner approved the final article and its four screenshots. Published the unchanged reviewed prose/gallery with date 2026-10-19. Rechecked production Markdown rendering, publication metadata, examples, draft exclusion and lint; verified the published route and assets through the site checks. Nine articles are published in the application. The deployment guide remains the sole private draft under its existing live-rehearsal gate. No external site deployment occurred.

### Live billing migration review — 19 October 2026

Reviewed as a first-time reader, then as a senior engineer, then against primary provider/deployment-safety sources. Narrowed the Flutterwave restriction to documented NOAUTH charging, distinguished recommended steps from the owner’s partial recollection, and checked example arithmetic. Added invoice uniqueness, claim-expiry/unknown-outcome safeguards, credential protection and audited controls. Repeated affected passes after corrections. No new financial integration was executed; the draft remains private. Sources and full review details are in drafts/migrating-live-recurring-billing.notes.md.

### General production-data scope correction — 19 October 2026

Replaced the private billing-specific draft with drafts/migrating-production-data-safely.md at the owner’s request. Reader review removed provider setup/proration and made production records, concurrent changes and recovery the central narrative. Senior-engineer review added proportional migration options, snapshot/log alignment, batching/replay rules, deletes, source fencing, cutover validation and preservation of destination writes before rollback. Factual review checked current primary backup, CDC, validation, parallel-change and rollback-safety guidance. Repeated affected passes after adding a small-transaction option and explicit pre-cutover destination-change capture. Rendering/metadata/example checks and lint pass. No live migration was performed; remains private. Detailed evidence is in the matching notes file.

### Production migration practical pass — 19 October 2026

Rebuilt the guide around one A-to-B customer/order migration with a maintenance window, concrete gate evidence, and a full-snapshot return into a compatible fresh recovery database. C-42’s post-cutover address update carries the recovery example. Reader, senior-engineer and factual reviews completed again; added explicit distinction between an application/infrastructure failure with valid data and corruption requiring reconciliation. Online CDC is an alternative when rehearsal proves the pause unsuitable. No live database workflow was executed. Rendering/metadata/example checks and lint pass; the article remains unpublished.

### Restored migration worked example — 19 October 2026

Following owner clarification, kept the broad production-migration title and restored a Flutterwave-to-Paystack walkthrough using illustrative S-42. Each stage connects the billing example to wider live-data migration concerns. Repeated reader, senior-engineer and primary-source factual reviews; clarified initial authorization/setup-payment accounting, pending charge ownership and preserving paid-through dates after cutover. Recommendations remain separate from the owner's partial account. Rendering/metadata/example checks and lint pass. No live migration or charge is claimed; unpublished.

### Production-copy rehearsal clarification — 19 October 2026

Expanded migration preparation into an explicit recent-production-copy rehearsal, with isolated credentials/network actions, exact release testing, before/after S-42 checks, interrupted-run recovery and restore timing. Clarified snapshot freshness, configuration/load drift, separate backup versus test copy and the independent live-provider pilot. Reader, engineering and primary-source factual review completed; a passing clone test is evidence, not a guarantee for live execution. Production Markdown/metadata and existing example checks pass; no actual database clone or restore was performed.

### Migration sequential destructive-risk audit — 19 October 2026

Reviewed every section in order at the owner's request, then repeated the reader, engineering and primary-source factual reviews. Corrected pre-restore isolation, unexpected-target protection, partial-restore/fail-on-error assumptions, backup dependencies, recovery limits, concurrent migration runners, stale writer control, durable webhook acknowledgement, narrow/version-checked backfill, billing obligation/attempt ownership and post-cutover recovery into a separately validated destination. Explicitly states that a transaction alone does not prevent stale overwrites and clone success does not guarantee a live outcome. Section-by-section findings and sources are in the draft's companion notes. Publishing/rendering/example checks and lint pass; no live migration procedure was executed or certified. Remains unpublished.

### Production-data migration publication — 19 October 2026

Owner approved the final section-by-section reviewed guide. Published the reviewed content unchanged, assigned date 2026-10-19, and updated the approved-post assertions. Publication makes it available in Writing and published-only recommendations. Final publishing, example, lint, build and site checks completed; the checks verify the portfolio rather than executing any recommended migration. Ten articles are published in the application. The deployment guide remains private pending its live rehearsal.

### Deployment publication and scoped final review — 19 October 2026

Reader review: independent no-database path, optional styling/database branches, complete configuration and health-route example, local and deployed expected outcomes. Senior-engineer review: account/resource targeting, separate secrets/build values, no shared private caching, dedicated read-only DB role, separate local credential file, pooling/caching boundary and request-scoped cleanup. Factual review: current OpenNext setup/CLI/environment and Cloudflare Hyperdrive/Supabase/local-development/node-postgres references, plus node-postgres timeout semantics. Added a verification-scope paragraph with exact base rehearsal versions and no unexecuted DB claims. Repeated affected passes after fixes.

The owner authorised publication and explicitly limited work to the portfolio, superseding further account-backed testing. Published the guide with date 2026-10-19; no new external account access, deployment, or DB test occurred during this final pass. Local publishing/rendering/example/lint/build and HTTP checks pass. Desktop/default and 390px page widths remain contained; code and table render through the shared components. All written articles are now published.


## Authorised live verification — 19 October 2026

The owner later authorised the scoped account-backed rehearsal. The separate demo now passes live homepage/assets/health checks and real Supabase/Hyperdrive product reads, changed-price visibility and restoration. Verified SELECT-only demo-table grants. Local database preview also passes using the documented session pooler and provider CA with certificate validation enabled. Corrected missing local binding initialization and conditional pg-cloudflare files in the published instructions. Repeated reader, senior-engineer and factual review; evidence, encountered failures, sources and test limitations are recorded in drafts/deploy-nextjs-cloudflare-workers.notes.md. No existing production data or connections were changed.

### Deployment verification updates approved — 19 October 2026

The owner approved the article after the account-backed rehearsal, corrections, and repeated reader, engineering, and factual reviews. The approved version remains published in the application; no further content changes or external deployment were made for this approval.
