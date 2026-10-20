# E-commerce series evidence

Private editorial notes. Sources checked on 18 October 2026. These notes are not article content and are excluded from the loader.

## Implementation sources

Source repository: `/Users/akeem/projects/alluring-aura-scent`, inspected read-only.

| Draft | Primary implementation evidence |
| --- | --- |
| IndexedDB | `src/lib/admin-catalogue-sync.ts`, `admin-sale-storage.ts`: generations, cursor commits, revision/stock deltas, leases, storage failure handling. |
| Public caches | `src/modules/catalogue/public-cache.ts`, `public-product-cache.ts`, `public-revision.ts`: versioned results, R2 storage, validation/age limits, taxonomy separation, private admin boundaries. |
| Deployment | package manifest (Next 16.3.8, OpenNext 1.20.6, Wrangler 4.147.0), Wrangler configuration, OpenNext configuration, `src/db/connection.ts`. The real store uses Postgres.js 3.4.9/Drizzle; the small tutorial explicitly uses node-postgres. No production credentials or configuration IDs copied. |
| Payments | `src/modules/payments/verification.ts`, `webhook.ts`, `paystack-adapter.ts`, `src/modules/orders/settlement.ts`: claim window, raw-body signatures, provider checks, locked settlement, extra-payment review. |
| Inventory | `src/modules/inventory/allocation.ts`, `service.ts`, `src/modules/sales/service.ts`, order settlement and schema: bounds, partial allocation, SKU locking, bundle aggregation, movements/non-negative check. |
| Money | `src/modules/pricing/money.ts`: integer kobo, safe result bounds, BigInt intermediates, discount truncation. Decimal parser is a separate illustrative helper, not claimed as the store's exact implementation. |
| Imports | `src/modules/imports/contracts.ts`, `parse.ts`, `service.ts`: file/expanded-size bounds, formula/numeric identifier rejection, row errors, grouping, staged batches, owner/expiry checks, commit transaction/table coordination. |
| Email | `src/modules/notifications/schedule-order-email.ts`, `order-email-delivery.ts`, `delivery-eligibility.ts`, `resend-webhook.ts`, `order-notification-policy.ts`, admin order actions: durable records, after(), leases, explicit failed-notification retry, provider status tracking, obsolete notifications. |

## Primary external references

- IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- Browser storage: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Hyperdrive cache boundaries: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
- OpenNext: https://opennext.js.org/cloudflare/get-started ; https://opennext.js.org/cloudflare/cli ; https://opennext.js.org/cloudflare/bindings
- Cloudflare framework approaches: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Supabase/Hyperdrive: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/
- Driver/local configuration: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/ ; https://developers.cloudflare.com/hyperdrive/configuration/local-development/
- Paystack: https://paystack.com/docs/payments/verify-payments/ ; https://paystack.com/docs/payments/webhooks/
- PostgreSQL: https://www.postgresql.org/docs/current/explicit-locking.html ; https://www.postgresql.org/docs/current/ddl-constraints.html
- JavaScript numeric limits: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER ; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt
- Resend: https://resend.com/docs/send-with-nodejs ; https://resend.com/docs/dashboard/emails/idempotency-keys ; https://resend.com/docs/webhooks/introduction

## Review decisions

- Essential setup stays inside the deployment article. Cloudflare's current generic scaffold guidance points at a different adapter; the draft uses the manual OpenNext path consistently and marks its example for an account-backed rehearsal.
- No claim that a local cache is a complete offline transaction system, that revision keys guarantee instantaneous global consistency, or that Hyperdrive pooling disables its query cache automatically.
- No claim that every accepted payment has all stock allocated. The store's paid-shortage/restock policy is described as a business choice.
- Chunked staging/inserts are distinguished from the actual final import transaction. No guessed partial-live import behavior.
- after() is not described as a durable queue. Failed email delivery has an explicit manual retry path; no unverified automatic retry worker is claimed. Provider idempotency is bounded to its documented retention window and same request payload.
- The executable example checks cover syntax and selected local logic, not hosted integration. See `content/DRAFT_REVIEW.md` for exact limits.

## IndexedDB clarification source check — 19 October 2026

- `src/modules/catalogue/admin-index.ts`: `ADMIN_CATALOGUE_CHUNK_SIZE = 15`, local ordering/filtering in `selectAdminProducts`.
- `src/app/admin/(protected)/products/shared-index-list.tsx`: `LIST_PAGE_SIZE = 25`, local visible slicing, opening/reconnect/visibility triggers, last-checked display, forced Refresh, cross-tab update handling.
- `src/lib/admin-catalogue-policy.ts`: five-minute normal freshness age, return threshold, retry/backoff policy. No claim of a five-minute polling timer.
- `src/lib/admin-catalogue-sync.ts`: usable saved copy reused, revision checks may be skipped by policy, explicit refresh still respects retry delay, changed/deleted entity pages, separate stock deltas, resumable generations.
- `drizzle/0030_admin_catalogue_entity_state.sql`, `0031_catalogue_trigger_guards.sql`: revision/entity tracking including deleted markers.
- Article does not promise data survives PWA uninstall/reinstall or transfers across devices. Browser-storage persistence/eviction reference rechecked against MDN; installation is not required for IndexedDB.
