# Architecture and detachment plan

## Agreed direction

- Use TypeScript for the game backend.
- Keep the backend as an independently deployable service, initially in this repository.
- Use WebSockets for live two-way match updates. Use ordinary HTTP for operations that do not require a live connection, such as lobby discovery, account profile, history, and leaderboard reads.
- Keep the service independent of Next.js runtime internals and portfolio-specific server code.
- The first game is a two-player, turn-based board game. The initial shared platform supports that class of game; real-time physics and high-frequency simulation are outside its current scope.

Frontend/hosting proposal: keep the existing Next.js portfolio and build the games UI separately with React/Vite, hosted on Cloudflare alongside a TypeScript Workers/Durable Objects service. This has been recommended but not approved. TypeScript does not require Next.js or a conventional Node.js server. A Cloudflare deployment must keep game rules free of Cloudflare bindings; provider migration would still require replacing the infrastructure adapters.

## Proposed service boundaries

1. **Portfolio shell**: links to `/play` and supplies the existing navigation/visual system where the route is hosted in the portfolio.
2. **Game client**: renders lobby, game board, results, account controls, history, and leaderboard. It talks to the game backend through documented HTTP and WebSocket contracts.
3. **Game service**: owns matchmaking, room membership, authentication/session validation, turn clocks, reconnect allowance, rules, and authoritative results.
4. **Persistence**: stores accounts, usernames, match summaries, operational event data, and precomputed leaderboard results according to separate retention rules.
5. **Contracts**: versioned request, event, and response schemas shared by client and service. Keep contracts independent of Next.js, UI components, and provider SDKs.

This is a boundary plan, not a commitment to a specific directory tree, database, WebSocket library, hosting vendor, or deployment product. Decide those after reviewing the existing deployment and the provider's WebSocket, background-job, region, and cost characteristics.

## Detachment requirements

- Keep game logic, protocol contracts, and game-specific UI in clearly named game-owned locations.
- The client must not import portfolio data, components, or server-only modules except through a small, documented shell integration point.
- The backend must not import from the portfolio app. It should receive all configuration via environment/runtime configuration and expose documented health/readiness interfaces.
- Do not couple game identity to portfolio analytics, content data, or private portfolio APIs.
- Use stable game-owned account IDs and match IDs; do not make database identity depend on the portfolio's route or deployment URL.
- Keep deployment configuration, environment-variable documentation, migrations, and operational instructions with the game service.
- When detached, the game can replace the portfolio link/header/theme adapter without rewriting game rules, persistence, or real-time contracts.

## Authoritative real-time model

- The client submits intent (for Connect Four, the selected column), not a new board state or result.
- The service verifies authenticated/guest session, room membership, turn ownership, legal column, timer, and match state before accepting a move.
- Each accepted move advances a server-owned sequence number and emits the resulting state to both players.
- Duplicate, delayed, or out-of-order messages are rejected or safely acknowledged without applying a move twice.
- On reconnect, the service returns the current authoritative state, current player, last accepted sequence, remaining turn time, and remaining reconnect allowance.
- A single terminal transition records a result. Retries and worker restarts must not create duplicate wins or leaderboard inputs.

## Data and APIs to plan

HTTP contract areas:

- Create/list/join public rooms; create/read private invites; Quick Match.
- Google authentication callback/session and username selection/availability.
- User profile and visibility preferences.
- Match history and rematch request/acceptance.
- Leaderboard views and last-calculated timestamp.
- Report/block actions and health/readiness.

WebSocket contract areas:

- Authenticate/authorize a connection and join a match.
- Submit a move with match ID, client action ID, and expected sequence.
- Receive authoritative state, accepted/rejected move, timer, presence, disconnect/reconnect, and terminal result events.

Exact schemas, endpoint paths, token strategy, and versioning policy remain implementation design decisions. Contracts must distinguish account IDs, temporary guest IDs, public usernames, and generated guest display names.

## Shared platform and individual games

Keep one shared platform for identity, room discovery, seat reservation, sessions, matchmaking, reports, history, and scheduled leaderboard publication. Each game is a module with its own rules and client rendering. Avoid a service per game or a dynamic plugin system for the first release.

The small game-module contract must cover:

- Stable game ID, rules version, action schema, and saved-state schema version.
- Creation of initial state, legal-action validation, application of an action, and detection of a terminal outcome.
- Player-visible state and outcome information; private information must not be serialized to unauthorized clients if a later game introduces it.
- Supported player count and timing policy. Connect Four's two seats, board dimensions, 45-second turns, and 60-second reconnect allowance belong to its game/session policy, not universal constants.
- A client renderer, accessible input model, and game-specific instructions.

Rule evaluation should be deterministic for a given validated state/action/context and must not perform networking or persistence. The service supplies trusted time and any server-selected randomness needed by a future game. Do not build a general-purpose game engine before another game's requirements justify it.

Pin the game ID and rules version at match creation. A deployment must continue supporting active matches on their existing version or use a documented draining strategy; never silently change rules mid-match. Protocol and database changes also need backward compatibility during overlapping client/server deployments.

Adding a game should require a module, rendering, rules coverage, versioned configuration, ranking eligibility policy, and documentation. It should not require rewriting Google sign-in, reports, the lobby, or the daily calculation pipeline. The next game may use a different score; introduce that through a versioned scoring policy and keep its standings separate.

## Concurrent actions and durability

- Serialize seat reservation, moves, timer expiry, reconnect updates, and match completion through one authoritative owner or a transactionally equivalent mechanism. Two join requests cannot occupy the same seat.
- Persist an accepted move and its resulting sequence/deadline before acknowledging it as durable. Define retry responses for an already accepted action, rather than reporting all duplicates as failures.
- Persist one canonical terminal outcome keyed by match ID, including game/rules version, public/private visibility, participant identities, outcome reason, and authoritative completion time. Store ranking eligibility separately from visibility and pin the applicable eligibility-policy version. Both players must be signed in at the start of a public match for eligibility; private and guest matches are unranked. Capture this prerequisite at match start so later account claims cannot change it. Rematch and repeated-opponent policies remain open.
- Room completion and publication to any result-processing pipeline must be retryable without losing or duplicating the result. This is not permission to recompute leaderboards after each match.
- Reject commands from an obsolete match owner after failover. Delayed timer work must recheck the current match sequence/status before applying a loss.
- Use deadline-based recovery rather than keeping a process in memory solely to count seconds. A runtime restart must not reset turn clocks or restore spent reconnect allowance.

## Developer setup and extraction acceptance

Before application implementation, document the concrete package layout and allowed dependencies for the portfolio, game UI, game service, game rules, and protocol contracts. These are logical boundaries; they do not require a separate repository or deployment for every package.

Required developer workflow:

- Independent game build/start/typecheck commands and a documented command to run the full local game stack.
- Reproducible dependencies, versioned migrations, an environment-variable inventory, and a safe local data reset/seed procedure.
- Runtime schema validation of HTTP/WebSocket input, in addition to shared TypeScript types.
- Separate local/staging/production identities and data. Any simulated authentication must be confined to local development and impossible to enable accidentally in production.
- Versioned protocol fixtures and meaningful checks for rules, races, recovery, and contracts. Document which checks require live provider access.
- A deployment guide for the chosen runtime. Workers-specific code must be exercised in its supported local/runtime environment; a normal Node process is not equivalent evidence.

Detachment acceptance: copy the game UI, service, contracts, rules, required licensed design assets, migrations, and deployment docs into a fresh repository. They must build with their documented dependencies and run without imports from the portfolio. Only the navigation/brand adapter and deployment settings should need replacement. This exercise is a future verification gate, not a claim that extraction has been tested.

## Persistence and scale shape

- Persist completed match summaries and the minimum state needed to restore an active match through a short service interruption.
- Store the leaderboard output generated by the daily job, so visits do not trigger a raw-match scan or recomputation.
- Keep provider-specific auth/payment abstractions out of core game rules. Google sign-in is planned for account creation; no payments or wallet API exist in the first release.
- Choose a data store and background-job mechanism that support uniqueness/idempotency, scheduled leaderboard generation, and recovery. Specific products are open until hosting is chosen.
- Design for unknown traffic with metrics and a measured baseline. Avoid a premature multi-region or multi-service architecture; ensure the selected runtime can scale concurrent WebSocket sessions and route each match to one authoritative owner.

## Future monetary system boundary

There is no wallet, balance, ledger, deposit, withdrawal, stake, prize, payment provider, or cash value in the first-release domain model. A future money feature would require a separate ledger and compliance architecture and may require material changes. The game boundary makes that future work more separable; it does not promise a simple switch or bypass legal/payment approval.
