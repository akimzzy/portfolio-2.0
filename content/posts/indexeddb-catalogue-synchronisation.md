---
title: "Building an IndexedDB catalogue that stays in sync"
summary: "Reuse a product catalogue across visits, search and filter locally, and fetch changes through revision checks instead of downloading it again."
slug: "indexeddb-catalogue-synchronisation"
author: "Akeem Adeyemi"
topics: ["indexeddb", "caching", "e-commerce"]
date: "2026-10-19"
modified: "2026-10-19"
draft: false
---

# Building an IndexedDB catalogue that stays in sync

Imagine four managers working through a catalogue of 5,000 products. They search for items, filter by brand, and scroll through results. Only a few products change, but a server-backed list can still make requests for each new search or page.

I used IndexedDB, the browser's database, to keep a reusable catalogue for a perfume-store admin app I built. It works in a browser or as an installed progressive web app (PWA). The same approach can suit an equipment list or another collection used repeatedly on one device.

The aim was to reuse one download across visits and fetch changes when needed. Constant revision requests would undermine that saving.

## A page of results does not have to be a network request

With server-side pagination, loading another page requests more data. Server-side search can find a product directly, but it also needs a request unless a suitable result is cached. A local catalogue moves those repeated reads to the device.

With the complete catalogue saved locally, searching, filtering, and ordering results can happen on the device. The interface can still display 25 products at a time. Scrolling reveals more saved records instead of requesting another product page from the server.

This is a client-side function fragment, not the IndexedDB setup or a complete page. Put it in the browser-side module or component that handles the saved catalogue, and call it after reading the product records from IndexedDB. It does not fetch products or perform a revision check.

A simplified local search looks like this:

```js
function findProducts(products, query, visibleCount = 25) {
  const term = query.trim().toLocaleLowerCase();
  return products
    .filter(product => product.name.toLocaleLowerCase().includes(term))
    .slice(0, visibleCount);
}
```

Calling it with `visibleCount = 50` reveals more matching records without a fetch. The application also filters by brand, category, status, and stock, and orders products locally. Neither typing a search nor changing those filters needs to trigger a revision check.

Local processing still uses device resources. Server-side search may suit larger or rapidly changing datasets better; this approach fit a repeatedly used admin catalogue on a limited hosting budget.

## Download in chunks, then reuse the saved copy

The initial download uses **15 products per chunk**; the list displays **25 at a time**. These are project settings, not recommended defaults. Smaller chunks reduce individual payloads but increase the initial request count, so choose a batch size that fits the data and server limits.

Each chunk saves its records and a **cursor**, a marker identifying where the next download should resume. Both must commit in one IndexedDB transaction so progress cannot advance past failed writes. Fetch and validate the chunk before opening the transaction; [MDN explains IndexedDB transactions and setup](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

An interrupted download resumes from committed progress if that progress remains compatible with the server's version rules. Otherwise, it rebuilds.

A replacement downloads into a separate copy, called a **generation**. The working copy stays available until its replacement is complete and has caught up with changes made during the download.

On a later visit, it reads the saved catalogue first. Showing the first 25 records again does not mean downloading those 25 again. A revision check may still contact the server, but browsing does not restart the full download.

## Use revisions to discover changes

A **revision** identifies the server changes incorporated into a saved copy. Its revision advances as updates are applied.

The database tracks changed records and deletions by revision. Stock has a separate revision, so selling a bottle does not require downloading every product's description again.

For example:

| State | Catalogue revision | Stock revision |
| --- | --- | --- |
| Saved on the manager's device | 20 | 35 |
| Current on the server | 21 | 36 |

The client requests catalogue changes after `20` and stock changes after `35`. It applies renamed products, changed quantities, and deletions locally.

When versions match, the client keeps its copy without fetching product changes. A revision check still costs a request and server work, so both its query and its frequency need attention.

Advance the completed revision only after every required update page commits. Replayed updates must be safe, and older data must not overwrite newer data.

## Keep revision checks small and deliberate

A saved catalogue can be out of date. If one manager changes a product, another device does not learn about it merely because both use IndexedDB.

Maintain revisions as relevant database writes happen. The check endpoint then returns versions and small freshness metadata, without loading or comparing the full catalogue. Fetch changed records only when versions differ.

A small response does not prove a cheap query. Inspect the database work, including extra lookups; avoid scanning products just to discover whether they changed.

Opening the catalogue, reconnecting, or returning from the background can request a check. A shared freshness policy skips unnecessary repeats. In this implementation, an ordinary check can be skipped when the last successful check was less than five minutes ago. That is a minimum freshness interval, not a timer that polls every five minutes.

The **Refresh** button explicitly requests a revision check, and successful local edits can trigger synchronisation. Overlapping sync attempts are coordinated; failed requests use a retry delay that manual refresh also respects. Browsing through local results does not itself require another check.

Choose the freshness window around the data. A reference directory can tolerate longer gaps than shared inventory. More frequent checks trade server work for fresher browsing.

Show the last-checked time. If refresh fails, explain that the user is seeing saved data. A sale or edit still goes to the server, which checks current permissions, prices, and stock before applying it.

## Keep a rebuild path

IndexedDB can retain data across normal browser or PWA closes. Installation is not required.

“One-time download” means once per usable local copy. Cleared or evicted storage, another device, or an incompatible format requires a new copy. Uninstall/reinstall behavior is not a persistence guarantee. [MDN documents browser storage persistence and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Private data also needs an account boundary: switching users must not expose another account's saved records.

## Check the request pattern

After the initial download, reopen the app and use the browser's Network panel while searching, filtering, and scrolling. Those actions should use saved records without product-page requests or a revision request for each interaction.

Then edit or delete a product from another session and refresh. Check that only required changes download and rapid repeat checks respect the freshness/retry policy. Test resuming an interrupted download and rebuilding after storage is cleared.

Measure the revision endpoint separately. The useful result is less repeated server work across ordinary visits, with an understandable freshness policy for the data kept on the device.
