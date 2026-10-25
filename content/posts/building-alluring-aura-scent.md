---
title: "Building a Next.js E-commerce App: Alluring Aura Scent"
summary: "How I built a Next.js e-commerce app for a perfume store, with Cloudflare Workers, IndexedDB catalogue caching, and shared online and in-store inventory."
slug: "building-nextjs-ecommerce-app"
author: "Akeem Adeyemi"
image: "/projects/alluring-home-trending-phone.png"
imageWidth: 941
imageHeight: 1672
imageAlt: "Alluring Aura Scent mobile home page with the fragrance budget finder, trending products, and bottom navigation"
topics: ["e-commerce", "nextjs", "indexeddb", "caching", "cloudflare"]
screenshots:
  - src: "/projects/alluring-home-trending-phone.png"
    label: "Home and trending fragrances"
    alt: "Alluring Aura Scent mobile home page with the fragrance budget finder, trending products, and bottom navigation"
    width: 941
    height: 1672
  - src: "/projects/alluring-quick-picks-drawer-phone.png"
    label: "Quick Picks"
    alt: "Alluring Aura Scent Quick Picks drawer showing featured fragrances and an option to explore the selection"
    width: 941
    height: 1672
  - src: "/projects/alluring-shop-phone.png"
    label: "Shop"
    alt: "Alluring Aura Scent shop with filters, sorting, and a two-column fragrance catalogue"
    width: 852
    height: 1846
  - src: "/projects/alluring-search-phone.png"
    label: "Search"
    alt: "Alluring Aura Scent search showing Oud fragrance results"
    width: 852
    height: 1846
  - src: "/projects/alluring-brands-phone.png"
    label: "Brands"
    alt: "Alluring Aura Scent brand directory with fragrance counts and search"
    width: 852
    height: 1846
  - src: "/projects/alluring-offers-phone.png"
    label: "Offers"
    alt: "Alluring Aura Scent offers page with perfume bundles and sale prices"
    width: 852
    height: 1846
  - src: "/projects/alluring-product-details-phone.png"
    label: "Product details"
    alt: "Alluring Aura Scent Strike Black product details with price, description, and Add to cart button"
    width: 852
    height: 1846
  - src: "/projects/alluring-quick-picks-phone.png"
    label: "Quick Picks product"
    alt: "Alluring Aura Scent Quick Picks product view for Khamrah Body Spray with price and Add to cart button"
    width: 852
    height: 1846
  - src: "/projects/alluring-order-tracking-phone.png"
    label: "Order tracking"
    alt: "Alluring Aura Scent order tracking form requesting an order ID and checkout email"
    width: 852
    height: 1846
  - src: "/projects/alluring-contact-faq-phone.png"
    label: "Contact and FAQs"
    alt: "Alluring Aura Scent contact page with expandable customer support questions"
    width: 941
    height: 1672
date: "2026-10-18"
modified: "2026-10-24"
draft: false
---

# Building a Next.js E-commerce App: Alluring Aura Scent

Alluring Aura Scent was growing from a business selling through social media into a physical perfume store with a larger inventory. Customers came through DMs to ask about prices, find fragrances, and get recommendations.

The store needed an e-commerce website where customers could browse and buy without waiting for a reply. Personal advice would still be available, but someone who already knew what they wanted could find it themselves.

I planned, designed, built, and deployed the app, then handed it over to the store. I also built an admin app for managing products, stock, and orders.

The hardest part was keeping the app responsive on a small hosting budget. That shaped how I fetched and cached data, especially as the catalogue grew.

## Building for customers and store staff

Customers can search for fragrances, check out without creating an account, and track their orders. They can choose delivery or pickup from the physical store. The payment flow also needs to handle callbacks and repeated webhooks without processing the order twice; I cover that in [handling duplicate Paystack payment notifications](/writing/duplicate-paystack-notifications).

The admin app handles catalogue management, spreadsheet imports, inventory, and fulfilment. The validation, preview, and commit workflow is covered in [importing a product catalogue from a spreadsheet](/writing/spreadsheet-product-imports). Because the business also sells in person, online orders and walk-in sales draw from the same stock.

The application uses Next.js, TypeScript, and PostgreSQL, and runs on Cloudflare Workers. It is also a progressive web app, or PWA, which can be installed from the browser.

## Hosting the Next.js app on Cloudflare Workers

I considered AWS and Vercel. I had used AWS and DigitalOcean before, but Cloudflare was new to me.

I chose Workers because its free tier offered a starting point that suited the store's budget, with the option to move to a paid plan as usage grew. I also wanted to learn Cloudflare, but the running cost was the main reason for choosing it. The deployment steps are covered in [deploying Next.js to Cloudflare Workers with OpenNext](/writing/deploy-nextjs-cloudflare-workers).

That choice meant paying close attention to CPU usage, database queries, and repeated requests. The free tier had limits, and hosting was only part of the app’s running cost. I needed to avoid unnecessary requests and database work.

## Caching the admin catalogue with IndexedDB

I designed the admin catalogue to accommodate more than 5,000 products. A routine task might involve finding a fragrance, updating it, and then searching for another. The interface needed to support that work without repeatedly downloading the entire catalogue.

I used IndexedDB, a database built into the browser, to store a local catalogue. After the initial download, the admin can browse and search that saved data. This is a catalogue cache, not a local copy of every part of the store's database. I explain the download, local search, and refresh policy in [building an IndexedDB catalogue that stays in sync](/writing/indexeddb-catalogue-synchronisation).

The download happens in chunks, with progress saved so an interrupted transfer can resume. The application checks for changes using revision numbers: versions that indicate whether the saved catalogue or stock data needs updating. Where possible, it fetches those changes rather than downloading everything again.

Catalogue and stock revisions are tracked separately. A change in stock therefore does not automatically require a complete catalogue download.

A local catalogue is not the only option. Server-side search and pagination can also handle a catalogue of this size. In this app, keeping a local copy lets the admin reuse product data while browsing and searching.

The tradeoff is synchronisation. The first download takes time and storage, requests can fail, and the browser's copy can fall behind. I had to handle interrupted downloads, refresh failures, and changes made while a download was in progress.

## Keeping cached data in its place

The local catalogue helps the interface respond without fetching the same data repeatedly. The server still validates permissions, prices, and inventory when an operation is submitted.

For example, a product may appear available in the saved catalogue even though a walk-in sale has just reduced its stock. The saved quantity cannot be the final authority when an order is processed. That check belongs on the server, where both sales channels share the same inventory. I explain the transaction and shortage rules in [keeping inventory consistent across online and in-store sales](/writing/shared-inventory-online-instore).

The storefront also uses caching for public catalogue data. Those cache entries include catalogue and stock revisions in their keys, so a new revision uses a different cached result. This reduces repeated database work while giving product and stock changes a way to reach the storefront. The cache keys, revision checks, and freshness tradeoffs are covered in [keeping catalogue caches fresh in Next.js](/writing/nextjs-catalogue-caching).

Private orders and authenticated admin responses stay out of shared public caches. They need access checks and cannot be treated like a public product listing.

## What using the store revealed

The store is now using [Alluring Aura Scent](https://alluringaurascent.com/). When a customer places an order, the admin receives an email with a link to manage it. Orders can be marked as shipped or ready for pickup, depending on the fulfilment method. I explain the delivery and recovery choices in [sending order emails with Resend](/writing/reliable-order-emails-resend).

One request after launch was for notifications from the installed PWA. Emails can be overlooked, and the admin wanted order alerts to appear like notifications from the business app on their phone. That feature is not yet available.

Another request came within the first week: the ability to choose which products appear first within a category or brand. The default order was based on when products were added. The admin wanted to bring selected products forward, regardless of their addition date.

These requests gave me a clearer picture of the admin’s daily work: keeping up with orders and choosing which products to show customers.

## What I learned

The hosting choice was only the start. I also had to decide what to fetch, what to keep in the browser, and when to refresh it.

The local catalogue reduced repeat downloads, but introduced synchronisation work. Cached browsing could be fast while an order still needed current server-side checks.

The first week of use also showed how much the admin experience matters. Customers need a straightforward way to buy, and the people running the store need a straightforward way to act on those purchases.
