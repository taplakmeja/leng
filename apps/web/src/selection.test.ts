import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@leng/engine';
import { DEFAULT_RULES, resolveNewRun } from '@leng/engine';
import { interpretSelection, sortHand } from './selection.js';

function fakeView(handIds: string[], table: PlayerView['table'] = []): PlayerView {
  return {
    config: DEFAULT_RULES,
    you: {
      id: 'p0',
      seat: 0,
      hand: handIds.map((id) => ({
        id,
        suit: id.startsWith('Jo') ? ('JOKER' as const) : (id[0] as 'S' | 'H' | 'D' | 'C'),
        rank: id.startsWith('Jo') ? 0 : (parseInt(id.slice(1, -1), 10) as 1),
      })),
      status: 'active',
      isYourTurn: true,
      matchPenalty: 0,
    },
    players: [
      { id: 'p0', name: 'me', seat: 0, status: 'active', handCount: handIds.length, isAI: false, isCurrentTurn: true, matchPenalty: 0 },
    ],
    table,
    phase: 'round1',
    dealNumber: 1,
    firstRoundActive: true,
    results: [],
    history: [],
  };
}

describe('selection interpretation', () => {
  it('finds a run regardless of selection order', () => {
    const view = fakeView(['H9a', 'H7a', 'H8a']);
    const plays = interpretSelection(view, ['H9a', 'H7a', 'H8a']);
    expect(plays.some((p) => p.kind === 'newRun')).toBe(true);
  });

  it('finds a set (POK)', () => {
    const view = fakeView(['S7a', 'H7a', 'D7a']);
    const plays = interpretSelection(view, ['S7a', 'H7a', 'D7a']);
    expect(plays.some((p) => p.kind === 'newSet')).toBe(true);
  });

  it('uses a joker to complete a run', () => {
    const view = fakeView(['H5a', 'Jo0', 'H7a']);
    const plays = interpretSelection(view, ['H5a', 'Jo0', 'H7a']);
    expect(plays.some((p) => p.kind === 'newRun')).toBe(true);
  });

  it('proposes extending an existing table run', () => {
    const base = resolveNewRun(
      [
        { id: 'S6a', suit: 'S', rank: 6 },
        { id: 'S7a', suit: 'S', rank: 7 },
        { id: 'S8a', suit: 'S', rank: 8 },
      ],
      DEFAULT_RULES,
    );
    if (!base.ok) throw new Error(base.error);
    const view = fakeView(['S9a', 'H2a', 'H3a'], [
      { kind: 'run', id: 'g1', suit: 'S', entries: base.value, ownerId: 'p1' },
    ]);
    const plays = interpretSelection(view, ['S9a']);
    expect(plays.some((p) => p.kind === 'extendRun' && p.groupId === 'g1')).toBe(true);
  });

  it('rejects invalid selections', () => {
    const view = fakeView(['H2a', 'H5a', 'S9a']);
    expect(interpretSelection(view, ['H2a', 'H5a', 'S9a'])).toHaveLength(0);
  });
});

describe('hand sorting', () => {
  it('groups by suit then rank', () => {
    const view = fakeView(['H10a', 'S3a', 'H2a', 'S12a']);
    expect(sortHand(view)).toEqual(['S3a', 'S12a', 'H2a', 'H10a']);
  });
});
