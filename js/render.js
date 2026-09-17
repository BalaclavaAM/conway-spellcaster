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

// #render-polish: timings de las animaciones nuevas, todas dentro del rAF único.
const POP_IN_MS = 140;          // pop-in de celdas recién nacidas (age===1)
const HERO_SQUASH_MS = 90;      // squash del héroe al moverse
const HERO_TRAIL_MS = 250;      // vida del trail del héroe
const SCAN_PERIOD_MS = 4000;    // periodo del scanline horizontal
const RADAR_PERIOD_MS = 1200;   // periodo del anillo radar en la salida
const CONFETTI_DURATION_MS = 2000;
const CONFETTI_INTERVAL_MS = 150;

// easeOutBack suavizado (c1 bajo = menos overshoot) para el pop-in.
function easeOutBackSoft(x) {
  const c1 = 1.15, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = readTheme();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.state = null;
    this._prevPlayer = null;
    this._prevSpellsCast = 0;
    this._prevGen = null;
    this._prevPhase = null;
    this._action = 'idle';
    this._actionExpire = 0;

    this.fade = new Float32Array(W * H);

    this.cellSize = 0;
    this.sprites = {};
    this._vignetteGradient = null;
    this._scanGradient = null;
    this._rgbCache = {};

    // #render-polish: step timing (pop-in), shake, flash, trail del héroe, confeti
    this._stepAt = 0;
    this._shakeStart = -Infinity;
    this._shakeMs = 0;
    this._shakeIntensity = 0;
    this._flashState = null;
    this._heroMoveAt = -Infinity;
    this._heroTrail = [];
    this._confettiUntil = 0;
    this._confettiNextFire = 0;
    this._confettiIdx = 0;

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

    // Observa al PADRE, no al canvas: si observáramos el canvas, cambiar su buffer
    // cambia su tamaño intrínseco -> nuevo resize -> bucle que lo encoge hasta 40x24 px.
    this._box = this.canvas.parentElement || this.canvas;
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(this._box);
    window.addEventListener('keydown', this._onKey);

    this._loadHero();
    this._resize(); // primer cálculo de tamaño/sprites antes del primer frame
  }

  // ---------- assets del héroe ----------
  _loadHero() {
    this.heroMode = 'sheet'; // 'sheet' | 'svg' | 'fallback'
    this.heroReady = false;
    const img = new Image();
    img.onload = () => {
      // #12: el sheet del humano llegó con fondo blanco opaco; chroma-key del blanco -> transparente
      if (this.heroMode === 'sheet') {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const x = c.getContext('2d');
          x.drawImage(img, 0, 0);
          const id = x.getImageData(0, 0, c.width, c.height);
          const d = id.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) d[i + 3] = 0;
          }
          x.putImageData(id, 0, 0);
          this.heroImg = c;
        } catch (e) { /* si falla, se dibuja tal cual */ }
      }
      this.heroReady = true;
    };
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
    const box = this._box;
    let rectW = box.clientWidth, rectH = box.clientHeight;
    if (box !== this.canvas) {
      const cs = getComputedStyle(box);
      rectW -= parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      rectH -= parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    }
    if (!(rectW > 0) || !(rectH > 0)) { rectW = W * 20; rectH = H * 20; }
    const cell = Math.max(1, Math.floor(Math.min(rectW / W, rectH / H)));
    const bufW = Math.max(1, Math.round(cell * W * this.dpr));
    const bufH = Math.max(1, Math.round(cell * H * this.dpr));
    // tamaño CSS explícito: el layout ya no depende del buffer
    this.canvas.style.width = (cell * W) + 'px';
    this.canvas.style.height = (cell * H) + 'px';

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
      this._buildScanGradient();
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

  _buildScanGradient() {
    const w = this.cssW;
    const [r, gC, b] = this._hexToRgb(this.theme.cyan);
    const g = this.ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, `rgba(${r},${gC},${b},0)`);
    g.addColorStop(0.5, `rgba(${r},${gC},${b},0.06)`);
    g.addColorStop(1, `rgba(${r},${gC},${b},0)`);
    this._scanGradient = g;
  }

  // ---------- color helpers (cachean el parseo hex, cero allocación por frame) ----------
  _hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  }

  _rgba(colorName, alpha) {
    let rgb = this._rgbCache[colorName];
    if (!rgb) {
      rgb = this._hexToRgb(this.theme[colorName] || colorName);
      this._rgbCache[colorName] = rgb;
    }
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  // ---------- API pública ----------
  setState(state) {
    const now = performance.now();

    // #render-polish: cada step (mover o castear) dispara el pop-in de las celdas nuevas
    if (state && state.gen !== this._prevGen) {
      this._stepAt = now;
      this._prevGen = state.gen;
    }

    if (state && state.player) {
      const moved = !!(this._prevPlayer && (this._prevPlayer.x !== state.player.x || this._prevPlayer.y !== state.player.y));
      if (moved) {
        this._action = 'walk';
        this._actionExpire = now + HERO_ACTION_HOLD.walk;
        this._heroMoveAt = now;
        this._heroTrail.push({ x: this._prevPlayer.x, y: this._prevPlayer.y, t: now });
        if (this._heroTrail.length > 3) this._heroTrail.shift();
        this._footParticles(this._prevPlayer.x, this._prevPlayer.y);
      } else if ((state.spellsCast || 0) > this._prevSpellsCast) {
        this._action = 'cast';
        this._actionExpire = now + HERO_ACTION_HOLD.cast;
        this.shake(3, 160);
        this.flash('cyan', 120, 0.18);
      }
      this._prevPlayer = { x: state.player.x, y: state.player.y };
      this._prevSpellsCast = state.spellsCast || 0;
    }

    if (state && state.phase !== this._prevPhase) {
      if (state.phase === 'dead') {
        this.shake(8, 400);
        this.flash('red', 300, 0.35);
      } else if (state.phase === 'won') {
        this.flash('green', 400, 0.25);
        this._confettiUntil = now + CONFETTI_DURATION_MS;
        this._confettiNextFire = now;
        this._confettiIdx = 0;
      }
      this._prevPhase = state.phase;
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
    this._spawnParticles(cx, cy, fill, { count: 24, speedMin: 60, speedMax: 210, life: 300, sizeMin: 1.5, sizeMax: 3.5 });
  }

  // pies del héroe al moverse: mismo sistema de partículas, más chicas y cortas.
  _footParticles(x, y) {
    if (!this.cellSize) return;
    const cell = this.cellSize;
    const cx = x * cell + cell / 2;
    const cy = y * cell + cell * 0.85;
    this._spawnParticles(cx, cy, this.theme.orange, { count: 6, speedMin: 15, speedMax: 60, life: 200, sizeMin: 1, sizeMax: 1.8 });
  }

  _spawnParticles(cx, cy, color, { count, speedMin, speedMax, life, sizeMin, sizeMax }) {
    for (let k = 0; k < count; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0, life,
        color,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
      });
    }
  }

  // screen shake: offset aleatorio decreciente aplicado una vez al inicio del frame.
  shake(intensity = 4, ms = 180) {
    this._shakeStart = performance.now();
    this._shakeMs = ms;
    this._shakeIntensity = intensity;
  }

  // flash de pantalla completa, alpha decreciente lineal.
  flash(color, ms = 200, maxAlpha = 0.25) {
    this._flashState = { color, start: performance.now(), ms, maxAlpha };
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

    // el shake solo desplaza el contenido, no el fondo ya pintado -> sin ghosting en los bordes.
    ctx.save();
    this._applyShake(ctx, now);

    this._drawGrid(ctx, w, h, cell, t);
    if (state) this._drawDangerGrid(ctx, w, h, cell, now, state);
    this._drawScanLine(ctx, w, h, now);

    if (state) {
      this._drawCells(ctx, state, cell, now);
      this._drawExit(ctx, state, cell, now, t);
      this._drawHeroTrail(ctx, cell, now);
      this._drawHero(ctx, state, cell, now);
    }

    this._updateAndDrawParticles(ctx, dt);

    if (state) this._drawDanger(ctx, state, w, h, now);
    this._drawFlash(ctx, w, h, now);

    ctx.restore();

    if (state) this._updateConfetti(state, now);

    this._updateFps(now);
    if (this.showFps) this._drawFps(ctx, t);
  }

  _applyShake(ctx, now) {
    const elapsed = now - this._shakeStart;
    if (elapsed >= this._shakeMs) return;
    const amp = this._shakeIntensity * (1 - elapsed / this._shakeMs);
    ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
  }

  _drawFlash(ctx, w, h, now) {
    const f = this._flashState;
    if (!f) return;
    const elapsed = now - f.start;
    if (elapsed >= f.ms) { this._flashState = null; return; }
    ctx.fillStyle = this._rgba(f.color, f.maxAlpha * (1 - elapsed / f.ms));
    ctx.fillRect(0, 0, w, h);
  }

  _updateConfetti(state, now) {
    if (now >= this._confettiUntil || now < this._confettiNextFire) return;
    const exit = state.exit;
    if (!exit) return;
    const palette = ['green', 'white', 'cyan'];
    this.burst(exit.x, exit.y, palette[this._confettiIdx % palette.length]);
    this._confettiIdx++;
    this._confettiNextFire = now + CONFETTI_INTERVAL_MS;
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

  // gridlines rojas parpadeando a 2 Hz cuando la población está fuera de rango (o venimos de estarlo).
  _drawDangerGrid(ctx, w, h, cell, now, state) {
    if (state.pop == null || state.popMin == null || state.popMax == null) return;
    const outOfRange = state.pop < state.popMin || state.pop > state.popMax;
    if (!outOfRange && !(state.outOfRangeStreak > 0)) return;
    if (Math.floor(now / 250) % 2 !== 0) return; // 2 Hz: medio ciclo encendido, medio apagado
    ctx.strokeStyle = this._rgba('red', 0.15);
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

  // scanline horizontal sutil, un solo fillRect por frame (barato).
  _drawScanLine(ctx, w, h, now) {
    if (!this._scanGradient) return;
    const phase = (now % SCAN_PERIOD_MS) / SCAN_PERIOD_MS;
    ctx.fillStyle = this._scanGradient;
    ctx.fillRect(0, phase * h, w, 2);
  }

  _drawCells(ctx, state, cell, now) {
    const { grid, age } = state;
    if (!grid) return;
    const sprites = this.sprites;
    const stepElapsed = now - this._stepAt;
    const popInActive = stepElapsed >= 0 && stepElapsed < POP_IN_MS;
    const popInScale = popInActive ? 0.55 + 0.45 * easeOutBackSoft(stepElapsed / POP_IN_MS) : 1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (grid[i] === 1) {
          const isNew = age && age[i] === 1;
          const sp = isNew ? sprites.white : sprites.cyan;
          if (!sp) continue;
          if (isNew && popInActive) {
            this._drawSpriteScaled(ctx, sp, x, y, cell, popInScale, 1);
          } else {
            ctx.drawImage(sp.canvas, x * cell - sp.pad, y * cell - sp.pad, cell + sp.pad * 2, cell + sp.pad * 2);
          }
        } else if (this.fade[i] > 0) {
          const sp = sprites.magenta;
          if (sp) {
            const ratio = this.fade[i] / FADE_FRAMES;
            // implosión: la celda que muere encoge de 1.0 a 0.7 mientras se desvanece.
            this._drawSpriteScaled(ctx, sp, x, y, cell, 0.7 + 0.3 * ratio, Math.min(1, ratio));
          }
          this.fade[i] -= 1;
        }
      }
    }
  }

  _drawSpriteScaled(ctx, sp, x, y, cell, scale, alpha) {
    const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.drawImage(sp.canvas, -cell / 2 - sp.pad, -cell / 2 - sp.pad, cell + sp.pad * 2, cell + sp.pad * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
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

    // anillo de radar: se expande y desvanece, un ciclo cada 1.2s.
    const rp = (now % RADAR_PERIOD_MS) / RADAR_PERIOD_MS;
    ctx.globalAlpha = 0.5 * (1 - rp);
    ctx.strokeStyle = t.green;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px + cell / 2, py + cell / 2, cell * (0.5 + 1.3 * rp), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = t.green;
    ctx.font = `${Math.max(8, cell * 0.85)}px ${t.fontPixel}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.fillText('>', px + cell / 2, py + cell / 2 + cell * 0.05);
    ctx.globalAlpha = 1;
  }

  // trail: últimas 3 posiciones del héroe, cuadrado naranja translúcido que se desvanece.
  _drawHeroTrail(ctx, cell, now) {
    const trail = this._heroTrail;
    for (let k = 0; k < trail.length; k++) {
      const p = trail[k];
      const age = now - p.t;
      if (age < 0 || age >= HERO_TRAIL_MS) continue;
      ctx.fillStyle = this._rgba('orange', 0.25 * (1 - age / HERO_TRAIL_MS));
      ctx.fillRect(p.x * cell, p.y * cell, cell, cell);
    }
  }

  _drawHero(ctx, state, cell, now) {
    const p = state.player;
    if (!p) return;

    if (state.phase === 'dead') this._action = 'dead';
    else if (state.phase === 'won') this._action = 'win';
    else if (this._action !== 'idle' && now > this._actionExpire) this._action = 'idle';

    const bob = Math.sin(now / 300) * 2;
    // #12: el héroe se veía diminuto a 1 celda; se dibuja a 1.6 celdas centrado en su casilla.
    const size = cell * 1.6;
    const cx = p.x * cell + cell / 2;
    const cy = p.y * cell + cell / 2 + bob;
    const px = cx - size / 2;
    const py = cy - size / 2;

    // squash al moverse: X 1.15 / Y 0.85 -> vuelve a 1,1 en 90ms.
    const squashElapsed = now - this._heroMoveAt;
    const squashing = squashElapsed >= 0 && squashElapsed < HERO_SQUASH_MS;
    const sp2 = squashing ? squashElapsed / HERO_SQUASH_MS : 1;
    const scaleX = squashing ? 1.15 - 0.15 * sp2 : 1;
    const scaleY = squashing ? 0.85 + 0.15 * sp2 : 1;

    ctx.save();
    if (squashing) {
      ctx.translate(cx, cy);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-cx, -cy);
    }

    const glow = this.sprites.orange;
    if (glow) ctx.drawImage(glow.canvas, px - glow.pad, py - glow.pad, size + glow.pad * 2, size + glow.pad * 2);

    if (this.heroMode === 'sheet' && this.heroReady) {
      const interval = HERO_ANIM_MS[this._action] || HERO_ANIM_MS.idle;
      const toggle = Math.floor(now / interval) % 2;
      const base = HERO_FRAME[this._action] ?? HERO_FRAME.idle;
      const frame = (this._action === 'dead' || this._action === 'win') ? base : base + toggle;
      ctx.drawImage(this.heroImg, frame * 32, 0, 32, 32, px, py, size, size);
    } else if (this.heroMode === 'svg' && this.heroReady) {
      ctx.drawImage(this.heroImg, px, py, size, size);
    } else if (this.heroMode === 'fallback') {
      const t = this.theme;
      ctx.fillStyle = t.orange;
      ctx.fillRect(px + size * 0.12, py + size * 0.12, size * 0.76, size * 0.76);
      ctx.fillStyle = t.bg;
      const eyeSize = size * 0.12;
      ctx.fillRect(px + size * 0.3, py + size * 0.38, eyeSize, eyeSize);
      ctx.fillRect(px + size * 0.58, py + size * 0.38, eyeSize, eyeSize);
    }

    ctx.restore();
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
