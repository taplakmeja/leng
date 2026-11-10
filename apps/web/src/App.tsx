import { useCallback, useMemo, useState } from 'react';
import type { PlayerView } from '@leng/engine';
import { HomeScreen } from './ui/HomeScreen.js';
import type { ModeSelection } from './ui/HomeScreen.js';
import { GameScreen } from './ui/GameScreen.js';
import { LobbyScreen } from './ui/LobbyScreen.js';
import { ProfileScreen } from './ui/ProfileScreen.js';
import { LocalController } from './controllers/local.js';
import type { GamePresenter } from './controllers/local.js';
import { OnlineController } from './controllers/online.js';
import {
  isGoogleAuthConfigured,
  loadHistory,
  loadProfile,
  recordLocalMatch,
  saveProfile,
} from './profile.js';

type Screen =
  | { kind: 'home' }
  | { kind: 'profile' }
  | { kind: 'game'; presenter: GamePresenter }
  | { kind: 'lobby' };

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [history, setHistory] = useState(loadHistory);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [onlineClient, setOnlineClient] = useState<OnlineController | null>(null);

  const rename = useCallback(
    (name: string) => {
      const next = { ...profile, name };
      setProfile(next);
      saveProfile(next);
    },
    [profile],
  );

  const setAvatar = useCallback(
    (avatar: string) => {
      const next = { ...profile, avatar };
      setProfile(next);
      saveProfile(next);
    },
    [profile],
  );

  const onSelect = useCallback(
    (mode: ModeSelection) => {
      if (mode.kind === 'profile') {
        setScreen({ kind: 'profile' });
        return;
      }
      if (mode.kind === 'online') {
        const client = new OnlineController(profile.name, OnlineController.storedIdentity() ?? undefined);
        setOnlineClient(client);
        setScreen({ kind: 'lobby' });
        return;
      }
      const presenter = new LocalController({
        mode: mode.kind,
        playerName: profile.name,
        aiDifficulty: mode.kind === 'practice' ? mode.difficulty : 'normal',
        playerCount: mode.playerCount,
      });
      setScreen({ kind: 'game', presenter });
    },
    [profile.name],
  );

  const recordOnlineMatch = useCallback(
    (view: PlayerView) => {
      const result = view.results[view.results.length - 1];
      if (!result) return;
      const ranking = [...view.players].sort((a, b) => a.matchPenalty - b.matchPenalty);
      const place = ranking.findIndex((p) => p.id === view.you.id) + 1;
      const winner = view.players.find((p) => p.id === result.winnerId);
      recordLocalMatch(
        {
          finishedAt: Date.now(),
          mode: 'online',
          place,
          matchPenalty: view.you.matchPenalty,
          winnerName: winner?.name ?? '?',
          players: view.players.map((p) => ({ name: p.name, isAI: p.isAI, matchPenalty: p.matchPenalty })),
        },
        profile,
      );
      setHistory(loadHistory());
    },
    [profile],
  );

  const recordLocalMatchCb = useCallback(
    (view: PlayerView) => {
      const result = view.results[view.results.length - 1];
      if (!result) return;
      const ranking = [...view.players].sort((a, b) => a.matchPenalty - b.matchPenalty);
      const place = ranking.findIndex((p) => p.id === view.you.id) + 1;
      const winner = view.players.find((p) => p.id === result.winnerId);
      recordLocalMatch(
        {
          finishedAt: Date.now(),
          mode: screen.kind === 'game' ? screen.presenter.mode : 'practice',
          place,
          matchPenalty: view.you.matchPenalty,
          winnerName: winner?.name ?? '?',
          players: view.players.map((p) => ({ name: p.name, isAI: p.isAI, matchPenalty: p.matchPenalty })),
        },
        profile,
      );
      setHistory(loadHistory());
    },
    [profile, screen],
  );

  const exitGame = useCallback(() => {
    if (screen.kind === 'game') screen.presenter.dispose();
    setScreen({ kind: 'home' });
  }, [screen]);

  const body = useMemo(() => {
    switch (screen.kind) {
      case 'home':
        return (
          <HomeScreen
            profile={profile}
            onSelect={onSelect}
            onRename={rename}
            onAvatar={setAvatar}
          />
        );
      case 'profile':
        return <ProfileScreen profile={profile} history={history} onBack={() => setScreen({ kind: 'home' })} />;
      case 'lobby':
        return onlineClient ? (
          <LobbyScreen
            client={onlineClient}
            onEnterGame={() => setScreen({ kind: 'game', presenter: onlineClient })}
            onExit={() => {
              onlineClient.dispose();
              setOnlineClient(null);
              setScreen({ kind: 'home' });
            }}
          />
        ) : null;
      case 'game':
        return (
          <GameScreen
            presenter={screen.presenter}
            onExit={exitGame}
            onMatchRecorded={screen.presenter.mode === 'online' ? recordOnlineMatch : recordLocalMatchCb}
            playerName={profile.name}
          />
        );
    }
  }, [screen, profile, history, onSelect, rename, setAvatar, exitGame, onlineClient, recordOnlineMatch, recordLocalMatchCb]);

  return (
    <div className="app">
      {body}
      {isGoogleAuthConfigured() ? null : null}
    </div>
  );
}
