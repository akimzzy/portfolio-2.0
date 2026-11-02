# Multiplayer service design

Status: Stage 2 local implementation available for review. Cloudflare as the games platform and the Worker plus per-room Durable Object shape are owner-approved. Public and invite-a-friend rooms, series formats, timer behavior, and series transitions are owner-approved. The local implementation is under `games/apps/worker`; local two-tab browser verification is recorded below. This does not authorize production deployment.

## Goal and boundary

Deliver recoverable, server-authoritative Connect Four series between two separate browsers. Keep the portfolio on its own Vercel deployment. Keep the game client, service, rules, contracts, and their deployment configuration within the detachable `games/` workspace; they may move to a separate repository later without depending on portfolio server code.

The current implementation slice includes public lobby discovery in addition to the Stage 2 match flow:

- Two-player guest matches, with generated display names. Guest matches are unranked.
- Public room creation, invite-link room creation, and a Games lobby that lists open public rooms. Quick Match remains deferred until lobby traffic supports automatic opponent search.
- Server-owned series target, per-game board and score, move validation, visible 45-second turn countdown, a cumulative 60-second reconnect allowance per series, and terminal series result.
- Best of 1, 3, or 5 games; default best of 3. A timeout forfeits only the current game, a draw awards no point, and the series continues until a player reaches the target.
- Both players can choose Next game to start the next board sooner; a shared server deadline starts it automatically after 30 seconds if both are connected. Both must choose Rematch before a new series starts. Explicitly leaving between games concedes the series.
- A responsive client connected to the service over WebSockets, plus documented local and preview environments.
- A small set of predefined, transient in-match reactions and short typed messages. The authenticated match WebSocket validates and rate-limits both under one event budget; neither is stored, included in match history, or treated as a game action. Typed messages are plain text, single-line, and limited to 100 Unicode code points. Clients keep only six recent unique sent messages in device-local storage.

The current slice excludes Google sign-in, usernames, profiles, account history, leaderboards, reports, spectator mode, wallets, coins, payments, and withdrawals. The approved in-match message feature is deliberately bounded and ephemeral; it is not a general chat service. Do not make client state, the browser client, or a guest's local record authoritative.

## Deployment shape

```text
Game browser client
       │ HTTPS: explicit room/session operations
       │ WSS: lobby and authenticated match events
       ▼
Cloudflare Worker entry point
       ├── routes lobby WebSocket to one shared Lobby Hub
       │   ├── SQLite index of joinable public rooms
       │   ├── event-driven updates and paginated snapshots
       │   └── approximate unique browser presence
       └── routes live match traffic by opaque match ID
       ▼
One Match Durable Object per match
       ├── WebSocket sessions for the two seats
       ├── serialized commands and timer transitions
       └── SQLite-backed Durable Object storage

Portfolio: separate Vercel deployment
```

The Worker is a thin HTTP/WebSocket entry point. It performs origin checks, coarse abuse controls, input-size limits, and routes each match request to the correct Durable Object. It must not keep authoritative match state in a Worker isolate or module global.

Each Durable Object is the single coordination point for one series room. It serializes seat claims, series format and score, game count, readiness votes, starting order, countdowns, moves, deadlines, reconnect state, rematches, and completion. Each round remains a standard Connect Four game. Different rooms use different objects and can progress independently. Use the Cloudflare-supported WebSocket hibernation API where compatible with the lifecycle; restore required state from durable storage after hibernation or restart. Use transactional SQLite-backed Durable Object storage for accepted revisions and deadlines. Keep all game rules and shared contracts provider-independent; Cloudflare bindings live in the service adapter.

Use Durable Object alarms for the next persisted deadline, not a process-local interval as the source of truth. Every alarm rechecks match status, revision, and the stored absolute deadline before applying an outcome, so delayed or retried alarms cannot end the wrong turn. If multiple deadlines are pending, schedule the earliest and calculate the next one after processing it.

The selected public hostname is `play.ake-em.com`; the UI uses React/Vite and the API uses a separately deployed Cloudflare Worker. Production DNS, origin allowlist, environment secrets, release/rollback procedure, account plan, budget, and placement policy still need verification. The UI and API deploy independently from the portfolio. Production WebSockets use `wss`; local testing allows only explicitly configured development origins.

### Public lobby feed and presence

The cross-game Lobby Hub stores public waiting-room card data: match ID, game ID, host display name, series target, creation time, and expiry. It never stores seat credentials, invite capabilities, board state, or account identifiers. The match Durable Object remains the authority for every join; a stale or simultaneous listing cannot claim a seat twice. The lobby opens one WebSocket to receive an initial paginated snapshot and subsequent room/presence events. Filter changes and page requests reuse that socket. Room creation, join, cancellation, and expiry publish event updates; no timer polls the listing endpoint.

Room creation publishes an entry; successful joining, host cancellation, and expiry remove it. Directory entries also expire by timestamp and alarm, so a missed cleanup does not keep a room discoverable indefinitely. The lobby WebSocket also identifies one anonymous browser using a random local identifier. Lobby connect and disconnect update the visible count directly from socket state without writing a debounce marker to Durable Object storage. An active match socket reports a temporary presence session to the hub; the same browser identifier is deduplicated across lobby and match connections. Match presence is refreshed on connection and at most once every four minutes when a match event occurs; ordinary moves do not write presence unless the refresh interval has elapsed. Disconnects remove sessions, and a five-minute expiry alarm cleans up missed disconnect events. This is an approximate active-browser count, not an account identity count: two browsers/devices for one person count twice, and offline sessions may remain visible briefly until cleanup. Guests are included. A user who is merely signed in but has no open lobby or match connection is not counted.

Persisted deadlines must be finite and status-consistent before they are scheduled. Legacy match records missing optional deadline fields are normalized and saved once. Terminal matches clear their alarm, and an early alarm with no due transition only recalculates the next valid deadline; it does not rewrite or rebroadcast the match.

The Hub is one serialized discovery and presence point, so it is a launch capacity boundary rather than an unlimited-capacity guarantee. Track request rate, WebSocket count, message volume, overload errors, response latency, active-room count, and query time. Before measured traffic approaches its safe capacity, shard room discovery and presence or introduce a partitioned fan-out design. The hub is reached by one connection per visible lobby and small internal events on match connect/disconnect; it does not issue recurring client requests.

## Workspace boundaries

Keep these logical packages separable, without forcing a repository split now:

| Boundary | Responsibility | Must not depend on |
| --- | --- | --- |
| Game client | Lobby/match presentation, accessible controls, reconnect UX | Durable Object storage or provider bindings |
| Worker service adapter | HTTP routing, WebSocket upgrade, origin checks, coarse rate limits, runtime configuration | Portfolio routes/data or client rendering |
| Match coordinator | Room lifecycle, seat ownership, revisions, deadlines, retry semantics | Browser-supplied state or provider-specific rules |
| Game module | Deterministic Connect Four rules and state validation | Network, storage, clocks, UI framework, or Cloudflare SDK |
| Contracts | Versioned, runtime-validated command/event envelopes | UI framework, database, or provider SDK |

The existing `packages/connect-four` rules module and `packages/contracts` are the starting point. Extend their versioned contract deliberately; the current command and state envelopes do not by themselves implement room creation, identity, WebSocket authorization, countdown, or recovery.

Reactions and quick messages are short-lived presentation events, separate from authoritative match snapshots. Accept only reaction IDs from the shared allowlist. Normalize typed text with the shared contract, reject empty or over-limit text, and treat it as text in the UI (never HTML). Accept either event only from an authenticated seat while the match is active; enforce a shared per-connection cooldown and rolling limit so switching between reactions and text cannot bypass the budget. Broadcast to the two authenticated seats without writing match state or refreshing lobby presence. Do not retain message bodies or replay activity to reconnecting clients. The browser stores up to six recent unique messages sent by that player locally and offers a clear-history control; this local convenience is not authoritative match data.

## Guest and room access

The server issues opaque guest-session credentials and binds each credential to one match seat. The client never chooses its seat or submits a player identity as proof. Tickets must be unguessable, scoped to a match and seat, short-lived, revocable, and excluded from logs. Do not put bearer credentials in room URLs or WebSocket query strings. Authorize the socket with a bounded first-message handshake or an equivalent secure same-origin mechanism, and close connections that do not authenticate promptly.

Room IDs and join capabilities are separate values. Use cryptographically secure randomness for any bearer join capability, store only a verifier where practical, and rate-limit creation, joins, and failed guesses. Joining must atomically reserve the second seat; simultaneous attempts cannot both succeed. Return explicit full, expired, unauthorized, and already-joined responses without leaking another player's private identifiers.

The first Worker uses a Cloudflare rate-limit binding for room creation and joins, keyed by source IP, plus a per-seat action window inside each match object. The lobby connection is established once while its view is visible; room changes arrive as pushed events, and reconnect attempts use capped exponential backoff only after a connection closes. The edge limit is an approximate abuse-control default, not a global quota or a substitute for capacity measurement. Mobile-network IP sharing makes conservative threshold tuning and monitoring important. Do not rate-limit all gameplay by IP.

Public room creation and invite-a-friend creation are confirmed options. Public waiting rooms are discoverable in the Games lobby; an invite room is unlisted and joinable through its capability link. Both guests may use these paths for testing; the match is unranked and the invite expires under the private-invite expiry rule. Broader guest eligibility and abuse controls remain subject to the launch policy.

## Match lifecycle

The authoritative lifecycle is:

```text
waiting → starting countdown → active → between-games → active → completed
   └──────────────→ expired/cancelled ←───────────────────────────────┘
```

Within a series, a non-final game ends in `between-games`. Both readiness votes move the room through a short countdown into the next game. If neither or only one player votes, a shared 30-second server deadline starts the next game automatically when both players are connected. A disconnected player retains the existing reconnect window; once they return after the intermission deadline, the server starts the game countdown. Reaching the series target ends the room in `completed`. A mutual rematch returns a completed room to a countdown for a new series.

The Durable Object owns both participant seats and their sanitized display names, room lifecycle, series target and score, game number, readiness votes, starting seat for each game, rules version, state revision, current Connect Four state, countdown deadline, current turn deadline, each player's remaining reconnect allowance, and the game/series outcome. A player may supply a display name when creating or joining; a stable generated name is used when blank. Names must be unique within a match after Unicode compatibility normalization, whitespace collapse, and case-insensitive comparison; the Durable Object enforces this before assigning the second seat. Display names identify seats within a match and do not authenticate a player or need to be globally unique. Client clocks are display hints only.

| Event | Server behavior |
| --- | --- |
| Create public | Create one waiting public match, return the creator's seat credential, and publish a minimal joinable-room entry to the directory. If directory publication fails, the room remains usable by direct link and the UI explains that it is not listed. |
| Create invite | Create one waiting unlisted match and return the creator's seat credential and shareable invite capability. |
| Cancel waiting room | The creator may cancel before play starts. Mark the room cancelled, reject further joins, and invalidate its link so the creator can return to games immediately. |
| Join | Atomically claim the only open seat; reject joins after expiry, start, or a prior successful claim. |
| Both seats claimed and connected | Joining counts as confirmation. Start a brief countdown; do not start the turn clock until it finishes. |
| Disconnect during countdown | Cancel the countdown and wait for reconnection; do not consume either player's turn time. |
| Countdown completes | Persist active state and the first absolute turn deadline, then broadcast the same authoritative snapshot to both players. |
| Valid move | Check socket authorization, seat, active status, expected revision, action ID, current turn, deadline, and Connect Four rules. Persist the next state/revision before acknowledging it. |
| Invalid/stale move | Return a bounded rejection code and current revision; do not change the board or consume the turn. |
| Turn deadline | Recheck the persisted deadline and revision, then apply the agreed timeout outcome exactly once. |
| Reconnect | Reauthorize the seat and return current state, revision, remaining turn time, and remaining reconnect budget. Never restore a client-provided board. |
| Current game completes | Store its outcome exactly once. Award a point for a win or timeout forfeit, none for a draw. Enter `between-games` until the series target is reached; otherwise enter `completed`. |
| Next game | Both votes start a short countdown immediately. If they do not both vote, start the next game after the shared 30-second server deadline when both seats are connected. Reset the board and alternate the starting seat. If a player is disconnected when the deadline arrives, wait for the reconnect policy; once they return, start a short countdown. |
| Series completion | Show the final score. A rematch requires both votes; leaving ends that room for the player who left. |
| Recovery failure | If authoritative state cannot be restored safely, cancel without recording a win/loss and explain the cancellation. |

Confirmed policies: a visible local countdown reflects the 45-second server deadline; the server alarm is authoritative. Timeout forfeits the current game only; no skipped turns. Each player has at most 60 seconds of reconnect allowance per series. An unjoined public room expires after five minutes. A private invite expires after 24 hours if nobody joins. Best-of-one/three/five are available with best-of-three default. First to the target number of game wins takes the series; ties award no point and extend the series. Mutual readiness starts the next game sooner; otherwise, the server uses a shared 30-second intermission deadline to start automatically when both players are connected. Both must agree before a rematch. A player who explicitly leaves between games concedes the series. The first game uses a server-selected random starter; later games alternate starters. Rematches also alternate the series' first starter. The initial countdown is two seconds.

## Remaining implementation and launch policies

Product-level series decisions are settled. These technical failure, release, and launch details remain to be verified or specified; this section does not reopen the approved series rules.

1. **Disconnect:** detect a dead socket through transport close. If the current player disconnects, pause their turn clock and charge their cumulative 60-second reconnect allowance. If they reconnect in time, resume with the remaining turn time; if that budget expires, they forfeit the current game. A disconnected off-turn player may reconnect while the opponent's turn continues; their allowance begins when their turn starts. Between games, one expired allowance concedes the series to the other player; if both allowances expire at the same instant, cancel the series without a winner. If service-side state is lost, cancel the match instead of awarding a forfeit.
2. **Deadline race:** process actions and deadline alarms through the same serialized owner. A move is on time only if accepted by the server before the persisted deadline. A timeout and a move racing at the boundary produce exactly one terminal/state transition.
3. **Repeated connections:** one active connection controls a seat. A newer authorized reconnect replaces the old socket; an old socket cannot continue submitting actions.
4. **Voluntary leave:** an explicit Resign action forfeits the current game. Explicitly leaving between games concedes the series. Closing a tab or losing network is a disconnect and uses the reconnect allowance; it is not treated as an intentional resignation.

The between-games reconnect expiry policy and automatic next-game deadline are implemented and covered by focused alarm tests. Active reconnect timing and countdown recovery still need race/restart verification. The browser retries with capped exponential backoff, stops automatic attempts when its local estimate reaches the last server-reported reconnect allowance, and offers manual retry; this countdown is a display estimate only. The 30-second intermission deadline and two-second game-start countdown are implementation settings; the browser renders server timestamps locally without polling. Numeric transport heartbeat intervals and WebSocket backpressure thresholds are implementation settings, validated in later verification and load checks.

## WebSocket protocol and reliability

Use the existing `protocolVersion`, `gameId`, `rulesVersion`, `matchId`, `actionId`, and `expectedRevision` concepts. Add a separately versioned session envelope for room lifecycle and socket authorization. Parse every decoded message at runtime; TypeScript types alone do not validate network input. Reject unknown fields, unsupported versions, malformed JSON, oversize frames, unauthenticated actions, and actions inconsistent with the authoritative room.

Before a direct-link join, `POST /v1/matches/:id/preview` returns only the waiting room's game ID, host display name, visibility, series target, and rule summary (turn duration, timeout outcome, and tie scoring). Public previews need no credential; private previews require the invite capability in the request body. The Worker rate-limits the request, and the match Durable Object verifies room state and invite authorization. Never return seat credentials, board state, or private identity data from a preview. Public-lobby joins reuse the already available lobby entry rather than making this extra request.

Client commands are intentions, never state replacement:

- `authenticate` — seat credential sent in the first WebSocket frame after connection. The local prototype uses a match-scoped opaque credential; a production protocol still needs explicit expiry, rotation, revocation, and compatibility rules.
- No separate Ready action is required: creating or joining is the player's explicit intent to play. Joining only starts the short countdown after both seats are connected.
- `submit-action` — action ID, expected revision, and a validated game action.
- `next-game` — vote to start the next game after a non-final result; both votes start it immediately, otherwise the server starts it after the shared intermission deadline when both seats are connected.
- `rematch` — vote to begin a new series after completion; the server starts it only after both seats vote.
- `concede-series` — explicitly end an in-progress series between games, awarding it to the other player.
- `leave-game` — leave a completed series and decline any rematch in that room.

Server events include:

- `match-snapshot` — lifecycle, authoritative state, revision, seat display names, server timestamp, current deadline, and remaining reconnect budget visible to that seat.
- `action-accepted` or `action-rejected` — correlation action ID, revision, and a stable bounded reason code.
- `presence` — opponent connection and countdown state; no account/provider identifiers.
- `match-completed` or `match-cancelled` — one canonical outcome/reason.
- `protocol-error` — safe error code and recovery instruction, never stack traces or secrets.

For Connect Four, send a compact complete board snapshot after each accepted move; 42 cells are small and a full snapshot simplifies recovery on mobile networks. The client shows a pending move while it waits, but treats only the server snapshot as accepted. Show remaining turn seconds locally from the server timestamp and absolute deadline; no per-second network polling is used. On reconnect, authenticate over the match WebSocket, which returns the authoritative snapshot before enabling input; do not issue a duplicate HTTP state read. Use bounded exponential reconnect retries within the remaining allowance, and stop cleanly after terminal state or expiry.

Persist action IDs (or a bounded deduplication window) with their accepted revision/result. A retry of an accepted action returns the same acceptance without applying it twice. Reject stale `expectedRevision` values while returning the latest authorized snapshot. Keep room mutation and terminal-result publication idempotent across worker retries and deployments.

## Traffic, abuse, and device constraints

- Apply request rate limits to room creation, joins, failed join attempts, and ticket issuance. Add per-seat message limits and a small maximum frame size for this turn-based game.
- Use per-room/per-session limits in addition to IP controls; mobile carrier NAT can place many Nigerian users behind one IP, so IP limits alone can block legitimate players.
- Bound socket count, pending messages, room count/age, and unauthed socket lifetime. Close slow consumers rather than building unbounded queues.
- Require exact production `Origin` allowlisting, secure cookies/tickets as applicable, and `wss`. Redact ticket material and invite capabilities from logs and analytics.
- Send move/state events only when authoritative state changes. Do not poll for lobby, match, or countdown data; the client renders countdowns locally from server deadlines and receives updates through WebSockets.
- Keep payloads small and avoid mandatory animation or sound. Respect reduced-motion, muted sound, background-tab throttling, low-memory phones, and reconnecting mobile networks.
- Provide a readable connection state, offline/reconnecting state, remaining grace time, and safe disabled controls. Never imply a move was accepted before the authoritative response.

Set numeric production limits from staged measurements and abuse review. Do not describe the service as production-ready until concurrency, message size/rate, p95 move acknowledgment, reconnect, restart recovery, and cost targets have measured acceptance values.

## Recovery, deployment, and observability

Persist the accepted board/revision, lifecycle, seat ownership, deadlines, reconnect usage, deduplication state, and terminal outcome before acknowledging the corresponding transition. On hibernation or restart, load the stored state and re-arm the earliest pending alarm. Deployments must keep existing protocol/rules versions valid for active rooms or drain/cancel them safely.

Log structured operational facts: match ID (non-secret), revision, event type, stable result code, latency, connection/reconnect state, and runtime release. Never log credentials, join capability, private account/provider IDs, or full message bodies. Emit metrics for room create/join, accepted/rejected actions, duplicate actions, socket close causes, reconnect outcomes, deadline outcomes, storage/alarm failures, active rooms/sockets, and message processing latency. Keep health/readiness checks independent of any one room.

Use separate development, preview, and production Cloudflare environments, credentials, OAuth clients, allowed origins, and data. The current local static preview does not emulate Workers or Durable Objects; add a supported local Worker development command and service integration checks before claiming runtime parity. Do not point local development at production match storage.

Cloudflare's single-object design is a good fit for per-match serialization, but it does not remove the need to measure latency from Nigeria, WebSocket behavior, limits, and cost. Measure both players' round-trip time; a match object is one coordination point and is not simultaneously close to every player. See [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/), [WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), and [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

## Stage 2 acceptance evidence

Do not call the first slice complete until these are verified in the Workers-compatible runtime:

- Two independent browsers join one room and see the same server-issued seats, turn, board, and outcome.
- Wrong-seat, wrong-turn, full-column, stale-revision, duplicate-action, malformed, oversized, and post-terminal actions cannot mutate the match.
- Concurrent joins reserve one seat only; racing actions/deadlines result in one valid transition.
- A refresh/reconnect within the approved allowance restores the exact server state and remaining time; reconnect exhaustion follows the approved rule.
- A Durable Object restart/hibernation restores board, sequence, deadlines, and deduplication safely.
- A network/server failure does not fabricate a win or ranked result; the client explains retry, cancellation, or terminal status.
- Desktop and mobile browsers have usable create, join, countdown, play, wait, disconnect, reconnect, and result flows; keyboard and reduced-motion behavior remain accessible.
- Rate/frame limits, monitoring, deployment rollback, and separate environment configuration are exercised before public traffic.

Observed locally: two independent browser tabs created/joined a room, synchronized moves and state, completed a best-of-three series, voted to continue between games, saw alternating starters, reached a final series result, and mutually accepted a rematch. The visible local countdown and result/leave flows were reviewed. TypeScript checks/build and browser-script syntax checks pass; 54 automated rules, contract, turn-expiry, and intermission-expiry tests pass. Active reconnect expiry, duplicate/stale/racing Worker actions, Durable Object restart/hibernation recovery, mobile screenshots of the full series flow, and measured Nigeria latency have not been verified. Passing local browser checks is not evidence of public capacity, provider failover, deployed authentication, or production cost. Those remain launch gates.
