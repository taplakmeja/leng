# Leng — Architecture

## Repository layout

```
packages/engine   @leng/engine — pure TypeScript Leng engine (rules, validation,
                  state machine, scoring). Zero dependencies, UI-free, platform-free.
packages/ai       @leng/ai — Easy/Normal/Hard bots built only on engine APIs.
apps/server       @leng/server — authoritative Node WebSocket server: rooms,
                  matchmaking, reconnection, turn timeouts, AI seats, match history.
apps/web          @leng/web — React + Vite responsive app (same engine), packaged
                  to Android/iOS with Capacitor.
firestore.rules   Production Firestore security rules (Firebase deployment).
docs/RULES.md     Phase 1 rules research, confirmed rules, assumptions.
```

## Key decisions

### 1. One engine, every platform
`@leng/engine` is the single source of truth for Leng rules. It is used in
three places: the authoritative server, the browser (practice/pass-and-play),
and the packaged mobile apps (via the same web bundle). There is no second
rules implementation anywhere. Rules ambiguity is isolated in
`LengRulesConfig` (see docs/RULES.md), so a rule change is a config change,
not a rewrite.

### 2. Authoritative server; clients render views
The server owns `GameState`. Clients receive a redacted `PlayerView`
(`getView(state, viewerId)`) that contains:

- your own hand (full),
- everyone else as counts/status only,
- the table, history, results, and the public rules config.

No message, document, or payload ever contains another player's cards. Cards
are instance-addressed (`S7a`, `S7b`, `Jo0`), so even card ids leak nothing
when absent. The engine test suite asserts view redaction; the server
integration tests assert it over the wire.

Every action (`{type:'pass'} | {type:'lay', plays:[…]}`) is validated by the
engine on the server: turn ownership, card ownership, combination legality,
duplicate use, round-1 constraints, and scoring. Illegal or out-of-turn
requests get a typed error and no state change. Concurrent duplicate actions
are naturally rejected because the second request no longer matches the
authoritative turn state.

### 3. Transport: WebSocket now, Firebase-compatible later
`apps/server` implements the full multiplayer protocol over WebSockets
(single-node, in-memory rooms + JSON persistence). This runs identically in
development, behind a reverse proxy, or as a container. For the Firebase
deployment the same engine runs inside Cloud Functions:

| Concern | Dev (this repo) | Firebase production |
|---|---|---|
| Auth | guest identity (server-issued id+token) | Firebase Auth (guest + Google) |
| Lobby/rooms | in-memory + room codes | Firestore `rooms` (metadata only) |
| Game state | server memory (never client-readable) | server-only `gameSecrets` docs via Admin SDK |
| Real-time moves | WebSocket `/ws` | Firestore listeners + callable functions, or RTDB |
| History/stats | `Store` (JSON file) | Firestore `users/{uid}/history` |
| Security | server-side validation | identical engine + `firestore.rules` |

The client is written against the `GamePresenter` interface
(`apps/web/src/controllers/local.ts`), which both `LocalController` (offline)
and `OnlineController` (online) implement — the UI does not know or care where
state comes from. Swapping the transport does not touch the UI or the engine.

### 4. AI runs only in trusted environments
`chooseMove(state, playerId, difficulty)` requires the real `GameState`, so it
runs server-side for online matches and in-browser only for offline practice
(where the player already owns the state). Online clients never receive AI
hands. Difficulty levels:

- **Easy** — plays the first generated legal move.
- **Normal** — sheds high-penalty cards, prefers extending table groups,
  avoids opening sets (easy to follow) and spending wilds.
- **Hard** — Normal plus urgency weighting near the end of a hand and stronger
  protection of Joker/AS Sekop until they are needed.

### 5. Modes
- **Practice** — engine + AI in-browser; no network needed.
- **Pass-and-play** — hot-seat with a hand-off overlay so the next player's
  cards stay hidden; supported because Leng has no hidden information exchange
  during a deal beyond what players can see on the table.
- **Private match** — room code, share with friends, optional AI fill.
- **Public matchmaking** — first-fit join into an open public room, else
  creates one.

### 6. Turn timeouts & disconnects (policies, not rules)
- Disconnects keep the seat alive for a grace period and the client
  auto-reconnects with its identity (playerId+token); on reconnect the server
  re-pushes room + full personal view (state recovery).
- When a human's turn times out, the configured policy applies: `autoPlay`
  (default, friendly: server AI plays a minimal legal move) or `pass`
  (authentic drop-out). Documented in docs/RULES.md as a platform policy,
  deliberately not presented as a Leng rule.
- Host migration: if the host leaves/disconnects from a lobby, host moves to
  the first human seat.

### 7. Mobile packaging
`apps/web/capacitor.config.ts` targets the built web bundle (`dist`). Android
and iOS share 100% of the code with web. Portrait-first CSS, safe-area
handling, 44px+ touch targets, and horizontal hand scrolling are already in
the stylesheet. Build steps are in the README.

### 8. Determinism & testing
The RNG (mulberry32) state lives inside `GameState`, so deals are
reproducible: the same seed yields the same deal and the same match replay.
Tests use controlled hands (`setHand`) for deterministic scenarios, and
full-match simulations (engine-vs-engine, AI at all difficulties, server
timeouts) to satisfy the "test complete matches" requirement.
