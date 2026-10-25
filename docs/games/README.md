# Games experience planning

Status: pre-build planning. No game or backend implementation is authorized by this document.

Decision status: the confirmed-decision table records owner-approved choices. Sections labelled proposed describe recommendations awaiting agreement. Technical requirements describe constraints needed to implement those choices safely; they do not settle open product policies.

This package describes a portfolio-linked multiplayer games experience. The first release is a free, non-monetary Connect Four experience for two players. The games surface should be detachable from the portfolio and its backend should deploy independently, while the work can begin in this repository.

## Documents

- This document — product brief, confirmed decisions, and open gates.
- [Connect Four specification](connect-four.md) — standard rules and online match lifecycle.
- [UX and screen flows](ux-and-screen-flows.md) — lobby, guest and account paths, match, history, and leaderboard.
- [Architecture and detachment](architecture-and-detachment.md) — service boundaries, real-time model, and repository portability.
- [Security, privacy, and reliability](security-privacy-reliability.md) — abuse controls, data rules, and failure behavior.
- [Deployment and operations](deployment-and-operations.md) — launch readiness, monitoring, capacity, and unresolved platform choices.

## Product purpose

Give visitors a memorable, easy-to-enter multiplayer experience connected to Akeem's portfolio. Visitors should be able to try a game as a guest, find an opponent, play a complete live match, and quickly play again. Accounts add saved records and a public game identity; they are not required to try the game.

Primary launch audience: people in Nigeria. The experience is public to portfolio visitors; whether access is geographically restricted is not decided.

## First-release scope

- One polished game: standard Connect Four. Other simple games remain future additions.
- Public lobby with a list of open matches and a Quick Match path; private invite links are also available.
- Two players per match. No spectators or free-text chat in the first release.
- Guests may create and join public matches. They use generated names and are subject to rate limits. Guest access to private matches remains open.
- Guest play is available without signup. Guest history stays on the device and can be saved to an account later.
- Optional account creation through Google sign-in. A unique username is required for an account's public identity. No password flow in the first release.
- Game outcomes and standings only: no wallet, purchasable or redeemable currency, point staking, deposits, withdrawals, or payment integration.
- Responsive desktop and mobile layouts that carry the portfolio's existing visual identity and centered structure while giving the game board adequate room.

## Confirmed decisions

| Area | Decision |
| --- | --- |
| Architecture | TypeScript backend as a separately deployable service, initially in this repository; keep the boundary portable to a future repository. |
| Real-time | WebSockets for two-way gameplay; the server owns and validates match state. |
| Audience | Public release, primarily for Nigeria; expected concurrent player count is unknown. |
| Game roadmap | One game at launch, Connect Four; other games may follow. |
| Match access | Public lobby plus private invite links; lobby list plus Quick Match. |
| Private match standings | Private matches are unranked and never contribute to public leaderboard totals. |
| Public ranked participation | A public match can count toward standings only when both players are signed in before play starts. Matches involving guests are unranked; saving guest history later does not make those results ranked. |
| Accounts | Guests can play. Google sign-in is the planned account path; account usernames are unique. No password flow. |
| Guest identity | Automatically generated guest names. |
| Profile | Username and game stats only; email remains private; no photo or bio at launch. |
| Public stats | Wins and rankings are public by default for accounts, with a way to hide them. Hidden stats are omitted from public profile/leaderboard. |
| Records | Show standard match summaries. Keep account history until account deletion; offer a separate history-clear action. Guest history remains on the device and may be claimed at signup. |
| Leaderboards | Separate by game; all-time, weekly, monthly, and yearly views. Rank by wins in the selected period and show matches played and win rate as context. Recalculate once per day, not per match or page request; show the last-calculated time. |
| Match timer | 45 seconds per turn. A timeout forfeits the match; turns are not skipped. |
| Reconnect | Up to 60 seconds of reconnect time per player per match. |
| Public room expiry | Remove an unjoined public match after 5 minutes. |
| Private invite expiry | Expire an invite after 24 hours if nobody joins. |
| Rematch | Offer rematch; start only when both players accept. |
| Social and safety | No spectators or free-text chat. Players can report or block an opponent after a public match. |
| Service outage | Attempt match recovery during reconnect time; otherwise cancel without recording a win or loss and explain what happened. |

## Open decisions and gates

These are intentionally unresolved; implementation must not invent answers.

## Implementation sequence and decision timing

Core discovery is complete. Do not restart the general questionnaire or ask the owner to reconfirm choices already in the confirmed-decision table. The backlog below is not a requirement to settle every launch detail before writing the first game code.

| Stage | Deliverable | Decisions needed at this stage |
| --- | --- | --- |
| 1. Game foundation | Isolated Connect Four rules module and minimal versioned platform contracts, with meaningful rules checks | Standard rules and TypeScript are confirmed; no hosting purchase or leaderboard policy is needed |
| 2. Multiplayer play | A recoverable guest match between two browsers, server validation, timers, and responsive accessible board | Select runtime/deployment structure; document unresolved readiness/disconnect policy as a concrete proposal before applying it |
| 3. Lobby and identity | Public lobby, Quick Match, private invitations, Google sign-in, usernames, and rematches | Resolve only remaining access/session choices affecting these flows |
| 4. Records and competition | Verified history claims, daily leaderboards, visibility and history controls | Resolve rematch/opponent eligibility, schedule/ties, and retention/deletion semantics |
| 5. Public launch | Reports/blocking, operational readiness, measured capacity/recovery, and deployment | Budget, support ownership, production configuration, and launch acceptance evidence |

Implementation remains a separate action from this planning package. It can begin with stage 1 when the owner instructs it; the initial request explicitly deferred implementation. Further clarification should be limited to a material unresolved product, privacy, or spending decision at the affected stage. Routine engineering choices should be documented with their rationale rather than turned into repeated approval questions. Proposals must not be relabelled as owner-approved decisions.

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
- Approve session policies covering ready confirmation, readiness expiry, simultaneous disconnects, leaving/resigning, start-player selection, and multiple active matches/devices. Technical race handling must be specified alongside them.

### Technical design and launch decisions

- Choose the game frontend/runtime, hosting, storage, deployment boundaries, monthly budget, and initial capacity target. Expected traffic remains unknown; measure against an explicit engineering target before launch.
- Current hosting proposal from the discussion: existing Next.js portfolio on Vercel; separate React/Vite game UI and TypeScript Workers/Durable Objects backend on Cloudflare, preferably under a game subdomain. These are recommendations, not confirmed implementation choices. Cloudflare runtime and state APIs would need replacement to move providers; moving repositories is a separate concern.
- Document atomic room joins, match ownership, durable move acceptance, session expiration, protocol compatibility, timer recovery, and daily leaderboard publication before implementing those systems.
- Define measurable browser, accessibility, latency, recovery, cost, and capacity acceptance criteria before public launch. See the acceptance matrix in [deployment and operations](deployment-and-operations.md).

### Later roadmap; not a first-release blocker

- Produce a shortlist of additional simple games when planning the second game. The shared game-module contract is required now; selecting later games is not.
- Consider preset reactions and user-facing move timelines/replays only after the core experience is stable.

## Review follow-through

| Review finding | Planning change | Remaining gate |
| --- | --- | --- |
| Locally edited guest records could inflate stats | Require server-verifiable results and single-use ownership claims; guest matches stay unranked after signup | Approve retention/claim window |
| Arranged matches could manufacture wins | Private and guest matches confirmed unranked; both players must sign in for a public match to be eligible | Public rematches, repeated opponents, and sanctions |
| Timers, joins, and reconnects can race | Lifecycle table and authoritative serialization requirements added | Resolve the named product policies before coding |
| Future games could inherit Connect Four assumptions | Small versioned game-module contract and extension checklist added | Review contract with the first implementation |
| Daily job could publish partial or inconsistent standings | Fixed cutoff, bounded processing, and atomic publication required | Schedule, timezone, tie-breaks, and ranking policy |
| History deletion and visibility conflict with shared results | Separate data responsibilities and immediate visibility suppression | Retention and clear-history semantics |
| Detachment and developer setup were not demonstrable | Independent build/setup and extraction acceptance specified | Choose concrete package layout and tooling |
| Quality goals were not measurable | Acceptance evidence matrix added | Set targets and collect actual evidence before launch |

These are documentation requirements and open gates, not evidence of implemented or tested behavior.

### Before any real-money feature

Real-money entry, prizes, purchasable/redeemable points, wallets, deposits, withdrawals, or payment providers are explicitly out of scope. Any future proposal is a separate approval gate requiring jurisdiction-specific legal advice, regulator and payment-provider approval, and new security, financial-ledger, responsible-play, support, and operations designs. The current architecture must not imply that this transition is automatic or trivial.

## Working principles

- The server is authoritative for turns, timers, results, and standings.
- A completed match is recorded once; retries must not duplicate outcomes.
- The portfolio links to the games experience but is not a dependency of the game service.
- Prefer a small, observable service with graceful failure to speculative large-scale infrastructure.
- A stopped or cancelled game must not be misreported as a loss.
- Keep personal information private and collect only what the feature needs.
