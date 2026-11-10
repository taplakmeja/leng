import type { PlayerView, Play } from '@leng/engine';
import type { GamePresenter } from './local.js';

export interface StoredMatchResultLike {
  roomCode: string;
  finishedAt: number;
  players: { id: string; name: string; isAI: boolean; matchPenalty: number }[];
  winnerId: string;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  isPrivate: boolean;
  playerCount: number;
  capacity: number;
  inGame: boolean;
}

export interface RoomSeat {
  id: string;
  name: string;
  isAI: boolean;
  connected: boolean;
  isHost: boolean;
}

type Listener = () => void;

/**
 * WebSocket client for the authoritative server. The server owns all game
 * state; this client renders views and forwards intents only.
 */
export class OnlineController implements GamePresenter {
  mode = 'online' as const;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private _view: PlayerView | null = null;
  private _room: RoomInfo | null = null;
  private _seats: RoomSeat[] = [];
  private _youAreHost = false;
  private _error: string | null = null;
  private _connected = false;
  private _matchResult: StoredMatchResultLike | null = null;
  private identity: { playerId: string; token: string } | null = null;
  private name: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private pendingActions: Record<string, unknown>[] = [];

  constructor(name: string, identity?: { playerId: string; token: string }) {
    this.name = name;
    this.identity = identity ?? null;
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: 'hello', name: this.name, ...this.identity }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      this.onMessage(msg);
    };
    ws.onclose = () => {
      this._connected = false;
      this.notify();
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 1500);
      }
    };
  }

  private onMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'welcome':
        this.identity = { playerId: msg.playerId as string, token: msg.token as string };
        this.persistIdentity();
        for (const action of this.pendingActions) this.send(action);
        this.pendingActions = [];
        break;
      case 'room':
        this._room = msg.room as RoomInfo;
        this._seats = msg.seats as RoomSeat[];
        this._youAreHost = msg.youAreHost as boolean;
        break;
      case 'view':
        this._view = msg.view as PlayerView;
        this._error = null;
        break;
      case 'error':
        this._error = msg.message as string;
        break;
      case 'matchFinished':
        this._matchResult = msg.result as StoredMatchResultLike;
        break;
      default:
        return;
    }
    this.notify();
  }

  private persistIdentity(): void {
    if (!this.identity) return;
    try {
      localStorage.setItem('leng.identity.v1', JSON.stringify(this.identity));
    } catch {
      /* ignore */
    }
  }

  static storedIdentity(): { playerId: string; token: string } | null {
    try {
      const raw = localStorage.getItem('leng.identity.v1');
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return null;
  }

  get connected(): boolean {
    return this._connected;
  }

  get room(): RoomInfo | null {
    return this._room;
  }

  get seats(): RoomSeat[] {
    return this._seats;
  }

  get youAreHost(): boolean {
    return this._youAreHost;
  }

  get matchResult(): StoredMatchResultLike | null {
    return this._matchResult;
  }

  get playerId(): string | null {
    return this.identity?.playerId ?? null;
  }

  createRoom(isPrivate: boolean, capacity = 4): void {
    this.send({ type: 'createRoom', isPrivate, capacity });
  }

  joinRoom(code: string): void {
    this.send({ type: 'joinRoom', code });
  }

  quickMatch(): void {
    this.send({ type: 'quickMatch' });
  }

  addAI(difficulty: string): void {
    this.send({ type: 'addAI', difficulty });
  }

  start(config?: Record<string, unknown>): void {
    this.send({ type: 'start', config });
  }

  leaveRoom(): void {
    this.send({ type: 'leaveRoom' });
  }

  getHistory(): void {
    this.send({ type: 'getHistory' });
  }

  snapshot(): PlayerView | null {
    return this._view;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  play(plays: Play[]): void {
    this.send({ type: 'action', move: { type: 'lay', plays } });
  }

  pass(): void {
    this.send({ type: 'action', move: { type: 'pass' } });
  }

  nextDeal(): void {
    this.send({ type: 'nextDeal' });
  }

  newMatch(): void {
    this.send({ type: 'newMatch' });
  }

  lastError(): string | null {
    return this._error;
  }

  hotSeat(): null {
    return null;
  }

  revealHand(): void {}

  private send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingActions.push(msg);
    }
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  dispose(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.listeners.clear();
  }
}
