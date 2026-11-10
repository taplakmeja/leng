import type { Card, GameState, LengRulesConfig } from '../src/index.js';
import { DEFAULT_RULES, createGame } from '../src/index.js';

/** Build a card from its instance id: "S7a", "H1b" (ace hearts), "Jo2". */
export function card(id: string): Card {
  if (id.startsWith('Jo')) return { id, suit: 'JOKER', rank: 0 };
  const suit = id[0] as 'S' | 'H' | 'D' | 'C';
  const rank = parseInt(id.slice(1, -1), 10);
  return { id, suit, rank: rank as Card['rank'] };
}

export function cards(ids: string[]): Card[] {
  return ids.map(card);
}

/** Test-only: place an exact, controlled hand into a seat. */
export function setHand(state: GameState, seat: number, ids: string[]): void {
  state.players[seat]!.hand = cards(ids);
}

export interface MakeGameOptions {
  players?: number;
  seed?: number;
  config?: Partial<LengRulesConfig>;
}

export function makeGame(opts: MakeGameOptions = {}): GameState {
  const count = opts.players ?? 4;
  const config: LengRulesConfig = {
    ...DEFAULT_RULES,
    minPlayers: 2,
    ...opts.config,
  };
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    isAI: i > 0,
  }));
  return createGame(config, players, opts.seed ?? 42);
}
