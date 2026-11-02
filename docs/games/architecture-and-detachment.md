# Architecture and detachment plan

## Agreed direction

- Use TypeScript for the game backend.
- Keep the backend as an independently deployable service, initially in this repository.
- Use Cloudflare Workers for the service entry point and one SQLite-backed Durable Object per match for authoritative room coordination. Keep the existing portfolio deployment on Vercel. The owner approved this provider direction on 26 October 2026.
- Use WebSockets for live two-way match updates and the visible lobby feed. Use ordinary HTTP for explicit room/session operations, account profile, history, and leaderboard reads.
- Keep the service independent of Next.js runtime internals and portfolio-specific server code.
- The first game is a two-player, turn-based board game. The initial shared platform supports that class of game; real-time physics and high-frequency simulation are outside its current scope.

The React/Vite game UI and TypeScript Worker deploy independently from the portfolio. The approved game hostname is `play.ake-em.com`; deployment configuration and production acceptance still need verification. TypeScript does not require Next.js or a conventional Node.js server. Cloudflare bindings belong in the service adapter; provider migration would require replacing infrastructure adapters, while moving the repository is a separate concern. See the [Stage 2 service design](multiplayer-service-design.md) for the deployable shape.

## Proposed service boundaries

1. **Portfolio shell**: links to `/play` and supplies the existing navigation/visual system where the route is hosted in the portfolio.
2. **Game client**: renders lobby, game board, results, account controls, history, and leaderboard. It talks to the game backend through documented HTTP and WebSocket contracts.
3. **Game service**: owns matchmaking, room membership, authentication/session validation, turn clocks, reconnect allowance, rules, and authoritative results.
4. **Persistence**: stores accounts, usernames, match summaries, operational event data, and precomputed leaderboard results according to separate retention rules.
5. **Contracts**: versioned request, event, and response schemas shared by client and service. Keep contracts independent of Next.js, UI components, and provider SDKs.

These are logical boundaries, not a mandate for a separate repository or a service per game. The match coordination runtime, React/Vite frontend, and public hostname are selected. Account/history storage, monthly budget, and measured region/capacity targets remain open.

### Database provider decision — deferred

The database decision is intentionally open. The current Worker has no D1 or Supabase binding and no server-side player-history store: active match state lives in per-match Durable Object SQLite, while the lobby hub uses its own Durable Object SQLite tables. Do not provision another database until accounts or server-backed history are scheduled.

When evaluating D1 against Supabase Postgres, estimate expected matches per day, stored summary rows and indexes per match, history page size and read frequency, account/profile reads and writes, leaderboard refresh work, monthly active users, and data egress. Compare D1's daily row limits and per-database storage with Supabase's database size, shared compute, egress, and free-project pause behavior. Neither provider replaces the match Durable Object or lowers its WebSocket/alarm request count. Record measured results and the chosen provider here before adding a binding.

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

- Create/join public rooms and create/read private invites. A shared Lobby Hub pushes room events and paginated lobby snapshots over one visible-lobby WebSocket; match Durable Objects still arbitrate joins. Quick Match is deferred until traffic can support it.
- Google authentication callback/session and username selection/availability.
- User profile and visibility preferences.
- Match history and rematch request/acceptance.
- Leaderboard views and last-calculated timestamp.
- Report/block actions and health/readiness.

WebSocket contract areas:

- Authenticate/authorize a connection and join a match.
- Submit a move with match ID, client action ID, and expected sequence.
- Receive authoritative state, accepted/rejected move, timer, presence, disconnect/reconnect, terminal result, and transient reaction or bounded quick-message events.

Exact schemas, endpoint paths, token strategy, and versioning policy remain implementation design decisions. Contracts must distinguish account IDs, temporary guest IDs, public usernames, and generated guest display names.

## Shared platform and individual games

Keep one shared platform for identity, room discovery, seat reservation, sessions, matchmaking, reports, history, and scheduled leaderboard publication. Each game is a module with its own rules and client rendering. Avoid a service per game or a dynamic plugin system for the first release.

The small game-module contract must cover:

- Stable game ID, rules version, action schema, and saved-state schema version.
- A rules-version-specific turn and reconnect duration policy. The Worker executes deadlines; game modules provide the corresponding values.
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

The workspace now has separate rule and runtime boundaries: `packages/contracts` defines the shared two-player alternating-turn contract; each `packages/<game-id>` package owns deterministic rules; `apps/worker/src/games/registry.ts` registers server-supported games; `apps/web/src/games/registry.ts` supplies the lobby catalog; and `apps/web/src/features/match/games/<game-id>/` supplies game-specific input and rendering. The shared match shell owns room, series, connection, countdown, and social UI. The Worker still owns authoritative moves and room lifecycle. See [the workspace guide](../../games/README.md) for commands and the game-addition checklist.

Keep the package layout and allowed dependencies for the portfolio, game UI, game service, game rules, and protocol contracts documented as the platform evolves. These are logical boundaries; they do not require a separate repository or deployment for every package.

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
- Use per-match Durable Object SQLite for active match state, revision, deadlines, and bounded action deduplication. A shared store for accounts, long-lived history, reports, and daily leaderboard outputs remains a later decision; Durable Object storage alone does not settle those cross-match data requirements.
- Design for unknown traffic with metrics and a measured baseline. Avoid a premature multi-region or multi-service architecture; ensure the selected runtime can scale concurrent WebSocket sessions and route each match to one authoritative owner.

## Future monetary system boundary

There is no wallet, balance, ledger, deposit, withdrawal, stake, prize, payment provider, or cash value in the first-release domain model. A future money feature would require a separate ledger and compliance architecture and may require material changes. The game boundary makes that future work more separable; it does not promise a simple switch or bypass legal/payment approval.
