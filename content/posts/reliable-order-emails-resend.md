---
title: "Sending order emails with Resend: retries and recovery"
summary: "Build a recoverable email workflow with a scheduled sender or durable queue, stable message identities, and a clear retry policy."
slug: "reliable-order-emails-resend"
author: "Akeem Adeyemi"
topics: ["notifications", "resend", "payments", "e-commerce"]
date: "2026-10-19"
draft: false
---

# Sending order emails with Resend: retries and recovery

A customer pays for order `ORDER-42`, but the receipt email request times out. The order is still paid. The question is how to recover the notification without losing it or sending unnecessary duplicates.

The same problem appears with booking confirmations, invoices, and staff alerts. This guide uses an order receipt and Resend as its example. The delivery design applies to other email providers and application frameworks; their retry and deduplication guarantees need checking separately.

There are three separate jobs: record that a notification is needed, arrange for a sender to run, and track what the email provider accepted. Keeping them separate makes failures easier to recover.

## Save the notification with the business change

When confirming the order, save a pending receipt in the same database transaction. A transaction makes both writes succeed together or neither persist. Do not call the email provider inside it.

Give the receipt a stable identity, such as `ORDER-42:receipt`. Enforce uniqueness in storage so a repeated payment notification cannot create another copy. A staff alert is a different notification with its own identity, such as `ORDER-42:staff-alert`.

The pending record is an **outbox**: durable work waiting to be delivered. For this example, it holds the notification ID, recipient and content, status, attempt count, next attempt time, and provider message ID when known. Store the original payload—the sender, recipient, subject, and body—or enough versioned data to reproduce it unchanged. Restrict access and set a retention policy because it contains customer information.

This example assumes a datastore that can save the business change and notification atomically. You can use a relational transaction, another datastore's transaction, or a supported change stream. Two unrelated writes do not acquire that guarantee simply because they run consecutively. [AWS's transactional outbox guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) explains the failure this pattern addresses.

## Choose how pending work gets picked up

An outbox preserves the work. A dispatcher finds it; a sender makes the provider request. These can be one scheduled process or separate components.

| Approach | Useful when | What you must provide |
| --- | --- | --- |
| Scheduled outbox sender | Volume is modest and a short delivery delay is acceptable | A recurring job, bounded batches, claims, retries, and monitoring |
| Outbox relay plus durable queue | Prompt delivery, bursts, or independent workers matter | Reliable queue submission, a consumer, retry limits, and failed-message recovery |
| Post-response attempt, such as Next.js `after()` | You want an optional immediate attempt | An independent recovery mechanism for important notifications |

For a small application, a scheduled sender can be sufficient. For bursty traffic or a service already using background workers, a durable queue is often a better fit. Neither choice requires Next.js, PostgreSQL, or Resend.

### Option 1: a scheduled sender

A recurring job selects a small batch of due notifications, claims them, and attempts delivery. For example, a one-minute schedule might suit routine receipts if that delay meets the product's needs; it would be a poor default for a time-sensitive sign-in email.

Index the due-work lookup, limit each batch, and cap concurrent sends to the provider's limits. Each run should finish within its hosting runtime. Failed attempts receive a future retry time, so a later run can recover them without a customer reopening the application.

A scheduler can also fail. Monitor the last successful run and the age of the oldest pending message, rather than assuming that configuring a schedule guarantees delivery.

### Option 2: a durable queue and consumer

A relay reads committed outbox records and submits their IDs to a durable queue. A consumer receives each ID, loads the notification, and sends it. Managed options include Cloudflare Queues and [Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html); use a service compatible with your hosting environment and operational needs.

Keep the outbox or an equivalent recovery mechanism. If you commit the order and then enqueue directly, the process can stop between those operations. The order exists, but no queue message does. A relay can find and resubmit work that was never confirmed as enqueued.

Only mark submission successful after the queue accepts it. A crash immediately afterward can cause the relay to submit twice, so the consumer must tolerate duplicate IDs. Cloudflare Queues explicitly provides [at-least-once delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/): a message can arrive more than once.

After sending, persist the provider acceptance result before acknowledging the queue message. Acknowledgement tells the queue that processing is complete. If the consumer stops first, redelivery must check stored state and reuse the same provider idempotency key when another request is necessary. A queue alone does not make an external email send happen exactly once.

### Where `after()` fits

In Next.js, `after()` can attempt delivery after returning the response. It still runs within the deployment's execution limits; it does not supply durable retries. See the [Next.js API documentation](https://nextjs.org/docs/app/api-reference/functions/after).

You can use it to try a pending notification sooner while the scheduled sender remains the recovery path. Both must use the same claim and delivery rules. You can also omit it entirely and let the queue consumer or scheduled job do all sending. Important receipts should not depend on another page visit or a manual retry to trigger recovery.

## Prevent competing attempts from overwriting each other

A scheduled job can overlap its previous run; a queue can redeliver. Claim a notification before sending, skipping records already accepted or owned by another active sender.

One database-backed approach uses a short transaction to assign a unique claim token and a lease expiry. The lease temporarily reserves the work. Commit that claim before the network call, then require the same token when recording success or failure. A sender whose lease expired must not overwrite the result of a newer attempt. [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html) are one way to coordinate claims; other stores need their own conditional-write mechanism.

Set the request timeout below the lease duration with room for recording the result, or renew the lease for longer work. Expired claims must become eligible again. Ownership checks protect local records, but cannot undo an email already accepted by the provider.

## Retry the same email with the same identity

Suppose Resend accepts the receipt, but the response is lost. Your sender cannot tell whether the message was accepted. Creating a new notification ID for the retry would make it look like a different send.

Use the existing notification ID as the provider's idempotency key. Resend retains these keys for 24 hours and requires a matching request when a key is reused. That limits duplicate sends within the retention window; it is not permanent deduplication. See [Resend's idempotency requirements](https://resend.com/docs/dashboard/emails/idempotency-keys).

Keep the payload unchanged on retry. Rebuilding it from today's template or an edited order can produce a different request under the old key. An intentional new notification gets a new identity; an uncertain retry keeps the old one.

After the retention window, an unknown outcome needs an explicit reconciliation or resend policy. Checking provider records may resolve it; automatically generating a new key can create a duplicate.

## Keep provider code separate from retry policy

This is a server-side function fragment, not a route or complete email workflow. Put it in a server-only email-provider module and call it from the scheduled sender or queue consumer that owns delivery. Pass the API key from server-side environment configuration; never expose it to browser code. This function performs one HTTP attempt. It does not claim work, schedule retries, or mark the notification complete:

```js
async function sendEmail(apiKey, notification, fetcher = fetch) {
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": notification.id,
    },
    body: JSON.stringify(notification.payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const error = new Error(`Email provider returned ${response.status}`);
    const details = await response.json().catch(() => null);
    error.status = response.status;
    error.code = details?.name ?? null;
    error.retryAfter = response.headers?.get("Retry-After") ?? null;
    throw error;
  }
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id) {
    throw new Error("Email provider response has no message ID");
  }
  return result.id;
}
```

A payload could be `{ from: "Store <orders@your-verified-domain.example>", to: ["customer@example.com"], subject: "Receipt for ORDER-42", text: "Your payment was received." }`. These addresses are placeholders. Use an authorised recipient, a verified sending domain, and a server-side API key as described in [Resend's setup guide](https://resend.com/docs/send-with-nodejs).

The caller saves the returned message ID and accepted state under its claim token. A timeout, unreadable response, or missing message ID leaves the outcome uncertain; it does not prove that no email was sent. The optional `fetcher` lets tests simulate those responses without sending mail.

## Give retries a limit and an owner

Handle failures according to what happened:

- **Temporary failure:** back off on rate limits and transient provider errors. Respect applicable `Retry-After` guidance and add jitter—a small random delay—to avoid all senders retrying together.
- **Invalid request or configuration:** stop automatic retries and surface the problem. A bad address, invalid API key, or changed payload under an existing key needs correction, not a tight retry loop. Use the provider's documented error code as well as its HTTP status; see [Resend's error reference](https://resend.com/docs/api-reference/errors).
- **Unknown outcome:** retain the original identity and payload. Retry within the provider's deduplication window or reconcile before a later resend.

For example, Resend distinguishes a request-rate limit from an exhausted sending quota even though both return `429`. Its `409` can mean a matching request is still in progress (retry later) or that the payload changed (correct the conflict). A single status-only rule would mishandle these cases.

Choose one owner for retry timing: the scheduled sender's next-attempt field or the queue's retry mechanism. Avoid two independent retry loops sending the same work. When using a queue, either request redelivery through it or durably save the next attempt before acknowledging; do not acknowledge a failed send and leave its recovery only in memory. Bound attempts and elapsed time. Exhausted messages belong in a visible failed state or **dead-letter queue**, a holding area for work requiring investigation. Alert someone and provide a controlled replay action; storage alone is not recovery. Cloudflare documents [queue acknowledgement, retry, and delay controls](https://developers.cloudflare.com/queues/configuration/batching-retries/).

Recheck whether a notification is still useful before retrying. A password-reset link can expire; a pickup instruction can become obsolete after cancellation. Skip obsolete work rather than changing its content silently under an existing idempotency key.

## Track acceptance separately from delivery

A successful API response means the provider accepted the email, not that someone read it. Save the provider message ID. Verify delivery webhooks before applying them, deduplicate events, and prevent delayed events from blindly overwriting newer state. [Resend's webhook guide](https://resend.com/docs/webhooks/introduction) covers that channel.

Monitor pending age, failure counts, and delivery problems. A bounce needs investigation or a corrected address; repeatedly resending an accepted message is not a general solution.

Before shipping, test crashes after the order commit, after queue submission, and after provider acceptance but before saving the result. Also test overlapping senders, expired claims, rate limits, exhausted retries, and obsolete notifications. In each case, the business record must stay correct and the notification must remain either recoverable or visibly resolved.
