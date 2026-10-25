import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPosts, getPublishedPosts } from '../app/writing/posts.ts';

const base = new URL(process.argv[2] ?? 'http://localhost:3000');
const get = async path => {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, `${path} should be available`);
  return response;
};

const home = await (await get('/')).text();
assert.match(home, /<title>Senior Full-Stack Engineer in Lagos \| Akeem Adeyemi<\/title>/);
assert.match(home, /Download résumé/);
assert.match(home, /Alluring Aura Scent/);
assert.match(home, /Giinagay Community Care/);
assert.match(home, /responsive client website presenting Giinagay Community Care/);
assert.doesNotMatch(home, /Speed Typer|Slider template|Earlier projects/);
assert.match(home, /og:image/);
assert.match(home, /twitter:card/);
const cssPaths = [...home.matchAll(/href="([^" ]+\.css[^" ]*)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
assert.ok(cssPaths.length, 'Production HTML must link a stylesheet');
const styles = (await Promise.all(cssPaths.map(async path => (await get(path)).text()))).join('\n');
for (const utility of ['.sticky', '.rounded-t-2xl', '.scroll-mt-']) assert.ok(styles.includes(utility), `Compiled Tailwind CSS must include ${utility}`);
assert.ok(styles.includes('--font-portfolio-sans'), 'The portfolio font must remain connected');

const writing = await (await get('/writing')).text();
assert.match(writing, /Writing \| Akeem Adeyemi/);
assert.match(writing, /<title>Writing \| Akeem Adeyemi<\/title>/);
assert.match(writing, /Building a Next.js E-commerce App/);
assert.match(writing, /aria-label="About \d+ minutes? to read"/);
assert.match(writing, /href="\/writing\/building-nextjs-ecommerce-app"/);
const article = await (await get('/writing/building-nextjs-ecommerce-app')).text();
assert.match(article, /<title>Building a Next\.js E-commerce App: Alluring Aura Scent \| Akeem Adeyemi<\/title>/);
assert.match(article, /Keeping cached data in its place/);
assert.match(article, /"@type":"BlogPosting"/);
assert.match(article, /aria-label="About \d+ minutes? to read"/);
assert.equal([...article.matchAll(/<h1\b/g)].length, 1);
for (const label of ['Enlarge Home and trending fragrances', 'Enlarge Quick Picks', 'Enlarge Shop', 'Enlarge Search', 'Enlarge Brands', 'Enlarge Offers', 'Enlarge Product details', 'Enlarge Quick Picks product', 'Enlarge Order tracking', 'Enlarge Contact and FAQs']) assert.ok(article.includes(label));
assert.match(article, /id="read-next-heading"/);
assert.match(article, /href="\/writing\/indexeddb-catalogue-synchronisation"/);
assert.match(writing, /Building an IndexedDB catalogue that stays in sync/);
const indexedDb = await (await get('/writing/indexeddb-catalogue-synchronisation')).text();
assert.match(indexedDb, /Keep revision checks small and deliberate/);
assert.match(indexedDb, /href="\/writing\/building-nextjs-ecommerce-app"/);
const cacheArticle = await (await get('/writing/nextjs-catalogue-caching')).text();
assert.match(cacheArticle, /Make the key describe the result/);
assert.match(writing, /Keeping catalogue caches fresh in Next.js/);
const deploymentArticle = await (await get('/writing/deploy-nextjs-cloudflare-workers')).text();
assert.match(deploymentArticle, /Start with your application/);
assert.match(deploymentArticle, /Optional example: Supabase Postgres with Hyperdrive/);
const deploymentPost = getPublishedPosts().find(post => post.slug === 'deploy-nextjs-cloudflare-workers');
const deploymentCodeBlocks = [...deploymentPost.content.matchAll(/^```/gm)].length / 2;
assert.equal((deploymentArticle.match(/aria-label="Copy code"/g) ?? []).length, deploymentCodeBlocks, 'Every deployment snippet should have a copy button');
assert.ok(writing.includes('href="/writing/deploy-nextjs-cloudflare-workers"'));
const unavailable = await (await fetch(new URL('/writing/unpublished-check', base))).text();
assert.match(unavailable, /Post not found/);
assert.match(unavailable, /noindex/);
for (const source of ['/content/drafts/building-alluring-aura-scent.md', '/content/posts/building-alluring-aura-scent.md', '/content/drafts/building-alluring-aura-scent.notes.md']) {
  assert.equal((await fetch(new URL(source, base))).status, 404, 'Editorial source must not be served');
}

// Check every published route and every internal page link, including future posts.
const pageHtml = new Map([['/', home], ['/writing', writing]]);
for (const post of getPublishedPosts()) {
  const route = `/writing/${post.slug}`;
  const html = await (await get(route)).text();
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${route}: one article title`);
  assert.ok(html.includes('"@type":"BlogPosting"'), `${route}: article metadata`);
  pageHtml.set(route, html);
}
const checkedLinks = new Set();
for (const [route, html] of pageHtml) {
  for (const [, raw] of html.matchAll(/href="([^"\s]+)"/g)) {
    const href = raw.replaceAll('&amp;', '&');
    if (!href.startsWith('/') && !href.startsWith('#')) continue;
    const target = new URL(href, new URL(route, base));
    if (target.pathname.startsWith('/_next/')) continue;
    const key = target.pathname + target.search;
    if (!checkedLinks.has(key)) {
      await get(key);
      checkedLinks.add(key);
    }
    if (target.hash && pageHtml.has(target.pathname)) {
      const id = decodeURIComponent(target.hash.slice(1));
      assert.ok(pageHtml.get(target.pathname).includes(`id="${id}"`), `${route}: missing anchor ${href}`);
    }
  }
}
for (const post of loadPosts().filter(post => post.draft)) {
  const html = await (await fetch(new URL(`/writing/${post.slug}`, base))).text();
  assert.match(html, /noindex/, `${post.slug}: drafts must not be indexed`);
  assert.ok(!writing.includes(`href="/writing/${post.slug}"`), `${post.slug}: draft leaked into listing`);
  assert.ok(!html.includes('<script type="application/ld+json">'), `${post.slug}: draft must not render an article`);
}
console.log(`PASS: all ${getPublishedPosts().length} published article routes, ${checkedLinks.size} internal destinations/anchors, and all draft exclusions.`);

const pdf = await get('/akeem-adeyemi-resume.pdf');
assert.match(pdf.headers.get('content-type') ?? '', /application\/pdf/);
const pdfBytes = Buffer.from(await pdf.arrayBuffer());
assert.ok(pdfBytes.equals(await readFile('public/akeem-adeyemi-resume.pdf')), 'The downloadable resume must match the reviewed artifact');

for (const path of ['/opengraph-image.png', '/twitter-image.png', '/apple-icon.png', '/favicon.ico', '/projects/alluring-home-trending-phone.png', '/projects/alluring-quick-picks-phone.png', '/projects/alluring-quick-picks-drawer-phone.png', '/projects/alluring-product-details-phone.png', '/projects/alluring-shop-phone.png', '/projects/alluring-search-phone.png', '/projects/alluring-brands-phone.png', '/projects/alluring-order-tracking-phone.png', '/projects/alluring-offers-phone.png', '/projects/alluring-contact-faq-phone.png', '/projects/quikcity.jpg', '/projects/quikcity-hero-mobile.jpg', '/projects/quikcity-how-it-works-desktop.jpg', '/projects/quikcity-vendors-mobile.jpg']) {
  const response = await get(path);
  assert.match(response.headers.get('content-type') ?? '', /image\//);
}
const optimized = await get('/_next/image?url=%2Fprojects%2Falluring-home-trending-phone.png&w=256&q=75');
assert.match(optimized.headers.get('content-type') ?? '', /image\//);
const robots = await (await get('/robots.txt')).text();
const sitemap = await (await get('/sitemap.xml')).text();
if (robots.includes('Disallow: /')) {
  assert.match(home, /noindex/);
  assert.doesNotMatch(home, /"@type":"Person"/);
  assert.doesNotMatch(sitemap, /<loc>/);
} else {
  assert.match(robots, /Sitemap:/);
  assert.match(sitemap, /<loc>/);
  assert.match(home, /"@type":"Person"/);
  assert.match(home, /"sameAs":\["https:\/\/github\.com\/akimzzy","https:\/\/linkedin\.com\/in\/akeem-adeyemi-872905154"\]/);
}
console.log('PASS: production HTML, compiled Tailwind, font mapping, metadata, images, resume, Writing, draft exclusion, robots, and sitemap.');
console.log(`Uncompressed HTML: ${Buffer.byteLength(home)} bytes; CSS: ${Buffer.byteLength(styles)} bytes; resume: ${pdfBytes.length} bytes.`);
