import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  applyAction,
  createGame,
  generateMoves,
  getView,
  startNextDeal,
} from '@leng/engine';
import type { GameState } from '@leng/engine';
import { chooseMove } from '../src/index.js';
import type { Difficulty } from '../src/index.js';

function aiGame(difficultySeed = 1, players = 4): GameState {
  return createGame(
    DEFAULT_RULES,
    Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isAI: true })),
    difficultySeed,
  );
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

describe('AI legality', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`every ${difficulty} AI move is engine-legal`, () => {
      let state = aiGame();
      let guard = 0;
      while ((state.phase === 'round1' || state.phase === 'round2') && guard++ < 500) {
        const player = state.players[state.turnSeat]!;
        const move = chooseMove(state, player.id, difficulty);
        const legal = generateMoves(state, player.id);
        const isLegal =
          move.type === 'pass'
            ? legal.some((m) => m.type === 'pass')
            : legal.some(
                (m) =>
                  m.type === 'lay' &&
                  JSON.stringify(m.plays) === JSON.stringify((move as { plays: unknown }).plays),
              );
        expect(isLegal).toBe(true);
        const res = applyAction(state, player.id, move);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        state = res.state;
      }
      expect(state.phase === 'dealOver' || state.phase === 'matchOver').toBe(true);
    });
  }
});

describe('complete AI matches', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`a full ${difficulty} match completes with valid results`, () => {
      let state = aiGame(1234);
      let guard = 0;
      while (state.phase !== 'matchOver' && state.phase !== 'dealOver' && guard++ < 2000) {
        const player = state.players[state.turnSeat]!;
        const res = applyAction(state, player.id, chooseMove(state, player.id, difficulty));
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        state = res.state;
      }
      expect(state.results.length).toBeGreaterThan(0);
      const result = state.results[0]!;
      const totalCards = state.players.reduce((s, p) => s + p.hand.length, 0);
      expect(totalCards).toBeLessThan(96);
      expect(result.ranking).toHaveLength(state.players.length);
      const places = result.ranking.map((r) => r.place).sort();
      expect(places).toEqual([1, 2, 3, 4]);
    });
  }

  it('AI-only matches never leak hands through views', () => {
    const state = aiGame(5);
    for (const p of state.players) {
      const view = getView(state, p.id);
      const json = JSON.stringify(view);
      for (const other of state.players) {
        if (other.id === p.id) continue;
        for (const card of other.hand) expect(json).not.toContain(card.id);
      }
    }
  });

  it('multi-deal AI match runs to matchOver', () => {
    const config = { ...DEFAULT_RULES, dealsPerMatch: 3 };
    let state = createGame(
      config,
      Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isAI: true })),
      77,
    );
    let guard = 0;
    while (state.phase !== 'matchOver' && guard++ < 5000) {
      if (state.phase === 'dealOver') {
        const res = startNextDeal(state);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        state = res.state;
        continue;
      }
      const player = state.players[state.turnSeat]!;
      const res = applyAction(state, player.id, chooseMove(state, player.id, 'normal'));
      if (!res.ok) throw new Error(res.error);
      state = res.state;
    }
    expect(state.phase).toBe('matchOver');
    expect(state.results).toHaveLength(3);
  });
});
