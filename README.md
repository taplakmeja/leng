# Leng 🐉 — Traditional Indonesian Card Game (Sumatera Utara)

A complete, playable digital version of **Leng** (a.k.a. Joker Karo / Song),
the rummy-style card game of the Batak people of North Sumatra. Fully played
in the browser (desktop + mobile), packaged to Android/iOS with Capacitor,
with an authoritative multiplayer server and AI opponents.

**Rules first:** see [docs/RULES.md](docs/RULES.md) for the researched rules,
their sources, and every assumption isolated behind configuration.
Architecture decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```bash
pnpm install

# Run everything (dev):
pnpm --filter @leng/server dev        # authoritative server on :8080 (/ws)
pnpm --filter @leng/web dev           # web app on :5173 (proxies /ws)

# Tests (engine, AI, server integration):
pnpm test

# Production build:
pnpm build
pnpm --filter @leng/web build         # static bundle in apps/web/dist
```

You can immediately play **Practice** (vs AI) and **Pass-and-Play** with no
server at all — open the web app and pick a mode. Online rooms need the
server running.

## What is implemented

| Area | Status |
|---|---|
| Researched rules + documented assumptions | ✅ docs/RULES.md |
| Pure TS engine (deck, runs, POK sets, wilds, turns, drop-outs, scoring) | ✅ 54 tests |
| AI easy/normal/hard using real rules | ✅ 8 tests incl. full AI matches |
| Authoritative server: rooms, codes, matchmaking, bots, reconnect, timeouts, history | ✅ 7 integration tests |
| Responsive UI: felt table, opponents, hand, selection, play/pass, history, scores, results | ✅ builds clean |
| Modes: Practice, Pass-and-Play, Private (code), Public matchmaking | ✅ |
| Profiles, stats, match history (local + server) | ✅ |
| Capacitor config (Android/iOS) | ✅ config ready; native builds need Android Studio / Xcode |
| Firebase Auth/Firestore production mapping | ✅ documented + firestore.rules |

## Mobile (Android / iOS)

```bash
cd apps/web
pnpm build
npx cap add android && npx cap add ios   # first time only
npx cap sync
npx cap open android                     # build/run from Android Studio
npx cap open ios                         # build/run from Xcode
```

The mobile app shares the exact same engine and UI bundle as the web app.
For online play, point the app at your deployed server (see
docs/ARCHITECTURE.md for the Firebase deployment mapping).

## Project layout

- `packages/engine` — game engine (zero dependencies)
- `packages/ai` — bots
- `apps/server` — authoritative WebSocket server
- `apps/web` — React app (also the Capacitor shell)

## Honest limitations

- The dev server is single-node/in-memory; scale-out (multi-node rooms) is a
  deployment concern for the Firebase/Cloud Functions mapping.
- Google sign-in activates automatically when Firebase env vars
  (`VITE_FIREBASE_*`) are configured; without them the app uses guest
  identities (no fake buttons).
- Tournament scoring variant (Scribd source) is documented but not enabled by
  default; classic rules are.
