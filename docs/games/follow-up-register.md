# Games follow-up register

Updated: 3 November 2026

This register keeps known follow-up work visible and separates confirmed defects from unverified edge cases. “Open verification” means the implementation or relevant unit tests exist, but the listed real-world behavior has not been fully exercised. It does not mean a defect is confirmed. No P1 defect is currently known to block the second game. Keep the remaining production edge walkthrough and P2 device-specific checks visible; pause feature work only if they reproduce a release-blocking defect.

## Current release

- The live game is the free, guest-first Connect Four experience. The owner reports completing multiple live matches with friends.
- The 3 November workspace run passed all 108 checks (15 frontend, 93 contracts/game/Worker), including AI opponent behavior, matchmaking, rematches, reconnects, and two-client runtime synchronization. The production-configured web build passed.
- The production Worker is version `8ab3c878-ec5e-4283-afe3-7cf3f71fefdb`. The latest Games UI deployment is [`7e203a40.portfolio-games-preview.pages.dev`](https://7e203a40.portfolio-games-preview.pages.dev/), served at [`play.ake-em.com`](https://play.ake-em.com/); the custom domain returned HTTP 200 with the final UI bundle. The latest deployment changed only the static UI; no Worker redeploy was needed for the AI-turn presentation countdown.
- The owner reports completing multiple live matches with friends. Specific delayed-delivery/deadline, reconnect-after-backgrounding, production restart, and mobile Safari cases remain open verification rather than confirmed defects. The latest AI-turn countdown change passed build/tests, but its full interaction was not independently clicked through in a live match during that deployment.
- The reviewed source checkpoint for this production release is being recorded and pushed on `origin/feature/multiplayer-games` before the next feature.

## Open verification

| Priority | Area | What still needs verification | Evidence to close it |
| --- | --- | --- | --- |
| P1 | Pending move and turn deadline | **Fixed and deployed:** authoritative unchanged-state sync clears the pending-move lock. Turn receipt accounting deducts only offline time during receipt wait; normal connected delivery latency no longer consumes reconnect allowance. Regression coverage checks unchanged sync, delayed receipt, offline receipt, deadline rejection, and accepted move. | Local regression tests pass. The owner has exercised live matches; deliberately delayed delivery and a move near the production deadline remain unverified. |
| P1 | Active reconnect and socket replacement | **Runtime coverage added and passing; fix deployed:** replacing an active player's socket preserves the seat connection, turn clock, and ability to submit a move. Worker restart recovery is covered by the two-client integration test. | Physical network interruption/backgrounding and deployed Worker restart/hibernation remain unverified. Confirm old socket cannot submit after replacement. |
| P1 | Round transitions and return paths | Existing lifecycle coverage passes for one vote, two votes, no votes, intermission reconnect deadlines, refresh/reconnect deadline behavior, and terminal retention. **Fixed and deployed:** the series-result “Back to games” action remains available if a mutual rematch countdown has begun; Worker route coverage confirms leaving cancels only that rematch. | Owner reports successful live matches. A focused two-browser walkthrough of next-game, rematch countdown, refresh, closed tabs, expired links, and terminal return remains useful; no regression is currently confirmed. |
| P1 | Room/action races | Local Worker runtime coverage passes for competing joins, cancellation versus join, and competing moves. The lifecycle suite covers timeout-versus-move ordering and rejects stale/post-terminal actions. | Production concurrency behavior remains unverified; local emulator tests do not establish Cloudflare capacity or restart behavior. |
| P2 | Mobile layout and board review | The collapsed result controls must remain clear of the board without shifting it, clipping, horizontal overflow, or unwanted page scrolling across phone sizes and orientation changes. | Recheck `play.ake-em.com` on iPhone Safari and a desktop browser, including portrait/landscape and expanded/collapsed result view. Capture screenshots after the 1 November deployment. |
| P2 | Sound and social feedback | The owner has reported sound not always playing on mobile. Verify first-gesture audio activation and consistent sent/received feedback for reactions, preset messages, typed messages, turn changes, wins, ties, and timeouts. Respect mute and browser autoplay restrictions. | Test on iOS Safari with sound initially locked, after user interaction, muted, backgrounded, and resumed. Confirm UI feedback remains understandable if the browser suppresses audio. |
| P2 | Lobby presence and stale state | A dropped lobby or match connection should not leave an indefinitely stale online count or waiting room; reconnect should restore the current lobby/match view without polling. | Disconnect/reconnect clients and compare pushed lobby state with the server's active rooms/presence after the stale window. |

## Operational follow-up

These items inform scaling and a stronger production-readiness claim. They do not need to delay ordinary feature development.

- **Usage and cost baseline:** record Durable Object requests, alarms, storage operations, CPU, active WebSockets, and Worker requests for representative short and long matches. Compare measured usage with the current Cloudflare plan and a stated monthly budget. Do not infer monthly capacity from alarm counts alone.
- **Latency and capacity:** choose a bounded initial concurrent-match target, measure end-to-end move acknowledgment from Nigeria, and run a controlled load/overload exercise. Traffic remains unknown.
- **Recovery and operations:** verify alarm/state recovery after a Worker/DO restart, safe cancellation when state cannot be recovered, health checks, actionable alerts, and rollback. Define an incident owner and user-facing service-outage procedure.
- **Preview access:** Cloudflare Pages preview deployments are public unless Access is configured. Enable Access before sharing previews with non-public data; the live game itself remains public by design.
- **Source traceability:** push the reviewed release checkpoint before beginning another feature, and record which commit was deployed. This keeps rollback and production behavior tied to a reviewable revision.

## Product and architecture decisions for later features

| Status | Item | Notes / dependency |
| --- | --- | --- |
| Not selected | Second game | The game registry, shared match shell, and per-game rules/view boundaries exist. Choose a simple game and verify the extension path with a real second module. No second game is currently implemented. |
| Deferred | Database provider | D1 versus Supabase remains undecided. Revisit with estimated account/history reads and writes, retention, and free-tier capacity before adding persistent user data. |
| Planned, not implemented | Accounts and usernames | Google sign-in, unique username rules, account recovery/session behavior, and username rename/reserved-name policy need a scoped design. Guests remain usable without accounts. |
| Planned, not implemented | Match records and guest-history transfer | Account history, guest data claiming, proof of ownership, cross-device behavior, retention, and deletion rules depend on identity and persistence. Local summaries must not create ranked outcomes. |
| Planned, not implemented | Leaderboards | Daily snapshots, period/timezone boundaries, ties/minimum sample, public-stat privacy effects, eligible match rules, stale output, and failure handling need decisions. This depends on verified identity and persistent results. |
| Open policy | Abuse response | Reporting, blocking, moderation thresholds, review ownership, and enforcement are not implemented. Current in-match text is limited and rate-limited, with a short conduct/privacy warning. |
| Explicitly out of current scope | Coins, deposits, withdrawals, or real-money play | No wallet or money flow exists. Any future monetization requires a separate legal/compliance review, provider decision, and ledger/security design; it is not a small extension of the current game wallet. |

## Recommended order

1. Record and push the reviewed deployed source checkpoint (this pass).
2. Shortlist and choose a second simple game, then implement it to validate the multi-game boundary.
3. Revisit accounts, persistence, guest-history transfer, and leaderboards as one dependency chain; decide the database from measured workload and retention needs before implementation.
4. Recheck mobile audio/layout, production reconnect edges, lobby stale state, usage, latency, capacity, and recovery as traffic and operational needs justify them, and before making a stronger scale or reliability claim.
