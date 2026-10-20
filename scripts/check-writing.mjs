import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleBody } from '../app/writing/article-body.ts';
import { loadPosts, getPublishedPosts, recommendPosts } from '../app/writing/posts.ts';
import { articleMetadata, articleJsonLd } from '../app/writing/article-metadata.ts';

const draft = loadPosts().find(post => post.slug === "building-nextjs-ecommerce-app");
assert.ok(draft);
assert.equal(draft.draft, false);
assert.equal(draft.slug, 'building-nextjs-ecommerce-app');
assert.match(draft.title, /Next.js E-commerce/);
assert.match(draft.summary, /e-commerce/);
assert.equal(draft.date, "2026-10-18");
assert.ok(getPublishedPosts().some(post => post.slug === draft.slug));
assert.doesNotMatch(draft.content, /agreement|separate agreement on scope/i);
const published = { ...draft, draft: false, date: '2026-10-18' };
const origin = new URL('https://portfolio.example');
const metadata = articleMetadata(published, origin);
assert.equal(metadata.alternates.canonical, `https://portfolio.example/writing/${draft.slug}`);
assert.equal(metadata.description, draft.summary);
assert.equal(metadata.openGraph.images[0].width, 390);
assert.equal(metadata.openGraph.images[0].height, 844);
assert.equal(draft.screenshots.length, 5);
assert.ok(draft.screenshots.every(image => image.width < image.height));
assert.equal(metadata.openGraph.type, 'article');
assert.equal(metadata.openGraph.title, `${draft.title} | Akeem Adeyemi`);
assert.equal(metadata.twitter.card, 'summary_large_image');
assert.ok(metadata.openGraph.images[0].url.startsWith(origin.href));
assert.equal(articleMetadata(published).robots.index, false);
assert.equal(articleMetadata(published).alternates, undefined);
const structured = articleJsonLd(published, origin);
assert.equal(structured['@type'], 'BlogPosting');
assert.equal(structured.author.name, 'Akeem Adeyemi');
assert.equal(structured.author['@id'], 'https://portfolio.example/#person');
assert.deepEqual(articleJsonLd(published, origin, ['https://github.com/akimzzy', 'https://linkedin.com/in/akeem-adeyemi-872905154']).author.sameAs, ['https://github.com/akimzzy', 'https://linkedin.com/in/akeem-adeyemi-872905154']);
assert.equal(structured.datePublished, published.date);
assert.equal(structured.headline, metadata.title);
assert.equal(structured.mainEntityOfPage, metadata.alternates.canonical);
assert.equal(structured.image[0], metadata.openGraph.images[0].url);
const rendered = renderToStaticMarkup(createElement(ArticleBody, { content: draft.content }));
assert.match(rendered, /<h2>Hosting the Next.js app/);
assert.match(rendered, /href="https:\/\/alluringaurascent.com\/"/);
assert.doesNotMatch(rendered, /<h1>/, 'The page owns the single article h1');
const unsafe = renderToStaticMarkup(createElement(ArticleBody, { content: '<script>alert(1)</script>\n\n[bad](javascript:alert)' }));
assert.doesNotMatch(unsafe, /<script|href="javascript:/);

const root = mkdtempSync(path.join(tmpdir(), 'portfolio-writing-'));
try {
  mkdirSync(path.join(root, 'posts'));
  const fixture = overrides => {
    const values = { ...published, ...overrides };
    const yaml = Object.entries(values).filter(([key, value]) => key !== 'content' && value !== undefined)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
    writeFileSync(path.join(root, 'posts', 'fixture.md'), `---\n${yaml}\n---\n\n# ${values.title}\n\n${values.content}`);
  };
  fixture({});
  assert.equal(loadPosts(root)[0].date, published.date);
  fixture({ draft: true, date: undefined });
  assert.equal(loadPosts(root)[0].draft, true);
  assert.equal(loadPosts(root)[0].date, undefined);
  for (const invalid of [undefined, '2026-02-30', 'invalid']) {
    fixture({ date: invalid });
    assert.throws(() => loadPosts(root), /valid quoted/);
  }
  fixture({ slug: '../private' });
  assert.throws(() => loadPosts(root), /slug/);
  fixture({ draft: undefined });
  assert.throws(() => loadPosts(root), /draft status/);
  fixture({ modified: '2025-01-01' });
  assert.throws(() => loadPosts(root), /modification date/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('PASS: draft privacy, publication validation, canonical and social metadata, article schema, and safe Markdown rendering.');

const sibling = { ...published, slug: "indexeddb-sync", topics: ["indexeddb"], date: "2026-10-17" };
const recent = { ...published, slug: "other-topic", topics: ["mobile"], date: "2026-10-18" };
const hidden = { ...sibling, slug: "unpublished-caching", draft: true };
assert.deepEqual(recommendPosts(published, [published]), []);
assert.deepEqual(recommendPosts(published, [published, recent, sibling, hidden]).map(post => post.slug), ["indexeddb-sync", "other-topic"]);
assert.equal(recommendPosts(published, [recent, sibling], 1)[0].slug, sibling.slug);
assert.equal(recommendPosts({ ...published, topics: [] }, [sibling, recent])[0].slug, recent.slug);
console.log("PASS: related-first recommendations, recent fallback, limits, and exclusion of drafts/current article.");

const { estimateReadingMinutes } = await import('../app/writing/reading-time.ts');
assert.equal(estimateReadingMinutes(''), 1);
assert.equal(estimateReadingMinutes('word '.repeat(200)), 1);
assert.equal(estimateReadingMinutes('word '.repeat(201)), 1);
assert.equal(estimateReadingMinutes('word '.repeat(299)), 1);
assert.equal(estimateReadingMinutes('word '.repeat(300)), 2);
assert.equal(estimateReadingMinutes('word '.repeat(400)), 2);
const prose = 'word '.repeat(199);
assert.equal(estimateReadingMinutes(prose + '[guide](https://example.com/a/long/path) ![an image with several words](https://example.com/image.png)'), 1);
assert.equal(estimateReadingMinutes(prose + '\n```js\nconst value = 1;\n```'), 1);
assert.equal(estimateReadingMinutes('école '.repeat(201)), 1);
console.log('PASS: reading-time rounding, minimum, Unicode words, link/image exclusions, and code inclusion.');

const payment = getPublishedPosts().find(post => post.slug === 'duplicate-paystack-notifications');
assert.ok(payment);
const paymentHtml = renderToStaticMarkup(createElement(ArticleBody, { content: payment.content }));
assert.match(paymentHtml, /<table[ >]/);
assert.match(paymentHtml, /<th[^>]*>What arrives<\/th>/);
assert.equal((paymentHtml.match(/<tr>/g) ?? []).length, 3);
assert.doesNotMatch(paymentHtml, /\| --- \|/);
const tableUnsafe = renderToStaticMarkup(createElement(ArticleBody, { content: '<script>alert(1)</script>\n\n[bad](javascript:alert)' }));
assert.doesNotMatch(tableUnsafe, /<script|href="javascript:/);
console.log('PASS: payment comparison renders as a semantic table; raw HTML and unsafe URLs remain blocked.');

// Test the real article renderer against every post, including unpublished drafts.
for (const post of loadPosts()) {
  let fence;
  let codeBlocks = 0;
  const proseLines = [];
  for (const line of post.content.split('\n')) {
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = undefined;
    } else {
      const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (opening) { fence = opening[1]; codeBlocks++; }
      else proseLines.push(line);
    }
  }
  assert.equal(fence, undefined, `${post.slug}: unclosed code fence`);
  const prose = proseLines.join('\n');
  assert.doesNotMatch(prose, /^\s*<\/?[a-z][^>]*>/im, `${post.slug}: raw HTML is unsupported; use Markdown`);
  const html = renderToStaticMarkup(createElement(ArticleBody, { content: post.content }));
  const tableCount = proseLines.filter(line => /^\s*\|?\s*:?-{3,}:?\s*\|/.test(line)).length;
  assert.equal((html.match(/<table[ >]/g) ?? []).length, tableCount, `${post.slug}: table must render semantically`);
  assert.equal((html.match(/<pre[ >]/g) ?? []).length, codeBlocks, `${post.slug}: fenced code must render as a code block`);
  assert.equal((html.match(/aria-label="Copy code"/g) ?? []).length, codeBlocks, `${post.slug}: each code block must have a copy control`);
  assert.equal((html.match(/data-code-block=""/g) ?? []).length, codeBlocks, `${post.slug}: copy controls must be associated with their own code blocks`);
  for (let level = 2; level <= 6; level++) {
    const expected = proseLines.filter(line => new RegExp(`^ {0,3}#{${level}}\\s`).test(line)).length;
    assert.equal((html.match(new RegExp(`<h${level}[ >]`, 'g')) ?? []).length, expected, `${post.slug}: heading hierarchy`);
  }
  assert.doesNotMatch(html, /<script|href="javascript:/i, `${post.slug}: unsafe output`);
  assert.doesNotMatch(html, /\snode="\[object Object\]"/, `${post.slug}: Markdown AST must not leak into DOM attributes`);
}
console.log(`PASS: all ${loadPosts().length} published/draft articles render headings, tables, and code blocks through the production renderer.`);

const formatting = [
  '## Heading two', '### Heading three', '#### Heading four', '##### Heading five', '###### Heading six',
  '**Strong** and *emphasis* with `inline code`.',
  '- Parent\n  - Nested item', '1. First\n2. Second',
  '> Quoted text', '---',
  '| Left | Right |\n| :--- | ---: |\n| One | Two |',
  '- [x] Finished\n- [ ] Pending', '~~Removed text~~',
  '[Guide](https://example.com/guide)', '![Example image](/writing/example.png)',
  '```js\nconst html = "<script>literal code</script>";\n```',
  'A footnote.[^note]\n\n[^note]: Supporting detail.',
].join('\n\n');
const formattingHtml = renderToStaticMarkup(createElement(ArticleBody, { content: formatting }));
for (const tag of ['h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'code', 'ul', 'ol', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'del', 'img']) {
  assert.match(formattingHtml, new RegExp(`<${tag}[ >/]`), `${tag} formatting support`);
}
assert.match(formattingHtml, /<th scope="col" class="text-right">Right/);
assert.match(formattingHtml, /role="region" aria-label="Article table" tabindex="0"/);
assert.match(formattingHtml, /<pre tabindex="0" aria-label="Code example"/);
assert.match(formattingHtml, /aria-label="Copy code"/);
assert.match(formattingHtml, /type="checkbox" disabled="" checked=""/);
assert.match(formattingHtml, /data-footnote-ref/);
assert.match(formattingHtml, /&lt;script&gt;literal code&lt;\/script&gt;/);
assert.doesNotMatch(formattingHtml, /<script>/);
console.log('PASS: future-post fixture covers headings, emphasis, nested/ordered/task lists, quotes, rules, aligned tables, links, images, literal code, and footnotes.');
