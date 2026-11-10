import { useEffect, useMemo, useState } from 'react';
import type { Play, PlayerView } from '@leng/engine';
import { validatePlayOnView } from '@leng/engine';
import type { GamePresenter } from '../controllers/local.js';
import { PlayingCard } from './PlayingCard.js';
import { interpretSelection, sortHand } from '../selection.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function ordinalLabel(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 14) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}


export function GameScreen({
  presenter,
  onExit,
  onMatchRecorded,
  playerName,
}: {
  presenter: GamePresenter;
  onExit: () => void;
  onMatchRecorded?: (view: PlayerView) => void;
  playerName: string;
}) {
  const [, force] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmPass, setConfirmPass] = useState(false);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => presenter.subscribe(() => force((n) => n + 1)), [presenter]);

  const view = presenter.snapshot();
  const hot = presenter.hotSeat();
  const isMyTurn = view?.you.isYourTurn === true && (!hot || hot.phase === 'playing');
  const handOrder = useMemo(() => (view ? sortHand(view) : []), [view]);
  const candidates = useMemo(
    () => (view && isMyTurn ? interpretSelection(view, selected) : []),
    [view, selected, isMyTurn],
  );
  const activePlay = candidates[0] ?? null;
  const round1 = view?.firstRoundActive ?? false;

  useEffect(() => {
    if (view && (view.phase === 'dealOver' || view.phase === 'matchOver') && !recorded && onMatchRecorded) {
      setRecorded(true);
      onMatchRecorded(view);
    }
  }, [view, recorded, onMatchRecorded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && activePlay) presenter.play([activePlay]);
      if (e.key.toLowerCase() === 'p' && isMyTurn) setConfirmPass(true);
      if (e.key === 'Escape') setSelected([]);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        setSelected((cur) => {
          if (cur.length === 0) {
            const idx = dir > 0 ? 0 : handOrder.length - 1;
            return handOrder[idx] ? [handOrder[idx]!] : [];
          }
          const first = cur[0]!;
          const idx = handOrder.indexOf(first);
          const next = handOrder[(idx + dir + handOrder.length) % handOrder.length];
          return next ? [next] : cur;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenter, activePlay, isMyTurn, handOrder]);

  const toggle = (id: string) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const opponents = view?.players.filter((p) => p.id !== view.you.id) ?? [];

  if (!view) {
    return (
      <div className="screen screen-center">
        <p className="muted">Menyambungkan…</p>
      </div>
    );
  }

  return (
    <div className="screen game-screen">
      <header className="game-header">
        <Button variant="ghost" onClick={onExit} aria-label="Keluar">
          ← Keluar
        </Button>
        <div className="game-title">
          <span className="deal-label">Deal {view.dealNumber}</span>
          <span className={`phase-label ${round1 ? 'phase-r1' : ''}`}>
            {round1 ? 'Putaran 1: buka run 3+ kartu' : 'Putaran bebas'}
          </span>
        </div>
        <Button variant="ghost" onClick={() => setShowHistory((s) => !s)}>
          Riwayat
        </Button>
      </header>

      <section className="opponents-row" aria-label="lawan">
        {opponents.map((p) => (
          <div
            key={p.id}
            className={`opponent ${p.isCurrentTurn ? 'opponent-turn' : ''} ${p.status !== 'active' ? 'opponent-out' : ''}`}
          >
            <div className="opponent-cards" aria-label={`${p.handCount} kartu`}>
              {Array.from({ length: Math.min(p.handCount, 10) }, (_, i) => (
                <PlayingCard key={i} card={{ id: `b${i}`, suit: 'JOKER', rank: 0 }} faceDown small />
              ))}
              {p.handCount > 10 && <span className="card-count">+{p.handCount - 10}</span>}
            </div>
            <div className="opponent-meta">
              <span className="opponent-name">
                {p.isAI ? '🤖 ' : '👤 '}
                {p.name}
              </span>
              <span className="opponent-count">{p.handCount} kartu</span>
              {p.status === 'droppedOut' && <Badge variant="outline">istirahat</Badge>}
              {p.status === 'leng' && <Badge>LENG!</Badge>}
              {p.penalty !== undefined && p.status !== 'leng' && (
                <Badge variant="secondary">{p.penalty} poin</Badge>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="table-area" aria-label="meja">
        {view.table.length === 0 ? (
          <div className="table-empty">Belum ada kartu di meja</div>
        ) : (
          view.table.map((group) => (
            <div key={group.id} className={`table-group group-${group.kind}`}>
              <span className="group-label">
                {group.kind === 'run'
                  ? `run ${group.suit === 'S' ? '♠' : group.suit === 'H' ? '♥' : group.suit === 'D' ? '♦' : '♣'}`
                  : `set ${ordinalLabel(group.rank)}`}
              </span>
              <div className="group-cards">
                {group.kind === 'run'
                  ? group.entries.map((e) => (
                      <PlayingCard
                        key={e.card.id}
                        card={e.card}
                        small
                        style={{ marginLeft: '-1.6rem' }}
                        animate="played"
                      />
                    ))
                  : group.cards.map((c, i) => (
                      <PlayingCard key={c.id} card={c} small style={{ marginLeft: i ? '-1.6rem' : 0 }} animate="played" />
                    ))}
              </div>
            </div>
          ))
        )}
      </section>

      {showHistory && (
        <aside className="history-panel">
          <h3>Riwayat</h3>
          <ul>
            {[...view.history].reverse().map((ev) => (
              <li key={ev.seq}>
                <span className="hist-detail">{ev.detail}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <section className="hand-area">
        <div className="score-strip">
          {view.players.map((p) => (
            <span key={p.id} className={p.id === view.you.id ? 'score-you' : ''}>
              {p.name}: {p.matchPenalty}
            </span>
          ))}
        </div>
        {presenter.lastError() && <div className="error-toast">{presenter.lastError()}</div>}
        {hot && hot.phase === 'handoff' ? (
          <div className="handoff">
            <p>Serukan perangkat ke</p>
            <h2>{view.players[hot.seat]?.name ?? playerName}</h2>
            <Button onClick={() => presenter.revealHand()}>Lihat Kartu Saya</Button>
          </div>
        ) : (
          <>
            <div className="hand-cards" role="listbox" aria-label="kartu di tangan">
              {handOrder.map((id) => {
                const card = view.you.hand.find((c) => c.id === id)!;
                return (
                  <PlayingCard
                    key={id}
                    card={card}
                    selected={selected.includes(id)}
                    dimmed={!isMyTurn}
                    onClick={isMyTurn ? () => toggle(id) : undefined}
                  />
                );
              })}
            </div>
            <div className="action-bar">
              <div className="play-hint">
                {round1
                  ? 'Pilih 3+ kartu berurutan dengan gambar sama untuk membuka run'
                  : 'Pilih kartu untuk run baru, set (POK), atau menambah kombinasi di meja'}
              </div>
              {candidates.length > 1 && (
                <div className="candidate-chips">
                  {candidates.map((c, i) => (
                    <button
                      key={i}
                      className={`chip ${i === 0 ? 'chip-active' : ''}`}
                      onClick={() => {
                        const reordered = [c, ...candidates.filter((x) => x !== c)];
                        candidates.splice(0, candidates.length, ...reordered);
                        force((n) => n + 1);
                      }}
                    >
                      {describePlay(c)}
                    </button>
                  ))}
                </div>
              )}
              <div className="action-buttons">
                <Button
                  size="lg"
                  className="btn-lg-touch font-bold"
                  disabled={!activePlay}
                  onClick={() => activePlay && presenter.play([activePlay])}
                >
                  Mainkan
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="btn-lg-touch"
                  disabled={!isMyTurn}
                  onClick={() => setConfirmPass(true)}
                >
                  Pass
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <AlertDialog open={confirmPass} onOpenChange={setConfirmPass}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pass?</AlertDialogTitle>
            <AlertDialogDescription>
              Pass berarti kamu <strong>keluar dari deal ini</strong> dan sisa kartumu dihitung di
              akhir. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSelected([]);
                presenter.pass();
              }}
            >
              Ya, pass
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(view.phase === 'dealOver' || view.phase === 'matchOver') && (
        <ResultsOverlay view={view} presenter={presenter} onExit={onExit} />
      )}
    </div>
  );
}

function describePlay(play: Play): string {
  switch (play.kind) {
    case 'newRun':
      return `Run baru (${play.cardIds.length} kartu)`;
    case 'newSet':
      return `Set/POK baru (${play.cardIds.length} kartu)`;
    case 'extendRun':
      return 'Tambah ke run di meja';
    case 'extendSet':
      return 'Tambah ke set di meja';
  }
}

function ResultsOverlay({
  view,
  presenter,
  onExit,
}: {
  view: PlayerView;
  presenter: GamePresenter;
  onExit: () => void;
}) {
  const result = view.results[view.results.length - 1]!;
  const winner = view.players.find((p) => p.id === result.winnerId);
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="results sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{winner ? `${winner.name} — LENG! 🐉` : 'Deal selesai'}</DialogTitle>
          {view.phase === 'matchOver' && (
            <DialogDescription className="match-over">Pertandingan selesai</DialogDescription>
          )}
        </DialogHeader>
        <table className="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pemain</th>
              <th>Poin sisa</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {result.ranking.map((r) => {
              const p = view.players.find((x) => x.id === r.playerId)!;
              return (
                <tr key={r.playerId} className={r.place === 1 ? 'row-winner' : ''}>
                  <td>{r.place}</td>
                  <td>
                    {p.isAI ? '🤖 ' : '👤 '}
                    {p.name}
                  </td>
                  <td>{r.penalty ?? 0}</td>
                  <td>{p.matchPenalty}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="outline" onClick={onExit}>
            Keluar
          </Button>
          {view.phase === 'dealOver' && (
            <Button onClick={() => presenter.nextDeal()}>Deal berikutnya</Button>
          )}
          {view.phase === 'matchOver' && presenter.mode === 'online' && (
            <Button onClick={() => presenter.newMatch()}>Main lagi</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
