import { describe, expect, it } from 'vitest';
import { buildDeck, mulberry32, shuffleInPlace } from '../src/index.js';
import { DEFAULT_RULES, isWild } from '../src/index.js';

describe('deck creation', () => {
  it('builds 108 cards: two 52-card packs plus 4 jokers', () => {
    const deck = buildDeck(DEFAULT_RULES);
    expect(deck).toHaveLength(108);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(108);
    expect(deck.filter((c) => c.suit === 'JOKER')).toHaveLength(4);
    for (const suit of ['S', 'H', 'D', 'C']) {
      for (let rank = 1; rank <= 13; rank++) {
        const copies = deck.filter((c) => c.suit === suit && c.rank === rank);
        expect(copies).toHaveLength(2);
      }
    }
  });

  it('marks 4 jokers and 2 aces of spades as wild', () => {
    const deck = buildDeck(DEFAULT_RULES);
    const wilds = deck.filter(isWild);
    expect(wilds).toHaveLength(6);
    expect(wilds.filter((c) => c.suit === 'JOKER')).toHaveLength(4);
    expect(wilds.filter((c) => c.suit === 'S' && c.rank === 1)).toHaveLength(2);
  });

  it('omits jokers when configured off', () => {
    const deck = buildDeck({ ...DEFAULT_RULES, useJokers: false });
    expect(deck).toHaveLength(104);
  });
});

describe('shuffling', () => {
  it('is deterministic for a given seed', () => {
    const a = buildDeck(DEFAULT_RULES);
    const b = buildDeck(DEFAULT_RULES);
    shuffleInPlace(a, 1234);
    shuffleInPlace(b, 1234);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('differs across seeds and preserves the multiset', () => {
    const a = buildDeck(DEFAULT_RULES);
    const b = buildDeck(DEFAULT_RULES);
    shuffleInPlace(a, 1);
    shuffleInPlace(b, 2);
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
    expect([...a].sort((x, y) => x.id.localeCompare(y.id)).map((c) => c.id)).toEqual(
      [...b].sort((x, y) => x.id.localeCompare(y.id)).map((c) => c.id),
    );
  });

  it('advances rng state monotonically', () => {
    const rng = mulberry32(7);
    const first = rng();
    expect(rng()).not.toBe(first);
  });
});
