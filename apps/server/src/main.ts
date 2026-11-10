import { createServer } from 'node:http';
import { GameServer } from './server.js';

const PORT = Number(process.env.PORT ?? 8080);

const http = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, game: 'leng', time: Date.now() }));
});

const gameServer = new GameServer({ dataDir: process.env.LENG_DATA_DIR });
http.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) {
    gameServer.handleUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

http.listen(PORT, () => {
  console.log(`Leng server listening on ws://0.0.0.0:${PORT}/ws`);
});
