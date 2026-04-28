# Typing Towers

A fast-paced multiplayer typing game. Type falling words to launch attacks — arrows, catapults, and cannon fire — and destroy your opponent's tower before they destroy yours.

## Play

Live on [CrazyGames](https://www.crazygames.com)

## How it works

- Words fall on your side of the screen — type the first letter to lock on, finish it to fire
- The height of the word when you complete it determines which floor gets hit
- Short words = arrows, medium = catapult, long phrases = 2× damage cannon
- Play solo against a bot or challenge a friend online with a room code

## Tech

- Frontend: HTML5 Canvas, Web Audio API
- Backend: Node.js + WebSocket (`ws`) for multiplayer
- Deployed on Railway

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
