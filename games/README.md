# Games workspace

This self-contained npm workspace contains shared versioned contracts, game rules modules, a Cloudflare Worker/Durable Object service, and the Games web app for the catalog, public lobby, and matches. The service runs independently from the portfolio and keeps provider-specific code outside game rules and contracts. The web app uses Vite, React, and TypeScript and has its own theme preference and bundled font. The lobby, shared match shell, and dialogs render in one React tree. Framework-independent TypeScript modules own match WebSocket lifecycle, explicit room HTTP operations, active-match persistence, and session coordination; the app controller coordinates game-neutral actions through a runtime game registry, while each game view owns its board rendering and input. See [frontend migration](docs/frontend-migration.md).

## Setup and commands

Use Node.js 22.18 or newer and npm. From this directory:

```sh
npm ci
npm run dev
npm run build
npm run typecheck
npm test
```

`npm run dev` starts the web app and local Worker together. `npm run check` builds and type-checks the application and packages, then runs the tests using Node's test runner. Tests import the compiled package exports. No separate test framework is needed.

From the portfolio root, install this workspace with `npm --prefix games ci`, then use `npm run dev:games`, `npm run check:games`, `npm run build:games`, or `npm run test:games`. The portfolio and Games have independent lockfiles; installing portfolio dependencies does not install this workspace.

For separate terminals, `npm run dev:worker` starts the Cloudflare-compatible Worker and Durable Object emulator at `http://127.0.0.1:8787`; `npm run dev:web` starts Vite at `http://127.0.0.1:4178`. The web server proxies API and WebSocket requests to the Worker. For phone testing on the same network, set `GAMES_WEB_HOST=0.0.0.0` and allow the phone's exact app origin in the local Worker's `ALLOWED_ORIGINS`. This local path uses the Durable Object emulator and is not evidence of deployed Cloudflare behavior, production capacity, OAuth, account persistence, wallets, or payments. The Cabinet Grotesk font and license are included under `apps/web/assets/`. Build outputs are generated into each package's ignored `dist/` directory.

## Cloudflare deployments

The API and static UI deploy separately. The preview API uses `apps/worker/wrangler.preview.jsonc` and the `portfolio-games-service-preview` Worker. Production uses `apps/worker/wrangler.production.jsonc` and the `portfolio-games-service` Worker. Both static environments use the existing Pages project `portfolio-games-preview`; its production branch is `main`, and `play.ake-em.com` is attached to that project. The project name includes “preview” but its `main` branch serves production. The portfolio is not deployed by these commands.

Current previews: [React/Vite Games UI](https://react-preview.portfolio-games-preview.pages.dev/) and [legacy UI for comparison](https://preview.portfolio-games-preview.pages.dev/). Both use the preview Worker at [health](https://portfolio-games-service-preview.a-akeem.workers.dev/health). The React lobby loaded against the deployed Worker and displayed live online presence. The prior Worker and legacy UI smoke checks covered health, lobby access, invite creation/joining, countdown, and synchronized moves. Full deployed React two-player gameplay, series, reconnect, timeout, and mobile-device flows remain unverified. Pages previews are publicly reachable until Cloudflare Access is enabled; they are noindex and contain no account or payment data, but are not access-restricted.

After authenticating Wrangler to the intended Cloudflare account, create the Pages project once and deploy the Worker:

```sh
npm run create:pages:preview
npm run deploy:worker:preview
```

Copy the HTTPS `workers.dev` URL printed by Wrangler, then build and deploy the UI using the API origin:

```sh
GAMES_API_URL=https://<worker-subdomain>.workers.dev npm run build:web
npm run deploy:web:preview
```

Deploy the legacy UI on the `preview` branch with `npm run deploy:web:preview`. Deploy the React/Vite UI on the separate `react-preview` branch with `npm run deploy:web:react-preview`; its stable origin is `https://react-preview.portfolio-games-preview.pages.dev`. Both origins are included in the preview Worker allowlist. Build with `GAMES_API_URL=https://portfolio-games-service-preview.a-akeem.workers.dev npm run build:web`. Before sharing either preview, enable Cloudflare Access for Pages preview deployments in the project settings. Pages preview URLs are public by default; the Access policy is a required dashboard step, not something this repository can enable. The Worker API remains a public `workers.dev` endpoint with origin checks and rate limiting; CORS does not authenticate non-browser clients. Do not put secrets or real user data in this preview. Cloudflare documents that preview deployments are public unless Access is enabled: [Pages preview access](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

For later UI deployments, rebuild with the same `GAMES_API_URL` and deploy the intended branch: `preview` for the legacy UI or `react-preview` for React/Vite. Local development uses the `portfolio-games-service-development` Worker name; only the explicitly named preview and production commands deploy to Cloudflare.

## Production release

The production API is `https://portfolio-games-service.a-akeem.workers.dev`. Deploy the Worker first, then verify its health endpoint. Build the UI with that API origin and deploy to the Pages production branch; the `play.ake-em.com` custom domain follows that branch.

```sh
npm run deploy:worker:production
curl --fail https://portfolio-games-service.a-akeem.workers.dev/health
GAMES_API_URL=https://portfolio-games-service.a-akeem.workers.dev npm run build:web
npm run deploy:web:production
```

Production and preview Workers use separate Durable Object namespaces. Switching the Pages UI to production therefore does not carry over preview rooms or invite links. The production and preview workers retain only the `MATCHES` and `LOBBY_HUB` Durable Object bindings; the unused `LobbyDirectoryDurableObject` was retired with migration `v4`. The `wrangler.jsonc` development configuration runs locally and has no deployed workers.dev endpoint. Local development configuration is not a deploy target.

## Web app source layout

The web client is React + Vite. Its source uses feature and responsibility folders; this is an organizational choice, not a Next.js route convention:

| Path | Responsibility |
| --- | --- |
| `apps/web/src/app/` | React app shell, app-level store, application controller, and the UI-facing controller contract. |
| `apps/web/src/features/lobby/` | Lobby screen and public-match listing client. |
| `apps/web/src/features/match/` | Shared match shell, match view store/model, payload validation, device-local message history, and game-specific renderers under `games/<game-id>/`. |
| `apps/web/src/games/` | Browser-safe game rules registry and lobby catalog metadata. |
| `apps/worker/src/games/` | Server-side game rules registry; no UI or browser dependencies. |
| `apps/web/src/components/` | Reusable UI such as the shared countdown display. |
| `apps/web/src/services/match/` | Match HTTP operations, WebSocket transport, session coordination, and browser persistence. |
| `apps/web/src/shared/` | Small utilities shared by app features, including the clock store and dialog behavior. |
| `apps/web/src/main.tsx` | Vite/React browser entry point. |

`app/application-controller.ts` is frontend orchestration: it translates UI actions and session events into app/view state. Feature screens depend on `app/controller-contract.ts`, not the controller implementation. The controller is not the online authority. Each `packages/<game>` module owns deterministic rules, legal actions, state parsing, and game-state selectors; `packages/contracts` owns shared protocol types and the type-erased runtime adapter; the Worker owns HTTP/WebSocket handling, authoritative match state, turn deadlines, and Durable Object lifecycle. `features/match` owns the shared session UI, while `features/match/games/<game-id>/` owns that game's visual board and input mapping. The worker and browser have explicit registries. Keep game rules and board-specific rendering out of the shared controller and match shell.

## Package boundaries

| Package | Owns | Allowed imports |
| --- | --- | --- |
| `@portfolio-games/contracts` | Protocol version, game identity, two-player module interface, action/state/rejection envelopes, outcomes, runtime adapter and registry | Standard ECMAScript only |
| `@portfolio-games/connect-four` | Connect Four rules versions 1 and 2, immutable game state, action validation, state restoration | Contracts and standard ECMAScript only |
| `@portfolio-games/worker` | Cloudflare HTTP/WebSocket adapter and per-match Durable Object lifecycle | Provider-independent game rules and contracts |

Keep client rendering, server identity, transport, storage, deadlines, and deployment configuration outside these packages. A future game can supply another module implementing the current two-player interface. Other player counts or simultaneous-action games may require a new interface; this is not a universal game engine.

## Use the rules

After building, run this as an ES module from within the workspace:

```js
import { createGame, applyAction } from '@portfolio-games/connect-four';

const state = createGame('first');
const result = applyAction(state, 'first', { type: 'drop-token', column: 3 });

if (result.ok) {
  console.log(result.value.board); // Row 0 is the top; column 0 is the left.
}
```

The service chooses which person occupies each seat and randomly selects a starting seat. The rules package accepts the starting seat explicitly and does not select players. Each successful move returns a frozen state; failures leave the prior state unchanged. `nextPlayer` becomes `null` after a win or draw. The rules package does not implement forfeits or service cancellations, which belong to the future match/session service.

Rules version 2 ends a round as a tie when every possible four-cell line already contains tokens from both players, so neither player can complete a line. The check runs after each accepted move and is bounded by the fixed 7×6 board. Version 1 stays available for matches already in progress when the newer rules are introduced; new matches are pinned to version 2.

State includes the starting seat, board, bounded move sequence, next seat, and outcome. The move sequence lets `parseConnectFourState` reconstruct a legal game in at most 42 steps and reject boards/outcomes that disagree with it. Use this parser when restoring persisted/wire data; do not cast untrusted objects to `ConnectFourState`. This internal sequence does not add a player-facing replay or change the agreed summary-only history UI.

## Validate commands and messages

An action command has these exact fields:

```json
{
  "protocolVersion": 1,
  "type": "submit-action",
  "gameId": "connect-four",
  "rulesVersion": 1,
  "matchId": "match-123",
  "actionId": "action-456",
  "expectedRevision": 0,
  "action": { "type": "drop-token", "column": 3 }
}
```

`parseConnectFourCommand` checks both the shared envelope and Connect Four identity/action. Generic `parseActionCommand` and `parseStateMessage` accept a game-specific parser so contracts do not need to import any game module. Parsers accept decoded JSON, reject unknown fields, and return `{ ok: true, value }` or `{ ok: false, issues }` with field paths. Callers must catch JSON decoding failures and impose byte/queue limits before parsing.

State messages use `type: "match-state"`, `revision`, and `state` in place of the action-specific fields. Action rejections use `type: "action-rejected"`, `actionId`, and a known `code`. Shared outcomes cover a rules win or draw. Room lifecycle and socket authorization live in the Worker adapter for now; they are not yet a stable, versioned shared session contract.

Protocol version and rules version are separate. The generic envelope parser validates a positive rules-version shape; the game-specific parser rejects unsupported game/rules versions. Identifiers are bounded protocol identifiers (up to 128 ASCII letters/digits/underscores/hyphens, starting with a letter/digit), not a username policy. Revisions are nonnegative safe integers. The future service owns revisions and must enforce expected-revision checks and action-ID deduplication; the pure rules package does neither.

A valid snapshot proves legal reachability, not authenticity or identity. The Worker is authoritative for online match state and never accepts a browser-supplied board or outcome. Its local prototype validates the seat credential, turn, revision, legal move, timer, and result. This does not yet establish production-grade identity, abuse resistance, persistence guarantees, Google integration, or leaderboard correctness.

## Extraction and future extension

Copy this entire `games/` directory, excluding `node_modules` and generated `dist` directories, into a fresh location. Run `npm ci` and `npm run check` there. Its package manifests, lockfile, tests, compiler settings, and sources are sufficient; the portfolio root is not required. Preserve the package names or update workspace dependencies/imports together.

## Add a game

The initial platform contract targets deterministic, two-player, alternating-turn games. It is not a universal engine for simultaneous actions, hidden information, or real-time physics. Add the next game in this order:

1. Add `packages/<game-id>` with its own stable ID, current rules version, supported historical versions, action/state validators, deterministic state transition, selectors, and per-version turn/reconnect durations. Wire it into `games/package.json` and `games/tsconfig.json`, add it to `apps/worker/package.json` and `apps/worker/tsconfig.json`, and regenerate the workspace lockfile. Its only runtime dependency should be `packages/contracts`. Keep networking, persistence, clock execution, identity, and UI out of this package.
2. Register the type-erased module in `apps/worker/src/games/registry.ts` and `apps/web/src/games/registry.ts`. The lobby catalog is derived from the browser registry; the Worker rejects unregistered games and rules versions.
3. Add `apps/web/src/features/match/games/<game-id>/...` and register its renderer in `features/match/game-views.ts`. The renderer maps game-specific input to `controller.playAction`; shared match UI retains room status, player identity, score/series, connection, timer, reactions, and dialogs.
4. Add rules tests for legal moves, illegal moves, terminal outcomes, state restoration, and every supported historical version. Add Worker/client integration coverage for room lifecycle and reconnect using that game. Keep each game's scoring/ranking policy explicit rather than assuming all games share the same score.
5. Document accessible controls and instructions, screen-size behavior, session/timer differences, game-specific moderation needs, and version retirement. Deploy matching worker and web registries together.

Retain every rules version used by an active room until rooms using it have expired or been deliberately drained. Do not remove a module just because it is no longer used for new rooms. Shared contracts do not contain Connect Four dimensions or actions; the generic session still assumes two seats and one action at a time.

The workspace contains its own app, Worker, packages, lockfile, compiler configuration, assets, and operational documentation, so it can be copied and run without the portfolio checkout. It still depends on separately configured Cloudflare resources for deployment. Accounts, persistent user history, virtual currency, payments, and cash-out are not implemented.

## Verification record

Verified on 29 October 2026 with Node.js 24.13.1 and TypeScript 5.9.3:

- `npm run check:games` from the portfolio root: type checking/build passed; 50 tests passed, including 200 reproducible legal games checked against an independent board scanner.
- A fresh copy of this workspace, excluding dependencies and generated outputs: clean lockfile installation, independent build/typecheck, and all 50 tests passed without portfolio files.
- Portfolio lint, TypeScript check, and production build passed with this workspace present and excluded from the portfolio compiler's source scope.

The local browser preview was previously reviewed at desktop width and an iPhone 16 viewport. The local Worker/Durable Object emulator was exercised with two independent browser tabs through room creation/joining, synchronized moves, a completed three-game series, readiness for the next game, alternating starters, the final result, and mutual rematch. The visible turn timer and result/leave confirmations were also checked. The Cloudflare preview Worker and legacy Pages UI were smoke-tested for health, lobby access, invite creation/joining, activation, and synchronized moves. On 29 October 2026, the React/Vite UI was deployed to the Pages `react-preview` branch, loaded in Chrome, and received live lobby presence from the preview Worker. Strict builds passed, 61 automated tests passed in the full local run, and the two-client Worker runtime integration test passed when rerun with permission to bind localhost (62 passing test cases in total). The deployed React two-player gameplay, series/reconnect/timeout, mobile-device acceptance, Pages access restriction, production load/recovery, persistent user history, account identity, and production lobby/online capacity remain unverified.

Production-readiness review on 30 October 2026: `npm test` completed successfully with 67/67 tests, including the two-client Worker integration test after permitting localhost binding. `npm run build` passed again after the chat-sheet interaction adjustment. This run did not include a fresh deployed browser walkthrough, current mobile-device review, load/capacity exercise, or recovery test. Production configuration and release commands remain an explicit gate; local and preview success must not be represented as production acceptance.

Multi-game foundation review on 31 October 2026: `npm test` passed all 73 tests, including Worker integration coverage, and `npm run build` passed. `GAMES_API_URL=https://portfolio-games-service-preview.a-akeem.workers.dev npm run build:web` also passed for the React/Vite app. The review added a game registry contract, per-game rules-version/session policy selection, game-specific board rendering boundaries, and registry-aware saved-match restoration. This verifies the current Connect Four path and the extension seams; no second game has been implemented, so adding a real second module remains the proof that the contract is sufficient. The checks were local builds and automated tests, not a deployed multiplayer or mobile-device acceptance run. No deployment was performed as part of this review.

Edge-case hardening on 2 November 2026: `npm test` passed 86 checks (78 rules/contracts/Worker tests and 8 frontend tests), including two-client Worker tests, socket replacement, Worker restart/state recovery, join/cancel/move races, and deadline outcomes. The production-configured `npm run build:web` passed. Fixes cover clearing a pending move after authoritative non-acceptance, preserving reconnect allowance across normal turn-receipt delay, and allowing a player to leave while a mutual rematch countdown is underway. Worker version `9937c469-6e78-4e48-ba2b-2242e8c11b8f` and Pages deployment `8c808f13.portfolio-games-preview.pages.dev` were deployed to production; the production Worker health endpoint returned `ok` and the deployed lobby loaded in a browser. Production two-player match walkthrough, physical iOS Safari audio/layout, capacity, and production restart/recovery remain unverified.

## Connect Four AI opponents

Human-created public rooms appear first. After all human-room pages have loaded, the lobby appends an initial 4–10 in-house offers. The same live offers, names, settings, and expiry times are restored on refresh within the browser session. Each offer expires independently after 3–5 minutes or is removed locally when selected; expiration does not trigger an immediate replacement. If fewer than four remain, one new offer is added after a randomized 8–18 second pause until the soft floor is restored. Human rooms can raise the total above ten. This roster is client-side and creates no placeholder server rooms, polling, or alarms. Selecting an offer opens the normal name-and-rules confirmation, then creates one on-demand match using the same display name shown in the lobby. In-house offers are not included in the public human-room directory. Lobby cards do not label an opponent as computer-controlled; Match details does.

AI selection is currently Connect Four only. The versioned engine uses a per-match seed, tactical win/block/fork checks, profile-weighted search, and a fixed node budget. The four profiles have different search depth and attack/defense weights; a profile remains assigned for its match, while board state and seeded tie-breaking influence each move. The Worker selects and applies moves through the registered game rules. A public human-created room can be claimed by a compatible human first; if it remains unfilled, one scheduled Durable Object alarm adds an in-house opponent after a randomized 8–60 second wait. The regular match countdown then applies.

AI games allow a seeded allowance of one to three rematches. The Worker persists the allowance and closes the virtual seat after it is used. Players can use the same reactions and short messages in AI matches as in human matches; social events are ephemeral and are not added to match history. In-house opponents do not send reactions or messages. The browser stages the already-accepted move for a client-only weighted delay between 1 and 10 seconds before animating it. A triangular distribution peaks near 3 seconds, so delays near 1 second and near the 10-second maximum are uncommon. This presentation delay adds no request or alarm and does not change the server-authoritative board, turn, or result. While the staged AI action is being revealed, its player card uses the same turn label and countdown treatment as a human opponent; the human's authoritative turn clock starts after the action is revealed and acknowledged.

AI games use the standard game UI. Player-side reactions and short messages remain available, but in-house opponents do not send social events. Match details identifies the opponent as in-house. The lobby mixes reserved names with the same generated guest-name convention used elsewhere and sends the chosen name with the create request. Strategy remains match metadata, not part of the display name. Virtual opponents support concurrent matches because their strategy is stateless per turn; each match retains its own seed, profile, and engine version.

To add another game's opponents, register browser-safe profile metadata in `apps/web/src/games/opponents.ts`, then add a server provider in `apps/worker/src/games/opponents.ts`. The lobby and match controller pass game and profile IDs through the shared contract; the Worker validates the provider and applies its action through that game's rules module. Keep old engine-version handlers registered until every match using them has expired. Do not place game-specific search or rules in the shared match controller.

AI variation and lobby matchmaking review on 3 November 2026: `npm test` passed all 108 checks (15 frontend tests and 93 package/Worker tests), including AI profile legality and tactics, varied roster bounds, on-demand AI games, server-authoritative replies, 8–60 second fallback, rematch limits, a leave/rematch race regression, and two-client synchronization. The production-configured `npm run build:web` passed against the production Worker origin. The AI-turn label/countdown presentation was then updated; the final full test run passed all 108 checks and the production build passed. Worker version `8ab3c878-ec5e-4283-afe3-7cf3f71fefdb` and Pages deployment `7e203a40.portfolio-games-preview.pages.dev` are live at `play.ake-em.com`; the custom domain returned HTTP 200 with the final bundle. The latest deployment changed only the UI. These checks do not measure production Worker CPU or verify mobile-device behavior, deliberate network interruption/deadline edges, production recovery, or whether the opponent feels indistinguishable from a person. The owner reports multiple successful live matches with friends.
