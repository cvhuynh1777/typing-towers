const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function getOther(room, ws) {
  return room.players.find(p => p !== ws);
}

wss.on('connection', (ws) => {
  ws.roomCode = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case 'create_room': {
        let code;
        do { code = generateRoomCode(); } while (rooms.has(code));
        rooms.set(code, { players: [ws], started: false });
        ws.roomCode = code;
        ws.playerIndex = 0;
        send(ws, { type: 'room_created', code });
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found.' });
          return;
        }
        if (room.players.length >= 2) {
          send(ws, { type: 'error', message: 'Room is full.' });
          return;
        }
        if (room.players[0] === ws) {
          send(ws, { type: 'error', message: 'Cannot join your own room.' });
          return;
        }
        room.players.push(ws);
        ws.roomCode = code;
        ws.playerIndex = 1;
        room.started = true;
        send(room.players[0], { type: 'game_start', playerIndex: 0 });
        send(room.players[1], { type: 'game_start', playerIndex: 1 });
        break;
      }

      case 'fire': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const other = getOther(room, ws);
        if (other) send(other, { type: 'incoming', floor: msg.floor, attackType: msg.attackType });
        break;
      }

      case 'i_lost': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const other = getOther(room, ws);
        if (other) send(other, { type: 'you_won' });
        break;
      }

      case 'player_info': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const other = getOther(room, ws);
        if (other) send(other, { type: 'opponent_info', username: msg.username });
        break;
      }

      case 'rematch_ready': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        if (!room.rematch) room.rematch = new Set();
        room.rematch.add(ws);
        if (room.rematch.size >= 2) {
          room.rematch.clear();
          send(room.players[0], { type: 'rematch_start' });
          send(room.players[1], { type: 'rematch_start' });
        } else {
          send(ws, { type: 'rematch_waiting' });
        }
        break;
      }

      case 'ping':
        send(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const other = getOther(room, ws);
    if (other) send(other, { type: 'opponent_left' });
    rooms.delete(ws.roomCode);
  });

  ws.on('error', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Typing Towers running at http://localhost:${PORT}`);
});
