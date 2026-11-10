import { useNavigate } from 'react-router-dom';
import type { LocalHistoryEntry, LocalProfile } from '../profile.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export function ProfileScreen({
  profile,
  history,
}: {
  profile: LocalProfile;
  history: LocalHistoryEntry[];
}) {
  const navigate = useNavigate();
  const winRate =
    profile.matchesPlayed > 0 ? Math.round((profile.matchesWon / profile.matchesPlayed) * 100) : 0;
  return (
    <div className="screen profile">
      <header className="game-header">
        <Button variant="ghost" onClick={() => navigate('/')}>
          ← Menu
        </Button>
        <h1>Profil</h1>
        <span />
      </header>
      <Card className="profile-card">
        <CardContent>
          <span className="avatar avatar-big">{profile.avatar}</span>
          <div>
            <h2>{profile.name}</h2>
            <p className="muted">
              {profile.authProvider === 'google' ? 'Akun Google' : 'Tamu'} · {profile.playerId}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="stats-grid">
        <Card className="stat">
          <CardContent>
            <span className="stat-num">{profile.matchesPlayed}</span>
            <span className="stat-label">Main</span>
          </CardContent>
        </Card>
        <Card className="stat">
          <CardContent>
            <span className="stat-num">{profile.matchesWon}</span>
            <span className="stat-label">Menang</span>
          </CardContent>
        </Card>
        <Card className="stat">
          <CardContent>
            <span className="stat-num">{winRate}%</span>
            <span className="stat-label">Win rate</span>
          </CardContent>
        </Card>
        <Card className="stat">
          <CardContent>
            <span className="stat-num">{profile.dealsWon}</span>
            <span className="stat-label">Deal LENG</span>
          </CardContent>
        </Card>
      </div>
      <h3>Riwayat pertandingan</h3>
      {history.length === 0 ? (
        <p className="muted">Belum ada pertandingan.</p>
      ) : (
        <ul className="history-list">
          {history.map((h, i) => (
            <li key={i}>
              <Badge variant={h.place === 1 ? 'default' : 'secondary'}>#{h.place}</Badge>
              <span>{new Date(h.finishedAt).toLocaleString('id-ID')}</span>
              <span className="muted">
                {h.mode} · {h.matchPenalty} poin
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
