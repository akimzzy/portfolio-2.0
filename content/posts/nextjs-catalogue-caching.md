---
title: "Keeping catalogue caches fresh in Next.js"
summary: "Reuse public catalogue results in Next.js, refresh them when products change, and keep checkout checks authoritative."
slug: "nextjs-catalogue-caching"
author: "Akeem Adeyemi"
topics: ["nextjs", "caching", "e-commerce", "cloudflare"]
date: "2026-10-19"
modified: "2026-10-19"
draft: false
---

# Keeping catalogue caches fresh in Next.js

A customer opens a product listing. Someone else buys the last bottle of a perfume on that page. If the listing is cached, how does the next visitor see the updated stock?

In a perfume storefront I built with Next.js and PostgreSQL, a server-side cache saves public catalogue results for later matching requests. That avoids repeating the full product query for every visitor, but it also needs a way to stop selecting old results.

A **revision** is a version number advanced when relevant data changes. I include those numbers in the cache keys. When products or stock change, later requests can select a newer result. The server still validates prices and stock when processing an order.

## Make the key describe the result

The cheapest products on page one must not share a result with the newest products on page two. A cache key identifies the response a request can reuse. Finding a usable saved response is a **cache hit**; a **miss** means the server needs to fetch the result.

Validate filters first, apply consistent defaults, and include every input that changes the response. Bound page sizes so one request cannot ask for the entire catalogue unexpectedly.

This is a function fragment, not a complete route or cache implementation. Put it beside the server-side code that builds catalogue cache keys. It expects a `state` object containing the current catalogue and stock revisions, plus a `filters` object that your request has already validated; map those values to your own application's data structures before using it.

Here is the key function:

```js
function catalogueKey(state, filters) {
  return JSON.stringify([
    "catalogue-v1",
    state.catalogue,
    state.stock,
    filters.category ?? null,
    filters.sort,
    filters.page,
    filters.pageSize,
  ]);
}
```

The first value identifies the response format. If that format changes, a new namespace prevents a deployment from reusing incompatible saved results.

The example uses readable keys. Include search terms, currency, or any other response-changing input if your endpoint supports them. Hashing the inputs, as my storage implementation does, does not change that requirement.

## Change the address when the data changes

Suppose the catalogue revision is `12` and the stock revision is `40`. A listing uses both in its key. A completed sale advances stock to `41`.

The next request that reads `41` looks up a different cache entry. If that entry does not exist, the server reads the database and saves the result under the new key. Subsequent matching requests can reuse it.

The old entry is no longer selected by requests using the new version. It can still occupy storage: rejecting an expired entry does not delete the underlying object. Cleanup needs its own policy.

The data change and revision update must commit together. Advancing a revision before the product update commits could populate the new address with old data. Forgetting to advance it could keep selecting the previous result.

A request can read a revision just before another transaction changes the products. If the version and product data must describe exactly the same snapshot, use a consistent database read or a version recheck with bounded retries. A new cache entry also does not update a page already open in someone's browser; that needs another request or an explicit live-update mechanism.

## Keep the revision lookup small without hiding changes

Maintain versions when relevant writes happen. Discovering the current version should not require loading products or comparing the whole catalogue.

The lookup still costs server and database work. Inspect that query separately from the larger product query, and deduplicate repeated lookups within one render where appropriate.

Be deliberate about caching the revision itself. Reusing an old version delays discovery of changes, even if every product cache key is otherwise correct. A database proxy can introduce the same problem through its own query cache. [Cloudflare documents Hyperdrive's caching and fresh-read options](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).

Choose the revision's freshness policy explicitly. Checking it on a public request adds overhead; caching it reduces that work but creates a stale window. Measure the lookup and choose a delay the storefront can tolerate instead of adding another unchecked cache.

## Separate results with different dependencies

A stock change does not rename a brand. Brand and category choices can use the catalogue revision without depending on the stock revision. Listings that include availability need the relevant stock version too.

These are broad dependency groups. With one global stock revision, a sale can change the keys of all stock-dependent listings, even pages that do not contain the sold product. That keeps the scheme simple but can lower the hit rate in a busy store. Measure that cost before introducing finer-grained versions.

I also keep filter choices separate from product-page responses, so loading another page does not repeat the same brand and category queries.

Time-based changes need attention. A promotion can end without anyone editing a record at that moment. Choose expiry or invalidation rules that cover those boundaries; a write-only revision scheme cannot detect the passage of time by itself.

## Fall back when the cache cannot help

My public result cache uses Cloudflare R2 storage, validates saved entries, and checks their age. A missing, invalid, or unreadable entry falls back to the underlying database read. A failed cache write does not discard a successful result.

Saving JSON in R2 does not configure browser or CDN caching. Check those response policies separately; a downstream cache can serve an older response without reaching this lookup.

Fallback also needs a realistic origin budget. Many simultaneous misses can repeat the same database work. Depending on traffic, request deduplication or controlled stale serving may be worthwhile. Measure that need before adding more coordination.

If the cache has no usable entry and the database read fails, show an unavailable state rather than treating the result as an empty catalogue.

## Keep checkout outside the public catalogue cache

A customer can leave a product page open while stock changes. Even a well-refreshed listing cannot reserve that stock by displaying it.

At checkout, validate the operation against authoritative records and coordinate inventory changes in the database. The competing-sale example in [keeping inventory consistent across online and in-store sales](/writing/shared-inventory-online-instore) explains that allocation boundary. Private orders, session checks, permissions, and authenticated admin responses must not enter the shared public catalogue cache.

## Check the behavior through one sale

Request the same listing twice, then change its stock through a committed sale. Confirm that the observed revision changes, the new result uses a different key, and the next matching request can reuse it.

Also check different filters/pages, a corrupt cache entry, unavailable cache storage, and a promotion crossing its end time. Finally, submit an order from an older product page: server validation must still enforce current prices and stock.

Compare database work before and after caching, including revision lookups and cache misses. Reusing more responses is useful only when those responses remain appropriate for the request.
