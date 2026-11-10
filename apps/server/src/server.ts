import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { LengRulesConfig, Move, PlayerView } from '@leng/engine';
import { DEFAULT_RULES } from '@leng/engine';
import type { Difficulty } from '@leng/ai';
import {
  addAI,
  applyMove,
  broadcastViews,
  createRoom,
  generateRoomCode,
  handleTimeout,
  nextDeal,
  publicInfo,
  runAI,
  seatView,
  startMatch,
} from './room.js';
import type { PublicRoomInfo, Room, Seat, StoredMatchResult } from './room.js';
import { Store } from './store.js';
import type { Profile } from './store.js';

export interface ClientMessage {
  type: string;
  name?: string;
  playerId?: string;
  token?: string;
  code?: string;
  isPrivate?: boolean;
  capacity?: number;
  difficulty?: Difficulty;
  config?: Partial<LengRulesConfig>;
  move?: Move;
}

export type ServerMessage =
  | { type: 'welcome'; playerId: string; token: string; profile: Profile }
  | { type: 'room'; room: PublicRoomInfo; seats: { id: string; name: string; isAI: boolean; connected: boolean; isHost: boolean }[]; youAreHost: boolean }
  | { type: 'view'; view: PlayerView }
  | { type: 'error'; message: string }
  | { type: 'matchFinished'; result: StoredMatchResult }
  | { type: 'history'; matches: unknown[] }
  | { type: 'lobbyClosed' };

interface Session {
  playerId: string;
  token: string;
  socket: WebSocket;
  roomCode: string | null;
  name: string;
}

export interface GameServerOptions {
  dataDir?: string;
  reconnectGraceMs?: number;
  emptyRoomTtlMs?: number;
}

export class GameServer {
  readonly wss: WebSocketServer;
  private sessions = new Map<WebSocket, Session>();
  private rooms = new Map<string, Room>();
  private readonly store: Store;
  private readonly reconnectGraceMs: number;
  private readonly emptyRoomTtlMs: number;

  constructor(opts: GameServerOptions = {}) {
    this.store = new Store(opts.dataDir);
    this.reconnectGraceMs = opts.reconnectGraceMs ?? 60_000;
    this.emptyRoomTtlMs = opts.emptyRoomTtlMs ?? 10 * 60_000;
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (socket, req) => this.onConnection(socket, req));
    setInterval(() => this.sweepRooms(), this.emptyRoomTtlMs).unref();
  }

  handleUpgrade(request: IncomingMessage, socket: unknown, head: Buffer): void {
    this.wss.handleUpgrade(request, socket as never, head, (ws) => this.wss.emit('connection', ws, request));
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  private onConnection(socket: WebSocket, _req: IncomingMessage): void {
    let session: Session | null = null;
    socket.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        this.send(socket, { type: 'error', message: 'bad message' });
        return;
      }
      try {
        this.handleMessage(socket, session, msg, (s) => {
          session = s;
        });
      } catch (e) {
        this.send(socket, { type: 'error', message: e instanceof Error ? e.message : 'server error' });
      }
    });
    socket.on('close', () => {
      if (session) this.onDisconnect(session);
    });
  }

  private handleMessage(
    socket: WebSocket,
    session: Session | null,
    msg: ClientMessage,
    setSession: (s: Session) => void,
  ): void {
    if (msg.type === 'hello') {
      this.handleHello(socket, session, msg, setSession);
      return;
    }
    if (!session) {
      this.send(socket, { type: 'error', message: 'send hello first' });
      return;
    }
    switch (msg.type) {
      case 'createRoom':
        this.handleCreateRoom(session, msg);
        break;
      case 'joinRoom':
        this.handleJoinRoom(session, msg.code ?? '');
        break;
      case 'quickMatch':
        this.handleQuickMatch(session);
        break;
      case 'addAI':
        this.handleAddAI(session, msg.difficulty ?? 'normal');
        break;
      case 'leaveRoom':
        this.handleLeave(session);
        break;
      case 'start':
        this.handleStart(session, msg.config);
        break;
      case 'action':
        this.handleAction(session, msg.move);
        break;
      case 'nextDeal':
        this.handleNextDeal(session);
        break;
      case 'newMatch':
        this.handleNewMatch(session);
        break;
      case 'getHistory':
        this.send(session.socket, { type: 'history', matches: this.store.getHistory(session.playerId) });
        break;
      case 'rename':
        if (msg.name) {
          const profile = this.store.rename(session.playerId, msg.name);
          session.name = profile.name;
          this.send(session.socket, { type: 'welcome', playerId: session.playerId, token: session.token, profile });
        }
        break;
      default:
        this.send(session.socket, { type: 'error', message: `unknown message type: ${msg.type}` });
    }
  }

  private handleHello(
    socket: WebSocket,
    existing: Session | null,
    msg: ClientMessage,
    setSession: (s: Session) => void,
  ): void {
    if (existing) return;
    let playerId = msg.playerId ?? '';
    let token = msg.token ?? '';
    if (playerId && token) {
      const known = this.findSeatByPlayer(playerId);
      if (!known || known.seat.token !== token) {
        playerId = '';
        token = '';
      }
    } else {
      playerId = '';
    }
    if (!playerId) {
      playerId = `u-${randomId()}`;
      token = randomId();
    }
    const name = (msg.name ?? 'Guest').slice(0, 24) || 'Guest';
    const profile = this.store.rename(playerId, name);
    const session: Session = { playerId, token, socket, roomCode: null, name: profile.name };
    this.sessions.set(socket, session);
    setSession(session);
    this.send(socket, { type: 'welcome', playerId, token, profile });

    // Reconnection: restore room membership and push a fresh view.
    const found = this.findSeatByPlayer(playerId);
    if (found && token) {
      const { room, seat } = found;
      seat.connected = true;
      if (seat.disconnectTimer) clearTimeout(seat.disconnectTimer);
      session.roomCode = room.code;
      this.pushRoom(room);
      const view = seatView(room, playerId);
      if (view) this.send(socket, { type: 'view', view });
    }
  }

  private findSeatByPlayer(playerId: string): { room: Room; seat: Seat } | null {
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s.playerId === playerId);
      if (seat) return { room, seat };
    }
    return null;
  }

  private handleCreateRoom(session: Session, msg: ClientMessage): void {
    if (session.roomCode) this.handleLeave(session);
    const isPrivate = msg.isPrivate ?? true;
    const capacity = Math.min(6, Math.max(2, msg.capacity ?? 4));
    const usedCodes = new Set(this.rooms.keys());
    const code = generateRoomCode(usedCodes);
    const room = createRoom(code, { playerId: session.playerId, name: session.name, token: session.token }, isPrivate, capacity);
    this.rooms.set(code, room);
    session.roomCode = code;
    this.pushRoom(room);
  }

  private handleJoinRoom(session: Session, code: string): void {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) {
      this.send(session.socket, { type: 'error', message: 'room not found' });
      return;
    }
    if (room.seats.some((s) => s.playerId === session.playerId)) {
      session.roomCode = room.code;
      this.pushRoom(room);
      return;
    }
    if (room.seats.length >= room.capacity) {
      this.send(session.socket, { type: 'error', message: 'room is full' });
      return;
    }
    room.seats.push({
      playerId: session.playerId,
      name: session.name,
      isAI: false,
      connected: true,
      token: session.token,
    });
    session.roomCode = room.code;
    this.pushRoom(room);
  }

  private handleQuickMatch(session: Session): void {
    for (const room of this.rooms.values()) {
      if (!room.isPrivate && !room.state && room.seats.length < room.capacity) {
        this.handleJoinRoom(session, room.code);
        return;
      }
    }
    this.handleCreateRoom(session, { type: 'createRoom', isPrivate: false, capacity: 4 });
  }

  private handleAddAI(session: Session, difficulty: Difficulty): void {
    const room = this.roomOf(session);
    if (!room) return;
    if (room.hostId !== session.playerId) {
      this.send(session.socket, { type: 'error', message: 'only the host can add bots' });
      return;
    }
    addAI(room, `Bot ${room.seats.length}`, difficulty);
    this.pushRoom(room);
  }

  private handleLeave(session: Session): void {
    const room = this.roomOf(session);
    if (!room) return;
    session.roomCode = null;
    if (room.state) {
      // Leaving mid-game: the seat stays, marked disconnected (drop-out rules apply).
      const seat = room.seats.find((s) => s.playerId === session.playerId)!;
      seat.connected = false;
      this.pushRoom(room);
      return;
    }
    room.seats = room.seats.filter((s) => s.playerId !== session.playerId);
    if (room.hostId === session.playerId) {
      const nextHost = room.seats.find((s) => !s.isAI);
      room.hostId = nextHost?.playerId ?? room.hostId;
    }
    if (room.seats.length === 0) {
      this.rooms.delete(room.code);
      this.hooks_onRoomClosed(room);
    } else {
      this.pushRoom(room);
    }
  }

  private handleStart(session: Session, configOverride?: Partial<LengRulesConfig>): void {
    const room = this.roomOf(session);
    if (!room) return;
    if (room.hostId !== session.playerId) {
      this.send(session.socket, { type: 'error', message: 'only the host can start' });
      return;
    }
    const config: LengRulesConfig = { ...DEFAULT_RULES, ...configOverride };
    if (!startMatch(room, config, (Math.random() * 0xffffffff) >>> 0)) {
      this.send(session.socket, { type: 'error', message: 'cannot start the match yet' });
      return;
    }
    runAI(room);
    broadcastViews(room, this.hooks());
    this.armTurnTimer(room);
  }

  private handleAction(session: Session, move?: Move): void {
    const room = this.roomOf(session);
    if (!room || !move) return;
    const res = applyMove(room, session.playerId, move);
    if (!res.ok) {
      this.send(session.socket, { type: 'error', message: res.error ?? 'illegal move' });
      return;
    }
    runAI(room);
    broadcastViews(room, this.hooks());
    this.checkMatchEnd(room);
    this.armTurnTimer(room);
  }

  private handleNextDeal(session: Session): void {
    const room = this.roomOf(session);
    if (!room) return;
    if (room.hostId !== session.playerId) {
      this.send(session.socket, { type: 'error', message: 'only the host can deal next' });
      return;
    }
    if (!nextDeal(room)) {
      this.send(session.socket, { type: 'error', message: 'cannot deal now' });
      return;
    }
    runAI(room);
    broadcastViews(room, this.hooks());
    this.armTurnTimer(room);
  }

  private handleNewMatch(session: Session): void {
    const room = this.roomOf(session);
    if (!room) return;
    if (room.hostId !== session.playerId) {
      this.send(session.socket, { type: 'error', message: 'only the host can start a rematch' });
      return;
    }
    room.state = null;
    this.pushRoom(room);
  }

  private checkMatchEnd(room: Room): void {
    if (!room.state || room.state.phase !== 'matchOver') return;
    const players = room.state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      matchPenalty: p.matchPenalty,
    }));
    const ranking = [...players].sort((a, b) => a.matchPenalty - b.matchPenalty);
    const result: StoredMatchResult = {
      roomCode: room.code,
      finishedAt: Date.now(),
      players,
      winnerId: ranking[0]!.id,
      results: room.state.results,
    };
    room.matchHistory.push(result);
    this.store.recordMatch(result, players.filter((p) => !p.isAI).map((p) => p.id));
    for (const [, session] of this.sessions) {
      if (session.roomCode === room.code) {
        this.send(session.socket, { type: 'matchFinished', result });
      }
    }
  }

  private onDisconnect(session: Session): void {
    this.sessions.delete(session.socket);
    if (!session.roomCode) return;
    const room = this.rooms.get(session.roomCode);
    if (!room) return;
    const seat = room.seats.find((s) => s.playerId === session.playerId);
    if (!seat) return;
    seat.connected = false;
    this.pushRoom(room);
    seat.disconnectTimer = setTimeout(() => {
      if (room.state) {
        // Mid-game: keep the seat; the turn timer policy handles their turns.
        this.pushRoom(room);
      } else {
        room.seats = room.seats.filter((s) => s.playerId !== seat.playerId);
        if (room.hostId === seat.playerId) {
          const nextHost = room.seats.find((s) => !s.isAI);
          room.hostId = nextHost?.playerId ?? room.hostId;
        }
        if (room.seats.length === 0) {
          this.rooms.delete(room.code);
        } else {
          this.pushRoom(room);
        }
      }
    }, this.reconnectGraceMs);
  }

  private turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private armTurnTimer(room: Room): void {
    const existing = this.turnTimers.get(room.code);
    if (existing) clearTimeout(existing);
    if (!room.state) return;
    if (room.state.phase !== 'round1' && room.state.phase !== 'round2') return;
    const current = room.state.players[room.state.turnSeat]!;
    const seat = room.seats.find((s) => s.playerId === current.id);
    if (!seat || seat.isAI) return;
    const delay = room.state.config.turnTimeoutMs;
    this.turnTimers.set(room.code, setTimeout(() => {
      this.turnTimers.delete(room.code);
      handleTimeout(room, this.hooks());
      this.checkMatchEnd(room);
      this.armTurnTimer(room);
    }, delay));
  }

  private roomOf(session: Session): Room | null {
    return session.roomCode ? this.rooms.get(session.roomCode) ?? null : null;
  }

  private pushRoom(room: Room): void {
    const info = publicInfo(room);
    const seats = room.seats.map((s) => ({
      id: s.playerId,
      name: s.name,
      isAI: s.isAI,
      connected: s.connected,
      isHost: s.playerId === room.hostId,
    }));
    for (const seat of room.seats) {
      if (seat.isAI || !seat.connected) continue;
      for (const [socket, session] of this.sessions) {
        if (session.playerId === seat.playerId) {
          this.send(socket, { type: 'room', room: info, seats, youAreHost: room.hostId === seat.playerId });
        }
      }
    }
  }

  private hooks() {
    return {
      onRoomUpdated: (room: Room) => this.pushRoom(room),
      onPlayerView: (room: Room, playerId: string, view: PlayerView) => {
        void room;
        for (const [socket, session] of this.sessions) {
          if (session.playerId === playerId) this.send(socket, { type: 'view', view });
        }
      },
      onMatchFinished: () => {},
      onRoomClosed: () => {},
      onKick: () => {},
    };
  }

  private hooks_onRoomClosed(_room: Room): void {}

  private sweepRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const anyConnected = room.seats.some((s) => !s.isAI && s.connected);
      if (!anyConnected && now - room.createdAt > this.emptyRoomTtlMs) {
        this.rooms.delete(code);
      }
    }
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
