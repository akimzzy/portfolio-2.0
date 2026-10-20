---
title: "Handling duplicate Paystack payment notifications"
summary: "A checkout can report the same payment more than once. Here’s how to verify it and update the order once, even when requests arrive together."
slug: "duplicate-paystack-notifications"
author: "Akeem Adeyemi"
topics: ["payments", "paystack", "e-commerce", "postgresql"]
date: "2026-10-19"
modified: "2026-10-19"
draft: false
---

# Handling duplicate Paystack payment notifications

A customer pays ₦50,000 for a bottle of perfume. Your store receives three requests about that payment. Should it reduce stock three times?

Of course not. But that can happen if every successful-payment message runs the same order-update code without checking what has already been done.

The aim is simple: confirm the payment, mark the order paid, and allocate its stock once. Receiving the same payment notification again should leave those changes intact. Developers call this **idempotency**: repeating an operation has the same effect as performing it once.

This walkthrough uses Paystack and a PostgreSQL-backed store. The example assumes checkout already exists. It focuses on what happens after a payment, rather than building checkout or a refund system.

## Why one payment produces several requests

There are two ways the store can hear about a payment:

- **Callback:** Paystack sends the customer’s browser back to your website with a transaction reference. Your server uses that reference to check the payment.
- **Webhook:** Paystack sends an HTTP request directly to your server. It does not depend on the customer returning to the website.

The customer might close the tab before the callback happens. The webhook can still arrive. Conversely, both can arrive almost together.

Paystack can also resend a webhook when it does not receive the expected acknowledgement. The payment has not necessarily happened again; the message has been delivered again. These entry points should use the same payment-processing service. For an attempt already processed successfully, return the stored outcome without another provider call. Otherwise, verify it before changing the order.

## Save the order and payment reference separately

An **order** describes the purchase. A **payment attempt** describes a checkout started to pay for it.

For example, order `ORDER-42` contains one bottle costing ₦50,000. Before opening Paystack checkout, the server saves a payment attempt with reference `pay-42-a`, linked to that order. Use that reference when initialising the transaction with Paystack.

If the callback and webhook both contain `pay-42-a`, they refer to the same attempt. Do not create another attempt just because a notification arrived or the customer refreshed the page. If checkout is deliberately restarted with a new reference, save that as a separate attempt for the same order.

Store the reference with a database uniqueness constraint. This prevents it from accidentally identifying two different attempts. Save the expected amount and currency on the server too, rather than taking them from the browser when confirming payment.

The two cases below need different treatment:

| What arrives | Meaning | What to do |
| --- | --- | --- |
| `pay-42-a` after that attempt was processed | Another message about the same payment | Return the saved result. Do not allocate stock again. |
| A verified successful `pay-42-b` after `ORDER-42` was paid by `pay-42-a` | A second successful payment for one order | Record it for review. Do not create another order or allocate more stock. |

The second case needs a business resolution, such as reviewing whether a refund is due. It must not disappear into the “already processed” path for the first payment.

## Check that the payment belongs to this order

A browser returning to a success page is not proof of payment. The server looks up the stored attempt and calls Paystack’s verification endpoint using its server-side secret key.

Check `data.status`, which describes the transaction. The response’s top-level `status` describes whether the API request succeeded. Then compare the verified reference, amount, currency, and test/live environment with the saved attempt. [Paystack’s verification guide](https://paystack.com/docs/payments/verify-payments/) documents this response.

For `ORDER-42`, ₦50,000 is **5,000,000 kobo**. A successful payment of 500,000 kobo is only ₦5,000 and must not mark that order paid. For converting price inputs and rounding discounts, see [calculating naira prices without floating-point errors](/writing/naira-prices-integer-kobo).

If you attach an order ID in payment metadata, set it on the server when initialising checkout and check it against the stored association. My implementation also compares the customer email. That identity check depends on the checkout model; it does not replace the amount and reference checks.

An unknown reference or mismatched payment should not turn into a paid order. Keep mismatches available for investigation. A verification timeout means “not confirmed yet,” not “the customer definitely failed to pay.”

## Make simultaneous requests safe

A check such as “if the order is unpaid, deduct stock” is insufficient on its own. The callback and webhook could both read “unpaid” before either changes it.

Use a **database transaction** to commit related changes together or roll them back together. Within it, lock the order row so two requests cannot update that order at the same time. PostgreSQL provides `SELECT … FOR UPDATE` for this purpose.

Here is how the two requests should behave:

1. The callback verifies `pay-42-a`, starts a transaction, and locks `ORDER-42`.
2. The webhook also verifies `pay-42-a`, but its transaction waits for that order lock.
3. The callback checks the latest order and attempt records. Neither has been processed, so it allocates stock, records the stock movement, marks the attempt and order paid, and creates the required notification records. It commits those changes together.
4. The webhook gets the lock and reads the records again. It now sees that `pay-42-a` was processed, so it returns the saved outcome without repeating those writes.

If a different successful attempt gets the lock after the order is paid, record that attempt as an additional payment needing review instead.

This waiting-and-rereading example assumes PostgreSQL’s Read Committed isolation. A retryable conflict at a stronger isolation level needs a bounded retry of the transaction. The reread under the lock is essential. A value read before waiting may already be outdated. Every path that processes payments must follow the same rule. Stock shared with other orders also needs protection: lock the affected stock rows in a consistent order and calculate from their current balances. [PostgreSQL’s locking guide](https://www.postgresql.org/docs/current/explicit-locking.html) covers these controls.

Call Paystack before opening this transaction, so database locks are not held while waiting for an external service. Keep email delivery outside it too: create notification records during the transaction, then attempt delivery afterward. An email failure should not undo a confirmed payment. For delivery and retry options, read [sending order emails with Resend](/writing/reliable-order-emails-resend).

## Authenticate and acknowledge the webhook

The webhook endpoint is public. Before using its payload, verify the `x-paystack-signature` against the raw request body using HMAC-SHA512 and the server-side secret key. Use a constant-time verification method supported by your runtime. Then validate the event and send `charge.success` to the shared service. The [Paystack webhook guide](https://paystack.com/docs/payments/webhooks/) explains signatures and delivery retries.

For a relevant payment event, return `200 OK` after processing completes, including when it was already processed. If processing temporarily fails, return a retryable error so it can be attempted again.

For longer work, another design is to save the authenticated event durably, return `200 OK`, and let a worker process it. That design needs its own retries and monitoring. Starting an in-memory background task before responding does not guarantee the event will survive a stopped process.

Provider retries do not continue forever. Keep unresolved attempts visible and provide a reconciliation action that verifies them again through the same service.

## Add coordination only if it helps

The transaction protects the order updates. A short-lived claim on the payment attempt can additionally reduce duplicate calls to Paystack: one request verifies while another receives an in-progress result.

This is optional. The claim can expire while a slow request is still running, so it cannot replace the transaction’s checks. In my synchronous webhook handler, an in-progress result receives a retryable response rather than being acknowledged as complete.

## Test what happens after the first success

Replay `pay-42-a` after payment, then send two requests for it simultaneously. Inspect the database: there should be one paid-order transition, one set of stock movements, and one notification record per intended message. Notification records alone do not guarantee exactly one delivered email; delivery needs its own duplicate protection.

Also test a second successful reference, the wrong amount, an invalid signature, a test/live mismatch, and a verification timeout.

Finally, stop the handler after the database commits but before it sends the response. A retry must find the saved payment and return success without another stock deduction. The sender cannot know your database committed if it never received the response.
