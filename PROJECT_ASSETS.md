# Project images

Captured from the owner's public product pages on 18 October 2026 using the browser. These are real interface screenshots, not mockups. No authenticated customer, vendor, or admin data was captured.

| Asset in `public/projects/` | Source | Viewport |
| --- | --- | --- |
| `alluring-storefront-mobile.jpg` | https://alluringaurascent.com/ | 390 × 844 |
| `alluring-catalogue-mobile.jpg` | https://alluringaurascent.com/shop | 390 × 844 |
| `alluring-product-mobile.jpg` | Public Qasida Signature product detail, reached from Shop | 390 × 844 |
| `alluring-categories-mobile.jpg` | https://alluringaurascent.com/categories | 390 × 844 |
| `alluring-search-mobile.jpg` | https://alluringaurascent.com/search (Lattafa results) | 390 × 844 |
| `airborne-hero-desktop.jpg` | https://airborneconsult.com/ | 1280 × 720 |
| `airborne-hero-mobile.jpg` | https://airborneconsult.com/ | 390 × 844 |
| `airborne-services-desktop.jpg` | https://airborneconsult.com/#services | 1280 × 720 |
| `airborne-destinations-desktop.jpg` | https://airborneconsult.com/#destinations | 1280 × 720 |
| `quikcity.jpg` | https://www.quikcity.co/ (Hungry selected) | 1280 × 720 |
| `quikcity-hero-mobile.jpg` | https://www.quikcity.co/ (Hungry selected) | 390 × 844 |
| `quikcity-how-it-works-desktop.jpg` | https://www.quikcity.co/#how-it-works | 1280 × 720 |
| `quikcity-vendors-mobile.jpg` | https://www.quikcity.co/#vendors | 390 × 844 |

Promotional invitations were dismissed before capture.

## Adding screenshots

Attach approved screenshots in the conversation, with the project name and screen label. Private admin/vendor screens should have customer information removed. Add each asset to the project's `screenshots` array in `app/portfolio-data.ts`, including its real width, height, descriptive alt text, and short label. Portrait and landscape images share a fixed-height, native horizontal gallery. External links remain above its independently scrolling detail body.

Refresh captures when the public interface materially changes.

The article uses the existing mobile storefront, catalogue, product-detail, category, and search captures in an accessible horizontal gallery, with the same full-screen viewer used by project details. Its sharing image at `public/writing/nextjs-ecommerce-alluring-aura-scent-mobile.jpg` is an unchanged copy of `public/projects/alluring-storefront-mobile.jpg` (390 × 844). The former desktop article image was removed. No image is stretched or cropped, and no private admin/customer data is exposed.

The published QuikCity article reuses all four existing public QuikCity captures in the shared horizontal gallery and full-screen viewer. Portrait and landscape images retain their original proportions. The vendor introduction is a public marketing page, not an authenticated vendor dashboard. Its sharing image, `public/writing/quikcity-food-ordering.jpg`, is an unchanged copy of `public/projects/quikcity.jpg` (1280 × 720). All four images were visually inspected before reuse; no new captures or private data were added.

The production article route's Next.js file trace includes the eleven published posts and excludes `content/drafts/` and the editorial Markdown files at the top of `content/`. Editorial sources remain available to the local review workflow but are omitted from the deployed server artifact.
