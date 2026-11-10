export interface LocalProfile {
  playerId: string;
  name: string;
  avatar: string;
  authProvider: 'guest' | 'google';
  matchesPlayed: number;
  matchesWon: number;
  dealsWon: number;
}

export interface LocalHistoryEntry {
  finishedAt: number;
  mode: 'practice' | 'passplay' | 'online';
  place: number;
  matchPenalty: number;
  winnerName: string;
  players: { name: string; isAI: boolean; matchPenalty: number }[];
}

const PROFILE_KEY = 'leng.profile.v1';
const HISTORY_KEY = 'leng.history.v1';
const AVATARS = ['🦎', '🐉', '🐯', '🦅', '🐘', '🦈', '🐺', '🦉'];

export const AVATAR_CHOICES = AVATARS;

function randomId(): string {
  return 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as LocalProfile;
  } catch {
    /* fallthrough */
  }
  const profile: LocalProfile = {
    playerId: randomId(),
    name: 'Pemain',
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
    authProvider: 'guest',
    matchesPlayed: 0,
    matchesWon: 0,
    dealsWon: 0,
  };
  saveProfile(profile);
  return profile;
}

export function saveProfile(profile: LocalProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable */
  }
}

export function loadHistory(): LocalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw) as LocalHistoryEntry[];
  } catch {
    /* fallthrough */
  }
  return [];
}

export function recordLocalMatch(
  entry: LocalHistoryEntry,
  profile: LocalProfile,
): void {
  profile.matchesPlayed += 1;
  if (entry.place === 1) profile.matchesWon += 1;
  saveProfile(profile);
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > 50) history.length = 50;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable */
  }
}

/** Google sign-in activates when Firebase env config is present (docs/ARCHITECTURE.md). */
export function isGoogleAuthConfigured(): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID);
}
