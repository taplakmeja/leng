import type { GameState, LengRulesConfig, Move, PlayerView } from '@leng/engine';
import { DEFAULT_RULES, applyAction, createGame, getView, startNextDeal } from '@leng/engine';
import { chooseMove } from '@leng/ai';
import type { Difficulty } from '@leng/ai';

export interface Seat {
  playerId: string;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty;
  connected: boolean;
  token: string;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

export interface PublicRoomInfo {
  code: string;
  hostId: string;
  isPrivate: boolean;
  playerCount: number;
  capacity: number;
  inGame: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  isPrivate: boolean;
  seats: Seat[];
  capacity: number;
  state: GameState | null;
  createdAt: number;
  matchHistory: StoredMatchResult[];
}

export interface StoredMatchResult {
  roomCode: string;
  finishedAt: number;
  players: { id: string; name: string; isAI: boolean; matchPenalty: number }[];
  winnerId: string;
  results: GameState['results'];
}

export interface RoomHooks {
  onRoomUpdated: (room: Room) => void;
  onPlayerView: (room: Room, playerId: string, view: PlayerView) => void;
  onMatchFinished: (room: Room, result: StoredMatchResult) => void;
  onRoomClosed: (room: Room) => void;
  onKick: (room: Room, playerId: string, reason: string) => void;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(existing: Set<string>): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
}

export function createRoom(
  code: string,
  host: { playerId: string; name: string; token: string },
  isPrivate: boolean,
  capacity: number,
): Room {
  return {
    code,
    hostId: host.playerId,
    isPrivate,
    capacity,
    seats: [
      { playerId: host.playerId, name: host.name, isAI: false, connected: true, token: host.token },
    ],
    state: null,
    createdAt: Date.now(),
    matchHistory: [],
  };
}

export function publicInfo(room: Room): PublicRoomInfo {
  return {
    code: room.code,
    hostId: room.hostId,
    isPrivate: room.isPrivate,
    playerCount: room.seats.length,
    capacity: room.capacity,
    inGame: room.state !== null,
  };
}

export function addAI(room: Room, name: string, difficulty: Difficulty): boolean {
  if (room.seats.length >= room.capacity) return false;
  room.seats.push({
    playerId: `ai-${room.code}-${room.seats.length}`,
    name,
    isAI: true,
    difficulty,
    connected: true,
    token: '',
  });
  return true;
}

export function startMatch(room: Room, config: LengRulesConfig, seed: number): boolean {
  if (room.state) return false;
  if (room.seats.length < config.minPlayers) return false;
  room.state = createGame(
    config,
    room.seats.map((s) => ({ id: s.playerId, name: s.name, isAI: s.isAI })),
    seed,
  );
  return true;
}

export function nextDeal(room: Room): boolean {
  if (!room.state) return false;
  const res = startNextDeal(room.state);
  if (!res.ok) return false;
  room.state = res.state;
  return true;
}

/**
 * Apply a move with full server-side validation. The engine is the only
 * authority: card ownership, turn order, legality, scoring and winning are
 * all checked here, never on the client.
 */
export function applyMove(room: Room, playerId: string, move: Move): { ok: boolean; error?: string } {
  if (!room.state) return { ok: false, error: 'no active match' };
  const seat = room.seats.find((s) => s.playerId === playerId);
  if (!seat) return { ok: false, error: 'you are not in this room' };
  const res = applyAction(room.state, playerId, move);
  if (!res.ok) return { ok: false, error: res.error };
  room.state = res.state;
  return { ok: true };
}

/** Play AI turns until the next human decision point. */
export function runAI(room: Room): void {
  if (!room.state) return;
  let guard = 0;
  while (
    room.state.phase === 'round1' ||
    room.state.phase === 'round2'
  ) {
    if (guard++ > 1000) break;
    const current = room.state.players[room.state.turnSeat]!;
    const seat = room.seats.find((s) => s.playerId === current.id);
    if (!seat || !seat.isAI) break;
    const difficulty = seat.difficulty ?? 'normal';
    const move = chooseMove(room.state, current.id, difficulty);
    const res = applyAction(room.state, current.id, move);
    if (!res.ok) break;
    room.state = res.state;
  }
}

export function seatView(room: Room, playerId: string): PlayerView | null {
  if (!room.state) return null;
  if (!room.seats.some((s) => s.playerId === playerId)) return null;
  return getView(room.state, playerId);
}

export function broadcastViews(room: Room, hooks: RoomHooks): void {
  if (!room.state) return;
  for (const seat of room.seats) {
    if (seat.isAI || !seat.connected) continue;
    const view = seatView(room, seat.playerId);
    if (view) hooks.onPlayerView(room, seat.playerId, view);
  }
  hooks.onRoomUpdated(room);
}

/**
 * Server-side timeout policy (a networking policy, not a Leng rule —
 * see docs/RULES.md): autoPlay lets a server-side AI play a minimal legal
 * move for the disconnected player; pass applies the authentic drop-out.
 */
export function handleTimeout(room: Room, hooks: RoomHooks): void {
  if (!room.state) return;
  if (room.state.phase !== 'round1' && room.state.phase !== 'round2') return;
  const current = room.state.players[room.state.turnSeat]!;
  const seat = room.seats.find((s) => s.playerId === current.id);
  if (!seat || seat.isAI) return;
  const action = room.state.config.turnTimeoutAction;
  let move: Move;
  if (action === 'autoPlay') {
    move = chooseMove(room.state, current.id, 'normal');
  } else {
    move = { type: 'pass' };
  }
  applyMove(room, current.id, move);
  runAI(room);
  broadcastViews(room, hooks);
}
