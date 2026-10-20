---
title: "Migrating production data safely: validation, cutover, and rollback"
summary: "Use a Flutterwave-to-Paystack billing migration to understand how to preserve live data, validate a transition, and prepare recovery before cutover."
slug: "migrating-production-data-safely"
author: "Akeem Adeyemi"
topics: ["migration", "production", "reliability", "payments", "subscriptions"]
date: "2026-10-19"
draft: false
---

# Migrating production data safely: validation, cutover, and rollback

A production migration changes a system people already depend on. Copying its records is only part of the work. You also need to preserve what those records mean, handle changes arriving during the move, and know how to recover if the new path fails.

I encountered this while adding subscription add-ons to an existing Flutterwave integration. Automatic card charging worked in testing but failed in production. Reverting the add-on changes did not resolve it; our investigation identified an account-level restriction on the charging flow we needed. I tested Paystack separately before moving the integration.

Flutterwave's [card-tokenization documentation](https://developer.flutterwave.com/docs/tokenization) currently requires approval for NOAUTH subsequent charges, which do not require customer authentication on each payment. That is a specific charging flow, not a claim that Flutterwave cannot support recurring payments.

This guide uses that kind of provider change as its worked example. The steps below are recommended practices, not a reconstruction of everything my team did. They also apply when replacing an inventory service, moving customer data, or changing a live database schema. This is a planning guide; the team responsible for the system must supply and rehearse the datastore-specific commands, validation queries, and recovery procedure before execution.

## Define what is moving and what must survive

A provider migration does not necessarily move your application database. It changes provider associations, payment capability, and responsibility for future charges while preserving existing business records. A database move changes the storage location; both need an explicit boundary and a source of truth.

Consider an illustrative subscription, `S-42`:

| Record | State before the move |
| --- | --- |
| Subscription S-42 | Five included users, with two paid add-on users |
| Current invoice | Paid through the end of the current period |
| Payment history | Flutterwave transaction references |
| Future renewal | Must use the agreed price and have one billing owner |

The migration must not remove those two add-on users, shorten the paid period, or collect the same renewal twice. These are **invariants**: conditions that must remain true throughout the transition.

Keep the example's pricing and period rules unchanged during the provider rollout. Recalculating historical invoices under new rules would make validation harder. A provider switch and a pricing release are easier to diagnose separately.

For another system, write equally concrete rules: an order must retain its customer, an inventory movement must not apply twice, or a user must retain the correct permissions. Turn those rules into checks before writing the migration script.

## Map identities, dependencies, and missing capabilities

Keep `S-42` as the internal subscription ID. Attach the new provider's customer and authorization records to it. Retain old provider references for historical payments, refunds, and disputes. Do not overwrite a Flutterwave reference with a Paystack code just because Paystack will handle the next renewal.

Record at least the internal identity, account ownership, migration state, current billing owner, provider associations, paid-through date, and any unresolved payment attempt. Scope references to their provider, merchant account, and test/live environment so a test result cannot settle a live invoice. Protect payment authorizations as credentials and keep them out of logs.

Copying a customer email into Paystack does not make their existing card chargeable there. Do not treat a Flutterwave token as a Paystack authorization. Unless the providers support and agree a transfer process, plan for the customer to authorize payment with the new provider.

Paystack's card flow obtains an authorization through a successful initial payment. Subsequent charges require a reusable authorization and the email associated with it; see [Paystack's recurring-charge requirements](https://paystack.com/docs/payments/recurring-charges/). A usable authorization still does not guarantee that every renewal will succeed.

Explain any required customer action or setup charge. Do not charge a full subscription again simply to move someone who has already paid. Account for a setup payment separately unless it explicitly settles an existing invoice; obtaining an authorization must not accidentally extend access or mark an unrelated renewal paid. Keep migration readiness separate from paid access: `S-42` can be paid for this period while still needing authorization for the next one.

The wider lesson is that records and capabilities are different. Migrating a file reference does not copy the file or its access policy; moving an account does not automatically reproduce its external credentials.

## Prepare a recovery point and rehearse it

After local tests pass, rehearse against a recent, consistent copy of production data before changing the live database:

1. Prepare an isolated environment **before** restoring anything. Give it no production-service access or live provider credentials, and prevent restored jobs from running automatically. Verify the target host, database, and account explicitly; use a runner that refuses an unexpected destination rather than relying on a database name alone.
2. Take a supported, consistent snapshot or backup and restore it into a fresh rehearsal database. Check restore errors and completeness, not just whether some tables are readable. Use the tool's supported fail-on-error behaviour; do not assume an entire restore or schema change is transactional. [PostgreSQL's restore reference](https://www.postgresql.org/docs/current/app-pgrestore.html) documents its error-handling options.
3. Match the relevant engine version, extensions, permissions, and configuration without restoring production access. Account separately for roles, encryption keys, files, and dependencies the database backup does not include. [PostgreSQL's dump guidance](https://www.postgresql.org/docs/current/backup-dump.html), for example, notes that a single-database dump excludes cluster-wide roles.
4. Run the exact migration release intended for production, changing only the documented environment-specific settings. Compare identities, ownership, paid-through dates, invoices, add-ons, and provider mappings. Test failures, interrupted batches, and reruns. Abort on unexpected record counts or validation errors.
5. Rehearse recovery into a fresh destination, then run the compatible application against it. Verify the latest recoverable point, required credentials and keys, and time needed for restore, validation, and routing. Do not learn the restore procedure by overwriting the live database during an incident.

For example, the restored copy contains `S-42`. After migration it must retain its paid period, seven permitted users, and historical Flutterwave references. A missing Paystack authorization should mark it as awaiting customer action, not turn its paid invoice into an unpaid one. No real card should be charged during this database rehearsal. A failed restore, unexplained data difference, or unresolved recovery requirement stops the live migration.

Protect the copy as production-sensitive: restrict and encrypt access, sanitise personal data where practical without losing the relationships being tested, and apply a retention policy. Keep the recovery backup separate from the working copy you modify during testing.

A passing rehearsal establishes evidence for that snapshot and environment, not a guarantee about a later live run. Production may have newer records, concurrent writes, different load, or account permissions the copy cannot reproduce. If the migration release changes, repeat the affected rehearsal checks. Before execution, verify a current recovery point and account for changes since the tested snapshot. Agree how long recovery may take and how much data loss, if any, is acceptable; if the proposed recovery cannot meet those limits, do not proceed. Keep the recovery copy protected from migration writes or accidental deletion. The isolated database test and an authorised, limited live-provider pilot serve different purposes.

Add new fields and associations before removing the old ones. During rollout, both the current and rollback application versions must tolerate the stored data. If the old version cannot read a new provider association, keeping its binary is not a usable rollback plan. [AWS's rollback-safety guidance](https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/) explains why compatibility must be established before deployment.

A backup also has a time boundary. Restoring the pre-migration database after new payments arrive would erase their local records without reversing the charges.

## Control writes while migrating existing records

Choose the simplest safe way to build the new state.

Before writing, run a read-only preview of the exact record selection and expected transformations. Record the migration release, target, scope, baseline counts, and operator; prevent concurrent copies of the migration runner. Use narrowly scoped credentials and explicit stop conditions. Do not truncate tables or drop old fields as an initial step.

For a manageable backfill, use a rehearsed maintenance window for affected billing changes. Pause renewal workers, plan changes, admin edits, and other writers; drain active operations before taking the migration boundary. Verify that stale workers and other application instances cannot bypass the pause, and budget lock waits and storage as well as elapsed time. Stop rather than extending a migration that is blocking unrelated production work. Ordinary product access can continue if it does not depend on those writes.

Keep receiving provider events safely. Verify their origin using the provider’s documented checks. Either process them through a compatible path or persist them durably before acknowledging receipt, then replay with duplicate protection. A replay must not resurrect a cancelled subscription or apply an older state over a newer one. [Paystack documents its webhook verification](https://paystack.com/docs/payments/webhooks/). If you rely on provider retries instead, verify their actual retry behaviour and time limits.

Backfill provider associations and migration states in bounded batches. Preserve internal IDs, enforce uniqueness, and save progress only after a batch commits. Update only the intended migration fields; an upsert that replaces the whole subscription can erase a newer payment or cancellation. Read and check the current row under an appropriate lock, or use an atomic conditional update against its recorded version. A transaction alone does not prevent an application from writing stale values. Record conflicts for reconciliation instead of forcing an overwrite. A stopped process may repeat its last batch; replay must be **idempotent**, meaning it does not create duplicates or apply the same change twice. Record rejected rows and investigate them before declaring the backfill complete.

If writes cannot pause, coordinate the backfill with a durable change stream or equivalent versioned update process. An older copied record must not overwrite a newer cancellation or plan change. Capture deletions too. For a database-to-database move, a supported snapshot-plus-change-data-capture process may fit; its starting boundary and log retention are datastore-specific. [AWS DMS documents one ongoing-replication approach](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html).

Do not independently write to two systems and assume they stay aligned. One write can succeed while the other fails. Whichever strategy you choose needs a clear authority, safe retries, and visible failures.

## Hand over responsibility, not just traffic

For the worked example, assume the application calculates invoices and schedules charges. This suits variable add-on totals, but is not the only design. Paystack also offers [provider-managed subscriptions](https://paystack.com/docs/payments/subscriptions/). Choose one scheduling owner per subscription.

Before moving `S-42`, check whether an old provider-managed renewal or retry is still active. Stopping your application worker does not stop a schedule inside the provider. Establish the last period owned by the old path and the first owned by the new one. Confirm old scheduled charging is disabled before activating its replacement; pause the handover if that outcome is uncertain.

Use an audited routing control with three outcomes: old path, new path for eligible subscriptions, or pause new automatic attempts. A pause matters when the old path cannot perform the required operation either.

Once an attempt exists, persist its provider and reference. A later routing change must not send its retry to another provider. Enforce a unique business identity for each subscription renewal period or add-on change, and preserve the agreed invoice amount and currency. Atomically record and claim an eligible attempt before submitting a charge, then release the database transaction before the network call. Concurrent workers must not create competing attempts for that invoice. Require current ownership when recording completion; an expired claim must not allow a stale worker to overwrite a newer result. Recovery still has to investigate whether the original request reached the provider.

If Paystack times out, do not immediately try Flutterwave. The first charge may have succeeded. Verify through the original provider, check the expected reference, amount, currency, and customer association, and reconcile an inconclusive outcome before another attempt. [Paystack's verification guide](https://paystack.com/docs/payments/verify-payments/) distinguishes an API request succeeding from a payment succeeding.

This ownership rule applies beyond billing: only one inventory service should authoritatively apply a movement, and a job already accepted by one system needs tracking after a routing switch.

## Validate before allowing the new path to charge

Sandbox tests should cover calculations, repeated events, stopped workers, and cancellation during handover. Complete the database rehearsal first. Before assigning an eligible subscription to the new live charging path, require evidence for these gates:

| Gate | Required evidence in the billing example |
| --- | --- |
| Complete mapping | Expected subscriptions accounted for; no unexplained duplicates, omissions, or rejected records |
| Preserved business state | S-42 retains its users, paid-through date, invoice values, and historical payment references |
| Readiness | New-provider authorization is usable; incomplete customers follow an explicit reminder or grace policy |
| One owner | Old charging schedule is stopped and the next renewal has one owner |
| Safe processing | Duplicate events do not extend access twice; unresolved attempts cannot trigger cross-provider fallback |
| Recovery | Compatible rollback code and reconciliation procedures have been rehearsed |

Compare values at a consistent boundary or against recorded versions. Equal row counts are not enough: two datasets can contain the same number of subscriptions and different owners or dates. Validate relationships and critical fields; state the limits of sampled checks. [AWS DMS's validation guidance](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Validating.html) also notes the additional query load involved.

Then use an authorised, limited production pilot to confirm the required capability on the actual merchant account. Verify the resulting transaction, invoice and access state, including an initial authorization and a subsequent charge. Do not silently accelerate a customer’s renewal to manufacture a test.

A small, stable cohort lets you observe real outcomes before expansion. Monitor verified renewals, unresolved attempts, duplicate payments, lost access, latency, and customer reports. Name the person authorised to pause the rollout and agree stop conditions beforehand. A duplicate charge or unexplained paid-access loss warrants immediate investigation.

For a customer or inventory migration, replace the billing checks with ownership, permission, balance, and workflow checks. Keep the requirement for concrete evidence before switching authority.

## Recover without losing post-cutover changes

**Cutover** is the point when the new path becomes authoritative for the selected work. A toggle can stop assigning new attempts to Paystack. Ensure workers read or enforce that control when claiming work; a queued job must not bypass it simply because it was created earlier. It cannot cancel an in-flight request or reverse a successful charge.

Suppose `S-42` renews successfully through Paystack after cutover. Returning to the old code must preserve that payment and the extended paid-through date. Reopening an old snapshot would forget the renewal while leaving the customer's bank charged.

Recovery depends on how far the migration has progressed:

| Stage | Safe recovery requires |
| --- | --- |
| No new-provider attempts submitted | Restore old routing only where it remains usable; verify records and schedules before resuming |
| New attempts pending or completed | Pause new charges, drain or account for in-flight submissions, retain new records, and resolve each attempt through its recorded provider |
| Some subscriptions fully handed over | Keep them on a compatible path or perform an explicit reverse handover; do not restart overlapping schedules |

Keep both providers' authenticated event handling and reconciliation available during rollback. Repeated events must not extend access twice. Two genuinely successful payments for one invoice need explicit review, not silent deduplication. [Handling duplicate payment notifications](/writing/duplicate-paystack-notifications) explores that distinction further.

If the old account lacks the required charging capability, switching back is not a billing solution. Pause automatic attempts and use an agreed recovery or customer-payment path while fixing the integration. Preserve access already paid for.

For a database move, prepare a way to preserve destination writes before accepting them. To return, pause writers again, account for in-flight work, and reconstruct a compatible source from a consistent destination snapshot or a complete change history. Include new records, updates, and deletions. Restore into a separate recovery database and validate it before routing users there; do not overwrite the only surviving current copy. A full-snapshot return may require another substantial write pause; both recovery methods must be rehearsed. If stored data is corrupted, copying it back spreads the fault; reconcile against trusted history and validate repairs first.

## Retire the old system only after its obligations end

Keep historical provider references and enough compatible code to process outstanding events, refunds, and disputes. Define an observation and retention period; do not keep sensitive copies indefinitely.

Remove old schedules, code paths, and schema only when unresolved work is accounted for and the new recovery procedure is accepted. A migration finishes when the records and responsibilities are correct, not when the first new-provider payment succeeds.
