---
title: "Building QuikCity: local food ordering through WhatsApp"
summary: "Why I built a food-ordering platform around WhatsApp, and why vendor trust and local rider availability mattered as much as the software."
slug: "building-quikcity-around-whatsapp"
author: "Akeem Adeyemi"
image: "/writing/quikcity-food-ordering.jpg"
imageWidth: 1280
imageHeight: 720
imageAlt: "QuikCity homepage introducing food ordering through WhatsApp"
topics: ["product-engineering", "whatsapp", "food-delivery"]
screenshots:
  - src: "/projects/quikcity.jpg"
    label: "Desktop · customer homepage"
    alt: "QuikCity desktop homepage introducing food ordering through WhatsApp"
    width: 1280
    height: 720
  - src: "/projects/quikcity-hero-mobile.jpg"
    label: "Mobile · customer homepage"
    alt: "QuikCity mobile homepage with its Buy food button"
    width: 390
    height: 844
  - src: "/projects/quikcity-how-it-works-desktop.jpg"
    label: "Desktop · ordering explained"
    alt: "QuikCity public ordering guide: share your location, pick an eatery and items, then pay for delivery"
    width: 1280
    height: 720
  - src: "/projects/quikcity-vendors-mobile.jpg"
    label: "Mobile · vendor introduction"
    alt: "QuikCity public vendor introduction explaining local discovery and orders through WhatsApp"
    width: 390
    height: 844
date: "2026-10-19"
draft: false
---

# Building QuikCity: local food ordering through WhatsApp

I started QuikCity because I saw a gap in how food delivery served my area. I wanted smaller eateries, including those without much online visibility, to be easier to order from. I also wanted customers to place those orders through an app they already used: WhatsApp.

I designed, built, and launched the platform myself. Customers can start ordering through WhatsApp or use the website. Vendors and riders receive notifications on WhatsApp, while vendors also have a web app to manage their side of the service.

The hardest part was getting that service to work between people who did not yet know or trust it.

## Use a familiar app, but keep the service behind it

A separate customer app would add another step before someone could order: finding it, downloading it, and deciding whether to keep it. WhatsApp offered an entry point that was already familiar to the customers and local businesses I wanted to reach.

Someone with QuikCity's WhatsApp contact could initiate an order without installing a dedicated food-delivery app. The website remained another way to order; customers were not restricted to a conversation.

That did not mean every part of the product belonged inside WhatsApp. QuikCity also needed vendor operations, payments, and delivery coordination. I built the [vendor web app](https://app.quikcity.co/) alongside the customer-facing service.

Consider the practical requirement: a customer wants lunch from a nearby eatery. Starting an order is only the beginning. The vendor needs to receive it, payment needs to be accounted for, and a rider needs to be available. Making the first step familiar does not remove the remaining work.

## Vendor trust was harder than vendor registration

One of the hardest parts was convincing eateries and supermarkets to join. QuikCity receives the customer's payment before the vendor receives its money. For a business that does not know the platform yet, that is a reason to hesitate.

I used Monnify virtual accounts for the payment flow, including vendor settlements and rider payouts. But integrating a payment provider did not, by itself, give a vendor confidence in a new service. The business still needed to trust that it would receive its money.

That distinction matters during onboarding. A completed registration is not the same as a vendor being comfortable accepting orders. The software can support payments and notifications; the relationship still has to be established.

More than 30 vendors joined QuikCity, and the platform recorded over 100 customer interactions. Those figures describe participation and activity, rather than completed orders or repeat purchasing.

## Reach people where delivery can actually work

Finding customers was another challenge. The audience was not simply everyone who lived nearby. It was people who wanted to buy prepared food and have it brought to them at that moment.

Flyers could introduce the service locally, but they were less useful for reaching someone who wanted to stay indoors. Online advertising could reach that person, but attracting attention outside the area we could serve would not help fulfil an order.

For example, an advert might interest someone in a nearby neighbourhood. If there is no available rider serving that neighbourhood, the interest does not translate into a dependable food-delivery service. The useful reach of the product depends on the area the operation can support.

This made customer acquisition and delivery coverage part of the same problem. Promoting the platform more widely only helps when vendors and riders can support the demand it brings.

## Food delivery makes local availability a product constraint

Food orders are time-sensitive. A customer ordering a meal usually wants to eat soon, so a rider being available much later can undermine the service even when the ordering software works.

I wanted riders to be available within minutes. That was an operational target, not a promise that every order would arrive within five minutes. Finding a rider, preparing the food, collecting it, and completing delivery are different parts of the wait.

Expanding into several locations would mean arranging local rider availability in each of them. Limited funding made that difficult to establish simultaneously. Adding another location to the software would not create the delivery capacity needed to serve it.

For a product like this, coverage is more than a list of supported areas. It also depends on whether an order can be fulfilled when the customer needs it. A familiar ordering channel helps someone begin; local operations determine whether they can rely on the result.

## What I took from building it

Reducing friction at the start of an order solved only part of the problem. Vendor confidence, reaching customers within a serviceable area, and having riders available were harder constraints than adding another screen.

For an engineer building a similar local service, I would start by asking who can fulfil an order, where, and at what time, alongside how the customer places it. Those answers shape the product as much as the choice of interface.
