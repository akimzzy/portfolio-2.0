# Deployment and operations plan

## Launch profile

- Audience is public, with Nigeria as the primary launch market.
- Concurrent-player demand is unknown. Do not present a traffic target as confirmed.
- The game backend is a separate deployable service in the same repository at first.
- Desktop and mobile web have equal priority.
- The portfolio should remain available if the game service is degraded or offline.

## Selected provider validation

Cloudflare is selected for the separately deployed games service. Verify the chosen configuration against these requirements before public launch:

- WebSocket support with predictable connection duration, idle behavior, reconnect behavior, and concurrency limits.
- A region with good measured round-trip time for the likely Nigerian audience, plus a path to serve visitors elsewhere.
- Scheduled/background work for a once-daily leaderboard calculation, with retries, observability, and safe idempotent execution.
- Persistent storage for accounts, matches, and the latest calculated leaderboard.
- Independent deployment, health checks, environment/secret management, logs, metrics, alerts, backups, and rollback.
- Clear baseline pricing, bandwidth/connection pricing, and practical scaling limits.
- A deployment path that does not require putting the portfolio on the same runtime or outage domain.

Provider direction approved 26 October 2026: keep the portfolio on Vercel and deploy the game service independently on Cloudflare. The UI uses React/Vite at the approved `play.ake-em.com` hostname; the service uses a TypeScript Worker and one SQLite-backed Durable Object per match for WebSockets, serialized match state, and deadlines. Production DNS/origin configuration, account and history storage, monthly budget, and production placement still need verification. Measure latency from Nigeria before setting production placement; do not assume an edge provider makes the authoritative state equally close to both players. See the [multiplayer service design](multiplayer-service-design.md).

## Environment separation

Plan at minimum for local development, preview/staging, and production. Keep separate credentials, OAuth clients/redirect URLs, domains, and data. Production account data must not be copied into development. Document environment variables with examples that contain no secrets.

The Cloudflare preview Worker runs as `portfolio-games-service-preview`. The legacy UI remains on the Pages `preview` branch; the React/Vite UI is on the separate `react-preview` branch. The live health route, lobby API/WebSocket, legacy browser lobby, and one synchronized move between two remote WebSocket clients were verified. The React preview was deployed and its lobby loaded with live presence from the Worker; its full two-player flow has not yet been re-verified after deployment. Cloudflare Access has not been enabled for Pages previews, so both preview URLs are publicly reachable and should not be treated as private. No accounts, payments, or real-money features are present. Full deployed React series, reconnect, timeout, mobile, capacity, and recovery verification remain open.

### Cloudflare resource cleanup (30 October 2026)

Read-only deployment inventory confirmed that `play.ake-em.com` serves the `main` production deployment of the Pages project `portfolio-games-preview`; despite its project name, this is the live game site. Its page metadata points to `portfolio-games-service.a-akeem.workers.dev`. The production Worker needs the `MATCHES` and `LOBBY_HUB` Durable Object bindings, so both and their data were retained. The old `LOBBIES` binding and `LobbyDirectoryDurableObject` class had no runtime references; migration `v4` removed that class from production, preview, and local configurations. Cloudflare's class-deletion migration permanently deletes that legacy directory's stored data. It does not touch match or current lobby-hub storage.

The Pages `preview` and `react-preview` aliases still point to `portfolio-games-service-preview`, so that isolated staging Worker and its match/lobby namespaces were retained for future preview testing. Its allowed origins now contain only those preview Pages hostnames. `portfolio-games-service-development` is a local emulator configuration, not a deployed Worker; its workers.dev health route returned 404. After both migrations, production and preview Worker health routes, the production game URL, and origin-authorized lobby endpoints returned HTTP 200.

The game service should have its own deploy and rollback lifecycle. A failed game deployment must not block or roll back the portfolio unless a shared change explicitly requires it.

### Durable Object row-write incident (30 October 2026)

Cloudflare's LobbyHub invocation logs showed repeated `GET /v1/lobby/socket` failures with `$metadata.message` stating that the Durable Objects free-tier row-write allowance had been exceeded. The 24-hour LobbyHub chart showed 101 errors at the time of review. This is direct evidence of a storage-quota failure on those invocations; it does not by itself establish which writes exhausted the allowance or how much usage came from matches versus lobby presence. The local mitigation removes storage-backed debounce-marker writes and 1-second alarms from lobby WebSocket connect/disconnect events. Match-presence refreshes, room directory mutations, and their cleanup deadlines still write state and must be measured after this change is deployed. Recheck LobbyHub error events and Durable Object row-write metrics after deployment before declaring the quota issue resolved.

## Daily leaderboard job

- Run once daily at a fixed, documented time and timezone (both still open decisions).
- Calculate all-time, weekly, monthly, and yearly per-game standings from completed match outcomes.
- Save the ranked result and its calculation timestamp; serve that saved result to page requests.
- Use a safe retry strategy so rerunning after a failure cannot double-count results.
- If a new calculation fails, retain and serve the last successful output while clearly showing its actual calculation time.
- Define period boundaries, draw/forfeit/cancel treatment, ties, minimum game counts, opt-outs, and history deletions before launch.

Required calculation/publication behavior:

1. Identify one scheduled run by a unique run ID, fixed data cutoff, game, scoring/eligibility-policy version, timezone, and period boundaries. Use authoritative completion time to assign matches to periods; specify start-inclusive/end-exclusive windows.
2. Read eligible completed outcomes. Exclude private matches and any match that started with a guest participant, even if guest history is later claimed. Public rematch, repeated-opponent, and other remaining eligibility rules need approval. Page requests and match completion do not trigger ranking calculations.
3. Use indexed data and bounded, resumable batches. If prior aggregates are reused, persist processed ranges/checkpoints and support safe correction/rebuild. Do not rescan the entire all-time history indefinitely or add an unapproved per-match leaderboard calculation.
4. Build all affected period lists as a new complete generation. Record both the results cutoff and successful calculation time; these are distinct timestamps.
5. Validate and publish that generation atomically, or switch a single current-generation pointer after it is complete. Readers must never see partially built lists. Overlapping retries/runs must not overwrite a newer generation with an older one.
6. Keep the last successful generation on failure, show its actual time, and alert an operator. Define catch-up after missed schedules and what appears when a new period has begun but its first daily list is not yet ready.

Privacy/deletion suppression is applied on reads/cache invalidation without recomputing ranking totals. Specify treatment of hidden rows and displayed rank gaps. Account history clearing and account deletion must follow the separate approved data-lifecycle rules.

## Monitoring and alerts

Track at least:

- Active WebSocket connections, connection failures, reconnect success, disconnect causes, message volume/size, and per-message processing latency.
- Lobby Hub connection count, room/presence event rate, fan-out volume, and overload/error rate. The shared Hub is a capacity boundary; shard it before sustained traffic approaches its measured safe capacity.
- Match creation/join success, time to opponent, active and abandoned rooms, invalid/stale moves, timer expiries, cancellation rate, rematches, and duplicate-event rejections.
- API error and latency rates, persistence errors/latency, job success/failure and age of latest leaderboard, and resource saturation.
- Abuse signals such as room creation spikes, repeated rejected moves, invite guessing, report volume, and account/username abuse.

Set alert thresholds after a baseline is available. Avoid logging secrets, OAuth tokens, invite credentials, or unnecessary personal data. Provide a simple status signal for the game service and a user-facing degraded/unavailable state.

## Backups, recovery, and rollout

- Define backup frequency, retention, and a restore procedure for account and match data.
- Keep enough active-match state to attempt recovery after a short service restart. If safe recovery fails within the reconnect limit, cancel without a loss.
- Deploy behind a reversible release path. Confirm health checks and WebSocket compatibility before switching traffic; keep rollback instructions with the service.
- Establish incident ownership, communication copy, and a manual process for reports and user account deletion requests.
- Before public launch, run a controlled load/capacity exercise sized from the chosen initial target. The target is a launch gate and remains TBD until provider and budget are known.

## Launch gates

### Acceptance evidence to define and collect

| Area | Required acceptance evidence | Status |
| --- | --- | --- |
| Rules and consistency | Legal moves, wins/draws, atomic seat joins, duplicate commands, timeout/move races, and one terminal outcome | Foundation rules checks pass; service concurrency checks await implementation |
| Version compatibility | Active matches survive a compatible client/service deployment or a documented drain; old rules are not replaced mid-match | Required; not run |
| Guest/account identity | Verified single-use guest claims; no client-authored wins; session expiry/logout closes protected socket access | Required; not run |
| Ranked integrity | Private/guest matches excluded; signup cannot retroactively rank guest results; approved rematch/opponent policies and cancelled-match treatment | Policy partly open; not run |
| Accessibility | Keyboard-only play, understandable board/turn announcements, non-color cues, focus continuity, contrast, and timing assessment against WCAG 2.2 AA | Target proposed; review required |
| Mobile/browser support | Agreed browser matrix; narrow portrait, tablet landscape, resizing, background tab, suspended mobile browser, and slow/interrupted network | Matrix open; not run |
| Latency | Defined percentile target separating server processing from end-to-end action confirmation, measured from Nigeria | Target TBD; not measured |
| Capacity/cost | Initial concurrent-connection/match target, bounded queues, overload response, and measured resource/cost envelope | Traffic unknown; engineering target TBD |
| Recovery | Tested restart/failover, spent reconnect time, persistent state consistency, infrastructure cancellation, and backup restoration | Objectives TBD; not run |
| Leaderboards | Daily-only calculations; fixed cutoff, atomic publish, retries, period boundaries, privacy suppression, and stale/empty states | Policy partly open; not run |
| Developer experience | Fresh local setup, independent game build, migrations, and extraction into a fresh repository without portfolio imports | Rules/contracts workspace extracted and verified; portfolio-aligned local browser preview checked at desktop and iPhone 16 viewport; online application, migrations, and full extraction await implementation |

No row is a completed integration test. Choose numeric latency, recovery, capacity, and cost objectives before launch; the owner does not need to predict actual demand to set a bounded engineering target. Run only the relevant checks during authorized implementation/verification work.

### Operational readiness

- Provider, region, monthly budget, custom domain/path, and initial capacity target approved.
- Authentication and privacy settings reviewed; Google OAuth production credentials verified.
- Report/block workflow and response owner in place.
- Daily leaderboard job verified for timezone boundaries, retries, stale output, ties, and deletion/opt-out cases.
- Reconnect, timeout, room expiry, server restart, and graceful-degradation behavior verified on mobile and desktop browsers.
- Backups and rollback rehearsed; dashboards and actionable alerts available.
- No real-money functionality, cash-valued points, Paystack integration, or cash-out path present.
