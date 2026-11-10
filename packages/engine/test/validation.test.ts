import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  cardPenalty,
  resolveNewRun,
  resolveNewSet,
  resolveRunExtension,
  validateExtendSet,
} from '../src/index.js';
import type { Card, Rank, Suit } from '../src/index.js';
import { cards } from './helpers.js';

const cfg = DEFAULT_RULES;

function runGroup(ids: string[], id = 'g1') {
  const res = resolveNewRun(cards(ids), cfg);
  if (!res.ok) throw new Error(res.error);
  return {
    kind: 'run' as const,
    id,
    suit: ids[0]![0] as Suit,
    entries: res.value,
    ownerId: 'p0',
  };
}

function setGroup(ids: string[], id = 'g3') {
  const res = resolveNewSet(cards(ids), cfg);
  if (!res.ok) throw new Error(res.error);
  return { kind: 'set' as const, id, rank: res.value.rank, cards: res.value.cards, ownerId: 'p0' };
}

describe('run validation', () => {
  it('accepts a plain same-suit run', () => {
    expect(resolveNewRun(cards(['H4a', 'H5a', 'H6a']), cfg).ok).toBe(true);
  });

  it('accepts ace-low (A-2-3) and ace-high (Q-K-A)', () => {
    expect(resolveNewRun(cards(['H1a', 'H2a', 'H3a']), cfg).ok).toBe(true);
    expect(resolveNewRun(cards(['H12a', 'H13a', 'H1a']), cfg).ok).toBe(true);
  });

  it('rejects ace in the middle (K-A-2)', () => {
    expect(resolveNewRun(cards(['H13a', 'H1a', 'H2a']), cfg).ok).toBe(false);
  });

  it('rejects mixed suits and non-consecutive ranks', () => {
    expect(resolveNewRun(cards(['H4a', 'S5a', 'H6a']), cfg).ok).toBe(false);
    expect(resolveNewRun(cards(['H4a', 'H5a', 'H7a']), cfg).ok).toBe(false);
    expect(resolveNewRun(cards(['H4a', 'H4b', 'H5a']), cfg).ok).toBe(false);
  });

  it('rejects runs shorter than 3', () => {
    expect(resolveNewRun(cards(['H4a', 'H5a']), cfg).ok).toBe(false);
  });

  it('lets a joker substitute inside a run', () => {
    const res = resolveNewRun(cards(['H4a', 'Jo0', 'H6a']), cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.map((e) => e.ordinal)).toEqual([4, 5, 6]);
  });

  it('lets the ace of spades substitute inside a run', () => {
    const res = resolveNewRun(cards(['H4a', 'S1a', 'H6a']), cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.map((e) => e.ordinal)).toEqual([4, 5, 6]);
  });

  it('resolves a leading wild as ace-low in A-2-3', () => {
    const res = resolveNewRun(cards(['Jo0', 'H2a', 'H3a']), cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.map((e) => e.ordinal)).toEqual([1, 2, 3]);
  });

  it('resolves a trailing wild after Q-K as ace-high', () => {
    const res = resolveNewRun(cards(['H12a', 'H13a', 'Jo0']), cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.map((e) => e.ordinal)).toEqual([12, 13, 14]);
  });

  it('rejects two wilds in one run by default (ambiguity A1)', () => {
    expect(resolveNewRun(cards(['H4a', 'Jo0', 'H6a', 'Jo1', 'H8a']), cfg).ok).toBe(false);
  });

  it('allows two wilds when configured', () => {
    const loose = { ...cfg, maxWildsPerRun: 2 };
    expect(resolveNewRun(cards(['H4a', 'Jo0', 'H6a', 'Jo1', 'H8a']), loose).ok).toBe(true);
  });

  it('rejects an all-wild run', () => {
    expect(
      resolveNewRun(cards(['Jo0', 'Jo1', 'Jo2']), { ...cfg, maxWildsPerRun: 3 }).ok,
    ).toBe(false);
  });
});

describe('run extension validation', () => {
  const group = runGroup(['S6a', 'S7a', 'S8a']);

  it('extends upward with one or more cards', () => {
    expect(resolveRunExtension(group, cards(['S9a']), cfg).ok).toBe(true);
    expect(resolveRunExtension(group, cards(['S10a', 'S9b']), cfg).ok).toBe(true);
  });

  it('extends downward', () => {
    expect(resolveRunExtension(group, cards(['S5a']), cfg).ok).toBe(true);
  });

  it('extends both ends at once', () => {
    expect(resolveRunExtension(group, cards(['S5a', 'S9a']), cfg).ok).toBe(true);
  });

  it('rejects cards that leave a gap or duplicate the run', () => {
    expect(resolveRunExtension(group, cards(['S10a']), cfg).ok).toBe(false);
    expect(resolveRunExtension(group, cards(['S7b']), cfg).ok).toBe(false);
  });

  it('rejects wrong suit', () => {
    expect(resolveRunExtension(group, cards(['H9a']), cfg).ok).toBe(false);
  });

  it('fills a wild extension on the anchored side', () => {
    const res = resolveRunExtension(group, cards(['S9a', 'Jo0']), cfg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.map((e) => e.ordinal)).toEqual([6, 7, 8, 9, 10]);
  });

  it('cannot extend past ace boundaries', () => {
    const low = runGroup(['H1a', 'H2a', 'H3a'], 'g2');
    expect(resolveRunExtension(low, cards(['H13a']), cfg).ok).toBe(false);
    const high = runGroup(['H12a', 'H13a', 'H1a'], 'g3');
    expect(resolveRunExtension(high, cards(['H2a']), cfg).ok).toBe(false);
  });
});

describe('set (POK) validation', () => {
  it('accepts 3+ same rank any suits', () => {
    expect(resolveNewSet(cards(['S5a', 'H5a', 'D5a']), cfg).ok).toBe(true);
    expect(resolveNewSet(cards(['S12a', 'H12a', 'D12a', 'C12a']), cfg).ok).toBe(true);
  });

  it('rejects mixed ranks, pairs, and wilds in sets (A2)', () => {
    expect(resolveNewSet(cards(['S5a', 'H6a', 'D5a']), cfg).ok).toBe(false);
    expect(resolveNewSet(cards(['S5a', 'H5a']), cfg).ok).toBe(false);
    expect(resolveNewSet(cards(['S5a', 'H5a', 'Jo0']), cfg).ok).toBe(false);
  });

  it('allows duplicate suits across the double deck', () => {
    expect(resolveNewSet(cards(['S5a', 'S5b', 'H5a']), cfg).ok).toBe(true);
  });
});

describe('set extension', () => {
  const group = setGroup(['S7a', 'H7a', 'D7a']);
  it('accepts same-rank cards', () => {
    expect(validateExtendSet(group, cards(['C7a']), cfg).ok).toBe(true);
    expect(validateExtendSet(group, cards(['S7b', 'H7b']), cfg).ok).toBe(true);
  });
  it('rejects other ranks', () => {
    expect(validateExtendSet(group, cards(['S8a']), cfg).ok).toBe(false);
  });
});

describe('penalty values', () => {
  it('matches the documented table', () => {
    expect(cardPenalty(cardOf('S1a'), cfg)).toBe(40);
    expect(cardPenalty(cardOf('Jo0'), cfg)).toBe(20);
    expect(cardPenalty(cardOf('H1a'), cfg)).toBe(11);
    expect(cardPenalty(cardOf('D13a'), cfg)).toBe(10);
    expect(cardPenalty(cardOf('C10a'), cfg)).toBe(10);
    expect(cardPenalty(cardOf('H2a'), cfg)).toBe(2);
    expect(cardPenalty(cardOf('S7a'), cfg)).toBe(7);
  });
});

function cardOf(id: string): Card {
  if (id.startsWith('Jo')) return { id, suit: 'JOKER', rank: 0 };
  const suit = id[0] as Suit;
  const rank = parseInt(id.slice(1, -1), 10) as Rank;
  return { id, suit, rank };
}
