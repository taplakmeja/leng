import { useEffect, useState } from 'react';
import type { OnlineController } from '../controllers/online.js';

export function LobbyScreen({
  client,
  onEnterGame,
  onExit,
}: {
  client: OnlineController;
  onEnterGame: () => void;
  onExit: () => void;
}) {
  const [, force] = useState(0);
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => client.subscribe(() => force((n) => n + 1)), [client]);
  useEffect(() => () => client.dispose(), [client]);

  const room = client.room;
  const inRoom = room !== null;
  const inGame = room?.inGame ?? false;

  useEffect(() => {
    if (inGame) onEnterGame();
  }, [inGame, onEnterGame]);

  return (
    <div className="screen lobby">
      <header className="game-header">
        <button className="btn btn-ghost" onClick={onExit}>
          ← Menu
        </button>
        <h1>Lobi Online</h1>
        <span className={`conn ${client.connected ? 'conn-on' : 'conn-off'}`}>
          {client.connected ? '● tersambung' : '○ menyambungkan…'}
        </span>
      </header>

      {!inRoom ? (
        <div className="lobby-actions">
          <button className="btn btn-primary btn-lg" onClick={() => client.createRoom(true)}>
            Buat Room Privat
          </button>
          <div className="join-box">
            <input
              placeholder="KODE ROOM"
              value={roomCode}
              maxLength={5}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="room-code-input"
            />
            <button
              className="btn btn-secondary btn-lg"
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
            </button>
          </div>
          <button className="btn btn-secondary btn-lg" onClick={() => client.quickMatch()}>
            Matchmaking Publik
          </button>
          {joinError && <p className="error-toast">{joinError}</p>}
          {client.lastError() && <p className="error-toast">{client.lastError()}</p>}
        </div>
      ) : (
        <div className="room-panel">
          <div className="room-code-big">
            <span className="room-code-label">Kode Room</span>
            <span className="room-code">{room.code}</span>
            <button
              className="btn btn-ghost"
              onClick={() => navigator.clipboard?.writeText(room.code)}
            >
              Salin
            </button>
          </div>
          <p className="room-privacy">{room.isPrivate ? '🔒 Privat — bagikan kode ke temanmu' : '🌐 Publik'}</p>
          <ul className="seat-list">
            {client.seats.map((s) => (
              <li key={s.id}>
                <span>{s.isAI ? '🤖' : '👤'} {s.name}</span>
                <span className="seat-tags">
                  {s.isHost && <em className="badge badge-host">host</em>}
                  {s.isAI && <em className="badge">bot</em>}
                  {!s.connected && !s.isAI && <em className="badge badge-out">terputus</em>}
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
              <button className="btn btn-secondary" onClick={() => client.addAI('easy')}>
                + Bot Mudah
              </button>
              <button className="btn btn-secondary" onClick={() => client.addAI('normal')}>
                + Bot Normal
              </button>
              <button className="btn btn-secondary" onClick={() => client.addAI('hard')}>
                + Bot Sulit
              </button>
            </div>
          )}
          <div className="lobby-start">
            {client.youAreHost ? (
              <button
                className="btn btn-primary btn-lg"
                disabled={client.seats.length < 4}
                onClick={() => client.start()}
              >
                Mulai {client.seats.length < 4 ? `(butuh ${4 - client.seats.length} lagi)` : ''}
              </button>
            ) : (
              <p>Menunggu host memulai…</p>
            )}
            <button className="btn btn-ghost" onClick={() => client.leaveRoom()}>
              Tinggalkan room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
