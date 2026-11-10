import { useState } from 'react';
import type { LocalProfile } from '../profile.js';
import { AVATAR_CHOICES } from '../profile.js';
import type { Difficulty } from '@leng/ai';

export type ModeSelection =
  | { kind: 'practice'; difficulty: Difficulty; playerCount: number }
  | { kind: 'passplay'; playerCount: number }
  | { kind: 'online' }
  | { kind: 'profile' };

export function HomeScreen({
  profile,
  onSelect,
  onRename,
  onAvatar,
}: {
  profile: LocalProfile;
  onSelect: (mode: ModeSelection) => void;
  onRename: (name: string) => void;
  onAvatar: (avatar: string) => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [practiceCount, setPracticeCount] = useState(4);
  const [passCount, setPassCount] = useState(4);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);

  return (
    <div className="screen home">
      <header className="home-header">
        <h1 className="logo">
          LENG <span className="logo-sub">🐉 Kartu Tradisional Sumatera Utara</span>
        </h1>
        <button className="profile-chip" onClick={() => onSelect({ kind: 'profile' })}>
          <span className="avatar">{profile.avatar}</span>
          <span>{profile.name}</span>
          <span className="profile-stats-chip">
            {profile.matchesWon}/{profile.matchesPlayed} menang
          </span>
        </button>
      </header>

      <div className="mode-grid">
        <button className="mode-card" onClick={() => onSelect({ kind: 'practice', difficulty, playerCount: practiceCount })}>
          <span className="mode-icon">🤖</span>
          <h2>Latihan</h2>
          <p>Main melawan AI, tanpa internet.</p>
          <div className="mode-options" onClick={(e) => e.stopPropagation()}>
            <label>
              Level:
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                <option value="easy">Mudah</option>
                <option value="normal">Normal</option>
                <option value="hard">Sulit</option>
              </select>
            </label>
            <label>
              Pemain:
              <select value={practiceCount} onChange={(e) => setPracticeCount(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </button>

        <button className="mode-card" onClick={() => onSelect({ kind: 'passplay', playerCount: passCount })}>
          <span className="mode-icon">🤝</span>
          <h2>Bergantian (Satu Perangkat)</h2>
          <p>Beberapa pemain berbagi satu layar.</p>
          <div className="mode-options" onClick={(e) => e.stopPropagation()}>
            <label>
              Pemain:
              <select value={passCount} onChange={(e) => setPassCount(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </button>

        <button className="mode-card" onClick={() => onSelect({ kind: 'online' })}>
          <span className="mode-icon">🌐</span>
          <h2>Online</h2>
          <p>Buat room privat, gabung kode room, atau matchmaking publik.</p>
        </button>
      </div>

      <section className="rules-summary">
        <h3>Cara main singkat</h3>
        <ul>
          <li>Putaran 1: buka <strong>run 3+ kartu</strong> dengan gambar sama. Tidak bisa? Kamu istirahat sampai deal selesai.</li>
          <li>Putaran berikutnya: buka run/set (POK) baru atau tambahkan ke kombinasi di meja.</li>
          <li>Joker &amp; As Sekop adalah kartu liar untuk run.</li>
          <li>Habiskan kartumu duluan dan teriakkan <strong>LENG!</strong> — sisa kartu lawan jadi poin penalti.</li>
        </ul>
      </section>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Profil</h3>
            <label className="field">
              Nama
              <input value={nameDraft} maxLength={24} onChange={(e) => setNameDraft(e.target.value)} />
            </label>
            <div className="avatar-row">
              {AVATAR_CHOICES.map((a) => (
                <button
                  key={a}
                  className={`avatar-choice ${a === profile.avatar ? 'avatar-active' : ''}`}
                  onClick={() => onAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                Tutup
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  onRename(nameDraft.trim() || 'Pemain');
                  setEditing(false);
                }}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
