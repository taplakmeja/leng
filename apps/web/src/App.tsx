import { useCallback, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { PlayerView } from '@leng/engine';
import { HomeScreen } from './ui/HomeScreen.js';
import { ProfileScreen } from './ui/ProfileScreen.js';
import { LobbyRoute, LocalGameRoute, OnlineGameRoute } from './routes/games.js';
import { OnlineSessionProvider } from './session.js';
import { loadHistory, loadProfile, recordLocalMatch, saveProfile } from './profile.js';

type MatchMode = 'practice' | 'passplay' | 'online';

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [history, setHistory] = useState(loadHistory);

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

  const recordMatch = useCallback(
    (view: PlayerView, mode: MatchMode) => {
      const result = view.results[view.results.length - 1];
      if (!result) return;
      const ranking = [...view.players].sort((a, b) => a.matchPenalty - b.matchPenalty);
      const place = ranking.findIndex((p) => p.id === view.you.id) + 1;
      const winner = view.players.find((p) => p.id === result.winnerId);
      recordLocalMatch(
        {
          finishedAt: Date.now(),
          mode,
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

  return (
    <OnlineSessionProvider>
      <Routes>
        <Route
          path="/"
          element={<HomeScreen profile={profile} onRename={rename} onAvatar={setAvatar} />}
        />
        <Route path="/profile" element={<ProfileScreen profile={profile} history={history} />} />
        <Route path="/lobby" element={<LobbyRoute playerName={profile.name} />} />
        <Route
          path="/game/practice"
          element={
            <LocalGameRoute mode="practice" playerName={profile.name} onMatchRecorded={recordMatch} />
          }
        />
        <Route
          path="/game/passplay"
          element={
            <LocalGameRoute mode="passplay" playerName={profile.name} onMatchRecorded={recordMatch} />
          }
        />
        <Route
          path="/game/online"
          element={<OnlineGameRoute playerName={profile.name} onMatchRecorded={recordMatch} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OnlineSessionProvider>
  );
}
