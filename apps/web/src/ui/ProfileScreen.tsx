import type { LocalHistoryEntry, LocalProfile } from '../profile.js';

export function ProfileScreen({
  profile,
  history,
  onBack,
}: {
  profile: LocalProfile;
  history: LocalHistoryEntry[];
  onBack: () => void;
}) {
  const winRate = profile.matchesPlayed > 0 ? Math.round((profile.matchesWon / profile.matchesPlayed) * 100) : 0;
  return (
    <div className="screen profile">
      <header className="game-header">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Menu
        </button>
        <h1>Profil</h1>
        <span />
      </header>
      <div className="profile-card">
        <span className="avatar avatar-big">{profile.avatar}</span>
        <div>
          <h2>{profile.name}</h2>
          <p className="muted">
            {profile.authProvider === 'google' ? 'Akun Google' : 'Tamu'} · {profile.playerId}
          </p>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat">
          <span className="stat-num">{profile.matchesPlayed}</span>
          <span className="stat-label">Main</span>
        </div>
        <div className="stat">
          <span className="stat-num">{profile.matchesWon}</span>
          <span className="stat-label">Menang</span>
        </div>
        <div className="stat">
          <span className="stat-num">{winRate}%</span>
          <span className="stat-label">Win rate</span>
        </div>
        <div className="stat">
          <span className="stat-num">{profile.dealsWon}</span>
          <span className="stat-label">Deal LENG</span>
        </div>
      </div>
      <h3>Riwayat pertandingan</h3>
      {history.length === 0 ? (
        <p className="muted">Belum ada pertandingan.</p>
      ) : (
        <ul className="history-list">
          {history.map((h, i) => (
            <li key={i}>
              <span className={`place place-${h.place}`}>#{h.place}</span>
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
