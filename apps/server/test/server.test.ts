import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { GameServer } from '../src/server.js';
import type { ServerMessage } from '../src/server.js';
import type { PlayerView } from '@leng/engine';

interface TestClient {
  ws: WebSocket;
  messages: ServerMessage[];
  waitFor: (pred: (m: ServerMessage) => boolean, timeoutMs?: number) => Promise<ServerMessage>;
}

let httpServer: ReturnType<typeof createServer>;
let gameServer: GameServer;
let url: string;
const clients: WebSocket[] = [];

function connect(): Promise<TestClient> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    clients.push(ws);
    const messages: ServerMessage[] = [];
    const waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      messages.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i]!.pred(msg)) {
          waiters[i]!.resolve(msg);
          waiters.splice(i, 1);
        }
      }
    });
    ws.on('open', () => {
      resolve({
        ws,
        messages,
        waitFor: (pred, timeoutMs = 4000) =>
          new Promise((res, rej) => {
            const found = messages.find(pred);
            if (found) return res(found);
            const timer = setTimeout(() => rej(new Error('waitFor timeout')), timeoutMs);
            waiters.push({
              pred: (m) => {
                if (pred(m)) {
                  clearTimeout(timer);
                  res(m);
                  return true;
                }
                return false;
              },
              resolve: () => {},
            });
          }),
      });
    });
  });
}

function send(client: TestClient, msg: Record<string, unknown>): void {
  client.ws.send(JSON.stringify(msg));
}

async function hello(name: string): Promise<TestClient> {
  const client = await connect();
  send(client, { type: 'hello', name });
  await client.waitFor((m) => m.type === 'welcome');
  return client;
}

let welcomeCount = 0;
beforeEach(async () => {
  welcomeCount = 0;
  httpServer = createServer(() => {});
  gameServer = new GameServer({ reconnectGraceMs: 200, emptyRoomTtlMs: 60_000 });
  httpServer.on('upgrade', (req, socket, head) => gameServer.handleUpgrade(req, socket, head));
  await new Promise<void>((res) => httpServer.listen(0, () => res()));
  const port = (httpServer.address() as { port: number }).port;
  url = `ws://127.0.0.1:${port}/ws`;
});

afterEach(() => {
  for (const ws of clients) ws.close();
  clients.length = 0;
  httpServer.close();
});

describe('online multiplayer server', () => {
  it('issues identities and lets a host create a room with bots and start', async () => {
    const host = await hello('Host');
    const welcome = host.messages.find((m) => m.type === 'welcome')!;
    expect(welcome.type === 'welcome' && welcome.playerId).toBeTruthy();
    expect(welcome.type === 'welcome' && welcome.token).toBeTruthy();

    send(host, { type: 'createRoom', isPrivate: true, capacity: 4 });
    const room = await host.waitFor((m) => m.type === 'room');
    expect(room.type === 'room' && room.youAreHost).toBe(true);
    const code = room.type === 'room' ? room.room.code : '';

    send(host, { type: 'addAI', difficulty: 'normal' });
    send(host, { type: 'addAI', difficulty: 'normal' });
    send(host, { type: 'addAI', difficulty: 'normal' });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 4);

    send(host, { type: 'start' });
    const view = await host.waitFor((m) => m.type === 'view');
    expect(view.type === 'view' && view.view.you.hand.length).toBe(24);
    void code;
  });

  it('gives each player a different private hand and never leaks others cards', async () => {
    const host = await hello('A');
    const guest = await hello('B');
    send(host, { type: 'createRoom', isPrivate: true, capacity: 4 });
    const roomMsg = await host.waitFor((m) => m.type === 'room');
    const code = roomMsg.type === 'room' ? roomMsg.room.code : '';

    send(guest, { type: 'joinRoom', code });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 2);
    await guest.waitFor((m) => m.type === 'room');

    send(host, { type: 'addAI', difficulty: 'easy' });
    send(host, { type: 'addAI', difficulty: 'easy' });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 4);

    send(host, { type: 'start' });
    const v1 = (await host.waitFor((m) => m.type === 'view')) as { type: 'view'; view: PlayerView };
    const v2 = (await guest.waitFor((m) => m.type === 'view')) as { type: 'view'; view: PlayerView };
    expect(v1.view.you.hand.length).toBe(24);
    expect(v2.view.you.hand.length).toBe(24);
    const ids1 = new Set(v1.view.you.hand.map((c) => c.id));
    const ids2 = new Set(v2.view.you.hand.map((c) => c.id));
    expect([...ids1].filter((id) => ids2.has(id))).toHaveLength(0);
    const json2 = JSON.stringify(v2);
    for (const id of ids1) expect(json2).not.toContain(id);
  });

  it('rejects out-of-turn and unauthorized actions', async () => {
    const host = await hello('A');
    const guest = await hello('B');
    send(host, { type: 'createRoom', isPrivate: true, capacity: 4 });
    const roomMsg = await host.waitFor((m) => m.type === 'room');
    const code = roomMsg.type === 'room' ? roomMsg.room.code : '';
    send(guest, { type: 'joinRoom', code });
    await guest.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 2);
    send(host, { type: 'addAI', difficulty: 'easy' });
    send(host, { type: 'addAI', difficulty: 'easy' });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 4);
    send(host, { type: 'start' });
    await host.waitFor((m) => m.type === 'view');
    await guest.waitFor((m) => m.type === 'view');

    send(guest, { type: 'action', move: { type: 'pass' } });
    const err = await guest.waitFor((m) => m.type === 'error');
    expect(err.type === 'error' && err.message).toMatch(/turn|dropped/i);
  });

  it('handles concurrent actions from two players without corruption', async () => {
    const host = await hello('A');
    const guest = await hello('B');
    send(host, { type: 'createRoom', isPrivate: true, capacity: 4 });
    const roomMsg = await host.waitFor((m) => m.type === 'room');
    const code = roomMsg.type === 'room' ? roomMsg.room.code : '';
    send(guest, { type: 'joinRoom', code });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 2);
    send(host, { type: 'addAI', difficulty: 'easy' });
    send(host, { type: 'addAI', difficulty: 'easy' });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 4);
    send(host, { type: 'start' });
    await host.waitFor((m) => m.type === 'view');
    await guest.waitFor((m) => m.type === 'view');

    const marker = host.messages.length;
    send(host, { type: 'action', move: { type: 'pass' } });
    send(host, { type: 'action', move: { type: 'pass' } });
    await new Promise((r) => setTimeout(r, 300));
    const errors = host.messages.slice(marker).filter((m) => m.type === 'error');
    expect(errors).toHaveLength(1);
  });

  it('supports reconnection with state recovery', async () => {
    const host = await hello('A');
    const guest = await hello('B');
    send(host, { type: 'createRoom', isPrivate: true, capacity: 4 });
    const roomMsg = await host.waitFor((m) => m.type === 'room');
    const code = roomMsg.type === 'room' ? roomMsg.room.code : '';
    send(guest, { type: 'joinRoom', code });
    await guest.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 2);
    send(host, { type: 'addAI', difficulty: 'easy' });
    send(host, { type: 'addAI', difficulty: 'easy' });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 4);
    send(host, { type: 'start' });
    const v1 = (await guest.waitFor((m) => m.type === 'view')) as { type: 'view'; view: PlayerView };
    const welcome = guest.messages.find((m) => m.type === 'welcome')!;
    const { playerId, token } = welcome as { playerId: string; token: string };

    guest.ws.close();
    await new Promise((r) => setTimeout(r, 60));

    const reconnected = await connect();
    send(reconnected, { type: 'hello', playerId, token, name: 'B' });
    const welcome2 = await reconnected.waitFor((m) => m.type === 'welcome');
    expect(welcome2.type === 'welcome' && welcome2.playerId).toBe(playerId);
    const roomBack = await reconnected.waitFor((m) => m.type === 'room');
    expect(roomBack.type === 'room' && roomBack.room.code).toBe(code);
    const viewBack = (await reconnected.waitFor((m) => m.type === 'view')) as { type: 'view'; view: PlayerView };
    expect(viewBack.view.you.hand.map((c) => c.id)).toEqual(v1.view.you.hand.map((c) => c.id));
  });

  it('auto-plays for timed-out players and finishes matches', async () => {
    const host = await hello('A');
    send(host, { type: 'createRoom', isPrivate: true, capacity: 4 });
    await host.waitFor((m) => m.type === 'room');
    send(host, { type: 'addAI', difficulty: 'easy' });
    send(host, { type: 'addAI', difficulty: 'easy' });
    send(host, { type: 'addAI', difficulty: 'easy' });
    await host.waitFor((m) => m.type === 'room' && m.type === 'room' && m.seats.length === 4);
    send(host, { type: 'start', config: { turnTimeoutMs: 40, turnTimeoutAction: 'autoPlay' } });
    const finished = await host.waitFor((m) => m.type === 'matchFinished', 15000);
    expect(finished.type === 'matchFinished' && finished.result.players).toHaveLength(4);
    send(host, { type: 'getHistory' });
    const history = await host.waitFor((m) => m.type === 'history');
    expect(history.type).toBe('history');
    expect((history as { matches: unknown[] }).matches.length).toBeGreaterThan(0);
  }, 20000);
});
