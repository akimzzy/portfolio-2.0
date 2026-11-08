# Games follow-up register

Updated: 8 November 2026

This register keeps known follow-up work visible and separates confirmed defects from unverified edge cases. “Open verification” means the implementation or relevant unit tests exist, but the listed real-world behavior has not been fully exercised. It does not mean a defect is confirmed. No P1 defect is currently known to block Connect Four or Reversi. Keep the remaining production edge walkthrough and P2 device-specific checks visible; pause feature work only if they reproduce a release-blocking defect.

## Current release

- The live product remains free and guest-first. Connect Four, Reversi, Google sign-in, unique usernames, and authenticated completed-series history are implemented. The owner is doing production end-to-end verification of the history write after the 7 November release.
- The 7 November workspace run passed 137 checks before deployment. The production-configured web build passed. The Worker secret inventory now includes `SUPABASE_SECRET_KEY`; values are never recorded here.
- Production Worker version `d49711d1-3848-49f0-98f6-6a980c023d86` and Pages deployment [`d0259646.portfolio-games-preview.pages.dev`](https://d0259646.portfolio-games-preview.pages.dev/) are live at [`play.ake-em.com`](https://play.ake-em.com/). Both the custom domain and Worker health endpoint returned HTTP 200; the lobby API returned a valid snapshot.
- Production account-history persistence has not yet been independently confirmed by a completed authenticated match. Mobile Safari, deliberately interrupted delivery/deadlines, and production recovery remain open verification rather than confirmed defects.
- The deployed Games source checkpoint is commit [`f53f8a3`](https://github.com/akimzzy/portfolio-2.0/commit/f53f8a3), `Prepare Games production release`, pushed to `origin/feature/multiplayer-games`. The unrelated portfolio image remains outside this checkpoint.
- Guest-history import is implemented locally and its migration `games/supabase/migrations/202611080001_guest_history_import.sql` is applied to the shared Games Supabase project. It is opt-in, imports only as `guest_import`, and is excluded from future leaderboard eligibility. The matching web feature has not been deployed.
- Leaderboards and in-house identities are implemented locally and their additive migration `games/supabase/migrations/20261107204750_leaderboards.sql` is applied to the shared Games project. The account rank-summary RPC (`games/supabase/migrations/202611080002_account_leaderboard_ranks.sql`) and caller-rank extension (`games/supabase/migrations/202611080003_leaderboard_my_entry.sql`) are **not** applied. Review and apply both additive migrations in order before releasing the matching account and leaderboard UI. Production history and profile data must be preserved.
- Leaderboard policy is settled: rank completed series (including private/invite matches), not individual rounds or rematches; exclude guests and imported guest history; limit one ranked series per unordered player pair, game, and Africa/Lagos calendar day; public by default with an opt-out; ties share rank; no minimum-match threshold. Periods are all-time, week, month, and year, published once daily for the prior completed Lagos day at 00:15 WAT.
- The stable in-house roster has ten identities, including Chichi; some fixed display names have numeric prefixes. The ten identities are reserved from public username claims and each can hold one active match lease. No AI label is added to the lobby.

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
| Implemented | Second game | Reversi validates the multi-game rules, registry, and renderer boundaries. A third game has not been selected. |
| Selected and configured | Database provider | Supabase is used for profiles and completed-series history. Capacity/usage should be reviewed against observed reads and writes before adding higher-volume features. |
| Implemented; production check in progress | Accounts and usernames | Google sign-in, unique usernames, guest play, profile, and completed-series history are implemented. The owner is checking a real production history write. Username changes and account recovery remain out of scope. |
| Implemented locally; migration applied | Guest-history transfer | Guest online series are stored locally with a 100-entry cap. Import is explicit, idempotent, and stored as unverified history; it cannot affect future rankings. The database migration is applied; deploy the matching web code before the feature is available to users. |
| Implemented locally; rank RPC migrations pending | Leaderboards and in-house identities | Per-game all-time/weekly/monthly/yearly snapshots, updated once daily for the prior complete Africa/Lagos day. Wins determine rank; ties share rank and display names sort tied rows. Completed series count, including private/invite matches; rematches, guests, guest imports, and repeat same-pair same-game same-day series do not rank. Public by default with an opt-out. Ten stable in-house identities appear as opponents and leaderboard participants; each can hold one active match lease. The leaderboard schema migration is applied; profile rank-summary and caller-rank RPC migrations are not. |
| Planned | Friends | Per-friend match totals and records remain future work and depend on stable account identity and verified history. |
| Open policy | Abuse response | Reporting, blocking, moderation thresholds, review ownership, and enforcement are not implemented. Current in-match text is limited and rate-limited, with a short conduct/privacy warning. |
| Explicitly out of current scope | Coins, deposits, withdrawals, or real-money play | No wallet or money flow exists. Any future monetization requires a separate legal/compliance review, provider decision, and ledger/security design; it is not a small extension of the current game wallet. |

## Recommended order

1. Back up the production Games project, review both additive rank RPC migrations, and apply them once in order. Confirm function ownership, `auth.uid()` behavior, grants, private-profile exclusion, and rank values without modifying existing history.
2. Build and deploy the matching web changes, then verify leaderboard navigation/back behavior, game and period selection, account rank chips, and privacy opt-out in production. Keep rollback steps ready; do not delete or rewrite existing history.
3. Add friends and per-friend records after leaderboard data and account identity behavior are stable.
4. Continue mobile audio/layout, reconnect, lobby stale-state, usage, latency, capacity, and recovery checks as operational needs justify them.
