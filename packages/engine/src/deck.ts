import type { Card, LengRulesConfig, Rank, Suit } from './types.js';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const COPY = ['a', 'b'];

/** Two 52-card packs (instance-duplicated) + 2 Jokers per pack = 108 cards. */
export function buildDeck(config: LengRulesConfig): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (const copy of COPY) {
        deck.push({ id: `${suit}${rank}${copy}`, suit, rank });
      }
    }
  }
  if (config.useJokers) {
    for (let i = 0; i < 4; i++) deck.push({ id: `Jo${i}`, suit: 'JOKER', rank: 0 });
  }
  return deck;
}

/** Fisher–Yates using the state-embedded RNG; returns new rng state. */
export function shuffleInPlace(cards: Card[], rng: number): number {
  const rand = mulberry32(rng);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = tmp;
  }
  return (rng + 1) >>> 0;
}

export function cardsById(cards: Card[]): Map<string, Card> {
  return new Map(cards.map((c) => [c.id, c]));
}
