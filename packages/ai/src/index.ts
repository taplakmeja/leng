import type { Card, GameState, Move, Play } from '@leng/engine';
import { cardPenalty, generateMoves, isWild } from '@leng/engine';

export type Difficulty = 'easy' | 'normal' | 'hard';

/**
 * Pick a move for the given player using the real configured Leng rules.
 * The engine remains the sole validator: the AI only chooses among moves the
 * engine generated, and falls back to pass.
 */
export function chooseMove(state: GameState, playerId: string, difficulty: Difficulty): Move {
  const moves = generateMoves(state, playerId);
  const lays = moves.filter((m): m is Extract<Move, { type: 'lay' }> => m.type === 'lay');
  if (lays.length === 0) return { type: 'pass' };

  const player = state.players.find((p) => p.id === playerId)!;
  switch (difficulty) {
    case 'easy':
      return lays[0]!;
    case 'normal':
      return bestMove(lays, player.hand, state.config, normalScore);
    case 'hard':
    default:
      return bestMove(lays, player.hand, state.config, (play, hand, config) =>
        hardScore(play, hand, config, state),
      );
  }
}

type Scorer = (play: Play, hand: Card[], config: GameState['config']) => number;

function bestMove(
  lays: Extract<Move, { type: 'lay' }>[],
  hand: Card[],
  config: GameState['config'],
  score: Scorer,
): Move {
  let best = lays[0]!;
  let bestScore = -Infinity;
  for (const move of lays) {
    for (const play of move.plays) {
      const s = score(play, hand, config);
      if (s > bestScore) {
        bestScore = s;
        best = move;
      }
    }
  }
  return best;
}

function playedPenalty(play: Play, hand: Card[], config: GameState['config']): number {
  return play.cardIds.reduce((sum, id) => {
    const card = hand.find((c) => c.id === id);
    return sum + (card ? cardPenalty(card, config) : 0);
  }, 0);
}

function usesWild(play: Play, hand: Card[]): boolean {
  return play.cardIds.some((id) => {
    const card = hand.find((c) => c.id === id);
    return card ? isWild(card) : false;
  });
}

/** Shed high-penalty cards, prefer extending, avoid sets and wilds. */
function normalScore(play: Play, hand: Card[], config: GameState['config']): number {
  let score = 2 * playedPenalty(play, hand, config);
  if (play.kind === 'extendRun' || play.kind === 'extendSet') score += 3;
  if (play.kind === 'newSet') score -= 2;
  if (usesWild(play, hand)) score -= 8;
  return score;
}

/**
 * Normal heuristics plus: protect Joker/AS Sekop until urgency, and when close
 * to going out weight penalty shedding much higher.
 */
function hardScore(
  play: Play,
  hand: Card[],
  config: GameState['config'],
  state: GameState,
): number {
  const handPenalty = hand.reduce((s, c) => s + cardPenalty(c, config), 0);
  const urgency = hand.length <= 5 ? 3 : 1;
  let score = 3 * playedPenalty(play, hand, config);
  if (play.kind === 'extendRun' || play.kind === 'extendSet') score += 5;
  if (play.kind === 'newSet') score -= 3;
  if (usesWild(play, hand)) {
    score -= 15 - (hand.length <= 6 ? 10 : 0);
  }
  score += (urgency * playedPenalty(play, hand, config) * 10) / Math.max(1, handPenalty);
  void state;
  return score;
}
