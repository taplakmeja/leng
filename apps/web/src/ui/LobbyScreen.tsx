import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OnlineController } from '../controllers/online.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function LobbyScreen({
  client,
  onExit,
}: {
  client: OnlineController;
  onExit: () => void;
}) {
  const navigate = useNavigate();
  const [, force] = useState(0);
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => client.subscribe(() => force((n) => n + 1)), [client]);

  const room = client.room;
  const inRoom = room !== null;
  const view = client.snapshot();
  const inGame = room?.inGame ?? false;

  useEffect(() => {
    if (inGame && view && (view.phase === 'round1' || view.phase === 'round2')) {
      navigate('/game/online');
    }
  }, [inGame, view, navigate]);

  return (
    <div className="screen lobby">
      <header className="game-header">
        <Button variant="ghost" onClick={onExit}>
          ← Menu
        </Button>
        <h1>Lobi Online</h1>
        <span className={`conn ${client.connected ? 'conn-on' : 'conn-off'}`}>
          {client.connected ? '● tersambung' : '○ menyambungkan…'}
        </span>
      </header>

      {!inRoom ? (
        <div className="lobby-actions">
          <Button size="lg" className="btn-lg-touch" onClick={() => client.createRoom(true)}>
            Buat Room Privat
          </Button>
          <div className="join-box">
            <Input
              placeholder="KODE ROOM"
              value={roomCode}
              maxLength={5}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="room-code-input"
            />
            <Button
              variant="secondary"
              size="lg"
              className="btn-lg-touch"
              onClick={() => {
                if (roomCode.length < 4) {
                  setJoinError('Kode room minimal 4 karakter');
                  return;
                }
                setJoinError(null);
                client.joinRoom(roomCode);
              }}
            >
              Gabung
            </Button>
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="btn-lg-touch"
            onClick={() => client.quickMatch()}
          >
            Matchmaking Publik
          </Button>
          {joinError && <p className="error-toast">{joinError}</p>}
          {client.lastError() && <p className="error-toast">{client.lastError()}</p>}
        </div>
      ) : (
        <Card className="room-panel">
          <CardHeader>
            <div className="room-code-big">
              <span className="room-code-label">Kode Room</span>
              <span className="room-code">{room.code}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard?.writeText(room.code)}
              >
                Salin
              </Button>
            </div>
            <p className="room-privacy">
              {room.isPrivate ? '🔒 Privat — bagikan kode ke temanmu' : '🌐 Publik'}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="seat-list">
              {client.seats.map((s) => (
                <li key={s.id}>
                  <span>{s.isAI ? '🤖' : '👤'} {s.name}</span>
                  <span className="seat-tags">
                    {s.isHost && <Badge>host</Badge>}
                    {s.isAI && <Badge variant="secondary">bot</Badge>}
                    {!s.connected && !s.isAI && <Badge variant="outline">terputus</Badge>}
                  </span>
                </li>
              ))}
              {Array.from({ length: Math.max(0, room.capacity - client.seats.length) }, (_, i) => (
                <li key={`empty-${i}`} className="seat-empty">
                  — slot kosong —
                </li>
              ))}
            </ul>
            {client.youAreHost && (
              <div className="host-tools">
                <Button variant="secondary" onClick={() => client.addAI('easy')}>
                  + Bot Mudah
                </Button>
                <Button variant="secondary" onClick={() => client.addAI('normal')}>
                  + Bot Normal
                </Button>
                <Button variant="secondary" onClick={() => client.addAI('hard')}>
                  + Bot Sulit
                </Button>
              </div>
            )}
            <div className="lobby-start">
              {client.youAreHost ? (
                <Button
                  size="lg"
                  className="btn-lg-touch"
                  disabled={client.seats.length < 4}
                  onClick={() => client.start()}
                >
                  Mulai {client.seats.length < 4 ? `(butuh ${4 - client.seats.length} lagi)` : ''}
                </Button>
              ) : (
                <p>Menunggu host memulai…</p>
              )}
              <Button variant="ghost" onClick={() => client.leaveRoom()}>
                Tinggalkan room
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
