---
title: "Keeping inventory consistent across online and in-store sales"
summary: "What happens when an online order and a shop attendant need the same stock? A practical look at allocation, transactions, shortages, and safe retries."
slug: "shared-inventory-online-instore"
author: "Akeem Adeyemi"
topics: ["inventory", "e-commerce", "postgresql"]
date: "2026-10-19"
draft: false
---

# Keeping inventory consistent across online and in-store sales

A perfume store has two bottles left. An online customer pays for both while a shop attendant records a sale for one.

Both screens showed two available. The store now has demand for three bottles, but only two to supply. Refreshing the screens more often will not solve the underlying problem: both sales must check and change the same stock records safely.

For example, both requests could read a balance of two. The online request assigns two bottles and writes a balance of zero. The walk-in request then assigns one and writes a balance of one, using its earlier read. Three bottles have been promised, and the database still says one is available.

The examples below use PostgreSQL and one shared stock balance. They explain how to coordinate those updates, then what to do when there genuinely is not enough stock.

## Define what the stock balance means

Use one stock record for each sellable variant, commonly called a **SKU**. A 50 ml bottle and a 100 ml bottle of the same fragrance need separate records. Online and in-store sales both update those records.

In the code below, `onHand` means the quantity available for a new allocation. Allocating a bottle means assigning it to an order and removing it from that available balance. The bottle may still be physically in the stockroom waiting for pickup. Do not confuse available stock with a count of everything on the premises.

Keep three quantities on an order line:

- **Requested:** how many units the customer ordered.
- **Allocated:** how many units were assigned from available stock.
- **Shortage:** the part of the request still waiting for stock.

The rules are `requested = allocated + shortage` and `available stock >= 0`. A walk-in sale in this system must also have zero shortage before it can complete.

## Decide whether a shortage can become an order

Protecting the balance does not create a third bottle. You still need a rule for the customer whose order cannot be supplied in full.

An online customer may finish paying after another sale takes the last bottle. A stock check before payment does not set that bottle aside.

In the store I built, a paid online order receives whatever quantity remains. Any shortage is flagged for restocking, and the order cannot proceed through the relevant fulfilment steps until those items are allocated. Staff must resolve the shortage; payment alone does not mean the order is ready to ship.

Walk-in sales follow a different policy: insufficient stock stops the sale. If stock or prices have changed since the attendant reviewed it, the application asks for another review before completion.

Another store may require full allocation before accepting an order. That can mean reserving stock before payment, with rules for expiry, release, and late payment. Choose that policy deliberately and explain availability to customers. Keeping the stock column non-negative does not, by itself, prevent taking payment for unavailable goods.

## Keep the arithmetic separate from the transaction

This JavaScript function is a pure calculation fragment, not a route, transaction, or database update. Put it with your inventory business rules. Call it on the server only after the operation below has locked and read the current stock balance; do not use a browser's cached balance as its input.

Once you have a current balance, the allocation calculation is small:

```js
function allocate(onHand, requested) {
  if (!Number.isSafeInteger(onHand) || onHand < 0 || onHand > 2147483647) {
    throw new Error("Invalid stock quantity");
  }
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > 1000000) {
    throw new Error("Invalid requested quantity");
  }
  const allocated = Math.min(onHand, requested);
  return {
    requested,
    allocated,
    shortage: requested - allocated,
    remaining: onHand - allocated,
  };
}
```

`allocate(1, 2)` returns `{ requested: 2, allocated: 1, shortage: 1, remaining: 0 }`. It calculates an outcome; it does not assign stock or save anything.

The maximum stock value fits a PostgreSQL integer, and the request cap is an application choice. Adapt those limits to your schema. Most importantly, do not calculate from a browser’s saved quantity and write the result back: the server must read the current balance within the protected operation below.

## Make the stock check and update one operation

Two controls work together here:

- A **transaction** saves related changes together. If a write fails before commit, the changes can all be rolled back.
- A **row lock** makes a competing stock update wait. Acquire the lock as part of reading the balance used for allocation. PostgreSQL provides `SELECT … FOR UPDATE` for this.

A transaction alone does not fix the opening example if both requests still calculate from old balances. The coordinated read matters too. An **inventory movement** records why a balance changed, such as “one bottle sold in store.”

For the two-bottle example, suppose the walk-in sale gets the stock lock first:

1. It reads two available bottles, validates the reviewed sale, and deducts one.
2. It saves the sale and its inventory movement in the same transaction, then commits.
3. The online transaction, which was waiting for that lock, reads the remaining bottle.
4. It allocates one to the online order, records the shortage of one, and commits its related order and inventory changes together.

The final records are:

| Sale | Requested | Allocated | Shortage |
| --- | ---: | ---: | ---: |
| Walk-in | 1 | 1 | 0 |
| Online | 2 | 1 | 1 |

Zero bottles remain available. If online allocation commits first instead, it takes both bottles and the walk-in sale is rejected. Lock order determines which transaction proceeds; it does not establish a business priority between channels.

Keep the stock balance, allocated quantities, shortages, movement records, and affected order state in the same transaction. A browser preview or a stock read before acquiring the lock cannot be the authority for those writes.

## Protect every route that changes stock

Online allocation, walk-in sales, restocks, and adjustments must coordinate against the same stock rows. An application-server lock in memory cannot coordinate requests handled by another process.

For several SKUs, acquire locks in a consistent order, such as ascending SKU ID. Otherwise, two transactions can each hold a lock the other needs and wait on each other: a **deadlock**. Consistent ordering reduces that risk. Keep transactions short and external payment or email calls outside them. [PostgreSQL’s locking guide](https://www.postgresql.org/docs/current/explicit-locking.html) explains the details.

The waiting-and-rereading example assumes PostgreSQL’s Read Committed isolation. Other isolation settings can instead reject a conflicting transaction. Retry the whole transaction when the database reports a retryable conflict, with a limit on attempts. [PostgreSQL’s isolation guide](https://www.postgresql.org/docs/current/transaction-iso.html) covers that behavior.

Use database constraints as another guard: reject negative available balances and require each line’s requested quantity to equal allocated plus shortage. These checks catch invalid writes, but cannot enforce the entire sales policy. [PostgreSQL’s constraint documentation](https://www.postgresql.org/docs/current/ddl-constraints.html) explains their scope.

## Make retries safe and changes traceable

Suppose a sale commits, but the response never reaches the attendant. Retrying it must return the existing sale, not deduct another bottle.

Give the sale request an operation ID before submitting it, and reuse that ID if its response is lost. Save it with the sale and enforce uniqueness in the database, in the same transaction as the stock change. A retry can then find and return the existing sale.

Two simultaneous submissions can both miss an initial lookup. The database uniqueness rule must still prevent both from committing. The request that loses that race should recover the saved sale, rather than start a new one with a different ID.

Only authorised staff should retrieve that result, and the same ID must not be reused for changed quantities or products. These are requirements for the retry design; writing an ID in a log does not enforce them. My walk-in flow uses a unique request ID. Stock adjustments also check the submitted inputs and save the result for recovery.

Online payment processing needs a similar guard around the order’s paid transition. The separate article on [duplicate Paystack payment notifications](/writing/duplicate-paystack-notifications) covers that entry point.

Record why each balance changed: sale, allocation, restock, or adjustment, with the operation reference and appropriate staff identity. When reconciling a physical count, account for bottles already allocated to orders. Replacing the available balance with the total number on the shelf can make those bottles available twice.

## Test competing requests, not just the helper

Unit-test zero stock, exact allocation, shortages, and invalid quantities. Separately, test against a real database using two connections so the stock transactions can overlap.

For the opening example, test the walk-in transaction getting the lock first, then repeat with the online transaction first. Across committed sales, allocated quantities must total two, available stock must be zero, and stock movements must total minus two. Confirm the online shortage or walk-in rejection matches the transaction that finished first.

Repeat an operation ID and check that it produces no additional movement. Inject a failure after changing the balance but before commit: the balance, order, and movement writes must all roll back. Then simulate a lost response after commit and verify that retrying returns the saved outcome.

The helper tests check arithmetic; the database tests check whether competing requests can actually obey the rules. Neither accounts for a bottle handed over without a recorded sale. Staff still need a recording and reconciliation process so the shared balance reflects what the store can supply.
