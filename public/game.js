'use strict';

// ── Canvas / Tower constants ────────────────────────────────────────────────

const CW = 1000;
const CH = 570;
const TW = 78;
const TH = 420;
const TY = 68;
const FLOORS = 8;
const FH = TH / FLOORS;
const FLOOR_HP = 2;

const MY_TX  = 18;
const OPP_TX = CW - 18 - TW;

const WORD_MIN_CX     = MY_TX + TW + 60;
const WORD_MAX_CX     = CW / 2 - 20;
const BOT_WORD_MIN_CX = CW / 2 + 20;
const BOT_WORD_MAX_CX = OPP_TX - 40;

// ── Word lists ──────────────────────────────────────────────────────────────

const WORDS_SHORT = [
  'bow', 'axe', 'gun', 'mace', 'dart', 'bolt', 'shot',
  'run', 'cat', 'dog', 'sun', 'sky', 'box', 'top', 'red', 'big',
  'hot', 'cut', 'hit', 'set', 'fly', 'war', 'map', 'arm', 'net',
  'fog', 'log', 'rod', 'orb', 'gem', 'sap', 'tar',
];

const WORDS_MEDIUM = [
  'castle', 'dragon', 'battle', 'shield', 'charge', 'forest', 'bridge',
  'attack', 'defend', 'portal', 'shadow', 'turret', 'cannon', 'barrel',
  'falcon', 'empire', 'throne', 'shatter', 'rampage', 'blizzard',
  'rocket', 'planet', 'market', 'garden', 'bottle', 'winter', 'summer',
  'silver', 'golden', 'danger', 'anchor', 'jungle', 'desert', 'frozen',
  'broken', 'stolen', 'hidden', 'rising', 'falling', 'burning', 'shining',
  'vortex', 'goblin', 'mystic', 'wizard', 'ranger', 'archer', 'knight',
];

const WORDS_LONG = [
  'fire at will', 'storm the gates', 'hold the line', 'break the walls',
  'rain of arrows', 'full force ahead', 'light the fuse', 'man the cannons',
  'brace for impact', 'take no prisoners', 'breach the walls',
  'destroy the tower', 'burning arrows', 'heavy bombardment',
  'siege engines', 'catapult stones', 'charge the gates',
  'open fire now', 'unleash the beast', 'bring down the wall',
];

const ALL_WORDS = [...WORDS_SHORT, ...WORDS_MEDIUM, ...WORDS_LONG];

// ── Attack types ────────────────────────────────────────────────────────────

const ATTACKS = {
  arrow: {
    damage: 1, speed: 1.55, arc: 0,
    projSize: 5, trailLen: 10,
    color: '#88ccff', trailRgb: '100,190,255',
    borderColor: '#3399dd', effectScale: 0.6,
    label: '→  ARROW', desc: 'fast & straight',
  },
  volley: {
    damage: 1, speed: 0.68, arc: 60,
    projSize: 9, trailLen: 14,
    color: '#ffbb33', trailRgb: '255,175,40',
    borderColor: '#dd8811', effectScale: 1.0,
    label: '⌒  CATAPULT', desc: 'arcing shot',
  },
  cannon: {
    damage: 2, speed: 0.40, arc: 155,
    projSize: 14, trailLen: 18,
    color: '#ee3366', trailRgb: '210,55,90',
    borderColor: '#bb1144', effectScale: 1.9,
    label: '☄  CANNON', desc: 'mortar lob, 2× dmg',
    shake: true,
  },
};

function getAttackType(text) {
  if (text.includes(' ')) return 'cannon';
  if (text.length <= 4)   return 'arrow';
  return 'volley';
}

// ── Bot difficulty ──────────────────────────────────────────────────────────

const DIFFICULTY = {
  // targetingSkill: 0=random, 1=prefers non-top floors, 2=full precision (damaged → non-top → any)
  // minPickY: don't grab a word until it has fallen this far (ensures it fires into a real floor zone)
  easy:   { typingSpeed: 2.2, spawnInterval: 3.5, thinkMax: 0.5,  targetingSkill: 0, minPickY: TY,             pool: [...WORDS_SHORT, ...WORDS_MEDIUM.slice(0, 12)] },
  medium: { typingSpeed: 4.6, spawnInterval: 2.6, thinkMax: 0.35, targetingSkill: 1, minPickY: TY + FH,       pool: ALL_WORDS },
  hard:   { typingSpeed: 10,  spawnInterval: 1.4, thinkMax: 0.18, targetingSkill: 2, minPickY: TY,            pool: ALL_WORDS },
};

// ── Sound Manager (Web Audio API — no files needed) ─────────────────────────

class SoundManager {
  constructor() {
    this._ac  = null;
    this.enabled = true;
  }

  toggle() { this.enabled = !this.enabled; }

  _ctx() {
    if (!this._ac) {
      try { this._ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { this.enabled = false; }
    }
    if (this._ac && this._ac.state === 'suspended') this._ac.resume();
    return this._ac;
  }

  _osc(type, freq, vol, dur, freqEnd) {
    const ac = this._ctx(); if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type;
    const t = ac.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  }

  _noise(cutoff, vol, dur) {
    const ac = this._ctx(); if (!ac) return;
    const size = Math.ceil(ac.sampleRate * dur);
    const buf  = ac.createBuffer(1, size, ac.sampleRate);
    const d    = buf.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ac.createGain();
    const t = ac.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(t); src.stop(t + dur);
  }

  keyClick()  { if (!this.enabled) return; this._osc('square', 1100, 0.06, 0.03, 420); }
  wrongKey()  { if (!this.enabled) return; this._osc('square', 160, 0.09, 0.10, 80); }
  wordLost()  { if (!this.enabled) return; this._osc('sine', 420, 0.10, 0.22, 140); }
  uiClick()   { if (!this.enabled) return; this._osc('sine', 660, 0.07, 0.08, 880); }

  fire(atk) {
    if (!this.enabled) return;
    if (atk === 'arrow') {
      this._osc('sawtooth', 320, 0.11, 0.14, 1800);
    } else if (atk === 'volley') {
      this._osc('sine', 220, 0.18, 0.28, 520);
      setTimeout(() => this._osc('square', 440, 0.05, 0.10, 200), 40);
    } else {
      // cannon — big boom launch
      this._osc('sawtooth', 170, 0.35, 0.50, 35);
      this._noise(350, 0.25, 0.40);
    }
  }

  impact(atk) {
    if (!this.enabled) return;
    if (atk === 'arrow') {
      this._noise(3000, 0.14, 0.08);
    } else if (atk === 'volley') {
      this._noise(700, 0.28, 0.20);
      this._osc('sine', 110, 0.10, 0.18, 50);
    } else {
      // cannon — kaboom
      this._noise(400, 0.50, 0.45);
      this._osc('sawtooth', 65, 0.22, 0.55, 18);
    }
  }

  victory() {
    if (!this.enabled) return;
    [523, 659, 784, 1047].forEach((hz, i) => {
      setTimeout(() => this._osc('sine', hz, 0.25, 0.30), i * 140);
    });
  }

  defeat() {
    if (!this.enabled) return;
    [392, 311, 261].forEach((hz, i) => {
      setTimeout(() => this._osc('sawtooth', hz, 0.14, 0.38), i * 210);
    });
  }
}

const Sound = new SoundManager();

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function yToFloor(y)        { return clamp(Math.floor((y - TY) / FH), 0, FLOORS - 1); }
function floorCenterY(floor) { return TY + floor * FH + FH / 2; }

// ── Tutorial ────────────────────────────────────────────────────────────────

class Tutorial {
  constructor(isSolo) {
    this.isSolo   = isSolo;
    this.step     = 0;
    this.age      = 0;
    this.active   = true;
    // solo = 3 steps; multiplayer = 1 quick tip that auto-expires
    this.maxSteps = isSolo ? 3 : 1;
  }

  advance() {
    this.step++;
    this.age = 0;
    if (this.step >= this.maxSteps) this.active = false;
  }

  update(dt) {
    if (!this.active) return;
    this.age += dt;
    if (!this.isSolo && this.age > 2.8) this.active = false;
  }

  // Returns true if the key was consumed by the tutorial
  handleKey(key) {
    if (!this.active) return false;
    this.advance();
    Sound.uiClick();
    return true;
  }

  draw(ctx) {
    if (!this.active) return;
    const t = this.age;

    // Dim entire canvas
    ctx.fillStyle = 'rgba(0,0,15,0.80)';
    ctx.fillRect(0, 0, CW, CH);

    if (!this.isSolo) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px Courier New';
      ctx.fillStyle = '#88ccff';
      ctx.fillText('Type words on your side to attack!', CW / 2, CH / 2 - 16);
      ctx.font = '15px Courier New';
      ctx.fillStyle = '#445566';
      ctx.fillText('Press any key when ready', CW / 2, CH / 2 + 20);
      return;
    }

    // Card
    const cw = 580, ch = 295;
    const cx = (CW - cw) / 2, cy = (CH - ch) / 2 - 15;
    ctx.fillStyle = 'rgba(6,10,28,0.97)';
    rrect(ctx, cx, cy, cw, ch, 14); ctx.fill();
    ctx.strokeStyle = '#1e3a88';
    ctx.lineWidth   = 2;
    rrect(ctx, cx, cy, cw, ch, 14); ctx.stroke();

    // Progress dots
    for (let i = 0; i < this.maxSteps; i++) {
      ctx.beginPath();
      ctx.arc(CW / 2 + (i - 1) * 20, cy + 22, 5, 0, Math.PI * 2);
      ctx.fillStyle = i === this.step ? '#4477dd' : '#192840';
      ctx.fill();
    }

    const mid = CW / 2;

    if (this.step === 0) {
      // ── Step 1: Lock on ──
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px Courier New';
      ctx.fillStyle = '#aaccff';
      ctx.fillText('Lock On', mid, cy + 62);

      ctx.font = '14px Courier New';
      ctx.fillStyle = '#667888';
      ctx.fillText('Type the FIRST LETTER of a falling word to target it,', mid, cy + 92);
      ctx.fillText('then type the rest to fire.', mid, cy + 112);

      // Animated demo word
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
      ctx.font = 'bold 16px Courier New';
      const demoWord = 'castle';
      const firstChar = 'c', rest = 'astle';
      const fw = ctx.measureText(demoWord).width + 16;
      const dx = mid - fw / 2, dy = cy + 148;
      ctx.fillStyle = 'rgba(0,25,55,0.9)';
      rrect(ctx, dx, dy, fw, 32, 5); ctx.fill();
      // orange strip = catapult word
      ctx.fillStyle = '#dd8811';
      rrect(ctx, dx, dy, fw, 4, 2); ctx.fill();
      ctx.strokeStyle = `rgba(80,180,255,${0.35 + pulse * 0.65})`;
      ctx.lineWidth = 2;
      rrect(ctx, dx, dy, fw, 32, 5); ctx.stroke();
      // First letter pulses bright
      ctx.textAlign = 'left';
      ctx.fillStyle = `rgba(100,230,160,${0.55 + pulse * 0.45})`;
      ctx.fillText(firstChar, dx + 8, dy + 22);
      ctx.fillStyle = '#667799';
      ctx.fillText(rest, dx + 8 + ctx.measureText(firstChar).width, dy + 22);

      // Bouncing arrow above
      const bounce = Math.sin(t * 3) * 5;
      ctx.fillStyle = `rgba(80,160,255,${0.5 + pulse * 0.5})`;
      ctx.font = '18px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('▼', mid, dy - 8 + bounce);

    } else if (this.step === 1) {
      // ── Step 2: Attack types ──
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px Courier New';
      ctx.fillStyle = '#ffcc44';
      ctx.fillText('Three Attack Types', mid, cy + 58);

      ctx.font = '13px Courier New';
      ctx.fillStyle = '#667888';
      ctx.fillText('Word length decides your weapon.', mid, cy + 84);
      ctx.fillText('Height when you finish = which floor gets hit.', mid, cy + 102);

      // Three boxes — fixed width, evenly spaced inside the card
      const types = [
        { word: 'gun',          color: '#3399dd', label: '→ ARROW',    sub: 'short · 1 dmg' },
        { word: 'castle',       color: '#dd8811', label: '⌒ CATAPULT', sub: 'medium · 1 dmg' },
        { word: 'fire at will', color: '#bb1144', label: '☄ CANNON',   sub: 'phrase · 2 dmg' },
      ];
      const bw = 130, bh = 34, gap = 20;
      const totalW = types.length * bw + (types.length - 1) * gap;
      const startBx = mid - totalW / 2;

      types.forEach(({ word, color, label, sub }, i) => {
        const bx = startBx + i * (bw + gap);
        const by = cy + 126;

        ctx.fillStyle = 'rgba(0,18,45,0.9)';
        rrect(ctx, bx, by, bw, bh, 5); ctx.fill();
        ctx.fillStyle = color;
        rrect(ctx, bx, by, bw, 4, 2); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        rrect(ctx, bx, by, bw, bh, 5); ctx.stroke();

        ctx.font = 'bold 12px Courier New';
        ctx.fillStyle = '#aabbcc';
        ctx.textAlign = 'center';
        ctx.fillText(word, bx + bw / 2, by + 22);

        ctx.fillStyle = color;
        ctx.font = 'bold 11px Courier New';
        ctx.fillText(label, bx + bw / 2, by - 7);

        ctx.fillStyle = '#445566';
        ctx.font = '10px Courier New';
        ctx.fillText(sub, bx + bw / 2, by + bh + 13);
      });

    } else if (this.step === 2) {
      // ── Step 3: No mercy ──
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px Courier New';
      ctx.fillStyle = '#ff5555';
      ctx.fillText('No Take-Backs', mid, cy + 62);

      ctx.font = '14px Courier New';
      ctx.fillStyle = '#667888';
      ctx.fillText('One wrong key = that word vanishes instantly.', mid, cy + 92);
      ctx.fillText('No backspace. No second chances. Pick targets carefully.', mid, cy + 112);

      // Lost word demo
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.font = 'bold 16px Courier New';
      const dw = ctx.measureText('dragon').width + 16;
      const dx = mid - dw / 2, dy = cy + 148;
      ctx.fillStyle = `rgba(130,0,0,${0.7 + pulse * 0.25})`;
      rrect(ctx, dx, dy, dw, 32, 5); ctx.fill();
      ctx.strokeStyle = `rgba(255,60,60,${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 2;
      rrect(ctx, dx, dy, dw, 32, 5); ctx.stroke();
      ctx.fillStyle = '#ff8888';
      ctx.textAlign = 'left';
      ctx.fillText('dragon', dx + 8, dy + 22);
      ctx.strokeStyle = '#ff2222'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(dx + 5, dy + 5);   ctx.lineTo(dx + dw - 5, dy + 27);
      ctx.moveTo(dx + dw - 5, dy + 5); ctx.lineTo(dx + 5, dy + 27);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,60,60,${pulse})`;
      ctx.font = 'bold 13px Courier New';
      ctx.fillText('MISS!', mid, dy - 8);
    }

    // Bottom prompt
    const isLast = this.step === this.maxSteps - 1;
    ctx.textAlign = 'center';
    ctx.font      = '12px Courier New';
    ctx.fillStyle = '#2a3d55';
    ctx.fillText(
      isLast ? '— Press any key to start! —' : '— Press any key to continue —',
      mid, cy + ch - 16
    );
  }
}

// ── FallingWord ──────────────────────────────────────────────────────────────

class FallingWord {
  constructor(text, isBot = false) {
    this.text  = text;
    this.isBot = isBot;
    const minCX = isBot ? BOT_WORD_MIN_CX : WORD_MIN_CX;
    const maxCX = isBot ? BOT_WORD_MAX_CX : WORD_MAX_CX;
    this.cx    = minCX + Math.random() * (maxCX - minCX);
    this.y     = -30;
    this.vy    = 24 + Math.random() * 16;
    this.typed = '';
    this.alive = true;
    this.state = 'normal';
    this.lostTimer = 0;
    this.shakeT    = 0;
    this.attackType = getAttackType(text);
  }

  update(dt) {
    this.y += this.vy * dt;
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.state === 'lost') {
      this.lostTimer -= dt;
      if (this.lostTimer <= 0) this.alive = false;
    } else if (this.y > CH + 40) {
      this.alive = false;
    }
  }

  lose() { this.state = 'lost'; this.lostTimer = 0.45; }

  get remaining() { return this.text.slice(this.typed.length); }
  get done()      { return this.typed.length === this.text.length; }
}

// ── Projectile ───────────────────────────────────────────────────────────────

class Projectile {
  constructor(sx, sy, ex, ey, attackType, onHit) {
    this.sx = sx; this.sy = sy;
    this.ex = ex; this.ey = ey;
    this.cfg   = ATTACKS[attackType] || ATTACKS.volley;
    this.onHit = onHit;
    this.t     = 0;
    this.x = sx; this.y = sy;
    this.trail = [];
    this.alive = true;
  }

  update(dt) {
    this.t = Math.min(1, this.t + this.cfg.speed * dt);
    const p = this.t;
    this.x = this.sx + (this.ex - this.sx) * p;
    this.y = this.sy + (this.ey - this.sy) * p - this.cfg.arc * Math.sin(p * Math.PI);
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > this.cfg.trailLen) this.trail.pop();
    if (this.t >= 1) {
      this.alive = false;
      if (this.onHit) this.onHit();
    }
  }
}

// ── Effect ───────────────────────────────────────────────────────────────────

class Effect {
  constructor(x, y, kind, scale = 1) {
    this.x = x; this.y = y; this.kind = kind; this.scale = scale;
    this.age   = 0;
    this.dur   = kind === 'hit' ? 0.52 : kind === 'miss' ? 0.75 : 0.35;
    this.alive = true;
    this.vy    = kind === 'miss' ? -55 : 0;
    if (kind === 'hit') {
      const n = Math.round(8 * Math.min(scale, 2));
      this.particles = Array.from({ length: n }, () => ({
        a: Math.random() * Math.PI * 2,
        s: (38 + Math.random() * 45) * scale,
        r: (2 + Math.random() * 2.5) * Math.min(scale, 1.6),
      }));
    }
  }

  update(dt) {
    this.age += dt;
    this.y   += this.vy * dt;
    if (this.age >= this.dur) this.alive = false;
  }

  get t() { return clamp(this.age / this.dur, 0, 1); }
}

// ── Bot AI ───────────────────────────────────────────────────────────────────

class Bot {
  constructor(game, difficulty) {
    this.game = game;
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
    this.typingSpeed   = cfg.typingSpeed;
    this.spawnInterval = cfg.spawnInterval;
    this.thinkMax       = cfg.thinkMax ?? 0.35;
    this.targetingSkill = cfg.targetingSkill ?? 1;
    this.minPickY       = cfg.minPickY ?? TY;
    this.pool  = cfg.pool;
    this.words = [];
    this.active      = null;
    this.typeTimer  = 0;
    this.thinkTimer = 0;
    this.spawnTimer = 0;
    this._spawnWord();
  }

  _spawnWord() {
    const text = this.pool[Math.floor(Math.random() * this.pool.length)];
    this.words.push(new FallingWord(text, true));
  }

  update(dt) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this._spawnWord();
      this.spawnInterval = Math.max(1.3, this.spawnInterval - 0.025);
    }

    for (const w of this.words) w.update(dt);
    this.words = this.words.filter(w => {
      if (!w.alive) { if (w === this.active) { this.active = null; this.typeTimer = 0; } return false; }
      return true;
    });

    if (!this.active) {
      if (this.thinkTimer > 0) { this.thinkTimer -= dt; }
      else {
        const cands = this.words.filter(w => w.state !== 'lost' && w.y > this.minPickY);
        if (cands.length) {
          const tower   = this.game.myTower;
          const pending = this.game.myTowerPending;

          if (this.targetingSkill === 0) {
            // Easy: random pick, no floor awareness
            this.active = cands[Math.floor(Math.random() * cands.length)];

          } else if (this.targetingSkill === 1) {
            // Medium: project landings, prefer non-top floors, no damaged priority
            const proj = cands.map(w => {
              const eta      = w.remaining.length / this.typingSpeed;
              const landY    = clamp(w.y + w.vy * eta, TY, TY + TH - 1);
              const hitFloor = clamp(Math.floor((landY - TY) / FH), 0, FLOORS - 1);
              const hp       = Math.max(0, tower[hitFloor] - pending[hitFloor]);
              return { w, hitFloor, hp };
            }).filter(p => p.hp > 0);

            const pickDeepest = pool => pool.reduce((a, b) => b.w.y > a.w.y ? b : a).w;
            const nonTop = proj.filter(p => p.hitFloor > 0);
            this.active = nonTop.length ? pickDeepest(nonTop)
                        : proj.length   ? pickDeepest(proj)
                        : cands.reduce((a, b) => b.y > a.y ? b : a);

          } else {
            // Hard: goal-driven targeting.
            // 1. Rank floors by effective HP (accounting for in-flight shots).
            // 2. Shuffle floors that share the same HP so attacks spread across the tower.
            // 3. For each priority floor, look for a word whose projected landing falls in that zone.
            // 4. Wait (don't fire anything) if no word lines up — patience creates real spread.
            const effHp = tower.map((hp, i) => Math.max(0, hp - pending[i]));

            const targets = effHp
              .map((hp, i) => ({ floor: i, hp }))
              .filter(f => f.hp > 0)
              .sort((a, b) => a.hp - b.hp); // most-damaged floors first

            // Shuffle within each HP tier so the bot doesn't always hit the same floor
            for (let i = 0; i < targets.length; ) {
              let j = i;
              while (j < targets.length && targets[j].hp === targets[i].hp) j++;
              for (let k = j - 1; k > i; k--) {
                const r = i + Math.floor(Math.random() * (k - i + 1));
                [targets[k], targets[r]] = [targets[r], targets[k]];
              }
              i = j;
            }

            let picked = null;
            for (const { floor: tf } of targets) {
              const floorMin = TY + tf * FH;
              const floorMax = floorMin + FH;
              const mid      = (floorMin + floorMax) / 2;

              const matching = cands.filter(w => {
                const landY = w.y + w.vy * (w.remaining.length / this.typingSpeed);
                return landY >= floorMin && landY < floorMax;
              });

              if (matching.length) {
                // Pick the match whose projected landing is closest to the floor centre
                picked = matching.reduce((a, b) => {
                  const la = a.y + a.vy * (a.remaining.length / this.typingSpeed);
                  const lb = b.y + b.vy * (b.remaining.length / this.typingSpeed);
                  return Math.abs(lb - mid) < Math.abs(la - mid) ? b : a;
                });
                break;
              }
            }

            // If nothing lines up yet, wait — don't snap to a bad shot.
            // (Words keep falling each frame; the right zone appears naturally.)
            if (!picked) return;
            this.active = picked;
          }

          this.active.state = 'active';

          // Occasional human-like hesitation before starting to type
          const r = Math.random();
          this.thinkTimer = r < 0.12 ? 1.2 + Math.random() * 1.3   // long pause  (~12%)
                          : r < 0.35 ? 0.4 + Math.random() * 0.5   // medium pause (~23%)
                          :             Math.random() * 0.2;         // quick        (~65%)
        }
      }
    }

    if (this.active) {
      this.typeTimer += dt;
      const n = Math.floor(this.typeTimer * this.typingSpeed);
      if (n > 0) {
        this.typeTimer -= n / this.typingSpeed;
        for (let i = 0; i < n && !this.active.done; i++) {
          this.active.typed += this.active.text[this.active.typed.length];
        }
        if (this.active.done) {
          this.game.botFire(this.active);
          this.words = this.words.filter(w => w !== this.active);
          this.active = null; this.typeTimer = 0;
          this.thinkTimer = 0.1 + Math.random() * 0.25;
        }
      }
    }
  }
}

// ── Game ─────────────────────────────────────────────────────────────────────

class Game {
  constructor(canvas, ws, isSolo, difficulty, myName) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.ws      = ws;
    this.isSolo  = isSolo;
    this.myName  = myName || '';
    this.oppName = '';

    this.myTower        = Array(FLOORS).fill(FLOOR_HP);
    this.myTowerPending = Array(FLOORS).fill(0); // damage committed but projectile still in flight
    this.oppTower = Array(FLOORS).fill(FLOOR_HP);

    this.words       = [];
    this.active      = null;
    this.projectiles = [];
    this.effects     = [];
    this.shake       = 0;

    this.spawnTimer    = 0;
    this.spawnInterval = 2.6;
    this.lastTs        = null;
    this.over          = false;
    this.overMsg       = '';
    this.paused        = false;
    this.rematchWaiting = false;

    this._stars   = this._makeStars();
    this.tutorial = new Tutorial(isSolo);
    this.bot      = isSolo ? new Bot(this, difficulty || 'medium') : null;

    if (!isSolo && ws) {
      this._pingId = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 20000);
    }

    this._boundKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._boundKey);

    // Canvas click: mute button, pause exit button, or tutorial advance
    canvas.addEventListener('click', (e) => {
      const r  = canvas.getBoundingClientRect();
      const sx = CW / r.width, sy = CH / r.height;
      const cx = (e.clientX - r.left) * sx;
      const cy = (e.clientY - r.top)  * sy;
      if (cx > CW - 52 && cx < CW - 6 && cy > 6 && cy < 30) {
        Sound.toggle(); return;
      }
      if (this.over && !this.rematchWaiting) {
        if (this.isSolo) {
          // Play Again: by=CH/2+58 h=36
          if (cy > CH/2+58 && cy < CH/2+94 && cx > CW/2-100 && cx < CW/2+100)
            this._exitToLobby();
        } else {
          // Play Again (rematch): by=CH/2+52 h=32
          if (cy > CH/2+52 && cy < CH/2+84 && cx > CW/2-100 && cx < CW/2+100) {
            this.rematchWaiting = true;
            if (this.ws) this.ws.send(JSON.stringify({ type: 'rematch_ready' }));
          }
          // Exit: by=CH/2+92 h=26
          if (cy > CH/2+92 && cy < CH/2+118 && cx > CW/2-80 && cx < CW/2+80)
            this._exitToLobby();
        }
        return;
      }
      if (this.paused) {
        // Exit button: centered, y = CH/2 + 45 to CH/2 + 79
        if (cy > CH / 2 + 45 && cy < CH / 2 + 79 && cx > CW / 2 - 90 && cx < CW / 2 + 90) {
          this._exitToLobby();
        } else {
          this.paused = false;
        }
        return;
      }
      if (this.tutorial && this.tutorial.active) {
        this.tutorial.advance(); Sound.uiClick();
      }
    });

    this._spawnWord();
    requestAnimationFrame(this._loop.bind(this));
  }

  // ── Word spawning ──────────────────────────────────────────────────────────

  _spawnWord() {
    const roll = Math.random();
    const pool = roll < 0.30 ? WORDS_SHORT : roll < 0.70 ? WORDS_MEDIUM : WORDS_LONG;
    const taken = new Set(this.words.filter(w => w.state !== 'lost').map(w => w.text[0]));
    const fresh = pool.filter(w => !taken.has(w[0]));
    const source = fresh.length ? fresh : pool;
    this.words.push(new FallingWord(source[Math.floor(Math.random() * source.length)], false));
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  _onKey(e) {
    if (e.key === 'Escape') {
      if (this.tutorial && this.tutorial.active) {
        this.tutorial.active = false; // skip tutorial
      } else if (!this.over) {
        this.paused = !this.paused;
        if (this.paused) this._refreshDisplay();
      }
      return;
    }

    // Tutorial intercepts everything else
    if (this.tutorial && this.tutorial.active) {
      this.tutorial.handleKey(e.key);
      return;
    }

    if (this.paused || this.over) return;

    if (e.key === 'Backspace') {
      if (!this.isSolo && this.active) {
        if (this.active.typed.length > 1) {
          this.active.typed = this.active.typed.slice(0, -1);
        } else {
          this.active.typed = ''; this.active.state = 'normal'; this.active = null;
        }
        this._refreshDisplay();
      }
      return;
    }

    if (e.key.length !== 1 || !/[a-zA-Z ]/.test(e.key)) return;
    const ch = e.key === ' ' ? ' ' : e.key.toLowerCase();

    if (this.active) {
      const expected = this.active.remaining[0];
      if (ch === expected) {
        this.active.typed += ch;
        Sound.keyClick();
        this._refreshDisplay();
        if (this.active.done) {
          this._fire(this.active);
          this.words = this.words.filter(w => w !== this.active);
          this.active = null;
          this._refreshDisplay();
        }
      } else {
        if (this.isSolo) {
          Sound.wrongKey();
          setTimeout(() => Sound.wordLost(), 60);
          this.effects.push(new Effect(this.active.cx, this.active.y - 10, 'miss'));
          this.active.lose();
          this.active = null;
          this._refreshDisplay();
        } else {
          this.active.shakeT = 0.18;
          Sound.wrongKey();
        }
      }
    } else {
      if (ch === ' ') return;
      const best = this.words
        .filter(w => w.state !== 'lost' && w.text[0] === ch)
        .reduce((acc, w) => (!acc || w.y > acc.y) ? w : acc, null);
      if (best) {
        this.active = best;
        this.active.state = 'active';
        this.active.typed = ch;
        Sound.keyClick();
        this._refreshDisplay();
        if (this.active.done) {
          this._fire(this.active);
          this.words = this.words.filter(w => w !== this.active);
          this.active = null;
          this._refreshDisplay();
        }
      }
    }
  }

  _refreshDisplay() {
    const el = document.getElementById('typed-so-far');
    if (el) el.textContent = this.active ? this.active.typed : '';
  }

  // ── Firing ─────────────────────────────────────────────────────────────────

  _fire(word) {
    const floor = yToFloor(word.y);
    const atk   = word.attackType;
    const cfg   = ATTACKS[atk];
    const ex    = OPP_TX + TW / 2;
    const ey    = floorCenterY(floor);

    Sound.fire(atk);
    this.effects.push(new Effect(word.cx, word.y, 'launch'));
    this.projectiles.push(new Projectile(word.cx, word.y, ex, ey, atk, () => {
      this.oppTower[floor] = Math.max(0, this.oppTower[floor] - cfg.damage);
      Sound.impact(atk);
      this.effects.push(new Effect(ex, ey, 'hit', cfg.effectScale));
      if (cfg.shake) this.shake = 0.32;
      if (this.oppTower.every(hp => hp === 0)) {
        this.over = true; this.overMsg = 'VICTORY!';
        Sound.victory(); this._sdkStop();
      }
    }));

    if (!this.isSolo && this.ws) {
      this.ws.send(JSON.stringify({ type: 'fire', floor, attackType: atk }));
    }
  }

  botFire(word) {
    const floor = yToFloor(word.y);
    const atk   = word.attackType;
    const cfg   = ATTACKS[atk];
    const ex    = MY_TX + TW / 2;
    const ey    = floorCenterY(floor);

    // Reserve this damage so the bot won't double-target the same floor while the projectile is in flight
    this.myTowerPending[floor] = Math.min(
      this.myTowerPending[floor] + cfg.damage,
      this.myTower[floor]
    );

    Sound.fire(atk);
    this.projectiles.push(new Projectile(word.cx, word.y, ex, ey, atk, () => {
      const dmg = Math.min(cfg.damage, this.myTower[floor]);
      this.myTower[floor]        = Math.max(0, this.myTower[floor] - cfg.damage);
      this.myTowerPending[floor] = Math.max(0, this.myTowerPending[floor] - dmg);
      Sound.impact(atk);
      this.effects.push(new Effect(ex, ey, 'hit', cfg.effectScale));
      if (cfg.shake) this.shake = 0.32;
      if (this.myTower.every(hp => hp === 0)) {
        this.over = true; this.overMsg = 'DEFEATED...';
        Sound.defeat(); this._sdkStop();
      }
    }));
  }

  // ── Multiplayer receive ────────────────────────────────────────────────────

  receiveHit(floor, attackType = 'volley') {
    const atk = ATTACKS[attackType] ? attackType : 'volley';
    const cfg = ATTACKS[atk];
    const ex  = MY_TX + TW / 2, ey = floorCenterY(floor);
    this.projectiles.push(new Projectile(OPP_TX + TW / 2, ey, ex, ey, atk, () => {
      this.myTower[floor] = Math.max(0, this.myTower[floor] - cfg.damage);
      Sound.impact(atk);
      this.effects.push(new Effect(ex, ey, 'hit', cfg.effectScale));
      if (cfg.shake) this.shake = 0.32;
      if (this.myTower.every(hp => hp === 0)) {
        this.over = true; this.overMsg = 'DEFEATED...';
        Sound.defeat(); this._sdkStop();
        if (this.ws) this.ws.send(JSON.stringify({ type: 'i_lost' }));
      }
    }));
  }

  receiveWin() {
    if (!this.over) { this.over = true; this.overMsg = 'VICTORY!'; Sound.victory(); this._sdkStop(); }
  }

  receiveOpponentLeft() { this.over = true; this.overMsg = 'Opponent left'; this._sdkStop(); }

  // ── Loop ───────────────────────────────────────────────────────────────────

  _loop(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min((ts - this.lastTs) / 1000, 0.1);
    this.lastTs = ts;
    if (!this.over) this._update(dt);
    this._draw();
    requestAnimationFrame(this._loop.bind(this));
  }

  _update(dt) {
    if (this.tutorial) this.tutorial.update(dt);

    // Pause game logic while tutorial is active or paused
    if ((this.tutorial && this.tutorial.active) || this.paused) return;

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this._spawnWord();
      this.spawnInterval = Math.max(1.1, this.spawnInterval - 0.04);
    }

    for (const w of this.words) w.update(dt);
    this.words = this.words.filter(w => {
      if (!w.alive) { if (w === this.active) { this.active = null; this._refreshDisplay(); } return false; }
      return true;
    });

    if (this.bot) this.bot.update(dt);

    for (const p of this.projectiles) p.update(dt);
    this.projectiles = this.projectiles.filter(p => p.alive);

    for (const e of this.effects) e.update(dt);
    this.effects = this.effects.filter(e => e.alive);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;

    ctx.save();
    if (this.shake > 0) {
      const m = (this.shake / 0.32) * 7;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, TY + TH);
    sky.addColorStop(0, '#07071c'); sky.addColorStop(1, '#0c1022');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, TY + TH);

    for (const s of this._stars) {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.fill();
    }

    // Ground
    const grd = ctx.createLinearGradient(0, TY + TH, 0, CH);
    grd.addColorStop(0, '#180e03'); grd.addColorStop(1, '#0e0802');
    ctx.fillStyle = grd; ctx.fillRect(0, TY + TH, CW, CH - TY - TH);
    ctx.fillStyle = '#261408'; ctx.fillRect(0, TY + TH, CW, 3);

    // Centre divider
    ctx.strokeStyle = 'rgba(60,60,100,0.2)'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(CW / 2, TY); ctx.lineTo(CW / 2, TY + TH); ctx.stroke();
    ctx.setLineDash([]);

    this._drawTower(MY_TX,  this.myTower,  true);
    this._drawTower(OPP_TX, this.oppTower, false);

    if (this.bot) for (const w of this.bot.words) this._drawWord(w);
    for (const w of this.words)       this._drawWord(w);
    for (const p of this.projectiles) this._drawProjectile(p);
    for (const e of this.effects)     this._drawEffect(e);

    this._drawHUD();
    this._drawMuteButton();
    ctx.restore();

    // Overlays drawn outside shake transform
    if (this.tutorial && this.tutorial.active) {
      this.tutorial.draw(this.ctx);
    } else if (this.paused) {
      this._drawPauseOverlay();
    } else if (this.over) {
      this._drawOverlay();
    }
  }

  _makeStars() {
    return Array.from({ length: 100 }, () => ({
      x: Math.random() * CW, y: Math.random() * (TY + TH),
      r: Math.random() * 1.4 + 0.3, a: 0.3 + Math.random() * 0.7,
    }));
  }

  _drawTower(tx, floors, isMine) {
    const ctx = this.ctx;
    const baseRGB     = isMine ? [38, 68, 155] : [155, 38, 38];
    const accentColor = isMine ? '#4477ee'      : '#ee4444';

    for (let i = 0; i < FLOORS; i++) {
      const hp = floors[i], fy = TY + i * FH;
      if (hp === 0) {
        ctx.fillStyle = '#0c0804'; ctx.fillRect(tx, fy, TW, FH);
        ctx.fillStyle = '#231208';
        for (let r = 0; r < 4; r++) ctx.fillRect(tx + 4 + r * 17, fy + FH - 9, 12, 7);
      } else {
        const dmg = (FLOOR_HP - hp) / FLOOR_HP;
        const [r, g, b] = baseRGB;
        ctx.fillStyle = `rgb(${Math.round(r + dmg*30)},${Math.round(g*(1-dmg*0.3))},${Math.round(b*(1-dmg*0.4))})`;
        ctx.fillRect(tx, fy, TW, FH);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(tx, fy, TW, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(tx, fy, TW, 1);
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, fy+FH*.5); ctx.lineTo(tx+TW, fy+FH*.5);
        ctx.moveTo(tx+TW*.33, fy); ctx.lineTo(tx+TW*.33, fy+FH*.5);
        ctx.moveTo(tx+TW*.66, fy+FH*.5); ctx.lineTo(tx+TW*.66, fy+FH);
        ctx.stroke();
        if (dmg > 0) {
          ctx.strokeStyle = `rgba(0,0,0,${dmg*.85})`; ctx.lineWidth = dmg * 1.5;
          ctx.beginPath();
          ctx.moveTo(tx+TW*.40, fy+4); ctx.lineTo(tx+TW*.55, fy+FH*.55); ctx.lineTo(tx+TW*.72, fy+FH-4);
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = accentColor; ctx.lineWidth = 2;
    ctx.strokeRect(tx, TY, TW, TH);

    const mW = TW/5, mH = 22;
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = isMine ? '#182080' : '#801818';
        ctx.fillRect(tx + i*mW, TY - mH, mW, mH);
        ctx.strokeStyle = accentColor; ctx.lineWidth = 1.5;
        ctx.strokeRect(tx + i*mW, TY - mH, mW, mH);
      }
    }

    const barY = TY + TH + 10;
    const hpPct = floors.reduce((a,b)=>a+b,0) / (FLOORS * FLOOR_HP);
    ctx.fillStyle = '#111'; ctx.fillRect(tx, barY, TW, 7);
    ctx.fillStyle = hpPct > 0.5 ? '#33ee55' : hpPct > 0.25 ? '#ffaa22' : '#ee2222';
    ctx.fillRect(tx, barY, TW * hpPct, 7);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(tx, barY, TW, 7);

    ctx.fillStyle = isMine ? '#7799cc' : '#cc7777';
    ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center';
    ctx.fillText(isMine ? (this.myName || 'YOUR TOWER') : (this.isSolo ? 'BOT TOWER' : (this.oppName || 'ENEMY TOWER')), tx + TW/2, TY + TH + 28);
  }

  _drawWord(word) {
    const ctx = this.ctx;
    const cfg      = ATTACKS[word.attackType];
    const isActive = word.state === 'active';
    const isLost   = word.state === 'lost';
    const isBot    = word.isBot;

    ctx.font = 'bold 15px Courier New';
    const typed = word.typed, rem = word.remaining;
    const twT = ctx.measureText(typed).width, twR = ctx.measureText(rem).width;
    const totalW = twT + twR;
    const pad = 7;
    const bx = word.cx - totalW/2 - pad, by = word.y - 14 - pad;
    const bw = totalW + pad*2, bh = 20 + pad*2;

    ctx.save();
    if (word.shakeT > 0) ctx.translate((Math.random()-0.5)*5, 0);

    if (isLost) {
      const alpha = word.lostTimer / 0.45;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(160,0,0,0.88)';
      rrect(ctx, bx, by, bw, bh, 5); ctx.fill();
      ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 2;
      rrect(ctx, bx, by, bw, bh, 5); ctx.stroke();
      ctx.fillStyle = '#ff7777'; ctx.textAlign = 'left';
      ctx.fillText(typed + rem, word.cx - totalW/2, word.y);
      ctx.strokeStyle = '#ff2222'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx+5, by+5); ctx.lineTo(bx+bw-5, by+bh-5);
      ctx.moveTo(bx+bw-5, by+5); ctx.lineTo(bx+5, by+bh-5);
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore(); return;
    }

    const bgColor = isActive
      ? (isBot ? 'rgba(90,5,20,0.9)'  : 'rgba(0,85,145,0.9)')
      : (isBot ? 'rgba(35,5,10,0.8)'  : 'rgba(4,20,48,0.8)');
    ctx.fillStyle = bgColor; rrect(ctx, bx, by, bw, bh, 5); ctx.fill();
    ctx.fillStyle = cfg.borderColor; rrect(ctx, bx, by, bw, 4, 2); ctx.fill();
    ctx.strokeStyle = isActive ? cfg.borderColor : (isBot ? '#551122' : '#1e3d5c');
    ctx.lineWidth = isActive ? 2 : 1;
    rrect(ctx, bx, by, bw, bh, 5); ctx.stroke();

    if (isActive) { ctx.shadowColor = cfg.borderColor; ctx.shadowBlur = 10; }
    ctx.textAlign = 'left';
    if (isBot) {
      ctx.fillStyle = '#ff9999'; ctx.fillText(typed, word.cx - totalW/2, word.y);
      ctx.fillStyle = isActive ? '#ffcccc' : '#774455';
      ctx.fillText(rem, word.cx - totalW/2 + twT, word.y);
    } else {
      ctx.fillStyle = '#66ffaa'; ctx.fillText(typed, word.cx - totalW/2, word.y);
      ctx.fillStyle = isActive ? '#ffffff' : '#8899bb';
      ctx.fillText(rem, word.cx - totalW/2 + twT, word.y);
    }
    ctx.shadowBlur = 0; ctx.restore();
  }

  _drawProjectile(proj) {
    const ctx = this.ctx, cfg = proj.cfg;
    for (let i = 0; i < proj.trail.length; i++) {
      const frac = i / proj.trail.length;
      ctx.beginPath();
      ctx.arc(proj.trail[i].x, proj.trail[i].y, cfg.projSize*(1-frac*0.7), 0, Math.PI*2);
      ctx.fillStyle = `rgba(${cfg.trailRgb},${(1-frac)*0.55})`; ctx.fill();
    }
    const g = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, cfg.projSize);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, cfg.color); g.addColorStop(1, cfg.color+'88');
    ctx.beginPath(); ctx.arc(proj.x, proj.y, cfg.projSize, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(proj.x, proj.y, cfg.projSize*1.9, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${cfg.trailRgb},0.14)`; ctx.fill();
  }

  _drawEffect(eff) {
    const ctx = this.ctx, t = eff.t, s = eff.scale;
    if (eff.kind === 'hit') {
      ctx.beginPath(); ctx.arc(eff.x, eff.y, t*44*s, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(255,120,30,${1-t})`; ctx.lineWidth = 3*Math.min(s,2); ctx.stroke();
      for (const p of eff.particles) {
        const d = t * p.s;
        ctx.beginPath(); ctx.arc(eff.x+Math.cos(p.a)*d, eff.y+Math.sin(p.a)*d, p.r*(1-t), 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,200,60,${1-t})`; ctx.fill();
      }
      const fw = 36*s, fh = 24*s;
      ctx.fillStyle = `rgba(255,${s>1.5?80:175},40,${(1-t)*(s>1.5?0.45:0.28)})`;
      ctx.fillRect(eff.x-fw, eff.y-fh, fw*2, fh*2);
    } else if (eff.kind === 'launch') {
      ctx.beginPath(); ctx.arc(eff.x, eff.y, t*20, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,230,80,${(1-t)*0.5})`; ctx.fill();
    } else if (eff.kind === 'miss') {
      ctx.font = 'bold 17px Courier New'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,55,55,${1-t})`; ctx.fillText('MISS!', eff.x, eff.y);
    }
  }

  _drawHUD() {
    const ctx = this.ctx;
    ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(90,130,210,0.5)';
    ctx.fillText(this.isSolo ? 'TYPING TOWERS  ·  SOLO' : 'TYPING TOWERS', CW/2, 20);

    if (this.isSolo) {
      ctx.textAlign = 'right'; let ly = CH - 46;
      for (const [, cfg] of Object.entries(ATTACKS)) {
        ctx.font = '11px Courier New'; ctx.fillStyle = cfg.borderColor;
        ctx.fillText(`${cfg.label}  ·  ${cfg.desc}`, CW - 12, ly); ly += 15;
      }
      ctx.font = '10px Courier New'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(180,60,60,0.38)';
      ctx.fillText('⚠ one mistake = word lost', MY_TX + TW + 4, CH - 8);
    }

    if (this.active && this.active.text.includes(' ')) {
      ctx.font = '11px Courier New'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(200,200,100,0.5)';
      ctx.fillText('Press SPACE to continue phrase', CW/2, CH - 8);
    } else if (!this.active && this.words.length > 0 && !(this.tutorial && this.tutorial.active)) {
      ctx.font = '11px Courier New'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(100,145,210,0.38)';
      ctx.fillText('Type the first letter of a word to target it', CW/2, CH - 8);
    }
  }

  _drawMuteButton() {
    const ctx = this.ctx;
    const bx = CW - 50, by = 6, bw = 44, bh = 20;
    ctx.fillStyle = 'rgba(12,20,48,0.75)';
    rrect(ctx, bx, by, bw, bh, 4); ctx.fill();
    ctx.font = '11px Courier New'; ctx.textAlign = 'center';
    ctx.fillStyle = Sound.enabled ? '#6688bb' : '#334455';
    ctx.fillText(Sound.enabled ? '♪ SFX' : '♪ OFF', bx + bw/2, by + 14);
  }

  _reset() {
    this.myTower        = Array(FLOORS).fill(FLOOR_HP);
    this.myTowerPending = Array(FLOORS).fill(0);
    this.oppTower = Array(FLOORS).fill(FLOOR_HP);
    this.words = []; this.active = null;
    this.projectiles = []; this.effects = [];
    this.shake = 0; this.spawnTimer = 0;
    this.spawnInterval = 2.6; this.lastTs = null;
    this.over = false; this.overMsg = '';
    this.paused = false; this.rematchWaiting = false;
    this.tutorial = null;
    this._refreshDisplay();
    this._spawnWord();
    try { window.CrazyGames?.SDK?.game?.gameplayStart(); } catch(e) {}
  }

  _sdkStop() {
    try { window.CrazyGames?.SDK?.game?.gameplayStop(); } catch(e) {}
  }

  _exitToLobby() {
    try { window.CrazyGames?.SDK?.game?.gameplayStop(); } catch(e) {}
    const go = () => location.reload();
    try {
      if (window.CrazyGames?.SDK?.ad?.requestAd) {
        const t = setTimeout(go, 4000); // safety fallback if ad never calls back
        window.CrazyGames.SDK.ad.requestAd('midgame', {
          adFinished: () => { clearTimeout(t); go(); },
          adError:    () => { clearTimeout(t); go(); },
        });
      } else {
        go();
      }
    } catch(e) { go(); }
  }

  _drawPauseOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,15,0.78)';
    ctx.fillRect(0, 0, CW, CH);

    ctx.textAlign = 'center';
    ctx.font = 'bold 50px Courier New';
    ctx.fillStyle = '#aaccff';
    ctx.shadowColor = '#2244aa'; ctx.shadowBlur = 22;
    ctx.fillText('PAUSED', CW / 2, CH / 2 - 22);
    ctx.shadowBlur = 0;

    ctx.font = '15px Courier New';
    ctx.fillStyle = '#445566';
    ctx.fillText('Press ESC to resume  ·  click anywhere to resume', CW / 2, CH / 2 + 18);

    // Exit button
    const bx = CW / 2 - 90, by = CH / 2 + 45, bw = 180, bh = 34;
    ctx.fillStyle = 'rgba(70,15,15,0.9)';
    rrect(ctx, bx, by, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = '#774444'; ctx.lineWidth = 1.5;
    rrect(ctx, bx, by, bw, bh, 6); ctx.stroke();
    ctx.font = '14px Courier New';
    ctx.fillStyle = '#cc7777';
    ctx.fillText('Exit to Menu', CW / 2, by + 22);
  }

  _drawOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,10,0.75)'; ctx.fillRect(0, 0, CW, CH);
    const won = this.overMsg === 'VICTORY!';
    ctx.textAlign = 'center';
    ctx.font = 'bold 60px Courier New';
    ctx.fillStyle   = won ? '#ffd700' : '#ff4444';
    ctx.shadowColor = won ? '#ff8800' : '#aa0000'; ctx.shadowBlur = 28;
    ctx.fillText(this.overMsg, CW/2, CH/2 - 10);
    ctx.shadowBlur = 0;
    ctx.font = '20px Courier New';
    ctx.fillStyle = won ? '#aaffcc' : '#ffaaaa';
    const sub = won ? 'The enemy tower crumbles!'
      : this.overMsg === 'DEFEATED...' ? 'Your tower has fallen...' : this.overMsg;
    ctx.fillText(sub, CW/2, CH/2 + 38);

    if (this.rematchWaiting) {
      const dots = '.'.repeat(1 + Math.floor(Date.now() / 450) % 3);
      ctx.font = '15px Courier New'; ctx.fillStyle = '#667788';
      ctx.fillText('Waiting for opponent' + dots, CW/2, CH/2 + 72);
      return;
    }

    if (this.isSolo) {
      const bx = CW/2-100, by = CH/2+58, bw = 200, bh = 36;
      ctx.fillStyle = won ? 'rgba(30,70,30,0.9)' : 'rgba(50,20,20,0.9)';
      rrect(ctx, bx, by, bw, bh, 8); ctx.fill();
      ctx.strokeStyle = won ? '#336633' : '#553333'; ctx.lineWidth = 1.5;
      rrect(ctx, bx, by, bw, bh, 8); ctx.stroke();
      ctx.font = 'bold 15px Courier New';
      ctx.fillStyle = won ? '#88ee88' : '#ee8888';
      ctx.fillText('Play Again', CW/2, by + 24);
    } else {
      // Play Again (rematch)
      const b1x = CW/2-100, b1y = CH/2+52, b1w = 200, b1h = 32;
      ctx.fillStyle = won ? 'rgba(30,70,30,0.9)' : 'rgba(20,45,75,0.9)';
      rrect(ctx, b1x, b1y, b1w, b1h, 6); ctx.fill();
      ctx.strokeStyle = won ? '#336633' : '#336688'; ctx.lineWidth = 1.5;
      rrect(ctx, b1x, b1y, b1w, b1h, 6); ctx.stroke();
      ctx.font = 'bold 14px Courier New';
      ctx.fillStyle = won ? '#88ee88' : '#66aadd';
      ctx.fillText('Play Again', CW/2, b1y + 21);
      // Exit
      const b2x = CW/2-80, b2y = CH/2+92, b2w = 160, b2h = 26;
      ctx.fillStyle = 'rgba(30,15,15,0.85)';
      rrect(ctx, b2x, b2y, b2w, b2h, 5); ctx.fill();
      ctx.strokeStyle = '#443333'; ctx.lineWidth = 1;
      rrect(ctx, b2x, b2y, b2w, b2h, 5); ctx.stroke();
      ctx.font = '12px Courier New'; ctx.fillStyle = '#775555';
      ctx.fillText('Exit to Menu', CW/2, b2y + 17);
    }
  }
}

// ── UI / Lobby ───────────────────────────────────────────────────────────────

const UI = (() => {
  let ws = null, game = null;
  let myUsername = null;

  // Init SDK first, then set up all CG features that depend on it
  (async () => {
    try { await window.CrazyGames?.SDK?.init(); } catch(e) {}

    try {
      const u = await window.CrazyGames?.SDK?.user?.getUser();
      myUsername = u?.username || null;
    } catch(e) {}

    try {
      window.CrazyGames?.SDK?.game?.addJoinRoomListener((data) => {
        const roomId = typeof data === 'string' ? data : (data?.roomName || data?.roomId || '');
        if (roomId && !game) {
          document.getElementById('code-input').value = roomId;
          UI.joinGame();
        }
      });
    } catch(e) {}

    // Check instant multiplayer — poll briefly since flag can lag behind init
    try {
      const checkIM = (attempts) => {
        if (window.CrazyGames?.SDK?.game?.isInstantMultiplayer) {
          setTimeout(() => UI.createGame(), 300);
        } else if (attempts > 0) {
          setTimeout(() => checkIM(attempts - 1), 200);
        }
      };
      checkIM(10);
    } catch(e) {}
  })();

  function connect() {
    return new Promise((resolve, reject) => {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const url = isLocal
        ? `ws://${location.host}`
        : 'wss://typing-towers-production.up.railway.app';
      ws = new WebSocket(url);
      ws.onopen  = () => resolve();
      ws.onerror = () => reject(new Error('Could not connect to server.'));
    });
  }

  function showError(msg) { document.getElementById('lobby-error').textContent = msg; }

  function _launchGame(isSolo, difficulty) {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    const canvas = document.getElementById('canvas');
    canvas.width = CW; canvas.height = CH;
    game = new Game(canvas, ws, isSolo, difficulty, myUsername);
    try { window.CrazyGames?.SDK?.game?.hideInviteButton(); } catch(e) {}
    try { window.CrazyGames?.SDK?.game?.gameplayStart(); } catch(e) {}
    if (!isSolo && ws) {
      // Send our username to opponent
      if (myUsername) setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'player_info', username: myUsername }));
      }, 200);

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'incoming')       game.receiveHit(msg.floor, msg.attackType);
        if (msg.type === 'you_won')        game.receiveWin();
        if (msg.type === 'opponent_left')  game.receiveOpponentLeft();
        if (msg.type === 'opponent_info')  game.oppName = msg.username || '';
        if (msg.type === 'rematch_waiting') game.rematchWaiting = true;
        if (msg.type === 'rematch_start')  game._reset();
      };
    }
  }

  function showSoloDiff() {
    document.getElementById('lobby-actions').style.display   = 'none';
    document.getElementById('solo-difficulty').style.display = 'block';
    showError('');
  }

  function backToMain() {
    document.getElementById('solo-difficulty').style.display = 'none';
    document.getElementById('room-info').style.display       = 'none';
    document.getElementById('lobby-actions').style.display   = 'flex';
    showError('');
  }

  function startSolo(difficulty) { _launchGame(true, difficulty); }

  async function createGame() {
    showError('');
    try {
      await connect();
      ws.send(JSON.stringify({ type: 'create_room' }));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'room_created') {
          document.getElementById('lobby-actions').style.display = 'none';
          document.getElementById('room-info').style.display     = 'block';
          document.getElementById('room-code-display').textContent = msg.code;
          // Generate CG invite link so host can invite friends
          (async () => {
            try {
              const link = await window.CrazyGames?.SDK?.game?.inviteLink({ roomId: msg.code });
              if (link) window._cgInviteLink = link;
            } catch(e) {}
            try { window.CrazyGames?.SDK?.game?.showInviteButton({ roomId: msg.code }); } catch(e) {}
          })();
        }
        if (msg.type === 'game_start') _launchGame(false, null);
        if (msg.type === 'error')      showError(msg.message);
      };
    } catch(e) { showError(e.message); }
  }

  async function joinGame() {
    showError('');
    const code = document.getElementById('code-input').value.trim().toUpperCase();
    if (code.length < 4) { showError('Enter a valid room code.'); return; }
    try {
      await connect();
      ws.send(JSON.stringify({ type: 'join_room', code }));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'game_start') _launchGame(false, null);
        if (msg.type === 'error')      showError(msg.message);
      };
    } catch(e) { showError(e.message); }
  }

  function inviteFriend() {
    const code = document.getElementById('room-code-display').textContent;
    const link = window._cgInviteLink || null;
    if (link) {
      navigator.clipboard?.writeText(link).catch(() => {});
      alert('Invite link copied! Share it with your friend.');
    } else {
      navigator.clipboard?.writeText(code).catch(() => {});
      alert(`Room code copied: ${code}`);
    }
  }

  return { showSoloDiff, backToMain, startSolo, createGame, joinGame, inviteFriend };
})();
