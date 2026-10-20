# Production-data migration: evidence and review

19 October 2026. Replaces the unpublished billing-specific draft at the owner's explicit request.

## Reader question and promised result

How can an engineer move live production data without losing existing or ongoing changes, and prepare a usable recovery path? The article is a stack-neutral migration planning guide, not a copy-and-run database tutorial. It covers invariants/dependencies, tested backup, choice of write-pause versus online replication, compatible expansion, resumable copying, validation, cutover, post-cutover recovery and cleanup. Billing is one brief external-side-effect example.

## Source boundaries

The owner supplied the historical billing migration as motivation but asked that it not prescribe the guide. Only the short personal context remains; no rollout, CDC, restore, backfill or reverse migration is claimed as a performed historical step. Customer C-42 and address updates are labelled illustrations. No invented data counts, outage durations, loss-free guarantees or measured outcomes. The unpublished slug changed with the scope; no public article URL was changed.

## Primary sources checked

- https://www.postgresql.org/docs/current/backup.html — supported backup approaches differ; no universal command or restore guarantee asserted. PostgreSQL is an example, not a required stack.
- https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html — ongoing change capture, initial load/change-stream coordination, source-specific setup and log requirements. DMS is optional further reading, not a required service.
- https://martinfowler.com/bliki/ParallelChange.html — expand/migrate/contract and parallel interface compatibility. Not represented as making independent writes atomic.
- https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Validating.html — row comparisons, changing data/validation timing, additional query load, incomplete validation limits. No claim that equal counts or samples establish full correctness.
- https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/ — data/version compatibility and preparing rollback before deployment. The guide's general recovery recommendations are engineering reasoning, not an assertion that all databases support reverse replication.

## Reviews, in requested order

1. Reader: title and summary promise general data migration. One customer/address example explains concurrent changes and post-cutover loss without knowing billing or the earlier articles. Definitions introduce invariants, CDC, idempotence and cutover. Tables compare options and show checks/rollback boundaries. Removed proration, card-token setup, provider-specific failure discussion and billing-scheduler detail from the main article.
2. Senior engineer: traced writers, consistent backup/restore, authoritative snapshot/log boundaries, log retention, updates/deletes, batch checkpoint crash recovery, snapshot regression prevention, stable IDs, schema compatibility, workload impact, validation at a common point, stale writer fencing, caches, tenant partitioning, and destination changes during rollback. Added a proportional small in-place transaction alternative and an explicit requirement to establish destination-change capture before accepting writes if rollback needs it. Recovery cannot silently discard post-cutover writes, and restore cannot undo outside effects.
3. Factual/best practices: checked sources above and bounded supported-operation assumptions. Avoided universal transactional DDL, free/automatic reverse replication, timestamp-only CDC, arbitrary dual-write atomicity, zero-loss claims and a mandatory platform. Confirmed recommended steps are not presented as executed integrations. Repeated reader/engineering checks after the two additions; scope remains a planning guide rather than vendor-specific executable procedure.

## Verification

Production Markdown renderer, frontmatter/metadata/draft privacy and existing example checks pass. Lint passes. There is no new executable integration snippet; no production restore, CDC session, data copy, pilot, reconciliation or rollback was performed. An implementation must rehearse the chosen datastore-specific procedure; the article does not claim that writing a plan verifies it. Private pending owner review and approval.

## Practical walkthrough revision — 19 October 2026

The owner authorised the proposed practical pass. Replaced the broad nine-stage checklist with one illustrative A-to-B customer/order migration using a rehearsed maintenance window. C-42/T-8, C-43/T-9 and paid order O-91 carry ownership, access and value checks. After cutover C-42 changes 12 Market Road to 18 Market Road; the recovery must preserve 18. The worked return uses a compatible fresh recovery database with a full authoritative snapshot, avoiding an unexplained assumption of reverse CDC. Online snapshot/CDC remains a bounded alternative, not the default requirement.

Reader pass: checked an uninterrupted preparation/pause/copy/validation/cutover/recovery sequence, concrete gates, the definition of cutover, and optional advanced tooling. Assumptions state unchanged structure/rules, preserved IDs and tested dual-database application compatibility. Commands intentionally remain datastore-specific; it is an operational walkthrough rather than an executable vendor tutorial.

Senior engineer pass: traced all writers, in-flight operations, durable event deferral/retries, stale writer blocking, idempotent batch checkpointing, relationship dependencies, sequence/ID collisions, controlled test writes, stable full-value comparisons, fresh-pool routing, cache/index dependencies, post-cutover new records/updates/deletes, and retirement. Full-snapshot return explicitly assumes valid destination data; added a corruption case requiring trusted history and validated repair rather than copying corruption back. Repeated reader/engineering review after that correction.

Factual pass: rechecked PostgreSQL backup, AWS DMS validation and AWS rollback-safety primary pages; retained the previously checked CDC reference. No claim that arbitrary engines support compatible restores, a toggle reverses accepted writes, or a copied snapshot undoes external actions. Downtime and recovery feasibility must be established by rehearsal, and sampled validation is not labelled comprehensive. Existing personal context is unchanged and narrow.

Checks: production Markdown rendering, frontmatter/metadata/draft exclusion, existing example suite and lint pass. No actual database move, restore, permission test, event replay, or rollback was executed. Private pending owner review/approval.

## Restored payment-provider worked example — 19 October 2026

Current scope supersedes the standalone customer-database walkthrough above. The owner confirmed that production-data migration remains the subject and Flutterwave-to-Paystack must remain the practical example. Rewrote the guide around illustrative subscription S-42 (five included users, two paid add-on users, existing paid period, historical Flutterwave references). No commercial price, date, execution result, or historical rollout mechanism is invented. Broader lessons accompany mapping, ongoing writes, ownership, validation, cutover and recovery; a second database is explicitly not assumed for a provider change.

Reader review: one subscription carries the entire migration. Defines invariants, idempotence and cutover; explains the difference between stored records and external capability; preserves optional further-reading links. Removed generic A/B customer records that had displaced the intended example. The article is a recommended operational guide, not a full SDK tutorial or a reconstruction of the owner's actions.

Senior-engineer review: traced paid access versus readiness, provider-specific credentials, setup-payment accounting, resumable backfill with intervening changes, one scheduler per subscription, handover boundary, immutable attempt routing, claim recovery, unknown provider outcomes, production permission checks, stable cohorts and stop conditions. Added setup-payment accounting so obtaining authorization cannot settle an unrelated invoice. Recovery preserves new provider payments and paid-through dates, retains authenticated event ingestion, handles additional successful payments explicitly, and does not assume the old provider is viable. Database snapshot/change replay remains a bounded analogy with explicit corruption limits. Repeated reader/engineering review after the setup-payment clarification.

Factual review: rechecked Flutterwave tokenization search/documentation (NOAUTH approval, not a universal recurring-payment limitation), Paystack recurring charges (initial payment, reusable authorization and original email), subscriptions (provider scheduling), verification (API versus transaction status), and AWS rollback safety. Existing PostgreSQL backup, DMS CDC/validation references remain applicable optional examples. No assumption of cross-provider token portability, exactly-once charges, automatic reverse replication, instant code rollback, or database restore reversing payments. Current sources support technical recommendations, not independent verification of the historical incident.

Local production-renderer, publication metadata/privacy, existing example suite and lint checks pass. No live account authorization, charge, copy, rollout or rollback was performed. Remains private pending owner review/approval.

## Production-copy rehearsal clarification — 19 October 2026

The owner asked whether local testing is followed by migration against a duplicate of current production data. Made the existing restore/rehearsal section explicit as a four-step process: recent consistent backup restored separately, isolated runner/environment with external actions blocked, exact release applied and checked, recovery rehearsed and timed. S-42 provides the concrete expected result. Recovery backup remains separate from the mutable working copy; a current recovery point and intervening changes must be accounted for before live execution.

Reader review: replaced implicit backup wording with an ordered pre-production sequence and a specific subscription outcome. Engineering review: checked consistent snapshot, environment parity, production credential isolation, provider side effects, repeated/interrupted batches, backup separation, current-data drift, and separate provider pilot. Factual review: checked PostgreSQL SQL-dump snapshot/restore documentation and RDS point-in-time restore documentation (new instance; configuration/performance differences). No guarantee that clone success proves production safety. Repeated affected clarity review. Local rendering/metadata/example checks pass. No actual clone, restore, or payment was executed. Remains private.

## Section-by-section destructive-risk review — 19 October 2026

Owner requested a sequential audit for false/incomplete advice that could damage live data. Reviewed the current article end to end, corrected findings, then repeated reader, senior-engineer and factual passes. This is a content audit; it does not certify a migration implementation.

| Section | Finding and correction |
| --- | --- |
| Opening/scope | Kept provider migration distinct from a database move and labelled the article a planning guide requiring system-specific scripts, queries and rehearsal. Preserved narrow historical/account-permission claim. |
| Invariants | Rechecked paid period, seven permitted users and renewal ownership against illustrative S-42; no new historical price or result invented. |
| Mapping/capabilities | Added account ownership plus provider/merchant/test-live reference scope so a test payment cannot settle a live invoice. Rechecked authorization portability, original email and setup-payment accounting. |
| Backup/rehearsal | Corrected order: isolate environment before restoring, block live actions, verify target identity, use fresh targets, inspect restore errors and fail fast. Added missing roles/keys/files, no universal transactional restore/DDL assumption, separate protected recovery copy, measured recovery/data-loss constraints, and explicit no-go on failed restore/unexplained differences. |
| Controlled writes/backfill | Added read-only preview, exact scope/release/baseline, single migration runner, narrow credentials, stale-writer pause, lock/storage budget and no destructive initial cleanup. Webhooks require verified origin and durable persistence before acknowledgement. Added narrow field updates and lock/atomic-version correctness; a transaction alone is insufficient to prevent stale overwrites. |
| Handover | Added durable unique obligation identity, frozen invoice values, no competing invoice attempts, completion ownership and uncertain-expired-claim recovery. Confirmed provider schedules must stop before activating replacements; no automatic cross-provider timeout fallback. |
| Validation/pilot | Clarified database rehearsal and eligibility gates precede new live charging; authorised pilot separately establishes live capability. Rechecked comparisons at stable/versioned boundary, monitored rollout and explicit investigation triggers. No claim that sample/row count proves correctness. |
| Recovery | Added queued-worker routing enforcement and in-flight accounting. Retains accepted payments and verified events. For storage recovery, pause again, preserve inserts/updates/deletes, rebuild and validate a separate compatible target, never overwrite the only current copy. Corruption requires trusted-history reconciliation. |
| Retirement | Rechecked distinction between stopping old schedules before handover and removing old code/data only after obligations and observation requirements are resolved. |

Primary checks: PostgreSQL backup-dump (consistent snapshot, restore error behavior, excluded cluster roles), pg_restore (fail-on-error/single-transaction semantics, restore execution caveats), explicit locking (lock/transaction distinction), AWS DMS CDC (source-specific log boundary/retention), Paystack recurring charges/subscriptions/verification/webhooks, and Flutterwave documented NOAUTH approval. No executable database instructions were added that would presume one engine's semantics apply to another.

Remaining limits: article checks test publishing/rendering and existing examples, not this recommended production procedure. No live database copy/restore/row-lock test, payment authorization, charge, webhook replay or rollback was performed. Per-system commands, recovery feasibility and controls must be rehearsed by the operating team. This audit does not establish zero risk or loss-free operation. Article stays private pending owner review/approval.

## Owner approval and publication — 19 October 2026

Owner approved the final reviewed guide. Article moved unchanged to ../posts/migrating-production-data-safely.md, dated 2026-10-19. Prior draft/review states above are historical. No recommended database operation was executed as part of publication.
