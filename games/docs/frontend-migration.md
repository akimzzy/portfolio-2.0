# Games web application

## Architecture

- `apps/web` is the Vite, React, and TypeScript client. It contains the HTML entry point, app shell, lobby, match UI, styles, and bundled font.
- `apps/worker` is the Cloudflare Worker backend, with Durable Objects for match and lobby state and WebSockets for live updates.
- `packages/contracts` and `packages/connect-four` contain provider-independent protocol contracts and game rules.
- The Worker and static web app are built and deployed separately. The local Vite server proxies API and WebSocket traffic to the local Worker.
- The web app has its own theme preference (`games-theme`); it does not read or write the portfolio's theme setting.

The React tree owns all visible UI. TypeScript modules own match transport, HTTP operations, session storage/recovery, game state, and validated API messages. The client uses server push instead of polling. The Worker decides authoritative match state and deadlines.

## Local development

From this workspace, install dependencies and start both services with:

```sh
npm ci
npm run dev
```

The web app is available at `http://127.0.0.1:4178`; the local Worker emulator is at `http://127.0.0.1:8787`. Use `npm run dev:web` and `npm run dev:worker` separately when you need independent logs or lifecycle control. See the workspace [README](../README.md) for phone testing and deployment instructions.

## Build and deployment

- `npm run build` builds shared packages and the Worker, then strictly type-checks the web app.
- `npm run build:web` also produces the static web bundle and security headers. Set `GAMES_API_URL` to the HTTPS Worker origin first.
- `npm run deploy:worker:preview` and `npm run deploy:web:preview` deploy the preview service and Pages UI separately.

Vite transpiles TypeScript but does not type-check it; the build runs TypeScript validation separately. The Pages build disables Vite's inline module-preload shim to preserve the configured script policy.

## Scope and verification

This frontend migration replaces the previous standalone client with one React application while preserving the match protocol and game behavior. The client remains in this independent workspace; it has no Next.js runtime dependency. It uses a copy of the selected font with its license included here.

Guest identity is device/session based. Accounts, virtual currency, payments, and cash-out are not implemented. Local builds and tests do not establish production capacity or verify every browser/device flow. See the workspace README's verification record for what has and has not been exercised.
