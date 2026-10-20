import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadPosts, getPublishedPosts } from '../app/writing/posts.ts';

const posts = loadPosts();
const drafts = posts.filter(post => post.draft);
assert.equal(drafts.length, 0);
assert.deepEqual(getPublishedPosts().map(post => post.slug).sort(), [
  'building-nextjs-ecommerce-app', 'duplicate-paystack-notifications',
  'indexeddb-catalogue-synchronisation', 'nextjs-catalogue-caching',
  'shared-inventory-online-instore', 'naira-prices-integer-kobo',
  'spreadsheet-product-imports', 'reliable-order-emails-resend',
  'building-quikcity-around-whatsapp', 'migrating-production-data-safely',
  'deploy-nextjs-cloudflare-workers',
].sort(), 'Only approved articles may be published');
for (const post of posts) {
  if (post.draft) assert.equal(post.date, undefined, `${post.slug}: no invented publication date`);
  assert.match(post.summary, /\S/);
  if (post.image) assert.ok(readFileSync(`public${post.image}`).length);
  for (const [, slug] of post.content.matchAll(/\]\(\/writing\/([^\s)]+)\)/g)) {
    assert.ok(getPublishedPosts().some(p => p.slug === slug), 'Links may only target published articles');
  }
  for (const [, language, code] of post.content.matchAll(/```(js|ts|json)\n([\s\S]*?)\n```/g)) {
    if (language === 'json') JSON.parse(code);
    else {
      const result = ts.transpileModule(code, { fileName: language === 'js' ? 'example.js' : 'example.ts', reportDiagnostics: true, compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
    }
  }
}
function example(slug) {
  const post = posts.find(post => post.slug === slug);
  const code = [...post.content.matchAll(/```js\n([\s\S]*?)\n```/g)].map(match => match[1]).join('\n');
  const context = vm.createContext({ crypto: globalThis.crypto, TextEncoder, AbortSignal, fetch });
  new vm.Script(code).runInContext(context);
  return expression => new vm.Script(expression).runInContext(context);
}
const localCatalogue = example('indexeddb-catalogue-synchronisation');
assert.equal(localCatalogue('findProducts(Array.from({length:5000},(_,i)=>({id:i+1,name:i===4000?"Amber perfume":"Citrus perfume"})),"AMBER")[0].id'), 4001);
assert.equal(localCatalogue('findProducts(Array.from({length:60},()=>({name:"Perfume"})),"",25).length'), 25);
assert.equal(localCatalogue('findProducts(Array.from({length:60},()=>({name:"Perfume"})),"",50).length'), 50);
assert.equal(localCatalogue('findProducts([{name:"Amber perfume"}],"missing").length'), 0);
const money = example('naira-prices-integer-kobo');
assert.equal(money('total'), 554998);
assert.equal(money('displayedTotal'), '₦5,549.98');
assert.equal(money('formatNaira(0)'), '₦0.00');
assert.equal(money('formatNaira(1)'), '₦0.01');
assert.equal(money('formatNaira(Number.MAX_SAFE_INTEGER)'), '₦90,071,992,547,409.91');
assert.equal(money('parseNaira("90071992547409.91")'), Number.MAX_SAFE_INTEGER);
assert.throws(() => money('parseNaira("90071992547409.92")'));
assert.equal(money('discountKobo(10001,0)'), 0);

assert.equal(money('parseNaira("0.1")'), 10);
assert.equal(money('parseNaira("1999.99")'), 199999);
assert.equal(money('discountKobo(10001,5000)'), 5000);
assert.equal(money('discountKobo(10001,10000)'), 10001);
for (const expression of ['parseNaira("3e2")', 'parseNaira("1\\n")', 'parseNaira(" 1")', 'parseNaira("1,000")', 'parseNaira("1.001")', 'lineTotal(Number.MAX_SAFE_INTEGER,2)', 'lineTotal(100,0)', 'discountKobo(100,10001)']) {
  assert.throws(() => money(expression));
}
for (const input of ["1\n", "1\r\n", " 1", "1 ", "1,000"]) {
  assert.throws(() => money(`parseNaira(${JSON.stringify(input)})`), /Enter a non-negative amount/);
}
const inventory = example('shared-inventory-online-instore');
assert.equal(inventory('JSON.stringify(allocate(2,3))'), JSON.stringify({requested:3,allocated:2,shortage:1,remaining:0}));
assert.equal(inventory('JSON.stringify(allocate(0,2))'), JSON.stringify({requested:2,allocated:0,shortage:2,remaining:0}));
assert.equal(inventory('JSON.stringify(allocate(2,2))'), JSON.stringify({requested:2,allocated:2,shortage:0,remaining:0}));
for (const expression of ['allocate(-1,1)', 'allocate(1,0)', 'allocate(1,1.5)', 'allocate(2147483648,1)']) {
  assert.throws(() => inventory(expression));
}
// Exercise the two serial allocation outcomes described in the draft.
const walkIn = JSON.parse(inventory('JSON.stringify(allocate(2,1))'));
const onlineAfterWalkIn = JSON.parse(inventory(`JSON.stringify(allocate(${walkIn.remaining},2))`));
assert.deepEqual(onlineAfterWalkIn, {requested:2,allocated:1,shortage:1,remaining:0});
assert.equal(walkIn.allocated + onlineAfterWalkIn.allocated, 2);
const onlineFirst = JSON.parse(inventory('JSON.stringify(allocate(2,2))'));
assert.equal(onlineFirst.remaining, 0);
assert.equal(onlineFirst.remaining < 1, true, 'Full-availability walk-in policy must reject the remaining request');
const cache = example('nextjs-catalogue-caching');
const base = '{category:"perfume",sort:"newest",page:1,pageSize:12}';
const key1 = await cache(`catalogueKey({catalogue:"1",stock:"1"},${base})`);
assert.equal(key1, await cache(`catalogueKey({catalogue:"1",stock:"1"},${base})`));
assert.notEqual(key1, await cache(`catalogueKey({catalogue:"1",stock:"2"},${base})`));
assert.notEqual(key1, await cache('catalogueKey({catalogue:"1",stock:"1"},{category:"perfume",sort:"newest",page:2,pageSize:12})'));
const email = example('reliable-order-emails-resend');
assert.equal(await email('sendEmail("test",{id:"o1:receipt",payload:{}},async()=>({ok:true,json:async()=>({id:"email-1"})}))'), 'email-1');
await assert.rejects(email('sendEmail("test",{id:"o1:receipt",payload:{}},async()=>({ok:false,status:429}))'));
await assert.rejects(email('sendEmail("test",{id:"o1:receipt",payload:{}},async()=>({ok:true,json:async()=>({})}))'));
await assert.rejects(
  email('sendEmail("test",{id:"o1:receipt",payload:{}},async()=>({ok:false,status:429,headers:{get:()=>"60"},json:async()=>({name:"rate_limit_exceeded"})}))'),
  error => error.status === 429 && error.code === 'rate_limit_exceeded' && error.retryAfter === '60',
);
await assert.rejects(email('sendEmail("test",{id:"o1:receipt",payload:{}},async()=>{throw new Error("timeout")})'));
assert.equal(await email('sendEmail("test",{id:"o1:receipt",payload:{subject:"Receipt"}},async(url,options)=>({ok:true,json:async()=>({id:options.headers["Idempotency-Key"]+":"+JSON.parse(options.body).subject})}))'), 'o1:receipt:Receipt');
console.log('PASS: no private article drafts and eleven published articles, metadata/assets, no premature links, JS/TS/JSON syntax, money bounds/rounding, inventory allocation, cache keys, and mocked email outcomes.');
