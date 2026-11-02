# Games experience planning

Status: planning and implementation reference. The React/Vite interface, TypeScript Worker, isolated rules/contracts foundation, server-authoritative Connect Four flow, Games home, and public waiting-room discovery are implemented. Accounts, records, and leaderboards remain later work. Local verification is not production acceptance; this document does not authorize deployment.

Decision status: the confirmed-decision table records owner-approved choices. Sections labelled proposed describe recommendations awaiting agreement. Technical requirements describe constraints needed to implement those choices safely; they do not settle open product policies.

This package describes a portfolio-linked multiplayer games experience. The first release is a free, non-monetary Connect Four experience for two players. The games surface should be detachable from the portfolio and its backend should deploy independently, while the work can begin in this repository.

## Documents

- This document — product brief, confirmed decisions, and open gates.
- [Connect Four specification](connect-four.md) — standard rules and online match lifecycle.
- [UX and screen flows](ux-and-screen-flows.md) — lobby, guest and account paths, match, history, and leaderboard.
- [Architecture and detachment](architecture-and-detachment.md) — service boundaries, real-time model, and repository portability.
- [Multiplayer service design](multiplayer-service-design.md) — approved Cloudflare runtime shape, Stage 2 scope, protocol, recovery, and acceptance evidence.
- [Security, privacy, and reliability](security-privacy-reliability.md) — abuse controls, data rules, and failure behavior.
- [Deployment and operations](deployment-and-operations.md) — launch readiness, monitoring, capacity, and unresolved platform choices.
- [Follow-up register](follow-up-register.md) — known verification work, deferred product decisions, and the recommended next pass.

The browser app is a React/Vite interface for the Games catalog, public lobby, and Connect Four match. It follows the portfolio's visual language and deploys independently from the portfolio.

## Product purpose

Give visitors a memorable, easy-to-enter multiplayer experience connected to Akeem's portfolio. Visitors should be able to try a game as a guest, find an opponent, play a complete live match, and quickly play again. Accounts add saved records and a public game identity; they are not required to try the game.

Primary launch audience: people in Nigeria. The experience is public to portfolio visitors; whether access is geographically restricted is not decided.

## First-release scope

- One polished game: standard Connect Four. Other simple games remain future additions.
- Games home with an available-game catalog and a paginated list of joinable public matches; private invite links are also available. Quick Match is deferred until lobby traffic makes automatic opponent search useful.
- Two players per match, with no spectators. Active players can use a small set of quick reactions or send short, rate-limited text messages.
- Guests may create and join public matches. They use generated names and are subject to rate limits. Guest access to private matches remains open.
- Guest play is available without signup. Guest history stays on the device and can be saved to an account later.
- Optional account creation through Google sign-in. A unique username is required for an account's public identity. No password flow in the first release.
- Game outcomes and standings only: no wallet, purchasable or redeemable currency, point staking, deposits, withdrawals, or payment integration.
- Responsive desktop and mobile layouts that carry the portfolio's existing visual identity and centered structure while giving the game board adequate room.

## Confirmed decisions

| Area | Decision |
| --- | --- |
| Architecture | TypeScript backend as a separately deployable service, initially in this repository; keep the boundary portable to a future repository. |
| Games hosting | Cloudflare for the separately deployed game service; keep the portfolio on Vercel. Use a Worker entry point and one Durable Object per match for authoritative coordination. The games hostname is `play.ake-em.com`; production configuration, budget, and launch-region measurements remain open. The UI uses React/Vite. |
| Real-time | WebSockets for two-way gameplay; the server owns and validates match state. |
| Audience | Public release, primarily for Nigeria; expected concurrent player count is unknown. |
| Game roadmap | One game at launch, Connect Four; other games may follow. |
| Match access | Offer both discoverable public games and invite-a-friend games. Players join from Games or create directly from the selected game's catalog row. Quick Match is deferred; invite-link matches remain unlisted. |
| Games home | Separate Open matches and Games tabs; Open matches is the default. The catalog only lists implemented games; match setup opens directly from a game's Create match action. |
| Lobby presence | Show an approximate unique-browser count, including guest lobby browsers and match connections; deduplicate one browser across its lobby/match sockets. It is not a unique-person or account count. |
| Private match standings | Private matches are unranked and never contribute to public leaderboard totals. |
| Public ranked participation | A public match can count toward standings only when both players are signed in before play starts. Matches involving guests are unranked; saving guest history later does not make those results ranked. |
| Accounts | Guests can play. Google sign-in is the planned account path; account usernames are unique. No password flow. |
| Guest identity | Automatically generated guest names. |
| Profile | Username and game stats only; email remains private; no photo or bio at launch. |
| Public stats | Wins and rankings are public by default for accounts, with a way to hide them. Hidden stats are omitted from public profile/leaderboard. |
| Records | Show standard match summaries. Keep account history until account deletion; offer a separate history-clear action. Guest history remains on the device and may be claimed at signup. |
| Leaderboards | Separate by game; all-time, weekly, monthly, and yearly views. Rank by wins in the selected period and show matches played and win rate as context. Recalculate once per day, not per match or page request; show the last-calculated time. |
| Match timer | Show a local countdown from the server deadline; the server remains the sole timeout authority. A 45-second timeout forfeits the current game, not the series. |
| Reconnect | Up to 60 seconds of cumulative reconnect time per player per series. |
| Public room expiry | Remove an unjoined public match after 5 minutes. |
| Private invite expiry | Expire an invite after 24 hours if nobody joins. |
| Series | Creator chooses best of 1, 3, or 5, default 3. First to 1, 2, or 3 game wins takes the series; a tied game awards no point and play continues until the target is reached. |
| Next game | Both players can choose Next game to start sooner. Otherwise, after 30 seconds the server starts it automatically if both remain connected. The first game starter is chosen randomly by the server; starters alternate between games and between mutually accepted series. |
| Leave series | Explicitly leaving between games concedes the series to the other player. Disconnects continue to use the reconnect allowance. |
| Rematch | Offer a rematch after the series; start a new series only when both players accept. |
| Social and safety | No spectators. In-match chat is limited to 100 characters, rate-limited, and not stored on the server. The device keeps up to six recent unique sent messages with a clear-history action. Keep it respectful; do not share personal details. Misuse may restrict access. |
| Service outage | Attempt match recovery during reconnect time; otherwise cancel without recording a win or loss and explain what happened. |

## Open decisions and gates

These are intentionally unresolved; implementation must not invent answers.

## Implementation sequence and decision timing

Core discovery is complete. Do not restart the general questionnaire or ask the owner to reconfirm choices already in the confirmed-decision table. The backlog below is not a requirement to settle every launch detail before writing the first game code.

| Stage | Deliverable | Decisions needed at this stage |
| --- | --- | --- |
| 1. Game foundation | Isolated Connect Four rules module and minimal versioned platform contracts, with meaningful rules checks | Standard rules and TypeScript are confirmed; no hosting purchase or leaderboard policy is needed |
| 2. Multiplayer play | Recoverable server-authoritative series between two browsers, public and invite room creation, server validation, visible timer, and responsive board | Review the local slice; verify reconnect, alarm/restart races, failure handling, and production limits before calling the stage complete |
| 3. Games home and lobby | Multi-game catalog, paginated public-room discovery, create/join flows | Keep lobby records minimal and let each match room arbitrate joins |
| 4. Account identity | Google sign-in, usernames, account identity, and verified guest-history claim | Resolve only remaining access/session choices affecting these flows |
| 5. Records and competition | Verified history, daily leaderboards, visibility and history controls | Resolve rematch/opponent eligibility, schedule/ties, and retention/deletion semantics |
| 6. Public launch | Reports/blocking, operational readiness, measured capacity/recovery, and deployment | Budget, support ownership, production configuration, and launch acceptance evidence |

Stage 1 was approved on 25 October 2026. Cloudflare for the games service, with the portfolio remaining on Vercel, was approved on 26 October 2026. Public and invite-a-friend rooms, join confirmation, and a short start countdown were approved on 26 October 2026. On 26 October 2026, the owner approved best-of-one/three/five series with best-of-three as default, current-game forfeits on timeout, mutual next-game readiness, ties awarding no point, explicit leave between games conceding the series, mutual rematch, and a visible server-authoritative countdown rendered locally without per-second polling. The owner later requested an automatic next-game start so intermissions cannot wait indefinitely. The implementation uses a shared 30-second deadline: mutual readiness starts the next game sooner, while the server starts it automatically at the deadline if both players are connected. The first starter is random; game starters alternate, and rematches alternate the series starter. The current source and independent commands are documented in [the games workspace](../../games/README.md). Further clarification should be limited to a material unresolved product, privacy, or spending decision at the affected stage. Routine engineering choices should be documented with their rationale rather than turned into repeated approval questions. Proposals must not be relabelled as owner-approved decisions.

## Remaining decision backlog

### Product decisions needed before the affected feature is built

- Confirm whether visitors outside Nigeria may play.
- Define exact username constraints, reserved names, and rename rules.
- Decide whether guests may create private invites, join private matches, or both; public guest creation/joining is confirmed.
- Define the exact leaderboard refresh time and display timezone. Africa/Lagos is the proposed display timezone, not yet approved.
- Define tie-breaking for equal wins and whether a minimum number of games is needed to appear on a periodic board.
- Define the remaining public ranking policies: whether public rematches remain ranked and how repeated opponents are treated. Both players must already be signed in before play starts; private and guest matches are unranked.
- Define what clearing history does to public aggregate stats and already-published leaderboard standings.
- Define guest-history claim behavior when an account is created on a different device or after local data is lost.
- Define event-log retention, user-requested detail/export behavior, and the distinction between support logs and user-visible records.
- Set reporting workflow, report review ownership, and the action taken on confirmed abuse.
- Set browser support baseline and accessibility acceptance criteria.
- Confirm account deletion behavior for match records involving other players and any legally required operational records.
- Allow one active online match series per browser profile. Multiple-device/account enforcement remains undecided. Active-game resignation, simultaneous reconnect expiry, series leaving, starter selection, and mutual rematches are approved in [the Connect Four spec](connect-four.md). Technical deadline and restart races still need verification.

### Technical design and launch decisions

- Verify production DNS, Worker/UI configuration, secrets, rollback, and deployed gameplay at `play.ake-em.com`; set the monthly budget and initial capacity target before public launch. Expected traffic remains unknown; measure against an explicit engineering target before launch.
- The approved provider direction is a separate Cloudflare games deployment and a Vercel portfolio. The Worker/Durable Object design is recorded in [the Stage 2 service design](multiplayer-service-design.md). Cloudflare runtime and state adapters would need replacement to move providers; moving repositories is a separate concern.
- Document atomic room joins, match ownership, durable move acceptance, session expiration, protocol compatibility, timer recovery, and daily leaderboard publication before implementing those systems.
- Define measurable browser, accessibility, latency, recovery, cost, and capacity acceptance criteria before public launch. See the acceptance matrix in [deployment and operations](deployment-and-operations.md).

### Later roadmap; not a first-release blocker

- Produce a shortlist of additional simple games when planning the second game. The shared game-module contract and catalog boundary are in place; selecting later games is not required now.
- Add Quick Match only after traffic measurements show players can reliably find an opponent.
- Consider preset reactions and user-facing move timelines/replays only after the core experience is stable.

## Review follow-through

| Review finding | Planning change | Remaining gate |
| --- | --- | --- |
| Locally edited guest records could inflate stats | Require server-verifiable results and single-use ownership claims; guest matches stay unranked after signup | Approve retention/claim window |
| Arranged matches could manufacture wins | Private and guest matches confirmed unranked; both players must sign in for a public match to be eligible | Public rematches, repeated opponents, and sanctions |
| Timers, joins, and reconnects can race | Server-authoritative lifecycle and expiry rules implemented; reconnect expiry has focused Worker tests | Verify move/deadline races, active reconnect expiry, and Durable Object restart recovery |
| Future games could inherit Connect Four assumptions | Small versioned game-module contract and extension checklist added | Review contract with the first implementation |
| Daily job could publish partial or inconsistent standings | Fixed cutoff, bounded processing, and atomic publication required | Schedule, timezone, tie-breaks, and ranking policy |
| History deletion and visibility conflict with shared results | Separate data responsibilities and immediate visibility suppression | Retention and clear-history semantics |
| Rules and multiplayer needed an isolated review surface | Standalone workspace, Connect Four client, event-driven public lobby hub, and local two-tab flow added | Review the lobby and match journey; accounts, records, leaderboards, and deployment remain future work |
| Quality goals were not measurable | Acceptance evidence matrix added | Set targets and collect actual evidence before launch |

These are planning requirements and open gates. The rules foundation and the initial local Worker-backed two-tab flow have been implemented. Only the behavior explicitly recorded in the [service design](multiplayer-service-design.md) has been observed locally; no deployed-service, production-capacity, restart-recovery, or security-review result is implied.

### Before any real-money feature

Real-money entry, prizes, purchasable/redeemable points, wallets, deposits, withdrawals, or payment providers are explicitly out of scope. Any future proposal is a separate approval gate requiring jurisdiction-specific legal advice, regulator and payment-provider approval, and new security, financial-ledger, responsible-play, support, and operations designs. The current architecture must not imply that this transition is automatic or trivial.

## Working principles

- The server is authoritative for turns, timers, results, and standings.
- A completed match is recorded once; retries must not duplicate outcomes.
- The portfolio links to the games experience but is not a dependency of the game service.
- Prefer a small, observable service with graceful failure to speculative large-scale infrastructure.
- A stopped or cancelled game must not be misreported as a loss.
- Keep personal information private and collect only what the feature needs.
