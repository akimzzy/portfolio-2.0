# Project images

The current Alluring Aura Scent gallery uses ten phone-frame images supplied by the owner on 24 October 2026. Each PNG is copied byte-for-byte into `public/projects/`; the images are not cropped, resized, recompressed, or retouched. Their full aspect ratios are retained in both project and article galleries. Superseded captures were removed after the owner supplied the approved set.

The owner later supplied iPhone mockup versions of the home/trending and Quick Picks drawer screens. They replace the earlier uploads at the same paths, are copied byte-for-byte at 941 × 1672 pixels, and remain in both galleries.

| Asset | Source | Image size |
| --- | --- | --- |
| `alluring-home-trending-phone.png` | Owner-supplied iPhone mockup of storefront home and trending fragrances | 941 × 1672 |
| `alluring-quick-picks-drawer-phone.png` | Owner-supplied iPhone mockup of the Quick Picks drawer | 941 × 1672 |
| `alluring-shop-phone.png` | Owner-supplied shop catalogue | 852 × 1846 |
| `alluring-search-phone.png` | Owner-supplied Oud search results | 852 × 1846 |
| `alluring-brands-phone.png` | Owner-supplied brand directory | 852 × 1846 |
| `alluring-offers-phone.png` | Owner-supplied offers and bundles | 852 × 1846 |
| `alluring-product-details-phone.png` | Owner-supplied Strike Black product details | 852 × 1846 |
| `alluring-quick-picks-phone.png` | Owner-supplied Quick Picks product view | 852 × 1846 |
| `alluring-order-tracking-phone.png` | Owner-supplied order tracking form | 852 × 1846 |
| `alluring-contact-faq-phone.png` | Owner-supplied contact and FAQ screen | 941 × 1672 |
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

Attach approved screenshots in the conversation, with the project name and screen label. Private admin/vendor screens should have customer information removed. Add each asset to the project's `screenshots` array in `app/portfolio-data.ts`, including its real width, height, descriptive alt text, and short label. Portrait images use a consistent phone frame; landscape images use a wider frame in the native horizontal gallery and expand to the available width in the image viewer. External links remain above its independently scrolling detail body.

Refresh captures when the public interface materially changes.

The article and project galleries reuse the ten owner-supplied phone-frame images in the same sequence: home and trending fragrances, Quick Picks drawer, shop, search, brands, offers, product details, Quick Picks product, order tracking, and FAQs. The article lead and social image use the home/trending iPhone mockup directly from the project asset at its original 941 × 1672 dimensions. The duplicate budget-and-Quick-Picks capture was removed from both galleries. No authenticated customer, vendor, or admin data is shown.

The published QuikCity article reuses all four existing public QuikCity captures in the shared horizontal gallery and full-screen viewer. Portrait and landscape images retain their original proportions. The vendor introduction is a public marketing page, not an authenticated vendor dashboard. Its sharing image, `public/writing/quikcity-food-ordering.jpg`, is an unchanged copy of `public/projects/quikcity.jpg` (1280 × 720). All four images were visually inspected before reuse; no new captures or private data were added.

The production article route's Next.js file trace includes the eleven published posts and excludes `content/drafts/` and the editorial Markdown files at the top of `content/`. Editorial sources remain available to the local review workflow but are omitted from the deployed server artifact.
