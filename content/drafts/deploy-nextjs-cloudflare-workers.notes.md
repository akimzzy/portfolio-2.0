# Deployment guide: final evidence and publication

19 October 2026. Article: ../posts/deploy-nextjs-cloudflare-workers.md. All review notes are private and excluded from article routes.

## Actual verification versus documentation

Earlier in the task, a separate demo was installed with Node 24.13.1, Next 16.3.8, React/ReactDOM 19.2.8, OpenNext Cloudflare 1.20.6 and Wrangler 4.147.0. OpenNext build passed. Local Workers preview HTTP checks passed for homepage, dynamic health JSON/no-store, public asset, compiled JS and immutable asset caching. Preview initially rejected compatibility date 2026-10-19 because the installed runtime supported up to 2026-10-08; changed the example date to 2026-10-01 and rebuilt/rechecked successfully. This was a Workers runtime issue, not a Next.js defect.

The earlier separate demo upload/deployment was accepted by Cloudflare. The later public HTTP verification was interrupted; no successful live-origin HTTP result is claimed. No Supabase account was signed into or project modified. No live Postgres/Hyperdrive query was executed. A temporary Cloudflare demo remains deployed from that earlier task scope; cleanup is separate and was not attempted after the owner stopped account work.

The owner then explicitly instructed content review/publication within the portfolio, without further account access or external deployments. Final pass followed that boundary. No authentication or external resource management was performed.

## Final review results

Reader: standalone core path and optional DB clearly separated, expected health response plus concrete first DB row stated, JS/TS/router variants bounded.
Engineering: corrected runtime-compatible date, static-only immutable caching, secret versus public/build-time values, driver minimum, test-project-only SQL and existing-name handling, role scope, local connection bypassing Hyperdrive, three timeout roles and safe cleanup. No false total deadline or live DB guarantee.
Facts: OpenNext setup/CLI/env/bindings, Cloudflare Hyperdrive Supabase/pg/local docs and node-postgres client docs checked. Optional DB setup is documentation-reviewed, explicitly disclosed in the public article. No database integration test substituted with mocks or syntax checks.

Publication authorised by the owner. Moved to posts with date 2026-10-19. Production Markdown/frontmatter/metadata, snippet syntax/existing executed examples, lint, build and local HTTP checks passed. Desktop and 390px checks confirmed contained page width, semantic table and code blocks. No future unpublished articles are exposed.

Final portability correction: kept only documented client connection/query wait options in the snippet. Server-side statement cancellation is described separately through the provider-supported mechanism; no assumption that startup options are forwarded unchanged through every pooler. This avoids presenting a general node-postgres configuration field as a verified Hyperdrive guarantee. Rechecked affected prose and snippet syntax.


## Authorised live verification — 19 October 2026

The owner subsequently authorised Chrome account access, selected a test Supabase project, and explicitly approved a three-row demo table, dedicated read-only login, and credential storage in a new Hyperdrive configuration. Created only those scoped demo resources; existing store tables, credentials and production Hyperdrive were not changed. No real/customer data was used by the route. Credentials were not copied into this repository.

The separate demo was built and deployed with the article's route. Live homepage, health JSON/no-store, public asset and compiled-JS/immutable checks pass. Live products returned all three names and bigint prices as strings. Changed the first dummy price from 1500000 to 1500100; a later deployed request returned the changed value with Hyperdrive caching disabled. Restored 1500000 and verified the restored response. Database privilege checks confirmed SELECT true; INSERT/UPDATE/DELETE false for the new login on the demo table.

Actual failures and verified corrections: initOpenNextCloudflareForDev required a local Hyperdrive connection setting even during the main deployment build. A credential-free localhost placeholder in main config fixes initialization; the ignored local copy uses the real test connection. Next.js tracing copied pg-cloudflare's Node default but omitted its conditional Workers implementation. A narrow outputFileTracingIncludes for /api/products fixes OpenNext bundling. Local direct DNS failed on this network. Used Supabase's documented IPv4 session pooler only locally; its custom-role username includes the project ref. Certificate-chain validation then failed; downloaded the provider CA linked in Database Settings and passed NODE_EXTRA_CA_CERTS to preview, preserving verify-full. Local /api/products then returned 200, no-store and all original rows. Deployed Hyperdrive continues to use the direct database hostname.

Reader review repeated: paths, merge instructions, expected output, local fallback, build placeholder limitations and copy/paste snippets. Engineering review repeated: scoped role/data, certificate verification, request client lifetime, conditional driver files, local/deployed boundary and actual update visibility. Facts checked against Cloudflare local-development docs, Supabase connection/TLS docs and Next.js bundled output tracing guide. These results verify this small route, not all Next.js features, throughput, authentication or provider integrations. Temporary demo resources remain available; deletion of remote resources was not part of this pass.

Final database hardening: enabled RLS on only the new demo table and added a SELECT policy scoped to catalogue_reader. Updated the published setup to enable RLS before adding the login/policy. The earlier editor no-RLS prompt is historical; the final example no longer asks readers to leave RLS disabled. Verified the live endpoint after this change. Local preview passed before this final database-only policy addition; the same read-only login and query are used by the deployed endpoint. Local preview shutdown also emitted a driver socket-closed diagnostic; no claim of clean shutdown or endurance testing is made.
