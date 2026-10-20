---
title: "Deploying Next.js to Cloudflare Workers with OpenNext"
summary: "Deploy an existing or new Next.js app with OpenNext, keep your styling choices, and optionally connect a database."
slug: "deploy-nextjs-cloudflare-workers"
author: "Akeem Adeyemi"
topics: ["nextjs", "cloudflare", "deployment", "postgresql", "e-commerce"]
date: "2026-10-19"
draft: false
---

# Deploying Next.js to Cloudflare Workers with OpenNext

This guide takes a Next.js application from a local build to a working Cloudflare Workers deployment. It uses OpenNext, an adapter that packages the Next.js build for the Workers runtime.

Start with the deployment steps below. They do not require Tailwind, a database, or a particular kind of application. An optional section then adds Supabase Postgres through Hyperdrive as one concrete database example.

**File locations:** Unless a step says otherwise, paths are relative to your project root—the directory containing `package.json`. Keep configuration files and `public/` there. If your app uses `src/`, put its `app/` or `pages/` routes under `src/`; do not move root configuration files. Each step says whether the snippet is a complete new file or a change to merge into an existing file. Do not replace an existing file with a fragment.

- **Create in the project root:** `open-next.config.ts`, `wrangler.jsonc`, `.dev.vars`; create `public/` if it does not exist, then create `public/_headers` inside it.
- **Edit in the project root:** the existing `next.config.*`, `package.json`, and `.gitignore`.
- **Create under your router:** `app/api/...` or `pages/api/...`; use `src/app/api/...` or `src/pages/api/...` when your app has a `src/` directory.

Every code block has a **Copy** button. It copies that block only. The sentence before it tells you whether the block is a whole file or a fragment to add to an existing file.

You need basic Next.js knowledge, npm, a Node.js LTS release compatible with your dependencies, and a Cloudflare account. Check your Next.js version and the features you use against the [OpenNext setup guidance](https://opennext.js.org/cloudflare/get-started). This is the OpenNext path; other adapters can have different commands and configuration.

The example was built, previewed, and deployed with Node.js 24.13.1, Next.js 16.3.8, React 19.2.8, OpenNext Cloudflare 1.20.6, and Wrangler 4.147.0 on 19 October 2026. The deployed Supabase/Hyperdrive endpoint returned the three example products and reflected a price update with query caching disabled. Local database preview also passed using Supabase’s session pooler with its CA trusted by the local Node process. These checks cover this small example, not every Next.js feature or application.

## Start with your application

If you already have an app, open a terminal in its project root and keep its existing framework, styling, and database choices. First run its existing production build command (usually `npm run build`). Fix any existing build errors before adding the deployment adapter; that gives you a baseline to compare against.

You can either follow the manual setup below, or let OpenNext scaffold it for an existing project. If you choose the helper, commit your current work first, run it from the project root, inspect the changes it made, then continue at **Check the server before connecting other services**:

```sh
npx @opennextjs/cloudflare migrate
```

OpenNext documents this [migration command](https://opennext.js.org/cloudflare/get-started#existing-nextjs-apps) as a setup shortcut. It can also create an R2 cache bucket when R2 is enabled in your account. This article's verified run used the manual steps below, so still run the local preview and production checks after using the helper. If you want to understand or control each file yourself, continue with the manual setup below.

For a new example application, run the scaffold at the Next.js version used in this guide. This keeps the Next.js version aligned with the tested adapter and Wrangler versions below:

```sh
npx create-next-app@16.3.8 workers-demo
cd workers-demo
```

Choose the scaffold options you want. This guide uses npm commands; if you use another package manager, keep its lockfile and use the corresponding commands consistently. The route examples below show App Router and Pages Router alternatives. JavaScript and TypeScript are both usable; the example configuration filenames use TypeScript. If you choose a newer Next.js version, check the OpenNext compatibility guidance before continuing and verify it with a Worker preview.

Install the deployment tools using the exact versions exercised in this guide:

```sh
npm install @opennextjs/cloudflare@1.20.6
npm install --save-dev wrangler@4.147.0
```

Commit the lockfile to record the selected versions. If you use a different Next.js or adapter version, check the current compatibility guidance and rerun the preview checks; this tested combination does not guarantee compatibility with every release. Database drivers are added only if your app needs them.

## Add the deployment configuration

Create a new file named `open-next.config.ts` in the project root. These are the complete contents of that file:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
export default defineCloudflareConfig({});
```

This call lets local Next.js development access Cloudflare bindings; it does not deploy your app. To enable that access, open your existing root `next.config.ts` or `next.config.mjs`. Add the import with the other imports and call the function once at the top level. Keep the existing exported config and options. Add these lines; they are not a replacement `next.config` file. The examples use ES module syntax; if your `next.config.js` uses CommonJS, convert it to `next.config.mjs` or `next.config.ts` while preserving its options, then use this snippet:

```js
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
```

A **binding** gives the Worker access to a configured resource, such as a storage bucket or database connection. No database binding is needed for the base example.

Create a new `wrangler.jsonc` in the project root. This is a complete minimal configuration for the example. If you already have a Wrangler file, merge the `main`, `compatibility_date`, `compatibility_flags`, `assets`, and `services` settings into that file instead of creating a second Wrangler configuration:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "workers-demo",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [{
    "binding": "WORKER_SELF_REFERENCE",
    "service": "workers-demo"
  }]
}
```

Replace both occurrences of `workers-demo` with the same unique name for your Worker. Keep the `main`, asset directory, and binding names as shown because OpenNext generates those paths and expects those bindings. The compatibility date must meet the adapter's documented minimum and be supported by your installed Wrangler/workerd runtime; an unsupported future date can prevent preview from starting. The example date was tested for this article. Keep the chosen date fixed and test any change because it selects Worker runtime behavior.

In the root `package.json`, find the existing `"scripts"` object. Add or update these entries inside it; this is only the contents of that object, not a complete `package.json`. Keep your other scripts and add commas where needed:

```json
{
  "build": "next build",
  "build:worker": "opennextjs-cloudflare build",
  "preview": "opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
  "cf:typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
}
```

The adapter invokes `build`, so keep that script as the normal Next.js build rather than pointing it back at `build:worker`. `build:worker` packages the Next.js build for Workers; `preview` runs that output locally; `deploy` builds and publishes it; `cf:typegen` generates TypeScript types from your Wrangler config. Stop preview with Ctrl+C before changing configuration or deploying.

At the project root, create a `public` folder if your project does not already have one. Inside it, create a file named `_headers` (no extension). Add these complete file contents for the generated, content-hashed Next.js assets:

```text
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

This rule applies to versioned static assets, not your HTML or API responses. Keep any other rules already in `public/_headers`. The adapter's [setup guide](https://opennext.js.org/cloudflare/get-started) documents this asset configuration.

Open the root `.gitignore` and make sure it ignores these generated files and local secrets. Add any missing lines; do not replace your existing ignore rules. `!.env.example` keeps the safe example environment file trackable, while `wrangler.local.jsonc` is ignored because it contains a local database credential:

```text
.open-next/
.wrangler/
.dev.vars*
.env*
!.env.example
wrangler.local.jsonc
```

Then create a root `.dev.vars` file containing this local-only setting:

```text
NEXTJS_ENV=development
```

This tells OpenNext to load the development environment locally. Configure production values separately. For local application variables, use ignored Next.js `.env` files so `next dev` and the adapter can load them consistently. For a deployed secret, run `npx wrangler secret put SECRET_NAME` from the project root, replacing `SECRET_NAME` with the variable's name; Wrangler prompts for the value. Or add it in the Cloudflare Workers dashboard. Do not put secret values in `wrangler.jsonc`, source code, or a committed `.env` file. A runtime secret cannot satisfy a data fetch that happens during the build. See [OpenNext environment configuration](https://opennext.js.org/cloudflare/howtos/env-vars). Values prefixed with `NEXT_PUBLIC_` are exposed to the browser and must be set correctly before the build.

## Check the server before connecting other services

Add a temporary health endpoint so you can verify the Worker before connecting a database or other services. For App Router, create `app/api/health/route.ts` (or `src/app/api/health/route.ts` if your project uses `src/`). The full contents are:

```js
export async function GET() {
  return Response.json({ ok: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}
```

For Pages Router, use `pages/api/health.ts` (or `src/pages/api/health.ts`) instead. Use only the version matching your router; do not create both:

```ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true });
}
```

For JavaScript, use `.js` and omit the type import and parameter annotations. If `/api/health` is already used in your app, choose another unused path and request that path in the checks below.

Build and preview:

```sh
npm run build:worker
npm run preview
```

Open the preview URL printed by Wrangler, then open `/api/health` on that same URL. Expect your app page to load and the health route to return `{"ok":true}`. This preview runs the generated app in the Workers runtime; `next dev` alone does not test the Workers deployment path.

Stop preview with Ctrl+C. Check that `wrangler.jsonc` names the Worker you intend to publish, then deploy from the project root:

```sh
npx wrangler login
npm run deploy
```

Wrangler prints the deployed URL. Open that URL and its `/api/health` route. If both work, the base deployment is complete. If your app does not need a database, you can stop here and skip the optional Supabase section. If the page or endpoint fails, check the build output, Worker name, asset binding, and Cloudflare deployment logs before adding more integrations.

## Keep the features your app actually uses

| If your application uses… | What to check |
| --- | --- |
| Tailwind, CSS Modules, or plain CSS | Keep the existing Next.js styling setup. Tailwind needs no separate installation just because you deploy to Workers. Verify the compiled styles in preview. |
| `next/image` optimisation | Configure a supported image path, such as the Cloudflare Images binding or your existing compatible loader. Follow the [OpenNext image guide](https://opennext.js.org/cloudflare/howtos/image). |
| ISR or persistent data caching | Configure the adapter's persistent-cache requirements for those features. An application without them does not need an R2 bucket merely to deploy this health endpoint. |
| Authentication or external APIs | Configure the required production secrets and callback URLs, then exercise those flows on the deployed origin. |
| Server-side packages | Check their Workers compatibility. The `nodejs_compat` flag enables supported Node.js APIs; it does not make Workers identical to a Node.js server. |

OpenNext's documented runtime mode is the Node.js mode. Review any route explicitly declaring `runtime = "edge"` rather than carrying that declaration over from another hosting setup.

## Optional example: Supabase Postgres with Hyperdrive

The rest of the example adds a public database-backed endpoint. **Supabase, PostgreSQL, and Hyperdrive are choices for this example, not requirements for deploying Next.js.**

Supabase hosts PostgreSQL. Hyperdrive connects the Worker to that database and pools connections. A PostgreSQL driver runs the query. You need a separate Supabase test project and Hyperdrive access for this section.

Install only this example’s driver and, for TypeScript, its type definitions:

```sh
npm install "pg@^8.16.3"
npm install --save-dev @types/pg
```

Hyperdrive requires node-postgres 8.16.3 or later; keep a supported version and commit the resulting lockfile. The [node-postgres integration reference](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/) lists its requirements.

### Create the example data

In the Supabase dashboard, open your disposable test project, choose **SQL Editor**, and create a new query. Paste and run this first block to create a table containing only example public data:

```sql
create table public.demo_products (
  id integer generated always as identity primary key,
  name text not null,
  price_kobo bigint not null check (price_kobo > 0)
);
insert into public.demo_products (name, price_kobo) values
  ('Amber perfume', 1500000),
  ('Citrus perfume', 1800000),
  ('Travel atomizer', 300000);
alter table public.demo_products enable row level security;
```

In a second SQL Editor query, create a dedicated login role. Replace the example password with a strong, unique value before running it:

```sql
create role catalogue_reader login password 'REPLACE_WITH_A_UNIQUE_PASSWORD';
grant usage on schema public to catalogue_reader;
grant select on public.demo_products to catalogue_reader;
create policy demo_catalogue_reader_select
  on public.demo_products
  for select to catalogue_reader
  using (true);
```

Run this SQL only in the separate test project. A pre-existing table or role name should be investigated rather than dropped or overwritten. Use this role's credentials for Hyperdrive, keeping the real password out of source control. It needs no migration or customer-table permissions. The endpoint returns intentionally public data. Row-level security allows this login to read the demo rows; it does not grant direct access to anonymous API clients. Private records need policies appropriate to their owners and authenticated authorization in the application. Never disable an existing table’s protections to follow this example.

### Add the database binding

In the Cloudflare dashboard, create a Hyperdrive configuration using the Supabase **direct database connection** and the dedicated role's credentials. Copy the configuration ID. Use the direct URL rather than a pooled Supabase URL because Hyperdrive already provides pooling. [Cloudflare's Supabase guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) explains the connection details.

Disable query caching for this exercise so later reads can verify database updates directly. This still leaves connection pooling available.

For this database example, update the root `wrangler.jsonc` created earlier. The block below shows the complete file after adding Hyperdrive. If you already had a Wrangler configuration, keep your own `name` and other settings, then merge only the `hyperdrive` entry into its top-level object. Do not create a second `wrangler.jsonc` or replace your customized settings:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "workers-demo",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [{
    "binding": "WORKER_SELF_REFERENCE",
    "service": "workers-demo"
  }],
  "hyperdrive": [{
    "binding": "HYPERDRIVE",
    "id": "YOUR_HYPERDRIVE_CONFIGURATION_ID",
    "localConnectionString": "postgresql://localhost:5432/postgres"
  }]
}
```

The credential-free localhost URL is a build-time placeholder that lets `initOpenNextCloudflareForDev()` initialise the binding. It is not a working local database connection and is not used by the deployed Worker; deployed requests use the Hyperdrive configuration ID and its credentials. In this tested version combination, leaving out `localConnectionString` makes `next build` fail after adding Hyperdrive. If your build queries the database while prerendering, it needs a reachable database and an appropriate build configuration too.

For local preview, copy the entire root `wrangler.jsonc` to a new root file named `wrangler.local.jsonc`. This filename is ignored by the `.gitignore` rule above. In the copy, replace the placeholder `localConnectionString` with your direct database URL and keep the other settings unchanged. This is the complete local file for the example:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "workers-demo",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [{
    "binding": "WORKER_SELF_REFERENCE",
    "service": "workers-demo"
  }],
  "hyperdrive": [{
    "binding": "HYPERDRIVE",
    "id": "YOUR_HYPERDRIVE_CONFIGURATION_ID",
    "localConnectionString": "postgresql://catalogue_reader:URL_ENCODED_PASSWORD@YOUR_DATABASE_HOST:5432/postgres?sslmode=verify-full"
  }]
}
```

Replace the host and password, URL-encoding special characters in the password. Confirm Git ignores `wrangler.local.jsonc` before saving real credentials there. Deploy with the main configuration, never this local copy. In local preview, this URL connects directly to the database; it does not exercise Hyperdrive pooling or query caching. Supabase direct hosts use IPv6 by default. On an IPv4-only network, use the **Session pooler** URL from Supabase’s Connect panel in this local file only; a custom role uses `catalogue_reader.PROJECT_REF` as the pooler username. Copy its actual host rather than constructing it from the region. Keep the deployed Hyperdrive connection pointed at the direct host. If certificate validation fails, configure the provider’s trusted CA for your local runtime rather than disabling verification. [Supabase’s connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) covers these alternatives. [Cloudflare documents the local connection behavior](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).

If local preview reports a certificate-chain error, download the CA certificate from **Database → Settings → SSL configuration** in your Supabase project. Trust that downloaded certificate for the preview process only. On macOS or Linux, for example:

```sh
NODE_EXTRA_CA_CERTS="/absolute/path/to/supabase-ca.crt" npm run preview -- --config wrangler.local.jsonc
```

Use the actual downloaded file path and keep `sslmode=verify-full` in the local URL. This adds a trusted CA without turning off certificate or hostname validation. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` or `rejectUnauthorized: false`. This setting concerns the local Node-based database proxy; the deployed connection is configured in Hyperdrive separately.

Regenerate the binding types after changing the configuration. Ensure `cloudflare-env.d.ts` is included by your TypeScript configuration (the default Next.js `**/*.ts` include covers it):

```sh
npm run cf:typegen
```

### Include the driver’s Workers files

In the tested versions, the Next.js file trace copied `pg-cloudflare`’s default Node entry but omitted its Workers implementation, causing the OpenNext bundle to fail with `Could not resolve "pg-cloudflare"`. Continue editing the root `next.config.ts` from the earlier step. The block below is a complete minimal configuration for the example. If you already have a config object, add only `outputFileTracingIncludes` inside that object, keep the existing OpenNext import and setup call, and retain all your other options. Do not add a second `export default`. If the app's products route has a different URL, replace `/api/products` with that route's URL:

```js
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

const nextConfig = {
  outputFileTracingIncludes: {
    "/api/products": ["./node_modules/pg-cloudflare/**/*"],
  },
};

export default nextConfig;
```

The property explicitly includes the driver’s installed runtime files; it does not replace them or mark a missing dependency as external. Next.js documents [file-tracing includes](https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats). Recheck whether the workaround is needed when you upgrade.

### Query the database

For App Router, create `app/api/products/route.ts` (or `src/app/api/products/route.ts` when using `src/`). This is the complete route file:

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Client } from "pg";

export async function GET() {
  let client: Client | undefined;
  try {
    const { env } = getCloudflareContext();
    client = new Client({
      connectionString: env.HYPERDRIVE.connectionString,
      connectionTimeoutMillis: 10000,
      query_timeout: 12000,
    });
    await client.connect();
    const result = await client.query(
      "select id, name, price_kobo from public.demo_products order by id limit $1",
      [3]
    );
    return Response.json(result.rows, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("catalogue_query_failed");
    return Response.json({ error: "Catalogue unavailable" }, { status: 503 });
  } finally {
    if (client) await client.end().catch(() => {
      console.error("catalogue_connection_cleanup_failed");
    });
  }
}
```

Create and close the client within the request; Hyperdrive maintains the underlying pool. The connection timeout limits connection waits, and `query_timeout` limits the client query wait. A client timeout does not establish that the database cancelled the statement. Configure any server-side statement limit through your provider’s supported mechanism; these client settings are not a total request deadline. Cleanup failures do not replace the original response. Log safe diagnostics on the server without returning credentials to the browser. The [node-postgres client reference](https://node-postgres.com/apis/client) documents these timeout and connection methods.

`price_kobo` is PostgreSQL bigint, which node-postgres returns as a string by default. Preserve it rather than coercing an arbitrarily large integer into a JavaScript number.

The route obtains capabilities through the binding, as described in [OpenNext's binding reference](https://opennext.js.org/cloudflare/bindings). The database client setup follows the supported [node-postgres integration](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/).


For JavaScript, save the App Router file as `route.js` and remove the `: Client | undefined` annotation. For Pages Router, create `pages/api/products.ts` (or `src/pages/api/products.ts`) instead. This is a complete alternative file; use only the version that matches your app:

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Client } from "pg";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (_req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  let client: Client | undefined;
  try {
    const { env } = getCloudflareContext();
    client = new Client({
      connectionString: env.HYPERDRIVE.connectionString,
      connectionTimeoutMillis: 10000,
      query_timeout: 12000,
    });
    await client.connect();
    const result = await client.query(
      "select id, name, price_kobo from public.demo_products order by id limit $1",
      [3]
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result.rows);
  } catch {
    console.error("catalogue_query_failed");
    return res.status(503).json({ error: "Catalogue unavailable" });
  } finally {
    if (client) await client.end().catch(() => {
      console.error("catalogue_connection_cleanup_failed");
    });
  }
}
```

For JavaScript, save this Pages Router file as `.js` and remove the type import and annotations.

### Verify the database separately

```sh
npm run build:worker -- --config wrangler.local.jsonc
npm run preview -- --config wrangler.local.jsonc
```

If the local connection needs the provider CA, use the `NODE_EXTRA_CA_CERTS` preview command above instead of the plain preview command.

Request `/api/products` on the preview URL. Expect three rows in ID order. For example, the first should contain `name: "Amber perfume"` and `price_kobo: "1500000"`.

Stop preview, run `npm run deploy` with the main configuration, and request that endpoint on the deployed origin. Change only a demo price in the test database and confirm a later request observes it, then restore the original value. Verify the dedicated role can select the demo table and cannot insert, update, or delete its rows. A successful local read checks the direct connection; the deployed read checks the Hyperdrive binding.

Before deploying, rebuild with the main configuration through `npm run deploy`; do not publish the local file containing credentials. A working local connection does not verify the deployed Hyperdrive binding. If the health route works but this one fails, check the configuration ID, binding name, credentials, grants, and database reachability.

## Using another database

You can keep the core deployment steps and replace the optional database section with your chosen integration:

- **Another PostgreSQL provider or MySQL:** use the supported driver and connection configuration for that provider. Hyperdrive supports these database families, but their settings and SQL differ.
- **MongoDB:** use a driver or server-side API supported in Workers, and configure that service's credentials and network access. The PostgreSQL driver and Hyperdrive example do not apply.
- **Firebase or Firestore:** choose a compatible SDK or authenticated HTTP API for the operations your server needs. A browser SDK's behavior does not establish that a server SDK runs unchanged in Workers.
- **No database:** omit the driver, database roles, and database bindings entirely.

Check the provider's current runtime requirements and verify a real read/write appropriate to your app in both preview and production. Keep authorization checks where private data is accessed. Hyperdrive is not a universal connector for all databases; its [supported-database reference](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/) defines that boundary.

The deployment check stays the same regardless of styling or database choice: the generated Worker must serve your application, load its assets, and successfully execute the server-side features you actually use.
