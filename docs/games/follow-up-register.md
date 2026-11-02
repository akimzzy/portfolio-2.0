# Games follow-up register

Updated: 2 November 2026

This register keeps known follow-up work visible and separates confirmed defects from unverified edge cases. “Open verification” means the implementation or relevant unit tests exist, but the listed real-world behavior has not been fully exercised. It does not mean a defect is confirmed. Recommendation: close any reproducible P1 defect and complete the core two-client lifecycle checks before implementing a second game. P2 device-specific polish and broader capacity work can remain tracked follow-ups unless testing exposes a blocker.

## Current release

- The live game is the free, guest-first Connect Four experience. The owner reports completing multiple live matches with friends.
- The 2 November workspace run passed its build, 78 rules/contracts/Worker tests, and 8 frontend reconciliation/action tests. The two-client Worker runtime integration tests, including socket replacement and persistence recovery, passed with localhost binding enabled. The production web build also passed.
- The result-board spacing update was deployed to the production Pages branch on 1 November 2026. A post-deploy mobile/desktop visual acceptance capture is still useful, but is not a blocker to planning or starting the next feature.

## Open verification

| Priority | Area | What still needs verification | Evidence to close it |
| --- | --- | --- | --- |
| P1 | Pending move and turn deadline | **Fixed locally on 2 November:** authoritative unchanged-state sync clears the pending-move lock. Turn receipt accounting now deducts only offline time during receipt wait; normal connected delivery latency no longer consumes reconnect allowance. Regression coverage checks unchanged sync, delayed receipt, offline receipt, deadline rejection, and accepted move. | Local unit/lifecycle tests pass. A deployed two-client pass with delayed delivery and a move near the server deadline remains useful after release. |
| P1 | Active reconnect and socket replacement | **Local runtime coverage added and passing on 2 November:** replacing an active player's socket preserves the seat connection, turn clock, and ability to submit a move. Worker restart recovery is also covered by the two-client integration test. | Physical network interruption/backgrounding and a deployed Worker restart/hibernation check remain unverified. Confirm old socket cannot submit after replacement. |
| P1 | Round transitions and return paths | Existing lifecycle coverage passes for one vote, two votes, no votes, intermission reconnect deadlines, refresh/reconnect deadline behavior, and terminal retention. **Fixed locally on 2 November:** the series-result “Back to games” action now remains available if a mutual rematch countdown has begun; Worker route coverage confirms leaving cancels only that rematch. | A final two-browser screen walkthrough for next-game, rematch countdown, refresh, closed tabs, expired links, and terminal return remains useful after release. |
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

1. Commit and push the reviewed edge-case hardening checkpoint, then deploy the Worker and Games UI from that revision.
2. Check Worker health and the production Games UI; recheck mobile audio/layout and lobby presence on representative devices. Fix any reproduced issue before moving on.
3. Choose and implement the second game to validate the multi-game boundary.
4. Revisit accounts, persistence, guest-history transfer, and leaderboards as one dependency chain; decide the database from measured workload and retention needs before implementation.
5. Measure usage, latency, capacity, and recovery as traffic and operational needs justify them, and before making a stronger scale or reliability claim.
