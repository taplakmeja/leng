import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { PlayerView } from '@leng/engine';
import type { Difficulty } from '@leng/ai';
import { LocalController } from '../controllers/local.js';
import { GameScreen } from '../ui/GameScreen.js';
import { LobbyScreen } from '../ui/LobbyScreen.js';
import { useOnlineSession } from '../session.js';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function parseDifficulty(raw: string | null): Difficulty {
  return DIFFICULTIES.includes(raw as Difficulty) ? (raw as Difficulty) : 'normal';
}

function parseCount(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 4;
  return Math.min(6, Math.max(2, Math.trunc(n)));
}

export function LocalGameRoute({
  mode,
  playerName,
  onMatchRecorded,
}: {
  mode: 'practice' | 'passplay';
  playerName: string;
  onMatchRecorded: (view: PlayerView, mode: 'practice' | 'passplay') => void;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const difficulty = parseDifficulty(params.get('difficulty'));
  const playerCount = parseCount(params.get('players'));
  const presenter = useMemo(
    () => new LocalController({ mode, playerName, aiDifficulty: difficulty, playerCount }),
    [mode, playerName, difficulty, playerCount],
  );
  useEffect(() => () => presenter.dispose(), [presenter]);
  return (
    <GameScreen
      presenter={presenter}
      playerName={playerName}
      onMatchRecorded={(view) => onMatchRecorded(view, mode)}
      onExit={() => navigate('/')}
    />
  );
}

export function LobbyRoute({ playerName }: { playerName: string }) {
  const { client, ensureClient, endSession } = useOnlineSession();
  const navigate = useNavigate();
  useEffect(() => {
    ensureClient(playerName);
  }, [ensureClient, playerName]);
  if (!client) {
    return (
      <div className="screen screen-center">
        <p className="muted">Menyambungkan…</p>
      </div>
    );
  }
  return <LobbyScreen client={client} onExit={() => { endSession(); navigate('/'); }} />;
}

export function OnlineGameRoute({
  playerName,
  onMatchRecorded,
}: {
  playerName: string;
  onMatchRecorded: (view: PlayerView, mode: 'online') => void;
}) {
  const { client, endSession } = useOnlineSession();
  const navigate = useNavigate();
  if (!client || client.room === null) return <Navigate to="/lobby" replace />;
  return (
    <GameScreen
      presenter={client}
      playerName={playerName}
      onMatchRecorded={(view) => onMatchRecorded(view, 'online')}
      onExit={() => { endSession(); navigate('/'); }}
    />
  );
}
