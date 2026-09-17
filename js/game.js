// Conway Spellcaster — js/game.js
// Orquestador. Único módulo que importa a todos los demás: life, patterns, render,
// spells, ui, audio, tutorial, score. Issue #5. Solo toca este archivo.
//
// Cada dependencia se importa con `await import()` dinámico + try/catch: life, patterns
// y render son P0 (si falta alguno, se aborta con un error claro en consola). El resto
// (spells, ui, audio, tutorial, score) son opcionales: si faltan, el juego sigue con
// degradación explícita (ver loadModule más abajo y los guards `mod &&` en cada uso).

async function loadModule(path, label, required) {
  try {
    return await import(path);
  } catch (e) {
    const log = required ? console.error : console.warn;
    log(`[game] módulo ${required ? 'REQUERIDO' : 'opcional'} "${label}" (${path}) no disponible:`, e);
    return null;
  }
}

const life = await loadModule('./life.js', 'life', true);
const patterns = await loadModule('./patterns.js', 'patterns', true);
const render = await loadModule('./render.js', 'render', true);
const spells = await loadModule('./spells.js', 'spells', false);
const ui = await loadModule('./ui.js', 'ui', false);
const audio = await loadModule('./audio.js', 'audio', false);
const tutorial = await loadModule('./tutorial.js', 'tutorial', false);
const score = await loadModule('./score.js', 'score', false);

const bootError = !life || !patterns || !render;
if (bootError) {
  console.error('[game] Abortando: falta life.js, patterns.js o render.js (módulos P0).');
}

// sfx stub silencioso: cubre audio.js ausente (ola 2) sin llenar el código de `audio &&`.
const sfx = (audio && audio.sfx) || { cast() {}, step() {}, die() {}, win() {}, alarm() {}, ui() {} };

// ---------------------------------------------------------------------------
// Nivel determinista (ver CLAUDE.md "Nivel fijo").
//
// Anillo de la salida: la salida (37,12) debe quedar rodeada SIN hueco: ningún camino
// de celdas muertas debe unir al jugador con la salida en el grid inicial. Se construye
// con 4 `block` en las esquinas del anillo + 3 `block` de lado (el 4º lado queda cerrado
// por solape con las esquinas: verificado por BFS, ver bfsExitReachable) + 1 `beehive`
// decorativo cerca del camino del jugador. Población inicial resultante: 38 (rango 25-40).
// Verificado con node + js/life.js + js/patterns.js reales antes de fijar estos offsets.
const LEVEL = {
  player: { x: 2, y: 21 },
  exit: { x: 37, y: 12 },
  popMin: 10,
  popMax: 80,
  maxTurns: 30,
};

const RING_CORNERS = [[-2, -2], [1, -2], [-2, 1], [1, 1]];
const RING_SIDES = [[0, -2], [-1, 1], [-2, -1]]; // el 4º lado ([1,-1]) queda cubierto por solape
const BEEHIVE_OFFSET = { x: 24, y: 17 };

function bfsExitReachable(grid, from, to) {
  const seen = new Uint8Array(life.W * life.H);
  const stack = [[from.x, from.y]];
  seen[life.idx(from.x, from.y)] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x === to.x && y === to.y) return true;
    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= life.W || ny < 0 || ny >= life.H) continue;
      const i = life.idx(nx, ny);
      if (seen[i] || grid[i] === 1) continue;
      seen[i] = 1;
      stack.push([nx, ny]);
    }
  }
  return false;
}

export function buildLevel() {
  const grid0 = life.createGrid();

  life.stamp(grid0, patterns.PATTERNS.r_pentomino.cells, 18, 10);
  life.stamp(grid0, patterns.oriented('glider', 'S'), 30, 3);

  const block = patterns.PATTERNS.block.cells;
  for (const [dx, dy] of [...RING_CORNERS, ...RING_SIDES]) {
    life.stamp(grid0, block, LEVEL.exit.x + dx, LEVEL.exit.y + dy);
  }
  life.stamp(grid0, patterns.PATTERNS.beehive.cells, BEEHIVE_OFFSET.x, BEEHIVE_OFFSET.y);

  life.clearRect(grid0, 0, 19, 5, 5);

  const pop0 = life.population(grid0);
  console.log(`[game] nivel construido: población inicial = ${pop0}`);
  if (pop0 < 25 || pop0 > 40) {
    console.error(`[game] ¡población inicial fuera de rango 25-40! pop=${pop0}`);
  }
  if (bfsExitReachable(grid0, LEVEL.player, LEVEL.exit)) {
    console.error('[game] ¡el anillo de la salida tiene un hueco! La salida es alcanzable sin hechizo.');
  } else {
    console.log('[game] anillo de la salida verificado por BFS: cerrado.');
  }

  return {
    phase: 'tutorial',
    grid: grid0,
    age: new Uint16Array(life.W * life.H),
    prevGrid: grid0,
    player: { x: LEVEL.player.x, y: LEVEL.player.y },
    exit: { x: LEVEL.exit.x, y: LEVEL.exit.y },
    turn: 0,
    maxTurns: LEVEL.maxTurns,
    gen: 0,
    pop: pop0,
    popMin: LEVEL.popMin,
    popMax: LEVEL.popMax,
    outOfRangeStreak: 0,
    spellsCast: 0,
    everOutOfRange: false,
    log: [],
    aiComment: '',
    score: null,
  };
}

const FALLBACK_STATE = {
  phase: 'dead',
  grid: null, age: null, prevGrid: null,
  player: { x: 0, y: 0 }, exit: { x: 0, y: 0 },
  turn: 0, maxTurns: 30, gen: 0,
  pop: 0, popMin: 10, popMax: 80, outOfRangeStreak: 0,
  spellsCast: 0, everOutOfRange: false,
  log: [{ text: 'Error fatal: faltan módulos life/patterns/render.', kind: 'sys' }],
  aiComment: '',
  score: null,
};

export const state = bootError ? FALLBACK_STATE : buildLevel();

// ---------------------------------------------------------------------------
// Máquina de turnos

let rendererInstance = null;

function syncViews() {
  if (rendererInstance) rendererInstance.setState(state);
  if (ui) ui.updateUI(state);
}

function stepGeneration() {
  state.prevGrid = state.grid;
  const next = life.step(state.grid, state.age);
  state.grid = next.grid;
  state.age = next.age;
}

function overlayEl() {
  return typeof document !== 'undefined' ? document.getElementById('overlay') : null;
}

function finish(outcome) {
  state.phase = outcome;
  if (outcome === 'won') sfx.win(); else sfx.die();

  if (score && typeof score.computeScore === 'function') {
    state.score = score.computeScore(state);
  }

  syncViews();

  const overlay = overlayEl();
  if (!overlay) return;

  if (score && typeof score.showScore === 'function') {
    score.showScore(overlay, state, reset);
    return;
  }

  overlay.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'box';
  const title = outcome === 'won' ? 'REACTOR ESTABILIZADO' : 'REACTOR PERDIDO';
  box.dataset.title = title;
  const p = document.createElement('p');
  p.textContent = `${title} — R para reiniciar`;
  box.appendChild(p);
  overlay.appendChild(box);
}

function resolveTurn() {
  state.gen += 1;
  state.turn += 1;
  state.pop = life.population(state.grid);

  if (state.player.x === state.exit.x && state.player.y === state.exit.y) {
    finish('won');
    return;
  }
  if (state.grid[life.idx(state.player.x, state.player.y)] === 1) {
    finish('dead');
    return;
  }
  if (state.turn > state.maxTurns) {
    finish('dead');
    return;
  }

  if (state.pop < state.popMin || state.pop > state.popMax) {
    state.outOfRangeStreak += 1;
    state.everOutOfRange = true;
    if (state.outOfRangeStreak === 1) {
      sfx.alarm();
      state.log.push({ text: 'ALARMA: población del reactor fuera de rango.', kind: 'sys' });
    } else {
      finish('dead');
      return;
    }
  } else {
    state.outOfRangeStreak = 0;
  }

  syncViews();
}

export function movePlayer(dx, dy) {
  if (bootError || state.phase !== 'play') return;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (nx < 0 || nx >= life.W || ny < 0 || ny >= life.H) return;

  state.player.x = nx;
  state.player.y = ny;

  stepGeneration();
  sfx.step();
  resolveTurn();
}

export function castSpell(cast = {}) {
  if (bootError || state.phase !== 'play') return;
  const { spell, x, y, dir, comment } = cast;
  if (!patterns.PATTERNS[spell]) {
    console.warn('[game] castSpell: patrón desconocido, ignorado:', spell);
    return;
  }
  const useDir = dir || 'E';

  life.stamp(state.grid, patterns.oriented(spell, useDir), x, y);
  if (rendererInstance) rendererInstance.burst(x, y, '#19e6ff');

  stepGeneration();

  state.spellsCast += 1;
  state.log.push({ text: `cast ${String(spell).toUpperCase()} at (${x},${y}) → ${useDir}`, kind: 'cast' });
  if (comment) {
    state.log.push({ text: comment, kind: 'ai' });
    state.aiComment = comment;
  }
  sfx.cast();

  resolveTurn();
}

export function reset() {
  if (bootError) return;
  const fresh = buildLevel();
  Object.assign(state, fresh);
  state.phase = 'play'; // reset nunca vuelve a mostrar el tutorial

  const overlay = overlayEl();
  if (overlay) overlay.innerHTML = '';

  syncViews();
}

// ---------------------------------------------------------------------------
// Input + arranque (solo en navegador; en Node se puede importar este módulo
// para reutilizar buildLevel/movePlayer/castSpell sin tocar el DOM).

let askedApiKeyThisSession = false;

function buildCtx() {
  return {
    player: state.player,
    exit: state.exit,
    pop: state.pop,
    turn: state.turn,
    popMin: state.popMin,
    popMax: state.popMax,
  };
}

async function onSpell(text) {
  if (bootError || !spells || state.phase !== 'play') return;

  if (!spells.getApiKey() && !askedApiKeyThisSession) {
    askedApiKeyThisSession = true;
    if (ui && typeof ui.promptApiKey === 'function') {
      const k = await ui.promptApiKey();
      if (k) spells.setApiKey(k);
    }
  }

  if (ui) ui.setBusy(true);
  const ctx = { ...buildCtx(), summary: spells.buildSummary ? spells.buildSummary(state) : '' };
  const r = await spells.interpret(text, ctx);
  if (ui) ui.setBusy(false);
  castSpell(r);
}

function isTypingTarget(el) {
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
}

const MOVES = {
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
};

function handleKey(rawKey) {
  const k = String(rawKey).toLowerCase();

  if (k === 'r') { reset(); return; }

  if (k === 'enter') {
    const ta = document.querySelector('#panel textarea');
    if (ta) ta.focus();
    return;
  }

  if (state.phase !== 'play') return; // fuera de 'play' solo R (y Enter, inofensivo) funcionan

  if (MOVES[k]) { movePlayer(MOVES[k][0], MOVES[k][1]); return; }

  if (k >= '1' && k <= '7') {
    if (!spells) return;
    castSpell(spells.keyboardFallback(k, buildCtx()));
    return;
  }

  if (k === 'm' && audio && typeof audio.toggleMute === 'function') { audio.toggleMute(); return; }
}

function onKey(k) {
  handleKey(k);
}

let audioUnlocked = false;
function unlockAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  if (audio && typeof audio.unlock === 'function') audio.unlock();
}

function wireInput() {
  window.addEventListener('keydown', (e) => {
    unlockAudioOnce();
    const active = document.activeElement;
    if (isTypingTarget(active)) {
      if (e.key === 'Escape') active.blur();
      return;
    }
    if (e.key === 'f' || e.key === 'F') return; // F: lo maneja render.js
    handleKey(e.key);
  });
  window.addEventListener('click', unlockAudioOnce, { once: true });
}

async function startGame() {
  if (bootError) {
    const overlay = overlayEl();
    if (overlay) overlay.textContent = 'Error fatal: faltan módulos life/patterns/render. Revisa la consola.';
    return;
  }

  const canvas = document.getElementById('board');
  rendererInstance = new render.Renderer(canvas);
  rendererInstance.setState(state);
  rendererInstance.start();

  if (ui && typeof ui.mountUI === 'function') {
    ui.mountUI(document.getElementById('panel'), { onSpell, onKey });
  } else {
    console.warn('[game] ui.js no disponible: sigo solo con teclado.');
  }

  wireInput();

  if (tutorial && typeof tutorial.showTutorial === 'function') {
    tutorial.showTutorial(overlayEl(), () => {
      state.phase = 'play';
      syncViews();
    });
  } else {
    state.phase = 'play';
  }

  syncViews();
}

if (typeof document !== 'undefined') {
  await startGame();
}

if (typeof window !== 'undefined') {
  window.__game = { state, movePlayer, castSpell, reset };
}
