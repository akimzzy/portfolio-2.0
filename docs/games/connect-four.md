# Connect Four specification

Status: first-game scope confirmed; exact implementation details remain subject to this spec and the open decisions in [the planning index](README.md).

## Game rules

Implement standard Connect Four without rule variants:

- The board has 7 columns and 6 rows.
- Two players alternate turns, dropping one token into a non-full column.
- A token occupies the lowest available cell in the selected column.
- A player wins by connecting four tokens horizontally, vertically, or diagonally.
- The game is a draw when the board is full and neither player has connected four.
- A move into a full column is invalid and does not change the turn or board.

These are the established rules of the selected game, not custom rules. The online timer and disconnect policies below govern the multiplayer session; they do not change how a legal move or win is determined.

## Match lifecycle

1. A player creates a public match, creates a private invite if eligible under the access policy, or chooses Quick Match.
2. A public match appears in the lobby until another player joins or 5 minutes pass.
3. A private match reserves its second seat atomically for the first eligible join. An unused invite expires after 24 hours. Private matches are unranked.
4. Before starting turn time, establish that both players are present and ready; exact readiness and expiry policies need approval. The server assigns player order and creates the initial board. Public display names, side assignments, and match ID are visible to both participants; private account/provider identifiers are not.
5. The server accepts only the current player's legal move. It assigns a monotonically increasing move sequence and broadcasts the resulting state.
6. On a win, draw, timeout, or cancellation, the server records one terminal result and shows the result screen.
7. Either player may request a rematch. A new match starts only after both accept; otherwise they may return to the lobby.

Public matches are listed and Quick Match is available. A match has exactly two players. Spectators are excluded in the first release. Whether guests may create or join private matches remains open.

## Turn timing and reconnects

- Each turn has a visible 45-second countdown controlled by the server.
- If the current player does not make a legal move before time expires, that player forfeits and the opponent wins. Do not pass the turn; passing is not part of standard Connect Four.
- If a player's connection drops, allow up to 60 seconds of reconnect time per player per match. The clock may pause within this cap. Repeated disconnects must not extend the match beyond the player's remaining reconnect allowance.
- On reconnect, send the current authoritative match state, move sequence, whose turn it is, and remaining time. Ignore duplicate or stale moves.
- If the service cannot restore the match after a service interruption, cancel it with no win or loss and explain the interruption.
- The 60-second allowance is cumulative per player per match; repeated disconnects cannot restart it. Define pause accounting for off-turn disconnects and simultaneous disconnects before implementation. The exact warning behavior and heartbeat thresholds are technical design items.

## Lifecycle transitions and unresolved policies

| Current state | Trigger | Required behavior |
| --- | --- | --- |
| Waiting | Second player joins | Reserve the seat once; validate membership/access and move into readiness handling |
| Waiting | Room/invite expires | Expire once; reject late joins; record no played result |
| Readiness pending | Both ready | Pin rules/order and start the first server deadline |
| Readiness pending | Player absent or readiness expires | Do not start a clock against an absent host; cancellation/reopening and invite reuse need a policy |
| Active | Valid current-player move | Serialize with deadlines; durably accept once; check outcome; otherwise begin the next player's 45-second turn |
| Active | Move repeats after a lost acknowledgment | Return the previously accepted result without applying the move again |
| Active | Turn deadline expires | Recheck status/version; complete once as a forfeit |
| Active | Connection lost/restored | Apply the remaining cumulative reconnect budget; restore authoritative state, never reset spent time |
| Active | Service interruption | Recover safely or cancel without win/loss; distinguish infrastructure failure from player timeout |
| Terminal | Any later move/timeout | Do not change the result; return terminal state |
| Terminal | Both request a rematch | Create a new match with its own ID; apply private/unranked status and the approved public-rematch eligibility policy |

The table specifies necessary transitions; it does not settle these remaining product choices: readiness timeout, explicit resignation/leave behavior, both players absent, which disconnect pauses whose clock, one versus multiple active matches, multiple-device control, first-player selection, and whether starting order alternates on rematch. The proposed starting-order policy is a server-selected first player for the first match and alternation for mutual rematches; owner approval is still needed.

Technical deadline rule to specify before implementation: use a trusted server acceptance point to decide whether a legal move arrived before its deadline. Moves, timeout work, and reconnect work must use the same serialized state. Client timestamps cannot extend a turn. Slow storage or event-loop stalls must not produce contradictory move acceptance and timeout results.

## Match state and result

Minimum match state:

- Match ID and visibility (public/private).
- Game/version identifier.
- Two player identities (account ID or ephemeral guest identity) and assigned colors.
- Board state, move sequence, current turn, turn deadline, and reconnect allowance used.
- Lifecycle status: waiting, readiness pending, active, completed, cancelled, or expired; connection status is tracked alongside lifecycle state.
- Start/end timestamps and terminal reason.
- A match summary: game, date, opponent's public username or generated guest name, and outcome.

The server is the only authority for board transitions, turn order, timer expiry, winners, draws, cancellations, and results. The browser submits an intended column; it never submits a trusted board or winner.

## Lobby and match cleanup

- Public unjoined matches expire after 5 minutes.
- Unused private invites expire after 24 hours.
- Expiration removes the match from the lobby and rejects later joins with a clear explanation.
- The system must distinguish a waiting-room expiry from a played match; it is not a loss and does not affect stats.
- Room-creation and join rates are limited to reduce spam. Exact thresholds are a capacity/security decision.

## Record and leaderboard behavior

- Match summaries are the default user-facing history; raw server events are not shown as a substitute for a useful summary.
- Private match outcomes never feed public standings. They may appear in private personal history, labelled unranked.
- Public matches require both players to be signed in before play starts to be eligible for standings. Any guest participant makes the match unranked. Signing in or claiming history afterward cannot retroactively make it ranked. Public rematches, repeated opponents, and timeout/forfeit treatment still need an explicit policy; two signed-in players alone do not guarantee every public win is ranked.
- Guest history may be displayed locally. Claiming a record requires a server-verifiable match outcome and proof of guest-session ownership; editable browser summaries are never evidence for awarding wins. A record may be claimed only once. Retention and cross-device claim behavior remain open.
- Wins are the primary leaderboard measure. Matches played and win rate are supporting values.
- Views: all-time, weekly, monthly, yearly. Each is per game.
- Generate and save the displayed ranked result once per day on a scheduled job. Do not recalculate on match completion or page view. Show the timestamp of the latest successful calculation.
- The exact period boundaries, timezone, tie-breaks, treatment of draws/forfeits/cancellations, and minimum sample rule remain open.
