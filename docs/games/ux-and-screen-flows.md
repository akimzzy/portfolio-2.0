# UX and screen flows

Mode: Experience for the game surface, with Operate-style clarity for account, lobby, and match controls.

## Visual and layout direction

- The games experience is linked from the portfolio and should inherit its restrained visual identity, typography, light/dark behavior, and predictable interaction style. See the root [DESIGN.md](../../DESIGN.md).
- Preserve the centered, responsive composition of the portfolio for shared navigation and entry points. The game area may use a wider max width than the portfolio's reading column when the board needs it; do not stretch the board to fill a wide screen.
- Desktop and mobile have equal priority. Adapt to viewport width and orientation; do not lock device orientation. Keep the board centered, legible, and touch-friendly with intentional whitespace on wide screens.
- Reuse the portfolio header/navigation when it helps orientation. The games service must not rely on the portfolio's private implementation details; a later standalone shell may replace the adapter.
- Provide visible keyboard focus, semantic controls, accessible names for board columns and actions, sufficient contrast in both themes, and a non-color-only indication of each player's tokens and turn.
- Respect reduced-motion preferences. Animation must not be required to understand a move, win, timeout, or connection state.

## Primary flows

### Visitor plays as a guest

1. Visitor follows the portfolio's Play link and lands on the game lobby.
2. Lobby explains that guest play is available and shows an approximate active-player count plus open public matches.
3. Visitor chooses a listed match, Quick Match, or Create Public Match. Private-match entry points depend on the unresolved guest access policy.
4. A generated guest name is assigned. Do not ask for email or a custom guest name.
5. The visitor plays Connect Four, sees turn and connection feedback, then receives a result summary.
6. The result screen offers Rematch (mutual acceptance required), Return to Lobby, and an unobtrusive option to create an account to keep records.

### Visitor creates an account

1. Visitor chooses Continue with Google.
2. On first sign-in, visitor chooses an available unique username. Exact format, reserved words, and rename policy are open decisions.
3. Explain that username, wins, and ranking are public by default; email remains private. Provide a simple setting to hide public game stats.
4. Offer to claim locally stored guest history. The claim rules and cross-device behavior are open decisions.

Only server-verified results can be claimed. Explain if local records cannot be recovered or verified. Claimed guest records remain unranked; signing up saves history rather than awarding retroactive leaderboard wins.

### Public match

- Lobby provides a list of open public matches and a Quick Match action.
- Guests and account holders may create and join public matches.
- Clearly label guest matches as unranked. Both players must be signed in before a public match starts for it to be eligible for standings; apply any additional approved eligibility rules.
- Open public matches disappear after 5 minutes without a second player.
- Only the two players may join the match; no spectators or free-text chat.
- After a match, either player may report or block the opponent. Block behavior should affect future matchmaking; exact scope and enforcement are open decisions.

### Private invite

- Host creates an invite and shares the link outside the game.
- Invite is usable until a second player joins or it expires after 24 hours.
- Show clear states for invalid, used, and expired invites; never expose a private match in the public lobby.
- Private matches are unranked. State that before the match begins and on results/history. Joining an invite must not start a turn clock against an absent host; readiness policy remains open.

### Active match and recovery

- Display the board, whose turn it is, 45-second turn countdown, opponent identity, and connection state.
- A legal move produces immediate, server-confirmed feedback. Invalid or stale moves explain the reason and leave the board unchanged.
- A dropped connection shows a reconnect state and a remaining reconnect allowance (up to 60 seconds per player per match).
- Timeout ends the match in the opponent's favor; it does not skip a turn.
- If the service cannot recover a match, show that it was cancelled without a win/loss and offer a path back to the lobby.

### Result, history, and leaderboard

- Result view shows win/loss/draw/cancelled status and offers rematch or lobby.
- Show whether the match counts toward standings. Private and guest matches never count. Both participants must be signed in before a public match starts; public rematch and repeated-opponent policies remain open.
- Account history shows standard summaries: game, date, opponent, and outcome. Keep account history until account deletion; users can clear it separately.
- Guest history is local to the device and should clearly say it may be lost if browser data is cleared or the player switches devices.
- Public account stats show username, wins, and ranking by default. A privacy control hides stats from the public leaderboard/profile; email and detailed match history remain private.
- Leaderboards are per game, with All-time, This week, This month, and This year views. Rank by wins in the period; display matches played and win rate as context. Show the last calculation time. Exact update time, timezone, ties, and minimum sample policy remain open.
- Explain that standings update once daily and distinguish the results cutoff from the time calculation finished. Show eligible/unranked match status so players understand why a win may not appear. Privacy suppression should take effect promptly even while standings await their next scheduled calculation.

## Interaction acceptance requirements

- Support selecting and playing a column with keyboard controls and accessible labels; no drag-only or color-only actions. Announce accepted moves, turn changes, connection changes, and outcomes without announcing every countdown second.
- Keep board controls, current turn, remaining time, and reconnect feedback understandable on small screens and in landscape. Do not let shared navigation obscure essential gameplay controls.
- Preserve focus through move updates and orient the player when transitioning to results or reconnect state. Do not force a page reload to recover state.
- Adapt to resize/orientation and suspended/background mobile tabs. On resume, resynchronize with server time/state; do not rely on browser interval accuracy for forfeits.
- Assess the fixed competitive timer against [WCAG timing requirements and exceptions](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html). Do not claim full accessibility compliance solely because this is a multiplayer game. Any alternate timing mode would require a separate product decision and must not silently change ranked rules.
- Choose a browser/support matrix and record real verification evidence before launch. Wireframes and local simulations do not prove live multiplayer reliability.

## States that require designed copy and behavior

- Lobby: loading, no open matches, no available opponent, full/expired room, Quick Match waiting, invite invalid/expired/used.
- Authentication: Google cancellation, provider error, username unavailable, account already exists/linking conflict.
- Match: connecting, opponent connecting, opponent disconnected, own connection lost, reconnect window nearly over, invalid move, turn expired, rematch pending/declined, match cancelled.
- Platform: service unavailable, retry in progress, retry exhausted, maintenance notice.
- Account/history: local guest data unavailable, claim conflict, history cleared, deletion pending/completed.
- Leaderboard: first calculation not yet available, stale result after a failed scheduled calculation, user opted out, ties, empty period.
- Reporting/blocking: report submitted, duplicate report, blocked player, and confirmation before an irreversible action.

## Design questions to resolve before visual design

- Whether `/play` uses the same route and origin, or a subdomain. Hosting choice is open.
- Whether guests may create private invites, join private matches, or both.
- How the lobby presents online count (aggregate only is recommended; individual presence is not required).
- Exact navigation/brand treatment when the game is later detached.
- Username format, browser support baseline, and accessibility acceptance criteria.
