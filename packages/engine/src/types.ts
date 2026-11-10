/**
 * Leng game engine — core types.
 * Platform-independent, dependency-free, UI-independent.
 * Rules traceability: every rule referenced here is documented in docs/RULES.md.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type SuitOrJoker = Suit | 'JOKER';
/** 1 = Ace, 11 = Jack, 12 = Queen, 13 = King. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  /** Unique instance id across the double deck, e.g. "S7a", "S7b", "Jo0". */
  id: string;
  suit: SuitOrJoker;
  rank: Rank | 0;
}

export function isWild(card: Card): boolean {
  return card.suit === 'JOKER' || (card.suit === 'S' && card.rank === 1);
}

/**
 * Ordinal used inside runs. A-low = 1, 2..13 = face, A-high = 14.
 * K-A-2 (wrap through the middle) is impossible in this space because a run
 * is strictly consecutive ascending and may not contain both 1 and 14
 * (docs/RULES.md, card order).
 */
export function rankToOrdinal(card: Card, asHigh: boolean): number {
  if (card.rank === 1) return asHigh ? 14 : 1;
  return card.rank as number;
}

export const RANK_LABEL: Record<number, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export const SUIT_SYMBOL: Record<string, string> = {
  S: '♠', H: '♥', D: '♦', C: '♣', JOKER: '★',
};

/* ------------------------------------------------------------------ */
/* Rules configuration                                                 */
/* ------------------------------------------------------------------ */

export type FirstTurnPolicy = 'random' | 'host' | 'seat0';
export type ScoringVariant = 'classic';
export type TurnTimeoutAction = 'pass' | 'autoPlay';

export interface LengRulesConfig {
  /** Seats at the table. Classic Leng: 4–6. */
  minPlayers: number;
  maxPlayers: number;
  /** Cards dealt per player count; undealt cards are set aside. */
  dealSizes: Record<number, number>;
  /** Jokers participate as wild cards. */
  useJokers: boolean;
  /** Wild cards may substitute inside runs. */
  allowWildsInRuns: boolean;
  /** Max wild cards inside a single run (pagat ambiguity A1; guess: 1). */
  maxWildsPerRun: number;
  /** Wild cards inside POK sets (pagat ambiguity A2; guess: not allowed). */
  allowWildsInSets: boolean;
  /** Voluntary pass in round 2+ even when a legal move exists (A6). */
  allowVoluntaryPass: boolean;
  firstTurnPolicy: FirstTurnPolicy;
  /** Penalty values for cards left in hand. */
  penalty: {
    aceOfSpades: number;
    joker: number;
    ace: number;
    face: number;
  };
  /** Minimum cards to open a run / set. */
  minRunLength: number;
  minSetSize: number;
  /** Deals per match (classic Leng: 1). */
  dealsPerMatch: number;
  scoringVariant: ScoringVariant;
  /** Networking policy, NOT a game rule (docs/RULES.md). */
  turnTimeoutAction: TurnTimeoutAction;
  turnTimeoutMs: number;
}

export const DEFAULT_RULES: LengRulesConfig = {
  minPlayers: 4,
  maxPlayers: 6,
  dealSizes: { 2: 26, 3: 26, 4: 24, 5: 20, 6: 16 },
  useJokers: true,
  allowWildsInRuns: true,
  maxWildsPerRun: 1,
  allowWildsInSets: false,
  allowVoluntaryPass: true,
  firstTurnPolicy: 'random',
  penalty: { aceOfSpades: 40, joker: 20, ace: 11, face: 10 },
  minRunLength: 3,
  minSetSize: 3,
  dealsPerMatch: 1,
  scoringVariant: 'classic',
  turnTimeoutAction: 'autoPlay',
  turnTimeoutMs: 45_000,
};

/* ------------------------------------------------------------------ */
/* Table state                                                         */
/* ------------------------------------------------------------------ */

/** A card laid on the table inside a run, with its fixed effective rank. */
export interface RunEntry {
  card: Card;
  /** Fixed at lay-down time; wilds can never be moved (ambiguity A3). */
  ordinal: number;
}

export type TableGroup =
  | { kind: 'run'; id: string; suit: Suit; entries: RunEntry[]; ownerId: string }
  | { kind: 'set'; id: string; rank: Rank; cards: Card[]; ownerId: string };

/* ------------------------------------------------------------------ */
/* Moves                                                               */
/* ------------------------------------------------------------------ */

export type Play =
  | { kind: 'newRun'; cardIds: string[] }
  | { kind: 'newSet'; cardIds: string[] }
  | { kind: 'extendRun'; groupId: string; cardIds: string[] }
  | { kind: 'extendSet'; groupId: string; cardIds: string[] };

export type Move =
  | { type: 'pass' }
  | { type: 'lay'; plays: Play[] };

export interface MoveError {
  code: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Players & game state                                                */
/* ------------------------------------------------------------------ */

export type PlayerStatus = 'active' | 'droppedOut' | 'leng';

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  hand: Card[];
  status: PlayerStatus;
  isAI: boolean;
  /** Populated at deal end. */
  penalty?: number;
  /** Cumulative penalty across deals of the match. */
  matchPenalty: number;
}

export type GamePhase = 'dealing' | 'round1' | 'round2' | 'dealOver' | 'matchOver';

export interface HistoryEvent {
  seq: number;
  dealNumber: number;
  playerId: string;
  kind:
    | 'deal'
    | 'lay'
    | 'pass'
    | 'dropOut'
    | 'leng'
    | 'dealOver'
    | 'matchOver'
    | 'timeout';
  detail: string;
  /** Card ids made public by this event (laid cards). */
  cardIds?: string[];
}

export interface DealResult {
  dealNumber: number;
  /** seat-ordered penalties; null when the player had already gone out. */
  penalties: (number | null)[];
  winnerId: string;
  ranking: { playerId: string; penalty: number | null; place: number }[];
}

export interface GameState {
  config: LengRulesConfig;
  players: PlayerState[];
  table: TableGroup[];
  phase: GamePhase;
  dealNumber: number;
  /** Seat index of the player to act. */
  turnSeat: number;
  /** True while no player has laid their first combination yet. */
  firstRoundActive: boolean;
  history: HistoryEvent[];
  results: DealResult[];
  /** Internal RNG state, advanced on every shuffle. Serialization-safe. */
  rng: number;
  nextGroupId: number;
  nextEventSeq: number;
}

export interface PlayerView {
  /** Public rules configuration so clients can preview legality locally. */
  config: LengRulesConfig;
  you: {
    id: string;
    seat: number;
    hand: Card[];
    status: PlayerStatus;
    isYourTurn: boolean;
    penalty?: number;
    matchPenalty: number;
  };
  players: {
    id: string;
    name: string;
    seat: number;
    status: PlayerStatus;
    handCount: number;
    isAI: boolean;
    isCurrentTurn: boolean;
    penalty?: number;
    matchPenalty: number;
  }[];
  table: TableGroup[];
  phase: GamePhase;
  dealNumber: number;
  firstRoundActive: boolean;
  results: DealResult[];
  history: HistoryEvent[];
}
