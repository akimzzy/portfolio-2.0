---
title: "Calculating naira prices without floating-point errors"
summary: "Use integer kobo, bounded arithmetic, and explicit discount rounding to keep JavaScript price calculations predictable."
slug: "naira-prices-integer-kobo"
author: "Akeem Adeyemi"
topics: ["pricing", "javascript", "e-commerce"]
date: "2026-10-19"
draft: false
---

# Calculating naira prices without floating-point errors

A customer buys three items at ₦1,999.99 each, with a 7.5% discount. What should the checkout charge?

The subtotal is ₦5,999.97. The discount produces a fraction of a kobo, so the final amount depends on how you round it. That rule should be a deliberate decision, rather than whatever happens when you format the result.

JavaScript adds another complication: decimal arithmetic can be approximate. For example, `0.1 + 0.2` produces `0.30000000000000004`. The approach below uses integer kobo and an explicit rounding rule, from price input to the displayed total. The code blocks are JavaScript fragments, not complete application files. For a quick run, paste them in order into a `prices.js` file and run `node prices.js`, or paste them in order into a browser console. In an application, keep the calculation and input-validation functions in a shared pricing module and have the server validate the amount before charging a customer.

## Choose the unit before writing the formula

One naira is 100 kobo: ₦1,999.99 becomes `199999`. For this example, amounts entering the pricing functions are non-negative integer kobo. Convert decimal input once, then keep calculations in that unit.

A function taking `15000` should not have to guess whether that means naira or kobo. Names such as `unitKobo` and `totalKobo` make the contract visible at call sites.

This example assumes NGN. A multi-currency application needs currency-aware minor-unit rules rather than assuming every currency has two decimal places.

## Integers still need bounds

JavaScript numbers represent integers exactly only within the safe-integer range. Validating that an input has no decimal part is not enough if its magnitude is too large. [MDN documents the safe-integer boundary](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER).

There is another issue: two individually safe integers can produce an unsafe product. A valid unit price multiplied by a valid quantity may exceed the result range.

The pricing helpers I built use **BigInt**, JavaScript’s integer type for exact large-integer arithmetic, for intermediate calculations. They check the result before converting back to a number. This example follows that approach:

```js
function kobo(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid kobo amount");
  }
  return BigInt(value);
}

function safeAmount(value) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount outside supported bounds");
  }
  return Number(value);
}

function lineTotal(unitKobo, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) {
    throw new Error("Invalid quantity");
  }
  return safeAmount(kobo(unitKobo) * BigInt(quantity));
}

function discountKobo(amountKobo, basisPoints) {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new Error("Invalid discount rate");
  }
  return safeAmount(kobo(amountKobo) * BigInt(basisPoints) / 10000n);
}
```

Convert inputs to BigInt before multiplying: converting an already-imprecise result cannot recover the lost digits. `safeAmount` rejects a result outside the supported range. The one-million quantity cap is an example application limit; choose one that fits your business.

## Make rounding a business rule

A basis point is one hundredth of a percentage point. A 7.5% discount is therefore `750` basis points, with `10000` representing 100%.

For a unit price of ₦1,999.99 and a quantity of three:

```js
const subtotal = lineTotal(199999, 3);        // 599997 kobo
const discount = discountKobo(subtotal, 750); // 44999 kobo
const total = subtotal - discount;          // 554998 kobo
```

The mathematical discount is `44999.775` kobo. This implementation truncates the non-negative discount to `44999`, because BigInt integer division discards the fractional part. The resulting total is ₦5,549.98. [MDN's BigInt reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) describes that division behavior.

Rounding that discount to the nearest kobo instead would give a 45,000-kobo discount and a total of ₦5,549.97: one kobo less. This example deliberately rounds the discount down, not the final total down. Use the rule your business requires consistently.

Also decide where rounding occurs. Applying and rounding a discount on every unit can produce a different result from applying it once to the subtotal. A cart-level discount spread across multiple lines needs an explicit allocation rule if the line amounts must sum exactly to the order total.

The small functions above calculate a subtotal discount. They do not silently define that allocation policy for an entire commerce system.

## Validate decimal input before converting it

An input field often contains a string such as `"1999.99"`. Avoid accepting arbitrary floating-point input and hoping `Math.round(value * 100)` makes every case safe.

Keep the input as text and split its naira and kobo parts directly. This helper uses `safeAmount` from above:

```js
function parseNaira(text) {
  if (typeof text !== "string" || text.trim() !== text || !/^\d{1,14}(?:\.\d{1,2})?$/.test(text)) {
    throw new Error("Enter a non-negative amount with at most two decimals");
  }
  const [whole, fraction = ""] = text.split(".");
  return safeAmount(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
```

`parseNaira("1999.99")` returns `199999`, and `parseNaira("0.1")` returns `10`. This parser is an illustrative input boundary, rather than a copy of the store’s form implementation. It deliberately rejects surrounding whitespace, commas, scientific notation, negative values, and extra decimal places. If the interface accepts a more flexible format, normalise it deliberately before this boundary rather than letting the arithmetic functions guess.

The length limit bounds parsing work; `safeAmount` still enforces the supported numeric range.

## Display the result without changing the amount

Formatting belongs at the end. This formatter splits integer kobo into naira and a two-digit remainder, without decimal division:

```js
function formatNaira(amountKobo) {
  const amount = kobo(amountKobo);
  const whole = (amount / 100n).toLocaleString("en-NG");
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `₦${whole}.${fraction}`;
}

const inputKobo = parseNaira("1999.99");
const checkoutSubtotal = lineTotal(inputKobo, 3);
const checkoutDiscount = discountKobo(checkoutSubtotal, 750);
const checkoutTotal = checkoutSubtotal - checkoutDiscount;
const displayedTotal = formatNaira(checkoutTotal); // ₦5,549.98
```

The displayed string is for people. Keep `checkoutTotal`, the integer `554998`, for storage and any payment integration that expects kobo. Do not parse a formatted receipt string back into an amount.

## Keep the database and payment boundary consistent

Application arithmetic is only one boundary. The database column must hold the intended range, and the payment provider must receive the required unit. For example, a [PostgreSQL `integer`](https://www.postgresql.org/docs/current/datatype-numeric.html) holds at most 2,147,483,647 kobo, or ₦21,474,836.47. Your database or provider may impose lower limits than the arithmetic helpers. Validate the actual boundary too; supporting a large number in JavaScript does not make it a valid product price.

The helpers allow a zero amount and a 100% discount. Your checkout or provider may require a positive charge, so validate that business rule separately.

Keep the order's calculated amounts as server-owned values. The browser can display an estimate, but it should not choose the amount the server sends to the payment provider.

For a cart with several lines, check the aggregate sum’s bounds too. Individually safe line totals can still overflow when added.

Store the amounts needed to explain an order after prices or discount rules change. A receipt for yesterday's purchase should not be recalculated from today's catalogue price.

## Test expected values and rejected values

Check zero and full discounts, rates with fractional percentages, totals near your supported maximum, and quantities outside the allowed range. Test string parsing separately from arithmetic.

For this example, `discountKobo(10001, 5000)` must return `5000`: a half-kobo fraction is truncated under the chosen rule. `lineTotal(Number.MAX_SAFE_INTEGER, 2)` must throw rather than return a rounded integer.

Also check that formatting preserves zero, one kobo, and the largest supported amount. If the rounding policy changes, update the expected amounts in the tests before changing the helper. Those values document what the checkout is supposed to charge.
