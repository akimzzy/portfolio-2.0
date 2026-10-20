# Live recurring-billing migration: sources and reviews

19 October 2026. Private engineering-practice draft, not a migration execution report.

## Reader question and scope

How can an existing recurring-billing system change providers while preserving paid access, controlling new attempts, and recovering safely? The intended result is an actionable migration plan, not a copy-and-run SDK implementation. Covers pricing preservation, state mapping, scheduler handover, authorizations, routing, test/pilot phases, rollback and reconciliation. Does not retell the full historic migration or teach provider setup/refunds/API integration end to end.

## Owner account

The owner joined an existing Flutterwave-using system and implemented per-user add-ons with partial-period charging and combined future renewals. Automatic existing-card charging worked in testing but failed in production; reverting the feature did not resolve it. The team identified a restriction requiring approval for the intended charging flow and pursued Paystack rather than waiting. The owner tested Paystack separately and migrated billing. Exact historical switch mechanisms, backfill, permissions, dates, token migration, customer reauthorization and production outcomes were not supplied and are not claimed. The owner explicitly requested expert guidance rather than a faithful reconstruction of that implementation.

The five-user, 30-day, 15-days-remaining scenario is adapted into a labelled illustration. Prices and three extra seats are invented example inputs, not reported commercial terms. Arithmetic verified: 3 × 200000 kobo × 15 / 30 = 300000 kobo; 2000000 + 3 × 200000 = 2600000 kobo. Calendar months and proration policy are distinguished.

## Primary evidence checked

- Flutterwave Card Tokenization: https://developer.flutterwave.com/docs/tokenization — retrieved through search. Approval applies to the documented NOAUTH subsequent-charge flow. Do not generalise to all recurring payments or API versions; the v4 card-flow documentation differs. Current documentation supports the narrow claim, not independent confirmation of the historic incident.
- Paystack recurring charges: https://paystack.com/docs/payments/recurring-charges/ — initial successful card payment, reusable flag, authorization-associated email, application-scheduled charging. No assumption of portable Flutterwave tokens or universal charge success.
- Paystack subscriptions: https://paystack.com/docs/payments/subscriptions/ — provider-managed plans/schedules and cancellation events. No claim that pausing an application stops a provider schedule.
- Paystack verification: https://paystack.com/docs/payments/verify-payments/ — transaction status versus API status, expected-value validation, pending/ongoing outcomes.
- Paystack webhooks: https://paystack.com/docs/payments/webhooks/ — provider-origin verification and duplicate-event considerations.
- AWS rollback safety: https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/ — version/data compatibility and preparing rollback before deployment. General engineering guidance is labelled as recommendations, not source-proven private implementation.

## Review order and findings

1. Reader: standalone scenario, proration and invoice definitions, numbered-by-workflow headings, concise tables and optional sibling link. Kept migration central and declined an unverified historical narrative. Intended audience is engineers maintaining a billing system, not beginners seeking an SDK tutorial.
2. Senior engineer: traced invoice uniqueness, pricing stability, application/provider scheduling ownership, handover boundary, missing authorizations, durable provider/reference association, transaction claim versus external charge, unresolved outcomes, delayed events, schema/binary compatibility, pause control, cohorts and reconciliation. Added explicit claim-expiry caveat, protected authorization storage, audited rollout permissions, and nonconclusive lookup handling. Rehearsal tables describe requirements, not executed tests.
3. Facts/best practices: rechecked primary sources above; narrowed Flutterwave statement to its documented charging model; checked integer arithmetic, calendar versus fixed-cycle assumptions, Paystack authorization/email requirements, and distinctions among payment, paid access and migration readiness. No claim of exactly-once external charging, automatic token portability, universal safe fallback, or ability to undo charges by restoring a database. Repeated reader and engineering passes after corrections.

## Verification limits and approval

Local publishing/Markdown/example checks validate article machinery and existing snippets. No live merchant charge, backfill, provider cancellation, migration pilot, database race, or rollback was executed. This article is a recommended migration runbook; the reader must validate the plan against their own provider accounts and system. It remains unpublished pending owner review/approval.

## Scope superseded — 19 October 2026

The owner clarified that production-data migration itself is the subject, with billing only an optional example. The billing-specific draft has been replaced by migrating-production-data-safely.md. Historical source/review notes above apply to the superseded scope, not the new draft. See migrating-production-data-safely.notes.md for its evidence and reviews. No public route or approved article was renamed.
