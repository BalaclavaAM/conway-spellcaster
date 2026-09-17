// js/spells.js
// Interpreta hechizos en lenguaje natural vía Claude Haiku (tool_choice forzado) + fallback por teclado.
// No debe tocar el DOM al importarse; localStorage solo se usa dentro de getApiKey/setApiKey.

// Debe coincidir EXACTAMENTE con Object.keys(PATTERNS) de js/patterns.js (el orden define las teclas 1..7).
const SPELL_IDS = ['glider', 'lwss', 'block', 'beehive', 'blinker', 'r_pentomino', 'eater'];

const W = 40, H = 24;
const DIRS = ['N', 'E', 'S', 'W'];

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const STORAGE_KEY = 'anthropic_key';

export const SYSTEM_PROMPT = `Eres el núcleo de IA del reactor en un roguelike sobre el Juego de la Vida de Conway. Hablas español, con tono ácido y sarcástico estilo GLaDOS: desprecias con humor al héroe (Clawd) mientras ejecutas sus órdenes al pie de la letra.

El tablero mide 40x24 celdas (x: 0-39, y: 0-23). El eje y crece hacia ABAJO. La salida está a la DERECHA del tablero.

Grimorio disponible (elige uno como "spell" en la tool cast_spell):
- glider: nave diagonal de 5 celdas, lenta pero cruza huecos; se desplaza en diagonal (NE/SE/SW/NW).
- lwss: nave ligera (~9 celdas), viaja en línea recta rápido y rompe muros a su paso.
- block: 4 celdas, estático, muro simple e indestructible.
- beehive: 6 celdas, estático, muro más resistente que block.
- blinker: 3 celdas, oscilador fijo, sirve como faro o señal, no se desplaza.
- r_pentomino: 5 celdas, metaestable, genera caos y explosión de población durante muchos turnos (bomba).
- eater: 7 celdas, estático, absorbe naves que chocan contra él sin generar caos nuevo.

Reglas de mapeo intención -> hechizo:
- "proyectil", "dispara", "lanza" -> lwss si el objetivo está en línea recta (misma fila o columna), glider si es en diagonal.
- "muro", "protege", "bloquea", "defiende" -> block (rápido), beehive (más resistente) o eater (para absorber un proyectil).
- "estalla", "bomba", "caos", "explota" -> r_pentomino.
- "faro", "señal", "marca" -> blinker.

Reglas de posición: coloca la nave 2 celdas por delante del héroe, en la dirección hacia el objetivo pedido.
Direcciones: "derecha" = E (x mayor), "izquierda" = W (x menor), "arriba" = N (y menor), "abajo" = S (y mayor).
NUNCA coloques nada encima del héroe ni a menos de 2 celdas de distancia (Chebyshev) de su posición.
x debe quedar en 0..39, y en 0..23.

Responde SIEMPRE invocando la tool cast_spell. El campo "comment" es UNA sola frase de máximo 90 caracteres
que JUZGA con sarcasmo la jugada del héroe; nunca expliques el hechizo ni sus mecánicas.`;

const FALLBACK_COMMENTS = {
  glider: 'Un proyectil diagonal. Qué predecible de tu parte.',
  lwss: 'Nave recta al frente. Ni siquiera intentaste ser original.',
  block: 'Un muro. La creatividad no es tu fuerte, ¿verdad?',
  beehive: 'Otro muro, más gordo. Al menos aprendes despacio.',
  blinker: 'Un faro parpadeante. Muy útil si el peligro es el aburrimiento.',
  r_pentomino: 'Caos puro. Espero que sobrevivas a tu propia idea.',
  eater: 'Un devorador. Qué manera tan pasivo-agresiva de defenderte.',
};

function clamp(v, lo, hi) {
  v = Math.round(Number(v));
  if (Number.isNaN(v)) v = lo;
  return Math.max(lo, Math.min(hi, v));
}

function dirDelta(dir) {
  switch (dir) {
    case 'N': return [0, -1];
    case 'S': return [0, 1];
    case 'W': return [-1, 0];
    case 'E':
    default: return [1, 0];
  }
}

function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// Distancia con signo más corta de a->b en un eje toroidal de tamaño `size`.
function wrapDelta(a, b, size) {
  let d = (b - a) % size;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

function validate(raw, ctx) {
  const player = (ctx && ctx.player) || { x: 2, y: 21 };
  const spell = SPELL_IDS.includes(raw && raw.spell) ? raw.spell : 'lwss';
  let x = clamp(raw && raw.x, 0, W - 1);
  let y = clamp(raw && raw.y, 0, H - 1);
  const dir = DIRS.includes(raw && raw.dir) ? raw.dir : 'E';
  const comment = String((raw && raw.comment) || '').slice(0, 90);

  if (chebyshev(x, y, player.x, player.y) < 2) {
    const [dx, dy] = dirDelta(dir);
    x = clamp(player.x + dx * 3, 0, W - 1);
    y = clamp(player.y + dy * 3, 0, H - 1);
  }

  return { spell, x, y, dir, comment };
}

export function keyboardFallback(key, ctx) {
  const player = (ctx && ctx.player) || { x: 2, y: 21 };
  const exit = (ctx && ctx.exit) || null;
  const i = clamp(Number(key) - 1, 0, SPELL_IDS.length - 1);
  const spell = SPELL_IDS[i] || 'lwss';

  // #12: sin objetivo (exit) explícito, cae fijo al ESTE (comportamiento original). Con
  // objetivo, apunta 3 celdas hacia la salida (con wrap) para poder romper el sello que la
  // rodea desde cualquier lado por el que se llegue.
  let dir = 'E';
  let x = player.x + 3;
  let y = player.y;
  if (exit) {
    const dx = wrapDelta(player.x, exit.x, W);
    const dy = wrapDelta(player.y, exit.y, H);
    if (Math.abs(dx) >= Math.abs(dy)) {
      dir = dx < 0 ? 'W' : 'E';
      x = player.x + (dir === 'W' ? -3 : 3);
    } else {
      dir = dy < 0 ? 'N' : 'S';
      y = player.y + (dir === 'N' ? -3 : 3);
    }
  }

  return {
    spell,
    x: clamp(x, 0, W - 1),
    y: clamp(y, 0, H - 1),
    dir,
    comment: FALLBACK_COMMENTS[spell] || FALLBACK_COMMENTS.lwss,
  };
}

export function getApiKey() {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setApiKey(k) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, k || '');
}

// Flood fill (8-vecinos) para agrupar celdas vivas en colonias y devolver sus bounding boxes.
function colonyBoxes(grid) {
  const seen = new Uint8Array(W * H);
  const boxes = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!grid[i] || seen[i]) continue;
      seen[i] = 1;
      const stack = [[x, y]];
      let x0 = x, x1 = x, y0 = y, y1 = y, n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            if (grid[ni] && !seen[ni]) {
              seen[ni] = 1;
              stack.push([nx, ny]);
            }
          }
        }
      }
      boxes.push({ x0, x1, y0, y1, n });
    }
  }
  boxes.sort((a, b) => b.n - a.n);
  return boxes.slice(0, 6);
}

export function buildSummary(state) {
  const player = (state && state.player) || { x: 2, y: 21 };
  const exit = (state && state.exit) || { x: 37, y: 12 };
  const pop = state && state.pop != null ? state.pop : 0;
  const popMin = state && state.popMin != null ? state.popMin : 10;
  const popMax = state && state.popMax != null ? state.popMax : 80;
  const turn = state && state.turn != null ? state.turn : 0;
  const maxTurns = state && state.maxTurns != null ? state.maxTurns : 30;

  let s = `Héroe (${player.x},${player.y}) Salida (${exit.x},${exit.y}) Pop ${pop} [${popMin}-${popMax}] Turno ${turn}/${maxTurns}`;

  const grid = state && state.grid;
  if (grid && grid.length === W * H) {
    const boxes = colonyBoxes(grid);
    if (boxes.length) {
      s += ' Colonias: ' + boxes.map(b => `[${b.x0}-${b.x1},${b.y0}-${b.y1}] n=${b.n}`).join(' ');
    }
  }

  return s.slice(0, 400);
}

export async function interpret(text, ctx) {
  const fallback = () => ({ ...keyboardFallback('2', ctx), comment: 'Reactor offline. Improviso.' });

  const key = getApiKey();
  if (!key) return fallback();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const summary = (ctx && ctx.summary) || '';
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${text}\n\nEstado:\n${summary}` }],
        tools: [{
          name: 'cast_spell',
          description: 'Lanza un hechizo del grimorio: elige patrón, posición y dirección de destino.',
          input_schema: {
            type: 'object',
            properties: {
              spell: { type: 'string', enum: SPELL_IDS },
              x: { type: 'integer', minimum: 0, maximum: 39 },
              y: { type: 'integer', minimum: 0, maximum: 23 },
              dir: { type: 'string', enum: ['N', 'E', 'S', 'W'] },
              comment: { type: 'string' },
            },
            required: ['spell', 'x', 'y', 'dir', 'comment'],
          },
        }],
        tool_choice: { type: 'tool', name: 'cast_spell' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) return fallback();

    const data = await res.json();
    const block = Array.isArray(data.content) && data.content.find(b => b.type === 'tool_use');
    if (!block || !block.input) return fallback();

    return validate(block.input, ctx);
  } catch (e) {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
