import type { Card, GameState, Move, Play, PlayerState, TableGroup } from './types.js';
import { isWild } from './types.js';
import { resolveNewRun, resolveRunExtension, resolveNewSet, validateExtendSet } from './validation.js';

const ALL_ORDINALS = Array.from({ length: 14 }, (_, i) => i + 1);

/**
 * Enumerate candidate plays for a player. Used by the AI and by the server's
 * timeout auto-play; the engine remains the sole validator of every move.
 */
export function generateLayPlays(state: GameState, playerId: string): Play[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.status !== 'active') return [];
  const hand = player.hand;
  const wilds = hand.filter(isWild);
  const plays: Play[] = [];

  // --- New runs -----------------------------------------------------------
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    const byOrdinal = new Map<number, Card[]>();
    for (const card of hand) {
      if (card.suit !== suit || isWild(card)) continue;
      const ord = card.rank === 1 ? [1, 14] : [card.rank as number];
      for (const o of ord) {
        if (!byOrdinal.has(o)) byOrdinal.set(o, []);
        byOrdinal.get(o)!.push(card);
      }
    }
    for (const start of ALL_ORDINALS) {
      for (let len = state.config.minRunLength; start + len - 1 <= 14; len++) {
        if (start === 1 && len === 14) continue;
        const wildQueue = [...wilds];
        let wildsNeeded = 0;
        const orderedIds: string[] = [];
        let feasible = true;
        for (let o = start; o < start + len; o++) {
          const pick = byOrdinal.get(o)?.[0];
          if (pick) orderedIds.push(pick.id);
          else {
            const wild = wildQueue.shift();
            if (!wild) { feasible = false; break; }
            orderedIds.push(wild.id);
            wildsNeeded++;
          }
        }
        if (wildsNeeded > 0) {
          if (!state.config.allowWildsInRuns) feasible = false;
          if (wildsNeeded > state.config.maxWildsPerRun) feasible = false;
        }
        if (feasible) plays.push({ kind: 'newRun', cardIds: orderedIds });
      }
    }
  }

  // --- New sets (POK) -----------------------------------------------------
  for (let rank = 1; rank <= 13; rank++) {
    const naturals = hand.filter((c) => !isWild(c) && c.rank === rank);
    const need = state.config.minSetSize - naturals.length;
    if (naturals.length >= state.config.minSetSize) {
      plays.push({ kind: 'newSet', cardIds: naturals.map((c) => c.id) });
    } else if (need > 0 && state.config.allowWildsInSets && need <= wilds.length) {
      plays.push({
        kind: 'newSet',
        cardIds: [...naturals.map((c) => c.id), ...wilds.slice(0, need).map((c) => c.id)],
      });
    }
  }

  // --- Extensions ---------------------------------------------------------
  for (const group of state.table) {
    if (group.kind === 'run') {
      const suitCards = hand.filter((c) => c.suit === group.suit && !isWild(c));
      const candidates: Card[][] = [];
      for (const card of suitCards) candidates.push([card]);
      for (let i = 0; i < suitCards.length; i++) {
        for (let j = 0; j < suitCards.length; j++) {
          if (i !== j) candidates.push([suitCards[i]!, suitCards[j]!]);
        }
      }
      if (state.config.allowWildsInRuns && wilds.length > 0) {
        for (const card of suitCards) candidates.push([card, wilds[0]!]);
        if (state.config.maxWildsPerRun > group.entries.filter((e) => isWild(e.card)).length) {
          candidates.push([wilds[0]!]);
        }
      }
      for (const cards of candidates) {
        const play: Play = { kind: 'extendRun', groupId: group.id, cardIds: cards.map((c) => c.id) };
        if (validatePlay(state, player, play).ok) plays.push(play);
      }
    } else {
      const rankCards = hand.filter(
        (c) => (state.config.allowWildsInSets ? c.rank === group.rank || isWild(c) : c.rank === group.rank && !isWild(c)),
      );
      if (rankCards.length > 0) {
        plays.push({ kind: 'extendSet', groupId: group.id, cardIds: rankCards.map((c) => c.id) });
      }
    }
  }

  return plays;
}

/** Validate a single play against current state without mutating. */
export function validatePlay(
  state: GameState,
  player: PlayerState,
  play: Play,
): { ok: true } | { ok: false; error: string } {
  const handIds = new Set(player.hand.map((c) => c.id));
  for (const id of play.cardIds) {
    if (!handIds.has(id)) return { ok: false, error: `card ${id} is not in your hand` };
  }
  const group = play.kind === 'extendRun' || play.kind === 'extendSet'
    ? state.table.find((g) => g.id === play.groupId)
    : undefined;
  if (play.kind === 'extendRun' || play.kind === 'extendSet') {
    if (!group) return { ok: false, error: 'table group not found' };
  }
  switch (play.kind) {
    case 'newRun': {
      const cards = play.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
      const res = resolveNewRun(cards, state.config);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
    case 'newSet': {
      const cards = play.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
      const res = resolveNewSet(cards, state.config);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
    case 'extendRun': {
      const runGroup = group as Extract<TableGroup, { kind: 'run' }>;
      const cards = play.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
      const res = resolveRunExtension(runGroup, cards, state.config);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
    case 'extendSet': {
      const setGroup = group as Extract<TableGroup, { kind: 'set' }>;
      const cards = play.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
      const res = validateExtendSet(setGroup, cards, state.config);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
  }
}

/** All legal moves for a player at this moment (engine-validated). */
export function generateMoves(state: GameState, playerId: string): Move[] {
  if (state.phase !== 'round1' && state.phase !== 'round2') return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.status !== 'active' || state.turnSeat !== player.seat) return [];
  const moves: Move[] = [];
  if (state.phase === 'round1') {
    for (const play of generateLayPlays(state, playerId)) {
      if (play.kind === 'newRun') moves.push({ type: 'lay', plays: [play] });
    }
  } else {
    for (const play of generateLayPlays(state, playerId)) {
      moves.push({ type: 'lay', plays: [play] });
    }
  }
  moves.push({ type: 'pass' });
  return moves;
}
