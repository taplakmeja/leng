import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StoredMatchResult } from './room.js';

export interface Profile {
  playerId: string;
  name: string;
  createdAt: number;
  matchesPlayed: number;
  matchesWon: number;
  dealsWon: number;
}

export interface HistoryEntry {
  finishedAt: number;
  roomCode: string;
  mode: 'online';
  matchPenalty: number;
  place: number;
  winnerId: string;
  players: { id: string; name: string; isAI: boolean; matchPenalty: number }[];
}

interface StoreData {
  profiles: Record<string, Profile>;
  history: Record<string, HistoryEntry[]>;
}

/**
 * In-memory store with JSON persistence. In the Firebase deployment this is
 * replaced by Firestore (docs/ARCHITECTURE.md); the interface is the same.
 */
export class Store {
  private data: StoreData = { profiles: {}, history: {} };
  private file: string | null = null;
  private dirty = false;

  constructor(dataDir?: string) {
    if (dataDir) {
      try {
        mkdirSync(dataDir, { recursive: true });
        this.file = join(dataDir, 'store.json');
        const raw = readFileSync(this.file, 'utf8');
        this.data = JSON.parse(raw) as StoreData;
      } catch {
        this.data = { profiles: {}, history: {} };
      }
    }
  }

  getProfile(playerId: string): Profile {
    let profile = this.data.profiles[playerId];
    if (!profile) {
      profile = { playerId, name: 'Guest', createdAt: Date.now(), matchesPlayed: 0, matchesWon: 0, dealsWon: 0 };
      this.data.profiles[playerId] = profile;
      this.save();
    }
    return profile;
  }

  rename(playerId: string, name: string): Profile {
    const profile = this.getProfile(playerId);
    profile.name = name.slice(0, 24);
    this.save();
    return profile;
  }

  recordMatch(result: StoredMatchResult, playerIds: string[]): void {
    for (const playerId of playerIds) {
      const profile = this.getProfile(playerId);
      profile.matchesPlayed += 1;
      if (result.winnerId === playerId) profile.matchesWon += 1;
      profile.dealsWon += result.results.filter((r) => r.winnerId === playerId).length;
      const mine = result.players.find((p) => p.id === playerId);
      const ranking = [...result.players].sort((a, b) => a.matchPenalty - b.matchPenalty);
      const entry: HistoryEntry = {
        finishedAt: result.finishedAt,
        roomCode: result.roomCode,
        mode: 'online',
        matchPenalty: mine?.matchPenalty ?? 0,
        place: ranking.findIndex((p) => p.id === playerId) + 1,
        winnerId: result.winnerId,
        players: result.players,
      };
      const list = this.data.history[playerId] ?? (this.data.history[playerId] = []);
      list.unshift(entry);
      if (list.length > 50) list.length = 50;
    }
    this.save();
  }

  getHistory(playerId: string): HistoryEntry[] {
    return this.data.history[playerId] ?? [];
  }

  private save(): void {
    if (!this.file || this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => {
      this.dirty = false;
      if (!this.file) return;
      try {
        writeFileSync(this.file, JSON.stringify(this.data));
      } catch {
        /* persistence is best-effort */
      }
    });
  }
}
