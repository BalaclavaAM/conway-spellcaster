// Conway Spellcaster — Renderer (canvas neón, glow por sprite, partículas, héroe)
// Único dueño de este archivo: issue #4. No lo importa nadie más que game.js.
import { W, H, createGrid, step } from './life.js';

const FALLBACK_COLORS = {
  bg: '#050608', grid: '#14181f', panel: '#0a0c10', border: '#2a3140',
  cyan: '#19e6ff', cyanDim: '#0a6b78', white: '#eafcff',
  magenta: '#ff2fa0', orange: '#ff7a1a', yellow: '#ffe14d', green: '#35ff8a', red: '#ff3b3b',
};

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => {
    const s = cs.getPropertyValue(name).trim();
    return s || fb;
  };
  return {
    bg: v('--bg', FALLBACK_COLORS.bg),
    grid: v('--grid', FALLBACK_COLORS.grid),
    panel: v('--panel', FALLBACK_COLORS.panel),
    border: v('--border', FALLBACK_COLORS.border),
    cyan: v('--cyan', FALLBACK_COLORS.cyan),
    cyanDim: v('--cyan-dim', FALLBACK_COLORS.cyanDim),
    white: v('--white', FALLBACK_COLORS.white),
    magenta: v('--magenta', FALLBACK_COLORS.magenta),
    orange: v('--orange', FALLBACK_COLORS.orange),
    yellow: v('--yellow', FALLBACK_COLORS.yellow),
    green: v('--green', FALLBACK_COLORS.green),
    red: v('--red', FALLBACK_COLORS.red),
    fontPixel: v('--font-pixel', "'Press Start 2P', monospace"),
    fontMono: v('--font-mono', 'monospace'),
  };
}

const FADE_FRAMES = 3;
const HERO_FRAME = { idle: 0, walk: 2, cast: 4, dead: 6, win: 7 };
const HERO_ANIM_MS = { idle: 500, walk: 120, cast: 90 };
const HERO_ACTION_HOLD = { walk: 260, cast: 400 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = readTheme();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.state = null;
    this._prevPlayer = null;
    this._prevSpellsCast = 0;
    this._action = 'idle';
    this._actionExpire = 0;

    this.fade = new Float32Array(W * H);

    this.cellSize = 0;
    this.sprites = {};
    this._vignetteGradient = null;

    this.particles = [];

    this.showFps = false;
    this._fpsFrames = 0;
    this._fpsLast = 0;
    this.fps = 0;

    this._running = false;
    this._lastTime = 0;

    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onKey = this._onKey.bind(this);

    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(this.canvas);
    window.addEventListener('keydown', this._onKey);

    this._loadHero();
    this._resize(); // primer cálculo de tamaño/sprites antes del primer frame
  }

  // ---------- assets del héroe ----------
  _loadHero() {
    this.heroMode = 'sheet'; // 'sheet' | 'svg' | 'fallback'
    this.heroReady = false;
    const img = new Image();
    img.onload = () => { this.heroReady = true; };
    img.onerror = () => {
      if (this.heroMode === 'sheet') {
        this.heroMode = 'svg';
        this.heroReady = false;
        img.onerror = () => { this.heroMode = 'fallback'; this.heroReady = false; };
        img.src = 'assets/clawd.svg';
      }
    };
    this.heroImg = img;
    img.src = 'assets/clawd_sheet.png';
  }

  // ---------- resize / dpr ----------
  _onResize() { this._resize(); }

  _resize() {
    const rectW = this.canvas.clientWidth || this.canvas.width || W * 20;
    const rectH = this.canvas.clientHeight || this.canvas.height || H * 20;
    const cell = Math.max(1, Math.min(rectW / W, rectH / H));
    const bufW = Math.max(1, Math.round(cell * W * this.dpr));
    const bufH = Math.max(1, Math.round(cell * H * this.dpr));

    if (this.canvas.width !== bufW) this.canvas.width = bufW;
    if (this.canvas.height !== bufH) this.canvas.height = bufH;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const changed = Math.abs(cell - this.cellSize) > 0.01;
    this.cellSize = cell;
    this.cssW = cell * W;
    this.cssH = cell * H;

    if (changed) {
      this._buildSprites();
      this._buildVignette();
    }
  }

  // ---------- sprites pre-renderizados (glow) ----------
  _buildSprite(fill, stroke, glow, blur) {
    const size = this.cellSize;
    const pad = size * 0.6;
    const total = size + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(total * this.dpr));
    c.height = Math.max(1, Math.round(total * this.dpr));
    const sctx = c.getContext('2d');
    sctx.scale(this.dpr, this.dpr);
    sctx.translate(pad, pad);
    sctx.shadowColor = glow;
    sctx.shadowBlur = blur;
    sctx.fillStyle = fill;
    sctx.fillRect(1, 1, Math.max(1, size - 2), Math.max(1, size - 2));
    sctx.shadowBlur = blur;
    sctx.strokeStyle = stroke;
    sctx.lineWidth = Math.max(1, size * 0.09);
    sctx.strokeRect(1, 1, Math.max(1, size - 2), Math.max(1, size - 2));
    return { canvas: c, pad };
  }

  _buildSprites() {
    const t = this.theme;
    const size = this.cellSize;
    this.sprites = {
      cyan: this._buildSprite('rgba(25,230,255,0.16)', t.cyan, t.cyan, size * 0.55),
      white: this._buildSprite('rgba(234,252,255,0.4)', t.white, t.white, size * 0.75),
      magenta: this._buildSprite('rgba(255,47,160,0.28)', t.magenta, t.magenta, size * 0.6),
      green: this._buildSprite('rgba(53,255,138,0.18)', t.green, t.green, size * 0.65),
      orange: this._buildSprite('rgba(255,122,26,0.22)', t.orange, t.orange, size * 0.6),
    };
  }

  _buildVignette() {
    const w = this.cssW, h = this.cssH;
    const cx = w / 2, cy = h / 2;
    const r = Math.hypot(cx, cy);
    const g = this.ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    g.addColorStop(0, 'rgba(255,59,59,0)');
    g.addColorStop(1, 'rgba(255,59,59,0.9)');
    this._vignetteGradient = g;
  }

  // ---------- API pública ----------
  setState(state) {
    if (state && state.player) {
      if (this._prevPlayer && (this._prevPlayer.x !== state.player.x || this._prevPlayer.y !== state.player.y)) {
        this._action = 'walk';
        this._actionExpire = performance.now() + HERO_ACTION_HOLD.walk;
      } else if ((state.spellsCast || 0) > this._prevSpellsCast) {
        this._action = 'cast';
        this._actionExpire = performance.now() + HERO_ACTION_HOLD.cast;
      }
      this._prevPlayer = { x: state.player.x, y: state.player.y };
      this._prevSpellsCast = state.spellsCast || 0;
    }

    if (state && state.grid && state.prevGrid && state.grid.length === state.prevGrid.length) {
      for (let i = 0; i < state.grid.length; i++) {
        if (state.prevGrid[i] === 1 && state.grid[i] === 0) this.fade[i] = FADE_FRAMES;
      }
    }

    this.state = state;
  }

  burst(x, y, color) {
    const cx = (x + 0.5) * this.cellSize;
    const cy = (y + 0.5) * this.cellSize;
    const fill = this.theme[color] || color || this.theme.cyan;
    for (let k = 0; k < 24; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 150;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0, life: 300,
        color: fill,
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._fpsLast = this._lastTime;
    requestAnimationFrame(this._loop);
  }

  // ---------- input FPS toggle ----------
  _onKey(e) {
    if (e.key !== 'f' && e.key !== 'F') return;
    const el = document.activeElement;
    const tag = el && el.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    this.showFps = !this.showFps;
  }

  // ---------- loop ----------
  _loop(now) {
    const dt = now - this._lastTime;
    this._lastTime = now;
    this._frame(now, dt);
    requestAnimationFrame(this._loop);
  }

  _frame(now, dt) {
    const ctx = this.ctx;
    const t = this.theme;
    const w = this.cssW, h = this.cssH, cell = this.cellSize;
    const state = this.state;

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, w, h);

    this._drawGrid(ctx, w, h, cell, t);

    if (state) {
      this._drawCells(ctx, state, cell);
      this._drawExit(ctx, state, cell, now, t);
      this._drawHero(ctx, state, cell, now);
    }

    this._updateAndDrawParticles(ctx, dt);

    if (state) this._drawDanger(ctx, state, w, h, now);

    this._updateFps(now);
    if (this.showFps) this._drawFps(ctx, t);
  }

  _drawGrid(ctx, w, h, cell, t) {
    ctx.strokeStyle = t.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) {
      const px = Math.round(x * cell) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = 0; y <= H; y++) {
      const py = Math.round(y * cell) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();
  }

  _drawCells(ctx, state, cell) {
    const { grid, age } = state;
    if (!grid) return;
    const sprites = this.sprites;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (grid[i] === 1) {
          const sp = (age && age[i] === 1) ? sprites.white : sprites.cyan;
          if (!sp) continue;
          ctx.drawImage(sp.canvas, x * cell - sp.pad, y * cell - sp.pad, cell + sp.pad * 2, cell + sp.pad * 2);
        } else if (this.fade[i] > 0) {
          const sp = sprites.magenta;
          if (sp) {
            ctx.globalAlpha = Math.min(1, this.fade[i] / FADE_FRAMES);
            ctx.drawImage(sp.canvas, x * cell - sp.pad, y * cell - sp.pad, cell + sp.pad * 2, cell + sp.pad * 2);
            ctx.globalAlpha = 1;
          }
          this.fade[i] -= 1;
        }
      }
    }
  }

  _drawExit(ctx, state, cell, now, t) {
    const exit = state.exit;
    if (!exit) return;
    const pulse = 0.55 + 0.45 * Math.sin(now / 260);
    const sp = this.sprites.green;
    const px = exit.x * cell, py = exit.y * cell;
    if (sp) {
      ctx.globalAlpha = pulse;
      ctx.drawImage(sp.canvas, px - sp.pad, py - sp.pad, cell + sp.pad * 2, cell + sp.pad * 2);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = t.green;
    ctx.font = `${Math.max(8, cell * 0.85)}px ${t.fontPixel}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillText('>', px + cell / 2, py + cell / 2 + cell * 0.05);
    ctx.globalAlpha = 1;
  }

  _drawHero(ctx, state, cell, now) {
    const p = state.player;
    if (!p) return;

    if (state.phase === 'dead') this._action = 'dead';
    else if (state.phase === 'won') this._action = 'win';
    else if (this._action !== 'idle' && now > this._actionExpire) this._action = 'idle';

    const bob = Math.sin(now / 300) * 2;
    const px = p.x * cell;
    const py = p.y * cell + bob;

    const glow = this.sprites.orange;
    if (glow) ctx.drawImage(glow.canvas, px - glow.pad, py - glow.pad, cell + glow.pad * 2, cell + glow.pad * 2);

    if (this.heroMode === 'sheet' && this.heroReady) {
      const interval = HERO_ANIM_MS[this._action] || HERO_ANIM_MS.idle;
      const toggle = Math.floor(now / interval) % 2;
      const base = HERO_FRAME[this._action] ?? HERO_FRAME.idle;
      const frame = (this._action === 'dead' || this._action === 'win') ? base : base + toggle;
      ctx.drawImage(this.heroImg, frame * 32, 0, 32, 32, px, py, cell, cell);
    } else if (this.heroMode === 'svg' && this.heroReady) {
      ctx.drawImage(this.heroImg, px, py, cell, cell);
    } else if (this.heroMode === 'fallback') {
      const t = this.theme;
      ctx.fillStyle = t.orange;
      ctx.fillRect(px + cell * 0.12, py + cell * 0.12, cell * 0.76, cell * 0.76);
      ctx.fillStyle = t.bg;
      const eyeSize = cell * 0.12;
      ctx.fillRect(px + cell * 0.3, py + cell * 0.38, eyeSize, eyeSize);
      ctx.fillRect(px + cell * 0.58, py + cell * 0.38, eyeSize, eyeSize);
    }
  }

  _updateAndDrawParticles(ctx, dt) {
    const particles = this.particles;
    if (particles.length === 0) return;
    const gravity = 220;
    ctx.globalCompositeOperation = 'lighter';
    let w = 0;
    for (let r = 0; r < particles.length; r++) {
      const p = particles[r];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy += gravity * (dt / 1000);
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      const alpha = 1 - p.age / p.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      particles[w++] = p;
    }
    particles.length = w;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawDanger(ctx, state, w, h, now) {
    if (state.pop == null || state.popMin == null || state.popMax == null) return;
    if (state.pop >= state.popMin && state.pop <= state.popMax) return;
    if (!this._vignetteGradient) this._buildVignette();
    const pulse = 0.35 + 0.35 * Math.sin(now / 200);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = this._vignetteGradient;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  _updateFps(now) {
    this._fpsFrames++;
    const elapsed = now - this._fpsLast;
    if (elapsed >= 250) {
      this.fps = (this._fpsFrames * 1000) / elapsed;
      this._fpsFrames = 0;
      this._fpsLast = now;
    }
  }

  _drawFps(ctx, t) {
    ctx.fillStyle = 'rgba(5,6,8,0.7)';
    ctx.fillRect(4, 4, 64, 18);
    ctx.fillStyle = t.cyan;
    ctx.font = `12px ${t.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS ${Math.round(this.fps)}`, 8, 6);
  }
}

// ---------- test aislado (#render-test), no requiere game.js ----------
if (typeof location !== 'undefined' && location.hash === '#render-test') {
  const canvas = document.getElementById('board');
  if (canvas) {
    const R_PENTOMINO = [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]];
    let grid = createGrid();
    for (const [dx, dy] of R_PENTOMINO) grid[(10 + dy) * W + (18 + dx)] = 1;
    let age = new Uint16Array(W * H);
    let prevGrid = grid;

    for (let i = 0; i < 8; i++) {
      prevGrid = grid;
      const next = step(grid, age);
      grid = next.grid;
      age = next.age;
    }

    // asegura ~100 celdas vivas aunque el r-pentomino no alcance ese número aún
    let pop = 0;
    for (let i = 0; i < grid.length; i++) pop += grid[i];
    let guard = 0;
    while (pop < 100 && guard < 2000) {
      const i = Math.floor(Math.random() * grid.length);
      if (grid[i] === 0) { grid[i] = 1; age[i] = 1; pop++; }
      guard++;
    }

    const testState = {
      phase: 'play',
      grid, age, prevGrid,
      player: { x: 2, y: 21 },
      exit: { x: 37, y: 12 },
      turn: 5, maxTurns: 30, gen: 8,
      pop, popMin: 25, popMax: 40, // pop>=100 fuerza el estado "fuera de rango"
      outOfRangeStreak: 1,
      spellsCast: 1, everOutOfRange: true,
      log: [], aiComment: '', score: null,
    };

    const renderer = new Renderer(canvas);
    renderer.setState(testState);
    renderer.showFps = true;
    renderer.start();

    renderer.burst(10, 10, 'cyan');
    renderer.burst(20, 12, 'magenta');
    renderer.burst(30, 6, 'white');

    let n = 0;
    const colors = ['cyan', 'white', 'magenta', 'green', 'orange'];
    setInterval(() => {
      const bx = Math.floor(Math.random() * W);
      const by = Math.floor(Math.random() * H);
      renderer.burst(bx, by, colors[n % colors.length]);
      n++;
    }, 1000);
  }
}
