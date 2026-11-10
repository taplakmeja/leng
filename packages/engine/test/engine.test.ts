import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getView, startNextDeal, DEFAULT_RULES, generateMoves } from '../src/index.js';
import type { GameState, LengRulesConfig } from '../src/index.js';
import { makeGame, setHand } from './helpers.js';

function config(overrides: Partial<LengRulesConfig> = {}): LengRulesConfig {
  return { ...DEFAULT_RULES, minPlayers: 2, ...overrides };
}

function ids(state: GameState, seat: number): string[] {
  return state.players[seat]!.hand.map((c) => c.id);
}

describe('game setup', () => {
  it('deals 24 cards to each of 4 players', () => {
    const state = createGame(DEFAULT_RULES, Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), 1);
    for (const p of state.players) expect(p.hand).toHaveLength(24);
    expect(state.phase).toBe('round1');
  });

  it('deals 20/16 cards for 5/6 players', () => {
    for (const [n, size] of [[5, 20], [6, 16]] as const) {
      const state = createGame(DEFAULT_RULES, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), 1);
      for (const p of state.players) expect(p.hand).toHaveLength(size);
    }
  });

  it('rejects illegal player counts', () => {
    expect(() => createGame(DEFAULT_RULES, [{ id: 'p0', name: 'A' }], 1)).toThrow();
  });

  it('is deterministic for a given seed', () => {
    const mk = () => createGame(DEFAULT_RULES, Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), 99);
    const a = mk();
    const b = mk();
    expect(a.players.map((p) => p.hand.map((c) => c.id))).toEqual(b.players.map((p) => p.hand.map((c) => c.id)));
    expect(a.turnSeat).toBe(b.turnSeat);
  });
});

describe('turn order and round-1 enforcement', () => {
  it('enforces that only the active seat may act', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a', 'S5a', 'S6a', 'S7a']);
    const res = applyAction(state, 'p1', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['S5a', 'S6a', 'S7a'] }] });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.code).toBe('NOT_YOUR_TURN');
  });

  it('requires exactly one new run on the first turn', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a', 'S5a', 'S5b', 'S7a', 'H9a', 'H9b']);
    const res = applyAction(state, 'p0', {
      type: 'lay',
      plays: [
        { kind: 'newRun', cardIds: ['H2a', 'H3a', 'H4a'] },
        { kind: 'newSet', cardIds: ['S5a', 'S5b', 'H9a'] },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.code).toBe('ROUND1_RUN_ONLY');
  });

  it('advances to the next active seat after a lay', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a', 'S5a']);
    const res = applyAction(state, 'p0', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['H2a', 'H3a', 'H4a'] }] });
    expect(res.ok).toBe(true);
    expect(res.ok && res.state.turnSeat).toBe(1);
    expect(res.ok && res.state.phase).toBe('round1');
    expect(res.ok && res.state.table).toHaveLength(1);
    expect(res.ok && res.state.players[0]!.hand).toHaveLength(1);
  });

  it('rejects invalid combinations with a reason', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H4a', 'H6a']);
    const res = applyAction(state, 'p0', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['H2a', 'H4a', 'H6a'] }] });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.code).toBe('INVALID_PLAY');
  });

  it('rejects playing cards you do not own', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a']);
    const res = applyAction(state, 'p0', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['S5a', 'S6a', 'S7a'] }] });
    expect(res.ok).toBe(false);
  });
});

describe('round 1 to round 2 transition', () => {
  it('switches to round 2 once every player has laid or dropped out', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a', 'S9a', 'S9b', 'S10a']);
    const r0 = applyAction(state, 'p0', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['H2a', 'H3a', 'H4a'] }] });
    expect(r0.ok).toBe(true);
    let cur = r0.ok ? r0.state : state;
    expect(cur.phase).toBe('round1');
    const r1 = applyAction(cur, 'p1', { type: 'pass' });
    cur = r1.ok ? r1.state : cur;
    const r2 = applyAction(cur, 'p2', { type: 'pass' });
    cur = r2.ok ? r2.state : cur;
    expect(cur.phase).toBe('round1');
    setHand(cur, 3, ['D5a', 'D6a', 'D7a', 'C2a', 'C3a']);
    const r3 = applyAction(cur, 'p3', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['D5a', 'D6a', 'D7a'] }] });
    expect(r3.ok).toBe(true);
    if (r3.ok) {
      expect(r3.state.phase).toBe('round2');
      expect(r3.state.firstRoundActive).toBe(false);
    }
  });
});

describe('passing and dropping out', () => {
  it('a pass in round 1 drops the player out for the whole deal', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    const res = applyAction(state, 'p0', { type: 'pass' });
    expect(res.ok).toBe(true);
    const next = res.ok ? res.state : null;
    expect(next && next.players[0]!.status).toBe('droppedOut');
    expect(next && next.turnSeat).toBe(1);
  });

  it('a dropped player cannot act again', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    const res = applyAction(state, 'p0', { type: 'pass' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const again = applyAction(res.state, 'p0', { type: 'pass' });
      expect(again.ok).toBe(false);
      expect(again.ok === false && again.code).toBe('NOT_ACTIVE');
    }
  });

  it('skips dropped players in the rotation', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    const r0 = applyAction(state, 'p0', { type: 'pass' });
    const r1 = applyAction(r0.ok ? r0.state : state, 'p1', { type: 'pass' });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.state.turnSeat).toBe(2);
  });

  it('blocks voluntary pass when configured off and a legal move exists', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0', allowVoluntaryPass: false } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a']);
    const res = applyAction(state, 'p0', { type: 'pass' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.code).toBe('MUST_PLAY');
  });

  it('ends the deal when every player has dropped out', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    let current = state;
    for (let i = 0; i < 4; i++) {
      const res = applyAction(current, `p${i}`, { type: 'pass' });
      expect(res.ok).toBe(true);
      if (res.ok) current = res.state;
    }
    expect(current.phase === 'dealOver' || current.phase === 'matchOver').toBe(true);
    expect(current.results).toHaveLength(1);
  });
});

describe('winning and scoring', () => {
  it('emptying the hand wins the deal as LENG and scores penalties', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a']);
    setHand(state, 1, ['S1a', 'Jo0', 'H13a', 'H7a']);
    setHand(state, 2, ['D3a', 'D3b']);
    setHand(state, 3, ['C11a']);
    const res = applyAction(state, 'p0', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['H2a', 'H3a', 'H4a'] }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = res.state;
    expect(s.phase === 'matchOver' || s.phase === 'dealOver').toBe(true);
    expect(s.players[0]!.status).toBe('leng');
    const result = s.results[0]!;
    expect(result.winnerId).toBe('p0');
    // p1: AS(40) + joker(20) + K(10) + 7 = 77; p2: 3+3=6; p3: J=10
    expect(result.penalties).toEqual([0, 77, 6, 10]);
    expect(result.ranking.map((r) => r.playerId)).toEqual(['p0', 'p2', 'p3', 'p1']);
    expect(s.players[1]!.matchPenalty).toBe(77);
  });

  it('ranks remaining players by lowest penalty when no leng occurs', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H2b']);
    setHand(state, 1, ['H3a']);
    setHand(state, 2, ['H4a', 'H5a']);
    setHand(state, 3, ['Jo0']);
    let cur = state;
    for (let i = 0; i < 4; i++) {
      const res = applyAction(cur, `p${i}`, { type: 'pass' });
      expect(res.ok).toBe(true);
      if (res.ok) cur = res.state;
    }
    const result = cur.results[0]!;
    expect(result.ranking.map((r) => r.playerId)).toEqual(['p1', 'p0', 'p2', 'p3']);
    expect(result.winnerId).toBe('p1');
  });

  it('accumulates match penalties across deals', () => {
    const state = makeGame({
      players: 4,
      config: { firstTurnPolicy: 'seat0', dealsPerMatch: 2 },
    });
    setHand(state, 0, ['H2a', 'H3a', 'H4a']);
    const r1 = applyAction(state, 'p0', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['H2a', 'H3a', 'H4a'] }] });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.phase).toBe('dealOver');
    const r2 = startNextDeal(r1.state);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.dealNumber).toBe(2);
    expect(r2.state.phase).toBe('round1');
    expect(r2.state.players.every((p) => p.hand.length === 24)).toBe(true);
    setHand(r2.state, 0, ['S6a', 'S7a', 'S8a']);
    const r3 = applyAction(r2.state, 'p0', { type: 'lay', plays: [{ kind: 'newRun', cardIds: ['S6a', 'S7a', 'S8a'] }] });
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.state.phase).toBe('matchOver');
    expect(r3.state.players[0]!.matchPenalty).toBe(0);
    expect(r3.state.results).toHaveLength(2);
  });
});

describe('security / information leakage', () => {
  it('never exposes other players hands in a view', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    const view = getView(state, 'p0');
    expect(view.you.hand.length).toBeGreaterThan(0);
    for (const p of view.players) {
      expect(p).not.toHaveProperty('hand');
      expect(p.handCount).toBe(24);
    }
    const serialized = JSON.stringify(view);
    for (const p of state.players) {
      if (p.id === 'p0') continue;
      for (const card of p.hand) expect(serialized).not.toContain(card.id);
    }
  });

  it('rejects actions from players who are not on turn or unknown', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    expect(applyAction(state, 'ghost', { type: 'pass' }).ok).toBe(false);
    expect(applyAction(state, 'p2', { type: 'pass' }).ok).toBe(false);
  });

  it('rejects reusing the same card instance twice in one move', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    setHand(state, 0, ['H2a', 'H3a', 'H4a', 'H5a', 'H6a', 'H7a', 'H8a']);
    const res = applyAction(state, 'p0', {
      type: 'lay',
      plays: [
        { kind: 'newRun', cardIds: ['H2a', 'H3a', 'H4a'] },
        { kind: 'newSet', cardIds: ['H2a', 'H5a', 'H6a'] },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.code).toBe('DUP_CARD');
  });

  it('rejects actions outside of play phases', () => {
    const state = makeGame({ config: { firstTurnPolicy: 'seat0' } });
    state.phase = 'matchOver';
    expect(applyAction(state, 'p0', { type: 'pass' }).ok).toBe(false);
  });
});

describe('move generation consistency', () => {
  it('every generated move is accepted by the engine', () => {
    let state = makeGame({ players: 4, seed: 7, config: { firstTurnPolicy: 'random' } });
    for (let turn = 0; turn < 40; turn++) {
      const seat = state.turnSeat;
      const player = state.players[seat]!;
      const moves = generateMoves(state, player.id);
      const lays = moves.filter((m) => m.type === 'lay');
      for (const m of lays) {
        const res = applyAction(state, player.id, m);
        expect(res.ok).toBe(true);
        break;
      }
      if (state.phase !== 'round1' && state.phase !== 'round2') break;
      if (state.turnSeat === seat) {
        const res = applyAction(state, player.id, { type: 'pass' });
        expect(res.ok).toBe(true);
        if (res.ok) state = res.state;
      } else if (lays.length > 0) {
        const res = applyAction(state, player.id, lays[0]!);
        if (res.ok) state = res.state;
      } else {
        const res = applyAction(state, player.id, { type: 'pass' });
        if (res.ok) state = res.state;
      }
      if (state.phase === 'dealOver' || state.phase === 'matchOver') break;
    }
  });
});
