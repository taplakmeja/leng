# Leng — Rules Research, Confirmed Rules & Assumptions

> Phase 1 deliverable. Every rule implemented by the engine traces to a source
> listed below or is explicitly marked **[ASSUMPTION]** and isolated behind
> `LengRulesConfig` so it can be changed without touching engine logic.

## Sources

1. **pagat.com — "Joker Karo" (Leng)** — John McLeod's card game rules site,
   compiled from multiple Indonesian sources (2020/2022).
   https://www.pagat.com/rummy/joker_karo.html
2. **nisura.blogspot.com — "Cara Bermain Kartu Leng"** (2012) — detailed
   Indonesian description with strategy notes and worked examples.
3. **Tournament rulesheet "Peraturan Permainan LENG"** (pdfcoffee/Scribd) — a
   competition variant (5 players, 3 rounds, laid-down-card scoring, LENG
   bonus). Treated as a **regional variant**, not the default.
4. **ITB Stei paper "Penerapan Greedy Algorithm dalam Permainan Kartu Leng"**
   (2023) — confirms 4–6 players, 2 decks, Joker/AS♠ wild behavior.

Leng is also known as **Joker Karo** and **Song**. "Leng" (Hokkien: dragon)
refers to the dragon-like chains of same-suit sequences built on the table.

## Confirmed rules (implemented as defaults)

### Players & equipment
- **Players:** best with 4–6. Engine allows 2–6 by configuration; default
  minimum 4 (matches all sources), configurable down to 2 for practice.
- **Deck:** two standard 52-card packs **plus 2 Jokers per pack = 108 cards**.
- **Wild cards:** the 4 Jokers **and the 2 Aces of Spades** (AS Sekop) are wild
  and may substitute for any card needed to complete a **sequence**.
- **Deal:** 4 players → 24 cards each (12 aside); 5 players → 20 each (8
  aside); 6 players → 16 each (12 aside). Undealt cards are set aside and not
  used during the deal.

### Card order
- Within a suit: **A-K-Q-J-10-…-3-2-A**. An Ace may sit at either end of a
  run (A-2-3 or Q-K-A) but **not in the middle** (K-A-2 is invalid).

### Play
- Direction: **clockwise**.
- **Round 1:** each player in turn must lay down **one run of 3+ cards of the
  same suit** (wilds may substitute). A player who cannot **passes and drops
  out** of the deal; their hand is counted at scoring time.
- **Round 2 onward**, an active player may lay down any combination of:
  - one or more **new runs** (3+ same suit, wilds allowed),
  - one or more **new sets (POK)** of 3+ cards of the same rank, any suits
    (e.g. 7♠7♥7♦) — **no wilds in sets** [pagat's stated guess, adopted],
  - **extensions**: one or more cards onto the end(s) of an existing table run,
  - **extensions**: one or more equal-rank cards onto an existing POK set.
- Table combinations may never be **broken apart or rearranged**; cards may be
  added to any combination regardless of who laid it down.
- A player who cannot (or chooses not to) play on their turn **passes and
  drops out for the rest of the deal**. This is the authentic Leng "pass":
  passing is permanent for the deal.

### Winning & scoring
- The first player to empty their hand **wins the deal — they call "Leng"**.
- Everyone else counts **penalty points** for cards left in hand:
  | Card | Penalty |
  |---|---|
  | Ace of Spades (AS Sekop) | 40 |
  | Joker | 20 |
  | Ace (hearts/diamonds/clubs) | 11 |
  | King, Queen, Jack | 10 |
  | Pip cards 2–10 | face value |
- Placings: Leng winner first, then remaining players ranked by **lowest**
  penalty total.
- Edge case: if every player has dropped out and the last active player cannot
  finish, all players count penalty points and the lowest total wins.

## Identified ambiguities → resolved as configurable assumptions

| # | Ambiguity (pagat lists these as unclear) | Decision | Config key |
|---|---|---|---|
| A1 | Multiple wilds inside one run (5-Joker-7-Joker-9)? | **Not allowed** (pagat's guess) | `maxWildsPerSequence` |
| A2 | Wild used inside a POK set (6-6-Joker)? | **Not allowed** (pagat's guess) | `allowWildsInSets` |
| A3 | Moving a wild from one end of a table run to the other when extending? | **Not allowed** — table runs are immutable | (forced: table is append-only) |
| A4 | Who leads the first turn? | **[ASSUMPTION]** Random seat (seeded). Host/dealer rotation is a UI choice. | `firstTurnPolicy` |
| A5 | Must a round-1 run be laid all at once by the same player? | **[ASSUMPTION]** Yes — the run is laid as one action by the player whose turn it is. | — |
| A6 | Can a player deliberately pass in round 2+ even if they *could* play? | **[ASSUMPTION]** Yes (sources say players pass "if they cannot play"; we allow voluntary pass because pass is self-punishing — it drops you out). Toggle: `allowVoluntaryPass`. | `allowVoluntaryPass` |
| A7 | Payments between players (gambling form). | Out of scope for scoring; we rank by penalty points. | — |
| A8 | AS♠ bonus when winning with it (dewapokertogel hint). | **[ASSUMPTION]** Not implemented in classic scoring; exposed as future config. | — |

## Regional variant (not default, engine-ready via config)

The tournament rulesheet variant: 5 players, exactly 3 rounds per match,
players **gain** points for cards laid down, "LENG" bonus 50, LENG with jokers
gives reduced penalties (−15/−25/−40/−50), match ends when someone passes 250,
lowest total wins. This conflicts with the classic rules above (it is a
competition adaptation). The engine's scoring module is isolated behind
`scoring` config so this variant can be added without touching core logic; it
is **not** silently mixed into the classic rules.

## Non-rules policies (not part of Leng, clearly separated)

- **Turn timeout behavior** (what the server does when an online player runs
  out of time) is a networking policy, not a game rule: configurable as
  `pass` (authentic drop-out) or `autoPlay` (server AI plays a minimal legal
  move for them). Default: `autoPlay` for friendliness, documented as
  non-authentic.
- Reconnection grace, host migration, public matchmaking: platform policies,
  documented in `docs/ARCHITECTURE.md`.
