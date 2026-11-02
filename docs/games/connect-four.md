# Connect Four specification

Status: Connect Four and series behavior are approved for the current implementation slice. Account, ranking, and production policies remain subject to the open decisions in [the planning index](README.md).

## Game rules

Implement standard Connect Four without rule variants:

- The board has 7 columns and 6 rows.
- Two players alternate turns, dropping one token into a non-full column.
- A token occupies the lowest available cell in the selected column.
- A player wins by connecting four tokens horizontally, vertically, or diagonally.
- The game is a draw when the board is full and neither player has connected four, or earlier when every possible four-cell line contains tokens from both players.
- A move into a full column is invalid and does not change the turn or board.

New matches use rules version 2 and check for a draw after every accepted move. Matches already in progress under version 1 keep the full-board draw rule until they finish, so a rules update cannot change a live match midway through.

These are the established rules of the selected game, not custom rules. The online timer and disconnect policies below govern the multiplayer session; they do not change how a legal move or win is determined.

## Match lifecycle

1. From Games, a player joins a listed public match or chooses **Create match** on Connect Four. Setup allows a public room or a private invite, subject to the access policy.
2. Public waiting rooms appear in the lobby and remain joinable through their direct link. An unjoined public room expires after 5 minutes.
3. A private match reserves its second seat atomically for the first eligible join. An unused invite expires after 24 hours. Private matches are unranked.
4. Joining is the player's confirmation to play. When both players are connected, show a brief start countdown; if either disconnects during it, cancel the countdown and require both to reconnect before play starts. The server creates the initial board. Public display names, side assignments, and match ID are visible to both participants; private account/provider identifiers are not. The server randomly chooses the first starter; game starters alternate, including the first game of a mutually accepted rematch.
5. The server accepts only the current player's legal move. It assigns a monotonically increasing move sequence and broadcasts the resulting state.
6. A win, draw, or timeout ends the current game. A timeout awards that game to the opponent; a draw awards no point. The server updates the series score once and shows the next action.
7. Before the target score, either player may choose Next game; when both are ready, the next game starts sooner. Otherwise, the server starts it automatically after 30 seconds if both remain connected. At the series target, either may request a rematch; the new series starts only after both accept.

## Series lifecycle

- The room creator chooses best of 1, 3, or 5; best of 3 is the default. This means first to 1, 2, or 3 game wins, respectively.
- The first game's starting seat is chosen randomly by the server. The starting seat alternates on each subsequent game and on a mutually accepted rematch.
- A tied game awards neither player a point. Continue the series until one player reaches the selected target; the number of games can therefore exceed the preset if games tie.
- Both players may choose **Next game** to start sooner. Otherwise, show the shared 30-second server countdown and start automatically when it expires if both remain connected. If a player is disconnected, wait for that player's reconnect window and then begin the short start countdown.
- Play a brief, distinct start cue for both players when the server transitions the room from countdown to active. Play it once per game, respect the sound preference, and keep the game usable when audio is unavailable or blocked.
- Explicitly leaving between games concedes the series. A network disconnect continues to follow the reconnect policy.
- At series completion, offer **Rematch** or **Leave game**. Rematch requires both players. Leaving closes that player's seat and prevents a rematch in the same room.
- The series score, game number, readiness, starter, outcome, and turn deadline are server-owned and restored with the room.

Public lobby listing is implemented through a shared event-driven Lobby Hub; the match Durable Object remains authoritative for joins and lifecycle. Lobby snapshots, room changes, and approximate unique-browser presence use one WebSocket while the lobby is visible; there is no periodic listing poll. Quick Match is deferred until the lobby has enough traffic to make it useful. A room has exactly two players. Spectators are excluded in the first release.

## Turn timing and reconnects

- Each turn has a visible 45-second countdown controlled by the server.
- If the current player does not make a legal move before time expires, that player forfeits the current game and the opponent receives its point. The series continues unless the opponent reaches the target. Do not pass the turn; passing is not part of standard Connect Four.
- If a player's connection drops, allow up to 60 seconds of cumulative reconnect time per player per series. Repeated disconnects must not extend the series beyond the player's remaining reconnect allowance. The server ends the series for the other player if one allowance expires between games; if both allowances expire at the same instant, cancel the series without a winner. The client may show an approximate local grace countdown, but only server deadlines decide outcomes. Race and restart behavior remain technical verification items; see the [Stage 2 service design](multiplayer-service-design.md).
- On reconnect, send the current authoritative match state, move sequence, whose turn it is, and remaining time. Ignore duplicate or stale moves.
- If the service cannot restore the match after a service interruption, cancel it with no win or loss and explain the interruption.
- The 60-second allowance is cumulative per player per series; repeated disconnects cannot restart it. Warning copy and heartbeat thresholds are technical design items.

## Lifecycle transitions and unresolved policies

| Current state | Trigger | Required behavior |
| --- | --- | --- |
| Waiting | Second player joins | Reserve the seat once; validate membership/access and begin the countdown once both seats are connected |
| Waiting | Room/invite expires | Expire once; reject late joins; record no played result |
| Starting countdown | Both players remain connected until countdown ends | Pin rules/order and start the first server deadline |
| Starting countdown | Either player disconnects | Cancel countdown; wait for reconnection without starting a turn clock |
| Active | Valid current-player move | Serialize with deadlines; durably accept once; check outcome; otherwise begin the next player's 45-second turn |
| Active | Move repeats after a lost acknowledgment | Return the previously accepted result without applying the move again |
| Active | Turn deadline expires | Recheck status/version; complete once as a forfeit |
| Active | Connection lost/restored | Apply the remaining cumulative reconnect budget; restore authoritative state, never reset spent time |
| Active | Service interruption | Recover safely or cancel without win/loss; distinguish infrastructure failure from player timeout |
| Completed | Any later move/timeout | Do not change the result; return terminal state |
| Completed | Both request a rematch | Start a new series in the room only after both votes; preserve the approved room access and ranking policy |

The table specifies necessary transitions; it does not settle all product choices. The [Stage 2 service design](multiplayer-service-design.md) records concrete proposals for resignation, disconnect accounting, and starting order. A player may have one active online match series per browser profile. Forfeiting an individual game does not release the slot when the series continues. A completed series keeps the slot while a rematch is still available; if either player leaves or the series is otherwise terminal, release it automatically. Before blocking a create/join attempt from another tab, reconcile the saved seat against one authorized server snapshot; never poll for this. Enforcing the rule across separate browsers/devices remains an account/device-identity decision, as does final public rematch ranking eligibility.

Technical deadline rule to specify before implementation: use a trusted server acceptance point to decide whether a legal move arrived before its deadline. Moves, timeout work, and reconnect work must use the same serialized state. Client timestamps cannot extend a turn. Slow storage or event-loop stalls must not produce contradictory move acceptance and timeout results.

## Match state and result

Minimum match state:

- Match ID and visibility (public/private).
- Game/version identifier.
- Two player identities (account ID or ephemeral guest identity) and assigned colors.
- Board state, move sequence, current turn, turn deadline, and reconnect allowance used.
- Lifecycle status: waiting, starting countdown, active, between games, completed, cancelled, or expired; connection status is tracked alongside lifecycle state.
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
- Guest summaries may be stored locally and can be imported into an account as private, unverified history; this never awards ranked wins. Claiming a verified record requires a server-verifiable match outcome and proof of guest-session ownership; editable browser summaries are never evidence for awarding wins. A record may be claimed only once. Retention and cross-device claim behavior remain open.
- Wins are the primary leaderboard measure. Matches played and win rate are supporting values.
- Views: all-time, weekly, monthly, yearly. Each is per game.
- Generate and save the displayed ranked result once per day on a scheduled job. Do not recalculate on match completion or page view. Show the timestamp of the latest successful calculation.
- The exact period boundaries, timezone, tie-breaks, treatment of draws/forfeits/cancellations, and minimum sample rule remain open.
