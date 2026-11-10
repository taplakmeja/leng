import type {
  Card,
  DealResult,
  GameState,
  HistoryEvent,
  LengRulesConfig,
  Move,
  Play,
  PlayerState,
  PlayerView,
  RunEntry,
  TableGroup,
} from './types.js';
import { isWild } from './types.js';
import { buildDeck, shuffleInPlace } from './deck.js';
import {
  cardPenalty,
  resolveNewRun,
  resolveNewSet,
  resolveRunExtension,
  validateExtendSet,
} from './validation.js';
import { generateLayPlays } from './moves.js';

export interface PlayerSpec {
  id: string;
  name: string;
  isAI?: boolean;
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; code: string };

function pushEvent(state: GameState, ev: Omit<HistoryEvent, 'seq' | 'dealNumber'>): void {
  state.history.push({ ...ev, seq: state.nextEventSeq++, dealNumber: state.dealNumber });
}

function dealSize(config: LengRulesConfig, playerCount: number): number {
  const size = config.dealSizes[playerCount];
  if (!size) {
    throw new Error(`no deal size configured for ${playerCount} players`);
  }
  return size;
}

/** Create a new match (deal 1) and deal the first hands. */
export function createGame(
  config: LengRulesConfig,
  players: PlayerSpec[],
  seed: number,
): GameState {
  if (players.length < config.minPlayers || players.length > config.maxPlayers) {
    throw new Error(
      `Leng requires ${config.minPlayers}-${config.maxPlayers} players, got ${players.length}`,
    );
  }
  const state: GameState = {
    config,
    players: players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      seat,
      hand: [],
      status: 'active',
      isAI: p.isAI ?? false,
      matchPenalty: 0,
    })),
    table: [],
    phase: 'dealing',
    dealNumber: 0,
    turnSeat: 0,
    firstRoundActive: true,
    history: [],
    results: [],
    rng: seed >>> 0,
    nextGroupId: 1,
    nextEventSeq: 1,
  };
  startDeal(state);
  return state;
}

/** Deal cards for a deal and set the opening turn. Mutates `state`. */
export function startDeal(state: GameState): void {
  const config = state.config;
  state.dealNumber += 1;
  state.phase = 'round1';
  state.firstRoundActive = true;
  state.table = [];
  for (const player of state.players) {
    player.hand = [];
    player.status = 'active';
    player.penalty = undefined;
  }
  const deck = buildDeck(config);
  state.rng = shuffleInPlace(deck, state.rng);
  const perPlayer = dealSize(config, state.players.length);
  let cursor = 0;
  for (const player of state.players) {
    player.hand = deck.slice(cursor, cursor + perPlayer);
    cursor += perPlayer;
  }
  const rand = (state.rng * 2654435761) >>> 0;
  switch (config.firstTurnPolicy) {
    case 'seat0':
      state.turnSeat = 0;
      break;
    case 'host':
      state.turnSeat = 0;
      break;
    case 'random':
    default:
      state.turnSeat = rand % state.players.length;
  }
  pushEvent(state, {
    playerId: '*',
    kind: 'deal',
    detail: `Deal ${state.dealNumber}: ${perPlayer} cards per player; ${state.players[state.turnSeat]!.name} leads`,
  });
  state.rng = (state.rng + 1) >>> 0;
}

/** Apply a player action. Pure: returns a new state or a typed error. */
export function applyAction(state: GameState, playerId: string, move: Move): ActionResult {
  if (state.phase !== 'round1' && state.phase !== 'round2') {
    return { ok: false, code: 'PHASE', error: 'no action possible outside of play' };
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, code: 'UNKNOWN_PLAYER', error: 'unknown player' };
  if (player.status !== 'active') {
    return { ok: false, code: 'NOT_ACTIVE', error: 'you have dropped out of this deal' };
  }
  if (state.turnSeat !== player.seat) {
    return { ok: false, code: 'NOT_YOUR_TURN', error: 'it is not your turn' };
  }

  const next = structuredClone(state);
  const nextPlayer = next.players.find((p) => p.id === playerId)!;

  if (move.type === 'pass') {
    if (!next.config.allowVoluntaryPass) {
      const candidates = generateLayPlays(next, playerId).filter((play) =>
        next.phase === 'round1' ? play.kind === 'newRun' : true,
      );
      if (candidates.length > 0) {
        return { ok: false, code: 'MUST_PLAY', error: 'you have a legal move; passing is not allowed' };
      }
    }
    playerDropOut(next, nextPlayer);
    return { ok: true, state: next };
  }

  // Lay move.
  const plays = move.plays;
  if (plays.length === 0) {
    return { ok: false, code: 'EMPTY', error: 'no cards selected' };
  }
  const seen = new Set<string>();
  for (const play of plays) {
    for (const id of play.cardIds) {
      if (seen.has(id)) return { ok: false, code: 'DUP_CARD', error: 'card used twice' };
      seen.add(id);
    }
  }
  if (next.phase === 'round1') {
    if (plays.length !== 1 || plays[0]!.kind !== 'newRun') {
      return {
        ok: false,
        code: 'ROUND1_RUN_ONLY',
        error: 'the first turn must lay exactly one 3+ card same-suit run',
      };
    }
  }
  for (const play of plays) {
    const res = validatePlayInternal(next, nextPlayer, play);
    if (!res.ok) return { ok: false, code: 'INVALID_PLAY', error: res.error };
  }
  for (const play of plays) {
    applyPlay(next, nextPlayer, play);
  }
  pushEvent(next, {
    playerId: nextPlayer.id,
    kind: 'lay',
    detail: describePlays(plays),
    cardIds: plays.flatMap((p) => p.cardIds),
  });
  maybeLeaveRound1(next);
  if (nextPlayer.hand.length === 0) {
    nextPlayer.status = 'leng';
    pushEvent(next, { playerId: nextPlayer.id, kind: 'leng', detail: `${nextPlayer.name} calls LENG!` });
    endDeal(next);
    return { ok: true, state: next };
  }
  advanceTurn(next);
  return { ok: true, state: next };
}

function validatePlayInternal(
  state: GameState,
  player: PlayerState,
  play: Play,
): { ok: true } | { ok: false; error: string } {
  const handIds = new Set(player.hand.map((c) => c.id));
  for (const id of play.cardIds) {
    if (!handIds.has(id)) return { ok: false, error: `card ${id} is not in your hand` };
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
      const group = state.table.find((g) => g.id === play.groupId);
      if (!group || group.kind !== 'run') return { ok: false, error: 'run not found on table' };
      const cards = play.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
      const res = resolveRunExtension(group, cards, state.config);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
    case 'extendSet': {
      const group = state.table.find((g) => g.id === play.groupId);
      if (!group || group.kind !== 'set') return { ok: false, error: 'set not found on table' };
      const cards = play.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
      const res = validateExtendSet(group, cards, state.config);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
  }
}

function applyPlay(state: GameState, player: PlayerState, play: Play): void {
  const cards = play.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
  const played = new Set(play.cardIds);
  player.hand = player.hand.filter((c) => !played.has(c.id));
  switch (play.kind) {
    case 'newRun': {
      const res = resolveNewRun(cards, state.config);
      const entries = (res as { ok: true; value: RunEntry[] }).value;
      const suit = entries.find((e) => !isWild(e.card))!.card.suit as Exclude<typeof entries[0]['card']['suit'], 'JOKER'>;
      state.table.push({
        kind: 'run',
        id: `g${state.nextGroupId++}`,
        suit,
        entries,
        ownerId: player.id,
      });
      break;
    }
    case 'newSet': {
      state.table.push({
        kind: 'set',
        id: `g${state.nextGroupId++}`,
        rank: (cards.find((c) => !isWild(c)) ?? cards[0]!).rank as never,
        cards,
        ownerId: player.id,
      });
      break;
    }
    case 'extendRun': {
      const group = state.table.find((g) => g.id === play.groupId) as Extract<TableGroup, { kind: 'run' }>;
      const res = resolveRunExtension(group, cards, state.config);
      group.entries = (res as { ok: true; value: RunEntry[] }).value;
      break;
    }
    case 'extendSet': {
      const group = state.table.find((g) => g.id === play.groupId) as Extract<TableGroup, { kind: 'set' }>;
      group.cards = [...group.cards, ...cards];
      break;
    }
  }
}

function playerDropOut(state: GameState, player: PlayerState): void {
  player.status = 'droppedOut';
  pushEvent(state, {
    playerId: player.id,
    kind: 'pass',
    detail: `${player.name} passes and drops out`,
  });
  maybeLeaveRound1(state);
  const anyActive = state.players.some((p) => p.status === 'active');
  if (!anyActive) {
    pushEvent(state, {
      playerId: player.id,
      kind: 'dealOver',
      detail: 'all players dropped out',
    });
    endDeal(state);
    return;
  }
  advanceTurn(state);
}


/** Round 1 ends once every player has laid a first run or dropped out. */
function maybeLeaveRound1(state: GameState): void {
  if (state.phase !== 'round1') return;
  const done = state.players.every(
    (p) => p.status !== 'active' || state.table.some((g) => g.ownerId === p.id),
  );
  if (done) {
    state.phase = 'round2';
    state.firstRoundActive = false;
  }
}

function advanceTurn(state: GameState): void {
  const order = state.players.length;
  for (let step = 1; step <= order; step++) {
    const seat = (state.turnSeat + step) % order;
    const candidate = state.players[seat]!;
    if (candidate.status === 'active') {
      state.turnSeat = seat;
      return;
    }
  }
  endDeal(state);
}

/** Close the deal: compute penalties, update match totals. Mutates state. */
export function endDeal(state: GameState): void {
  const config = state.config;
  for (const player of state.players) {
    let penalty = 0;
    if (player.status !== 'leng') {
      penalty = player.hand.reduce((sum, card) => sum + cardPenalty(card, config), 0);
    }
    player.penalty = penalty;
    player.matchPenalty += penalty;
  }
  const ranking = [...state.players]
    .sort((a, b) => {
      const av = a.status === 'leng' ? -1 : a.penalty!;
      const bv = b.status === 'leng' ? -1 : b.penalty!;
      return av - bv;
    })
    .map((p, i) => ({ playerId: p.id, penalty: p.penalty ?? null, place: i + 1 }));
  const winner = state.players.find((p) => p.status === 'leng');
  const result: DealResult = {
    dealNumber: state.dealNumber,
    penalties: state.players.map((p) => (p.status === 'leng' ? 0 : p.penalty!)),
    winnerId: winner?.id ?? ranking[0]!.playerId,
    ranking,
  };
  state.results.push(result);
  state.phase = 'dealOver';
  pushEvent(state, {
    playerId: result.winnerId,
    kind: 'dealOver',
    detail: winner
      ? `${winner.name} wins deal ${state.dealNumber} (LENG)`
      : 'deal ended without a LENG',
  });
  if (state.dealNumber >= config.dealsPerMatch) {
    state.phase = 'matchOver';
    pushEvent(state, {
      playerId: ranking[0]!.playerId,
      kind: 'matchOver',
      detail: `match over — ${state.players.find((p) => p.id === ranking[0]!.playerId)!.name} wins the match`,
    });
  }
}

/** Begin the next deal of a multi-deal match. */
export function startNextDeal(state: GameState): ActionResult {
  if (state.phase !== 'dealOver') {
    return { ok: false, code: 'PHASE', error: 'the current deal is not over' };
  }
  const next = structuredClone(state);
  startDeal(next);
  return { ok: true, state: next };
}

/** Redacted view for one player. Other hands are NEVER included. */
export function getView(state: GameState, viewerId: string): PlayerView {
  const you = state.players.find((p) => p.id === viewerId)!;
  return {
    config: state.config,
    you: {
      id: you.id,
      seat: you.seat,
      hand: you.hand,
      status: you.status,
      isYourTurn: state.turnSeat === you.seat && (state.phase === 'round1' || state.phase === 'round2'),
      penalty: you.penalty,
      matchPenalty: you.matchPenalty,
    },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      status: p.status,
      handCount: p.hand.length,
      isAI: p.isAI,
      isCurrentTurn: state.turnSeat === p.seat && (state.phase === 'round1' || state.phase === 'round2'),
      penalty: p.penalty,
      matchPenalty: p.matchPenalty,
    })),
    table: state.table,
    phase: state.phase,
    dealNumber: state.dealNumber,
    firstRoundActive: state.firstRoundActive,
    results: state.results,
    history: state.history,
  };
}

function describePlays(plays: Play[]): string {
  return plays
    .map((p) => {
      const n = p.cardIds.length;
      switch (p.kind) {
        case 'newRun':
          return `laid a run of ${n}`;
        case 'newSet':
          return `laid a set of ${n}`;
        case 'extendRun':
          return `extended run ${p.groupId} with ${n}`;
        case 'extendSet':
          return `extended set ${p.groupId} with ${n}`;
      }
    })
    .join(', ');
}

export { isWild };
