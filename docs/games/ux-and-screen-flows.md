# UX and screen flows

Mode: Experience for the game surface, with Operate-style clarity for account, lobby, and match controls.

## Visual and layout direction

- The games experience is linked from the portfolio and should inherit its restrained visual identity, typography, light/dark behavior, and predictable interaction style. See the root [DESIGN.md](../../DESIGN.md).
- Preserve the portfolio's 688px centered page shell (640px content at 24px side gutters), responsive header, typeface, theme behavior, and vertical reading flow. A game board may use a smaller centered measure within that shell; any later board that needs more width must keep page chrome aligned to the 688px shell and widen only the board area, without adding a permanent desktop side rail.
- Desktop and mobile have equal priority. Adapt to viewport width and orientation; do not lock device orientation. Keep the board centered, legible, and touch-friendly with intentional whitespace on wide screens.
- Reuse the portfolio header/navigation when it helps orientation. The games service must not rely on the portfolio's private implementation details; a later standalone shell may replace the adapter.
- Provide visible keyboard focus, semantic controls, accessible names for board columns and actions, sufficient contrast in both themes, and a non-color-only indication of each player's tokens and turn.
- Respect reduced-motion preferences. Animation must not be required to understand a move, win, timeout, or connection state.

## Primary flows

### Visitor plays as a guest

1. Visitor follows the portfolio's Play link and lands on **Games**.
2. The home view defaults to **Open matches** and provides a separate **Games** tab. Keep labels brief; show the approximate live count without extra instructional copy.
3. Visitor joins an open match directly from its row, or chooses **Create match** on a game row. Creating goes straight to the selected game's setup; there is no intermediate “start a game” page. The setup chooses public listing or private invite and series length.
4. Private invite rooms are never listed. Public rooms appear in discovery while they are waiting for a second player; the match service remains the final authority when two people attempt to join at once.
5. Before creating or joining, a player may enter an optional display name. Prefill the last name they explicitly used on this device; if left blank, assign a generated name. Before a join, show the selected series target, turn limit, timeout result, and tie scoring above the name field. Use the existing lobby entry for public-list joins; direct links load a safe, rate-limited room preview, and private previews require the invite capability. Store only the name convenience value locally. A display name is not an account username or proof of identity.
6. The visitor plays the selected game, sees turn and connection feedback, then can return to Games directly from the result.

### Visitor creates an account

1. Visitor chooses Continue with Google.
2. On first sign-in, visitor chooses an available unique username. Exact format, reserved words, and rename policy are open decisions.
3. Explain that username, wins, and ranking are public by default; email remains private. Provide a simple setting to hide public game stats.
4. Offer an optional transfer of guest history. Locally stored summaries may be imported as private, unverified history, but must never award ranked wins. Verified results may be claimed only when the service can prove guest-session ownership and the result; claim each result once.

Only server-verified results can be claimed. Explain if local records cannot be recovered or verified. Claimed guest records remain unranked; signing up saves history rather than awarding retroactive leaderboard wins.

### Public match

- Games home separates the catalog and paginated public match list into compact centered tabs beneath the simple header, defaulting to Open matches. Match rows show the game, host display name, series format, and a direct Join action. When no public rooms are waiting, show a concise empty state with a **Create a match** action that opens the game catalog.
- Keep the game filter out of the match list header; a single selected-filter button opens a mobile bottom sheet with game choices. Apply a selection immediately, reuse the lobby WebSocket, and close the sheet.
- Create match is attached to a game in the catalog and opens its setup directly. The catalog is data-driven; only games with an implemented client and server module are listed as available.
- Open one lobby WebSocket while the lobby is visible. It supplies the first page and pushes room/presence changes; filtering and pagination reuse the same connection. Reconnect only after a connection failure with capped backoff. Keep loading, empty, connection-error, and retry states concise. Do not run periodic HTTP refreshes.
- The online count is an approximate count of unique browser identifiers with an active lobby or match connection, deduplicated across those connections. Guests count. Separate browsers/devices may count the same person more than once; a short stale window may remain after a network loss. It does not mean signed-in accounts or unique people.
- Quick Match is deferred until the public lobby has enough traffic to make an automatic opponent search useful.
- Guests and account holders may create and join public matches.
- Clearly label guest matches as unranked. Both players must be signed in before a public match starts for it to be eligible for standings; apply any additional approved eligibility rules.
- Open public matches disappear after 5 minutes without a second player.
- Only the two players may join the match; no spectators. During an active game, either player may send a quick reaction or a single-line message up to 100 characters. Show a concise respect/privacy warning in the chat sheet. Attribute transient activity to the sending player and keep it separate from board instructions. Store only the sender's six most recent unique typed messages on the device, with a clear-history action.
- Keep match status, both player names, scores, turn ownership, and the active turn countdown together in a compact sticky bar below the header. Do not show redundant connected labels; show reconnecting/offline state only when relevant.
- After a match, either player may report or block the opponent. Block behavior should affect future matchmaking; exact scope and enforcement are open decisions.

### Private invite

- Host creates an invite and shares the link outside the game.
- Invite is usable until a second player joins or it expires after 24 hours.
- Show clear states for invalid, used, and expired invites; never expose a private match in the public lobby.
- Private matches are unranked. State that before the match begins and on results/history. Joining an invite must not start a turn clock against an absent host; readiness policy remains open.

### Active match and recovery

- Display the board, whose turn it is, 45-second turn countdown, opponent identity, and connection state.
- Keep lobby navigation out of the active match so players are not encouraged to leave mid-game. If a player closes the tab or returns to the lobby, show a **Match in progress** banner with a **Return to match** action. Retain a guest seat credential only in that browser profile; verify it with one authenticated snapshot request before reconnecting, never put it in the URL, and clear it when the player leaves or the server closes or expires the seat. Recovery is same-browser only until account-based recovery exists.
- Allow one active online series per browser profile. Block creating or joining another match from the lobby or a direct invite while the current series is open; direct the player to **Return to match**. Keep the lock after a round win or forfeit if the series continues, and while a completed series still offers a rematch. Clear it automatically when the series becomes terminal, including when either player leaves a completed series. Before blocking a create/join attempt from another tab, reconcile the saved seat with one authorized server snapshot; this is event-driven/on-demand, never polling.
- A legal move produces immediate, server-confirmed feedback. Invalid or stale moves explain the reason and leave the board unchanged.
- A dropped connection shows a reconnect state and an approximate local countdown from the last server snapshot, up to the 60 cumulative seconds per player per series. Make clear that the server decides expiry.
- Show a visible 45-second turn countdown derived locally from the server-provided deadline; no per-second polling. The server alone decides timeout.
- A timeout forfeits the current game to the opponent, not the whole series; it does not skip a turn.
- Show a visible **Forfeit game** action during an active online game. Require confirmation, explain that the opponent wins this game, and clarify that the series continues unless this result completes it. The server records the resignation and awards the game; the client never decides the outcome. On mobile, confirmation and other dialogs use a bottom sheet with a clear title, brief explanation, destructive primary action, and a safe secondary action.
- Explicitly leaving between games concedes the series and remains a separate action from forfeiting the current game.
- If the service cannot recover a match, show that it was cancelled without a win/loss and offer a path back to the lobby.

### Result, history, and leaderboard

- At room creation, select best of 1, 3, or 5 games, default 3. The series score is shown throughout.
- After a non-final game, both players can choose Next game to start sooner; once both confirm, start a short countdown. Otherwise show the shared server deadline and start automatically after 30 seconds if both remain connected. A tied game scores no point and the series continues until a player reaches the target.
- Explicitly leaving between games concedes the series. At series completion, offer mutual Rematch or Leave game.
- Label the completed-series return action **Back to games**. Keep navigation clear after a result without exposing lobby navigation during active play.
- Result view shows game and series outcomes clearly and returns to Games when the player leaves. Public match discovery lists only joinable public waiting rooms; private invites remain link-only.
- Show whether the match counts toward standings. Private and guest matches never count. Both participants must be signed in before a public match starts; public rematch and repeated-opponent policies remain open.
- Account history shows standard summaries: game, date, opponent, and outcome. Keep account history until account deletion; users can clear it separately.
- Guest history is local to the device and should clearly say it may be lost if browser data is cleared or the player switches devices. On account creation, offer to carry it over as private, unverified history; it does not change rankings. A verified server result can be claimed as account history only with proof of guest-session ownership, once.
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

- Lobby: loading, no open matches, stale/claimed match, service unavailable, rate limited, and retry. Quick Match is deferred.
- Authentication: Google cancellation, provider error, username unavailable, account already exists/linking conflict.
- Match: connecting, opponent connecting, opponent disconnected, own connection lost, reconnect window nearly over, invalid move, turn expired, rematch pending/declined, match cancelled.
- Platform: service unavailable, retry in progress, retry exhausted, maintenance notice.
- Account/history: local guest data unavailable, claim conflict, history cleared, deletion pending/completed.
- Leaderboard: first calculation not yet available, stale result after a failed scheduled calculation, user opted out, ties, empty period.
- Reporting/blocking: report submitted, duplicate report, blocked player, and confirmation before an irreversible action.

## Design questions to resolve before visual design

- Whether `/play` uses the same route and origin, or a subdomain. Hosting choice is open.
- Whether guests may create private invites, join private matches, or both.
- Online presence is a helpful aggregate only; it is not an identity, matchmaking, or authorization signal. Do not keep polling to refresh it.
- Exact navigation/brand treatment when the game is later detached.
- Username format, browser support baseline, and accessibility acceptance criteria.
