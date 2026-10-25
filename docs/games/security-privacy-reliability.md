# Security, privacy, and reliability requirements

This is a requirements document for planning. Exact implementation controls, thresholds, legal review, and provider choices remain open.

## Identity and access

- Guests can create and join public matches using generated names. Guest access to private matches is undecided.
- Guest sessions need unguessable identifiers and short-lived credentials. A display name is not proof of identity.
- Google sign-in establishes an account. The unique username is a public handle, not an authentication secret.
- Map a verified Google issuer/subject (`sub`) to a stable internal account ID; do not use email or a public username as the provider identity key. Validate provider tokens and protect callback state using a maintained authentication implementation. See [Google's identity guidance](https://developers.google.com/identity/openid-connect/openid-connect).
- Keep email private. Do not expose provider tokens, account IDs, or private match details in public lobby/profile responses.
- Authorize each match action against current room membership and player identity. A client-supplied username, player ID, turn, or result is untrusted.
- Private invite credentials must be unpredictable, revocable on use/expiry, and excluded from logs/referrers where feasible.
- Require secure WebSockets in production, an explicit browser-origin allowlist, bounded unauthenticated connections, and authorization per message. Logout, session expiry, account deletion, and suspension must revoke live socket access. Define heartbeat/dead-connection cleanup and outbound backpressure; handshake-only checks are insufficient. See [OWASP's WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

## Game integrity and abuse controls

- Server validates every move, turn, timer, result, room transition, and rematch.
- Enforce message size/type limits, per-session and per-IP rate limits, room creation/join limits, connection caps, and bounded queues. Do not rely on IP limits alone because many mobile users can share an address.
- Make move acceptance, match completion, reports, and leaderboard inputs idempotent.
- Reject stale sequences, duplicate action IDs, invalid columns, full-column moves, wrong-turn moves, and actions against expired/completed rooms.
- Use server time for deadlines. Clients display countdowns but cannot decide expiry or pause time.
- Bound reconnect allowance at 60 seconds per player per match. Repeated disconnects cannot renew it indefinitely.
- Provide a report path after public matches and a block control. Define how blocks affect rematching and future public matchmaking before launch.
- No free-text chat or spectators in the first release. Generated guest names and account usernames still need reserved/prohibited-name handling; policy and enforcement are open.
- Private matches and any match involving a guest are unranked. A public match requires both players signed in before play starts to be eligible; guest-history claims cannot turn unranked outcomes into ranked wins. Public rematch and repeated-opponent controls remain product decisions. Threat-model self-play, collusion, account farms, and automated game solvers; server validation prevents illegal moves but cannot guarantee a player receives no outside help.
- Guest-history claims must reference authoritative outcomes and prove session ownership. Reject edited local results, duplicate claims, and claims already attached to another account. Any retained guest outcome/ownership evidence requires an approved retention period and disclosure.

## Privacy and data lifecycle

- Account profile: username and selected public game stats only. No profile photo or bio in v1. Email remains private.
- Wins and rankings are public by default for accounts. Users can hide them; hidden stats should be removed from public profile/leaderboard views. Whether hidden players still contribute to aggregate rankings is to be decided.
- Detailed match history is private. User-facing records are summaries: game, date, opponent display name, and result.
- Guest history is local to the device and may be lost if browser data is cleared or another device is used. Offer a clear option to claim locally available records after signup.
- Account history remains until account deletion, with a separate clear-history action. Define the effects of clearing/deleting on public aggregates, other players' records, reports, and audit data.
- Keep operational event logs separate from player-facing history. Collect only what is needed for integrity, abuse investigation, and reliability; set retention, access, and redaction rules before launch.
- Provide clear privacy copy for public usernames/stats, guest data, Google authentication, reports, and account deletion.

Separate data responsibilities before selecting a schema:

| Data | Purpose | Required policy |
| --- | --- | --- |
| Canonical match outcome | Integrity, both participants' results, eligible standings | Retention and identity removal on deletion; not editable by a browser |
| Personal history view | The player's browsing experience | Define whether clear-history hides/removes this view and how it affects stats |
| Guest local history | Convenient records on one device | No promise of recovery after local deletion; never trusted to create outcomes |
| Guest verification evidence | Safe claim of existing outcomes | Minimal fields, ownership proof, bounded retention, single claim |
| Daily leaderboard output | Fast public reads | Fixed cutoff/version; immediate visibility/deletion suppression where required |
| Operational logs/reports | Reliability and abuse investigation | Separate retention, privileged access, redaction, and deletion rules |

Recommended clear-history behavior is to clear the player's history view without destroying shared outcomes or resetting competitive totals. This recommendation needs owner approval. Account deletion/anonymization must be specified separately and must not erase an opponent's records accidentally.

Hiding public stats must suppress the player from public output promptly, including cached leaderboard responses, without waiting for a new daily calculation. Filtering a saved list is not recalculating standings; whether ranks retain gaps until the next batch needs a product decision. Making stats public again must not expose records disallowed by the current visibility/deletion policy.

## Reliability and failure behavior

- The server is authoritative; clients can reconnect and receive a full current state.
- Use bounded retries with backoff. Do not create duplicate rooms, moves, results, or leaderboard rows on retry.
- On a brief client disconnect, allow the agreed reconnect window and show remaining time. On expiry, use the documented turn-timeout rule.
- On service restart, restore an active match if state can be safely recovered within the reconnect allowance. Otherwise cancel it with no win/loss and a clear explanation.
- If leaderboard generation fails, continue serving the most recent successful calculation and show its timestamp; alert operators. Never present stale standings as freshly calculated.
- If authentication, lobby, or real-time service is unavailable, show an actionable state and keep the portfolio itself usable.
- Define maintenance behavior, incident owner, escalation path, and manual match/report handling before public launch.

## Turn timing and anti-abuse interaction

- 45-second move timer, server controlled.
- Timeout forfeits to the opponent. No skipped turns.
- Up to 60 seconds reconnect allowance per player per match. It can pause the turn clock only within the remaining cap.
- Each accepted non-terminal move starts the next player's 45-second turn. Resolve warning timing, exact-deadline ordering, simultaneous disconnects, and multi-device behavior in the game spec before coding.

## Pre-launch security review

- Threat model guest and account impersonation, invite leakage, room flooding, forged moves/results, timer manipulation, replayed messages, username abuse, report spam, and account-linking conflicts.
- Review OAuth redirect/origin configuration, cookie/session protections, WebSocket origin checks, secrets, CORS, logs, and data access boundaries.
- Decide whether CAPTCHA or other friction is triggered only after suspicious behavior.
- Set and document rate limits, connection limits, retention periods, report workflow, and account recovery/support process.
