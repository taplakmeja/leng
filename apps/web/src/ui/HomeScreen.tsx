import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Difficulty } from '@leng/ai';
import type { LocalProfile } from '../profile.js';
import { AVATAR_CHOICES } from '../profile.js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PLAYER_COUNTS = [2, 3, 4, 5, 6];

export function HomeScreen({
  profile,
  onRename,
  onAvatar,
}: {
  profile: LocalProfile;
  onRename: (name: string) => void;
  onAvatar: (avatar: string) => void;
}) {
  const navigate = useNavigate();
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
        <Button variant="ghost" className="profile-chip" onClick={() => navigate('/profile')}>
          <span className="avatar">{profile.avatar}</span>
          <span>{profile.name}</span>
          <span className="profile-stats-chip">
            {profile.matchesWon}/{profile.matchesPlayed} menang
          </span>
        </Button>
      </header>

      <div className="mode-grid">
        <Card
          className="mode-card"
          onClick={() => navigate(`/game/practice?difficulty=${difficulty}&players=${practiceCount}`)}
        >
          <CardHeader>
            <span className="mode-icon">🤖</span>
            <CardTitle>Latihan</CardTitle>
            <CardDescription>Main melawan AI, tanpa internet.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mode-options" onClick={(e) => e.stopPropagation()}>
              <Label className="mode-label">
                Level:
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Mudah</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="hard">Sulit</SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Label className="mode-label">
                Pemain:
                <Select
                  value={String(practiceCount)}
                  onValueChange={(v) => setPracticeCount(Number(v))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAYER_COUNTS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card
          className="mode-card"
          onClick={() => navigate(`/game/passplay?players=${passCount}`)}
        >
          <CardHeader>
            <span className="mode-icon">🤝</span>
            <CardTitle>Bergantian (Satu Perangkat)</CardTitle>
            <CardDescription>Beberapa pemain berbagi satu layar.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mode-options" onClick={(e) => e.stopPropagation()}>
              <Label className="mode-label">
                Pemain:
                <Select value={String(passCount)} onValueChange={(v) => setPassCount(Number(v))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAYER_COUNTS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card className="mode-card" onClick={() => navigate('/lobby')}>
          <CardHeader>
            <span className="mode-icon">🌐</span>
            <CardTitle>Online</CardTitle>
            <CardDescription>Buat room privat, gabung kode room, atau matchmaking publik.</CardDescription>
          </CardHeader>
        </Card>
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

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profil</DialogTitle>
            <DialogDescription>Ubah nama dan avatar kamu.</DialogDescription>
          </DialogHeader>
          <div className="field">
            <Label htmlFor="player-name">Nama</Label>
            <Input
              id="player-name"
              value={nameDraft}
              maxLength={24}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </div>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Tutup
            </Button>
            <Button
              onClick={() => {
                onRename(nameDraft.trim() || 'Pemain');
                setEditing(false);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
