import type { GameState, LengRulesConfig, Move, PlayerView, Play } from '@leng/engine';
import { applyAction, createGame, getView, startNextDeal, DEFAULT_RULES } from '@leng/engine';
import { chooseMove } from '@leng/ai';
import type { Difficulty } from '@leng/ai';

export interface GamePresenter {
  mode: 'practice' | 'passplay' | 'online';
  snapshot(): PlayerView | null;
  subscribe(fn: () => void): () => void;
  play(plays: Play[]): void;
  pass(): void;
  nextDeal(): void;
  newMatch(): void;
  lastError(): string | null;
  /** Pass-and-play hand-off state, if any. */
  hotSeat(): { seat: number; phase: 'handoff' | 'playing' } | null;
  revealHand(): void;
  dispose(): void;
}

interface LocalOptions {
  mode: 'practice' | 'passplay';
  playerName: string;
  aiDifficulty: Difficulty;
  playerCount: number;
}

/**
 * Runs the engine in-browser for offline modes. This is a trusted environment:
 * the same engine package backs the authoritative server.
 */
export class LocalController implements GamePresenter {
  mode: 'practice' | 'passplay';
  private readonly difficulty: Difficulty;
  private state: GameState;
  private listeners = new Set<() => void>();
  private error: string | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private hot: { seat: number; phase: 'handoff' | 'playing' } | null = null;
  private readonly humanId: string;

  constructor(opts: LocalOptions) {
    this.mode = opts.mode;
    this.difficulty = opts.aiDifficulty;
    const config: LengRulesConfig = {
      ...DEFAULT_RULES,
      minPlayers: 2,
      firstTurnPolicy: 'random',
    };
    const players = Array.from({ length: opts.playerCount }, (_, i) => ({
      id: `p${i}`,
      name: i === 0 ? opts.playerName : `Bot ${i}`,
      isAI: opts.mode === 'practice' ? i > 0 : false,
    }));
    this.humanId = 'p0';
    this.state = createGame(config, players, (Math.random() * 0xffffffff) >>> 0);
    if (opts.mode === 'practice') this.scheduleAI();
    else this.hot = { seat: this.state.turnSeat, phase: 'handoff' };
  }

  snapshot(): PlayerView | null {
    const seatId = this.mode === 'passplay' ? `p${this.hot?.seat ?? 0}` : this.humanId;
    return getView(this.state, seatId);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  lastError(): string | null {
    return this.error;
  }

  hotSeat(): { seat: number; phase: 'handoff' | 'playing' } | null {
    return this.mode === 'passplay' ? this.hot : null;
  }

  revealHand(): void {
    if (this.hot) {
      this.hot = { ...this.hot, phase: 'playing' };
      this.notify();
    }
  }

  play(plays: Play[]): void {
    if (this.hot && this.hot.phase === 'handoff') return;
    const seatId = this.mode === 'passplay' ? `p${this.hot?.seat ?? 0}` : this.humanId;
    this.act(seatId, { type: 'lay', plays });
  }

  pass(): void {
    const seatId = this.mode === 'passplay' ? `p${this.hot?.seat ?? 0}` : this.humanId;
    this.act(seatId, { type: 'pass' });
  }

  nextDeal(): void {
    const res = startNextDeal(this.state);
    if (!res.ok) {
      this.error = res.error;
      this.notify();
      return;
    }
    this.state = res.state;
    if (this.mode === 'passplay') this.hot = { seat: this.state.turnSeat, phase: 'handoff' };
    else this.scheduleAI();
    this.notify();
  }

  newMatch(): void {
    /* local modes exit to home instead */
  }

  private act(playerId: string, move: Move): void {
    const res = applyAction(this.state, playerId, move);
    if (!res.ok) {
      this.error = res.error;
      this.notify();
      return;
    }
    this.error = null;
    this.state = res.state;
    if (this.state.phase === 'dealOver' || this.state.phase === 'matchOver') {
      this.hot = null;
      this.notify();
      return;
    }
    if (this.mode === 'practice') {
      this.scheduleAI();
    } else {
      this.hot = { seat: this.state.turnSeat, phase: 'handoff' };
    }
    this.notify();
  }

  private scheduleAI(): void {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    const step = () => {
      if (this.state.phase !== 'round1' && this.state.phase !== 'round2') return;
      const current = this.state.players[this.state.turnSeat]!;
      if (!current.isAI) return;
      const move = chooseMove(this.state, current.id, this.difficulty);
      const res = applyAction(this.state, current.id, move);
      if (!res.ok) return;
      this.state = res.state;
      this.notify();
      if (this.state.phase === 'round1' || this.state.phase === 'round2') {
        this.aiTimer = setTimeout(step, 650);
      }
    };
    this.aiTimer = setTimeout(step, 650);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  dispose(): void {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.listeners.clear();
  }
}
