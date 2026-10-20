# Writing plan

One consolidated editorial backlog for Akeem's portfolio. All eleven written articles are approved and published in the application. This backlog now contains only future ideas; an idea here is not a draft or a promise to publish. Code supports implementation facts, while Akeem's account supports personal decisions and experience. Do not invent incidents, benchmarks, business results, or alternatives considered.

## Editorial direction

Each article answers one useful reader question and works as an independent entry point. Alluring Aura Scent supplies real examples; knowing the store or reading its overview is never a prerequisite. Related posts offer optional depth.

Group material by the problem being solved. A service name alone does not justify a separate article. Keep connected steps together when the reader needs them to reach a working result. Separate subjects when they have different correctness rules, examples, or outcomes.

## Published overview

**Status:** Published on 18 October 2026. This section documents the article's scope; it is not a pending task.

**Building a Next.js E-commerce App: Alluring Aura Scent**

The existing article explains the business need, ownership, budget constraints, catalogue caching, and early operational feedback. Preserve its role as a project story. It does not need deployment instructions or a summary of every service. Add descriptive links from relevant passages as focused articles are approved and published.

## Focused articles from Alluring Aura Scent

**Status:** All eight articles below are approved and published. Their briefs are retained as editorial records, not unfinished tasks.

### 1. Building an IndexedDB catalogue that stays in sync

**Reader question:** How can an admin browse and search a saved product catalogue while keeping it up to date?

**Scope:** Explain IndexedDB briefly, define the product records and version metadata, build the local search flow, download the initial catalogue in chunks, and apply subsequent changes. Cover interrupted sync, deletions, storage failures, stale data, and when a rebuild is needed. Show where server validation remains necessary.

**Standalone example:** An admin repeatedly finds and edits products. Supply enough example data and code to follow the local-storage and synchronisation flow without another article. Explicitly distinguish cached browsing from offline business transactions.

**Boundary:** Keep browser caching and synchronisation together. Public server caches and hosting setup belong elsewhere. Compare with server-side search/pagination so readers can judge whether a local catalogue is justified.

**Evidence:** Catalogue synchronisation and IndexedDB modules. Verify the example against the implementation before drafting. No implied live product count or measured speedup.

### 2. Keeping catalogue caches fresh in Next.js

**Reader question:** Which public catalogue results can be reused, and how do changes reach readers?

**Scope:** Show one public catalogue query, a cache hit/miss, revision-based keys, and the refresh path after a product or stock change. Explain private/public boundaries and server-authoritative stock checks. Include query shape, repeated reads, and pagination only where they explain that example.

**Standalone example:** A public product listing whose stock changes after a sale. Define the data flow and cache location in this article; explain the actual freshness guarantees and limitations instead of promising instant consistency everywhere.

**Boundary:** This concerns server-side result reuse. It does not reteach IndexedDB or provide the deployment walkthrough. Connection pooling and query-result caching must be distinguished when Hyperdrive is mentioned. Do not present caching as a substitute for appropriate database queries or indexes.

**Evidence:** Public catalogue queries/cache modules and revision updates. A separate database-performance article needs a specific query, query-plan evidence, and meaningful validation; it is not part of the active list yet.

### 3. Deploying Next.js to Cloudflare Workers with OpenNext

**Reader question:** How do I deploy a working full-stack Next.js application to Workers and verify it?

**Scope:** Explain the OpenNext adapter and a complete database-free deployment path first, preserving existing styling and supporting either Next.js router. Then offer Supabase Postgres/Hyperdrive as an optional, self-contained worked example. Explain where another database/SDK changes the integration and how to check runtime compatibility. Add image or persistent-cache configuration only when the application needs those features.

**Standalone example:** A small, complete application with a database-backed feature, representative of the real project. Provide its required files, environment-variable names, commands, and expected results. A reader must not need the private store repository, credentials, or another blog post to complete it.

**Boundary:** Keep the essential database connection setup here so the deployment guide is complete. Detailed catalogue caching, broad provider comparisons, and every production feature are outside this guide. Explain relevant cost/runtime tradeoffs without asserting a fixed total monthly bill.

**Evidence:** Deployment configuration and official documentation checked. The base example was built and previewed; the optional database path was reviewed against primary documentation, with no live Supabase test claimed. Published on 19 October 2026 under the owner’s instruction to complete portfolio article work without further external-account testing. A deeper database-connection article needs a distinct reader problem.

### 4. Handling duplicate Paystack payment notifications

**Reader question:** How can redirects, webhooks, and retries lead to one valid payment settlement?

**Scope:** Introduce provider verification and idempotency in plain terms. Walk through competing messages, stored payment/order state, concurrency, and already-settled payments. Include meaningful duplicate/concurrent-event checks and recovery limits.

**Standalone example:** One checkout produces both a redirect and a webhook. Define the order/payment states and supply the relevant handler/service example. Clearly distinguish provider verification from trusting a client callback.

**Boundary:** Keep stock and email as downstream consequences with brief local explanations. Their full implementations are optional further reading. Do not combine this with the inventory article merely because both run during checkout.

**Evidence:** Payment verification, settlement, and order services. Describe the guarantees the implementation supports without claiming exactly-once delivery from external systems.

### 5. Keeping inventory consistent across online and in-store sales

**Reader question:** What happens when an online order and a shop attendant need the same stock at the same time?

**Scope:** One competing-sale example, shared SKU balances, requested/allocated/shortage quantities, explicit channel policies, transaction boundaries, safe retries, and traceable movements. Explain the distinction between available stock and physical counts. Include a real-database concurrency test plan without claiming it was executed during drafting.

**Standalone example:** Two bottles, an online request for two, and a walk-in request for one. Show both possible transaction orders and their outcomes. Keep the code to one allocation helper.

**Boundary:** Remove the bundle walkthrough so the central correctness problem stays clear. Reservations are an alternative policy, not an implemented feature or a separate tutorial here. Payment verification is optional further reading. Do not claim all application retry guarantees are implemented simply because the article describes a recommended design.

**Evidence:** Online settlement, walk-in transactions, inventory adjustments, allocation helpers, schema constraints, and PostgreSQL documentation. Bundle material is deferred; a separate article needs verified integration and a distinct reader problem.

### 6. Calculating naira prices without floating-point errors

**Reader question:** How do I calculate prices and discounts with explicit rounding rules?

**Scope:** Define naira/kobo representation, integer bounds, intermediate arithmetic, discount rounding, and display conversion. Use a small worked price/discount example with boundary checks. Explain JavaScript number/BigInt constraints where they matter.

**Standalone example:** A product price and percentage discount, calculated from input to displayed total. Include the rounding rule and expected values locally.

**Boundary:** This is a focused pricing article, not a payment integration guide. Keep it concise if the useful explanation is short; do not add unrelated currency or tax systems to make it longer.

**Evidence:** Pricing helpers and their supported rules. Avoid universal claims about which rounding policy every business should use.

### 7. Importing a product catalogue from a spreadsheet

**Reader question:** How do I turn a spreadsheet into validated catalogue changes without corrupting existing data?

**Scope:** Give a sample spreadsheet format, validate rows, report actionable errors, handle duplicates, and separate staging from committing. Explain chunking, interrupted work, and retries only as supported by the implementation.

**Standalone example:** A small spreadsheet containing valid and invalid product rows. Show what the admin sees and what reaches the database.

**Boundary:** Import validation and commit safety belong together. IndexedDB is a consumer of the resulting catalogue, not a prerequisite for understanding this workflow.

**Evidence:** Import contracts, parser, and service. Verify transaction boundaries; do not imply a whole import is atomic if only individual batches are.

### 8. Sending order emails with Resend: retries and recovery

**Reader question:** How do I notify customers or staff without making a completed payment depend on email delivery?

**Scope:** Explain atomic notification intent, scheduled outbox sending versus a durable queue and relay, delivery attempts, bounded retries, and duplicate-send risks. Treat after() as an optional immediate attempt, not the recovery architecture. Use Resend as a worked provider example with setup prerequisites; keep the design usable with other providers and services.

**Standalone example:** A paid order remains paid when its email attempt fails. Show how the notification is recorded, picked up independently, and retried, including uncertain provider outcomes. Do not require the reader to reproduce the store implementation.

**Boundary:** Explain enough about payment state locally, then link optionally to payment verification. Keep unimplemented PWA notifications outside the delivered email workflow. Distinguish provider acceptance/delivery from the recipient reading the message.

**Evidence:** Notification scheduling and email modules, plus current official Resend documentation when drafting. This merges the earlier email-provider and Resend proposals.

## Stories from other work

**Status:** QuikCity and production migration are approved and published. Encrypted secret sharing is the only remaining idea, pending a project evidence review.

These remain in the backlog rather than being absorbed into the e-commerce series.

| Working title | Reader value | Evidence still needed |
| --- | --- | --- |
| Building QuikCity around WhatsApp | Explain a real customer/vendor ordering flow and the decision to meet customers in WhatsApp. | Approved and published on 19 October 2026; article covers WhatsApp access, vendor trust and local fulfilment constraints. API details and measured outcomes are outside its scope. |
| Migrating production data safely: validation, cutover, and rollback | Protect live records and concurrent changes, validate the destination, and prepare recovery that preserves post-cutover writes. | Approved and published on 19 October 2026; Flutterwave-to-Paystack is the worked example. |
| Building encrypted secret sharing with RSA and AES | Explain the roles of each algorithm through one sharing flow and its threat model. | **To do, not drafted.** Inspect the project and confirm the implemented algorithms, key handling, threat model, and Akeem's contribution before writing. Make no security claims based on the title alone. |

Each must define its own context and terminology. Publish no guessed implementation details to fill gaps.

## Consolidation decisions

- Merged the two deployment titles; folded essential Supabase/Hyperdrive connection setup into that complete guide.
- Merged both email proposals into one Resend article.
- Kept browser catalogue caching/synchronisation together, separate from public server-side catalogue caching.
- Initially grouped bundles with shared inventory; removed that section during review to focus on competing sales. Bundle material remains deferred.
- Kept payment idempotency separate from inventory: each has a different correctness question and failure example.
- Folded query-efficiency material into the relevant catalogue example for now. A separate optimisation post needs distinct evidence and an independent result.
- Retained money and spreadsheet imports: each solves a bounded problem with useful worked examples.

The eight focused e-commerce follow-ups, the overview, and the QuikCity and production-migration stories are all published. The only current writing to-do is the encrypted secret-sharing idea above. Reassess its value and scope after inspecting the implementation; it may turn out not to warrant an article.

## Linking plan

| Passage or article | Optional further reading after publication |
| --- | --- |
| Overview: local admin catalogue | IndexedDB catalogue synchronisation |
| Overview: public caching | Next.js catalogue caching |
| Overview: Cloudflare hosting decision | Next.js deployment guide |
| Overview: order emails | Resend order notifications |
| Deployment: database access | A future connection deep dive only if a distinct article is warranted |
| IndexedDB: authoritative stock updates | Shared inventory, if the reader wants the server-side allocation rules |
| Public caching: stock changes | Shared inventory, for transaction details |
| Payments: stock allocation and email delivery | Shared inventory and Resend articles |
| Inventory: price calculations | Naira arithmetic, where relevant to the example |
| Imports: browsing the updated catalogue | IndexedDB synchronisation, if relevant |
| Email: confirmed order/payment state | Payment verification, for the settlement implementation |

Use descriptive anchors, such as “deploying Next.js to Cloudflare Workers,” rather than “see here.” Add links only when the target is published and available. Link the overview back from a focused article only where it helps readers explore the real product; do not require that visit or insert a forced link in every post.

The automatic Read next section is supplementary navigation. In-text links explain why another article is relevant. Each essential setup step, definition, correctness rule, and validation result stays in the article where it is needed.

## Original writing order (completed)

The sequence below is retained for reference. All listed articles have since been written, approved, and published.

1. IndexedDB catalogue synchronisation.
2. Public catalogue caching.
3. Next.js deployment, including the essential database connection path.
4. Payment idempotency and shared inventory, each as its own article.
5. Choose money, imports, email, or another project according to evidence and the next useful reader question.

Order is an editorial preference, never a reading dependency. Every article must remain usable when discovered directly through search.


Deployment verification update (19 October 2026): the optional Supabase/Hyperdrive example now has live read/update-visibility evidence and a successful local preview with TLS verification. The published guide includes fixes discovered during that scoped rehearsal; see content/drafts/deploy-nextjs-cloudflare-workers.notes.md for boundaries.

## Current writing to-do

- [ ] Inspect the secret-sharing project and gather owner-confirmed context before deciding whether to draft “Building encrypted secret sharing with RSA and AES.”
