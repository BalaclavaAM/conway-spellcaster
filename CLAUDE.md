# Conway Spellcaster — contrato de arquitectura

Roguelike de un solo nivel en el navegador. El héroe es **Clawd** (la mascota naranja de Claude).
Cruzas un tablero de Conway 40×24 desde la esquina inferior izquierda hasta la salida `>` a la derecha.
Los obstáculos son colonias vivas. No colocas células a mano: escribes hechizos en lenguaje natural
y Claude (Haiku 4.5) los traduce a un patrón del grimorio + posición + dirección.

Este archivo es el contrato entre agentes que trabajan **en paralelo**. Léelo completo antes de tocar código.

## Reglas de oro para trabajo paralelo

1. **Cada issue es dueño de sus archivos** (sección "Archivos" del issue). No edites archivos de otro issue.
   Si necesitas algo de otro módulo que aún no existe, prográmalo contra la interfaz de abajo y sigue.
2. **Vanilla JS con ES modules, cero build, cero npm.** Se abre con `index.html` desde un servidor estático
   (`python -m http.server 8080`). Nada de bundlers, TypeScript ni frameworks.
3. **Sin estado global implícito.** Cada módulo exporta funciones/clases; `game.js` es el único que orquesta.
4. **Rendimiento:** el tablero es 40×24 = 960 celdas. El render debe correr a 120+ FPS en un laptop gaming.
   Un solo `requestAnimationFrame` vive en `render.js`. La simulación es por turno, no por frame.
5. **Estética:** ver "Tema visual". Todo color sale de las variables CSS de `css/theme.css`.
6. **Trabaja directo en `main`, commits pequeños con prefijo `#<n>`** (número del issue). Los archivos
   son disjuntos por diseño, así que no hay conflictos. No crees ramas ni PRs: no hay tiempo.

## Estructura de archivos

```
index.html          shell: layout 70/30, carga js/game.js como módulo      (issue: shell)
css/theme.css       tokens de color, fuentes, CRT overlay                    (issue: shell)
css/layout.css      grid, panel derecho, overlays                            (issue: shell)
js/life.js          motor Conway puro                                        (issue: life)
js/patterns.js      grimorio + rotación                                      (issue: patterns)
js/render.js        canvas, glow, fade, partículas, sprite del héroe         (issue: render)
js/game.js          máquina de estados, turnos, jugador, nivel               (issue: game)
js/spells.js        llamada a Claude + schema + fallback por teclado         (issue: spells)
js/ui.js            panel derecho: consola, log, gauge, caja de la IA        (issue: ui)
js/audio.js         Web Audio con osciladores, sin assets                    (issue: audio)
js/tutorial.js      overlay de tutorial de 4 pasos                           (issue: tutorial)
js/score.js         overlay final con score y desglose                       (issue: score)
assets/**           arte y sonido, ver sección Assets                        (issue: assets, lo hace una persona)
```

## Interfaces (contrato; no cambiar firmas sin decirlo en el issue)

### js/life.js
```js
export const W = 40, H = 24;
export function createGrid()                    // -> Uint8Array(W*H) todo en 0
export function idx(x, y)                       // -> índice con wrap toroidal
export function step(grid, age)                 // -> { grid: Uint8Array, age: Uint16Array }  regla B3/S23
export function population(grid)                // -> número de celdas vivas
export function stamp(grid, cells, ox, oy)      // cells: [[dx,dy],...]; escribe 1 en (ox+dx, oy+dy) con wrap
export function clearRect(grid, x, y, w, h)     // pone en 0 un rectángulo (para spawn seguro del héroe)
```
`age[i]` = generaciones que lleva viva la celda (0 si muerta). `step` devuelve arrays nuevos, no muta.

### js/patterns.js
```js
export const PATTERNS = {
  glider:      { name: 'Glider',      glyph: '◢', cells: [[1,0],[2,1],[0,2],[1,2],[2,2]], moves: 'diagonal',   desc: 'Proyectil diagonal' },
  lwss:        { name: 'LWSS',        glyph: '➤', cells: [/* LifeWiki, viajando al ESTE */], moves: 'straight', desc: 'Nave recta, rompe muros' },
  block:       { name: 'Block',       glyph: '■', cells: [[0,0],[1,0],[0,1],[1,1]], moves: 'static',    desc: 'Muro' },
  beehive:     { name: 'Beehive',     glyph: '⬢', cells: [/* 6 celdas */], moves: 'static',              desc: 'Muro resistente' },
  blinker:     { name: 'Blinker',     glyph: '┃', cells: [[0,0],[1,0],[2,0]], moves: 'oscillator',       desc: 'Faro' },
  r_pentomino: { name: 'R-pentomino', glyph: '✸', cells: [[1,0],[2,0],[0,1],[1,1],[1,2]], moves: 'chaos', desc: 'Bomba de caos' },
  eater:       { name: 'Eater',       glyph: '◘', cells: [/* eater 1, 7 celdas */], moves: 'static',      desc: 'Devora proyectiles' },
};
export const SPELL_IDS = Object.keys(PATTERNS);   // el orden define las teclas 1..7
export function oriented(id, dir)   // dir: 'N'|'E'|'S'|'W' -> cells rotadas/reflejadas para que la nave viaje hacia dir
                                    // glider: N->NE, E->SE, S->SW, W->NW. Estáticos y osciladores: rotación simple.
```
Las coordenadas canónicas de cada patrón son las de LifeWiki con la nave viajando hacia el ESTE.
Incluye un `selftest()` exportado que estampa cada nave en un grid vacío, corre 4 pasos de `life.js`
y verifica que el centroide se movió en la dirección pedida. Debe pasar para las 4 direcciones.

### js/render.js
```js
export class Renderer {
  constructor(canvas)                            // maneja devicePixelRatio y resize
  setState(state)                                // recibe el objeto state de game.js; no lo muta
  burst(x, y, color)                             // partículas ~300 ms en la celda (x,y) al castear
  start()                                        // arranca el rAF loop
}
```
Render: celda viva = cuadrado con borde neón cian y relleno oscuro translúcido; `age===1` = blanco-cian brillante;
celda que murió en el último step = fade magenta durante ~3 frames (compara `state.prevGrid`).
Héroe: si existe `assets/clawd_sheet.png` anima frames (idle 2 fps, walk al moverse, cast al castear, dead/win
según `phase`); si no, `assets/clawd.svg` estático; si no, placeholder. Siempre con bob senoidal de 2 px.
Salida = `>` verde con pulso. Glow: pre-renderiza UNA celda con `shadowBlur` a un offscreen canvas por color
y usa `drawImage` (mucho más rápido que shadowBlur por celda). Objetivo: 120+ FPS, medir con un contador
de FPS visible con la tecla F.

### js/game.js  (orquestador; es el único que importa a todos)
```js
export const state = {
  phase: 'tutorial' | 'play' | 'won' | 'dead',
  grid, age, prevGrid,                          // de life.js
  player: { x, y },  exit: { x, y },
  turn, maxTurns: 30, gen,
  pop, popMin: 10, popMax: 80, outOfRangeStreak,
  spellsCast: 0, everOutOfRange: false,
  log: [],                                      // [{ text, kind: 'cast'|'ai'|'sys' }]
  aiComment: '',
  score: null,                                  // lo llena score.js al terminar
};
export function movePlayer(dx, dy)              // 1 celda; luego step(); muere si pisa celda viva tras el step
export function castSpell({ spell, x, y, dir, comment })  // stamp + burst + step + log + sfx
export function reset()
```
Cada movimiento del jugador = 1 generación. Cada hechizo = 1 generación (el jugador no se mueve).
Muere si la celda destino está viva **después** del step, o si `pop` está fuera de [popMin, popMax]
durante 2 turnos seguidos (el primero dispara `sfx.alarm()` y el gauge en rojo). Gana al llegar a `exit`.
Pierde también si `turn > maxTurns`.

**Nivel fijo (determinista, para poder ensayar la demo):**
- jugador en (2, 21), `clearRect(0, 19, 5, 5)`.
- salida en (37, 12), rodeada por un anillo cerrado de `block` y `beehive` a distancia 2 (sin hueco:
  hay que romperlo con un LWSS o un r_pentomino cercano).
- colonias iniciales: un `r_pentomino` en (18, 10) y un `glider` en (30, 3) orientado hacia SW.
- población inicial debe quedar entre 25 y 40.

### js/spells.js
```js
export async function interpret(text, ctx)      // ctx: { player, exit, pop, turn, popMin, popMax, summary }
                                                // -> { spell, x, y, dir, comment }  validado contra SPELL_IDS y rangos
export function keyboardFallback(key, ctx)      // '1'..'7' -> mismo objeto (posición: 3 celdas frente al héroe, dir E), sin red
export function getApiKey() / setApiKey(k)      // localStorage 'anthropic_key'
export function buildSummary(state)             // -> string corto para el modelo (ver abajo)
```
Llamada directa desde el browser a `https://api.anthropic.com/v1/messages` con headers
`x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`.
Modelo `claude-haiku-4-5-20251001`, `max_tokens: 200`, **tool_choice forzado** a la tool `cast_spell` con schema:
`{ spell: enum SPELL_IDS, x: int 0..39, y: int 0..23, dir: enum [N,E,S,W], comment: string }`.
System prompt: eres la IA del reactor, ácida estilo GLaDOS, hablas español, `comment` es UNA frase ≤ 90 chars
que juzga la jugada; nunca explicas el hechizo. Reglas de mapeo en el system prompt: "proyectil/dispara/lanza" →
lwss (recto) o glider (diagonal); "muro/protege/bloquea" → block/beehive/eater; "estalla/bomba/caos" → r_pentomino;
"faro/señal" → blinker. Coloca naves 2 celdas por delante del héroe en la dirección del objetivo.
`summary` = posición del héroe, salida, población, turno y bounding boxes de las colonias (≤ 6), NUNCA las 960 celdas.
Timeout 4 s o error → devuelve `keyboardFallback('2')` con `comment: 'Reactor offline. Improviso.'`.

### js/ui.js
```js
export function mountUI(root, { onSpell, onKey })   // construye el panel derecho dentro de #panel
export function updateUI(state)                     // gauge, log (últimos 8), aiComment, turno, gen, pop
export function setBusy(bool)                       // "casting…" con cursor parpadeante en la consola
export function promptApiKey()                      // -> Promise<string>, modal simple
```
Panel: `┌ SPELL CONSOLE ┐` (textarea de 3 líneas, Enter envía, Shift+Enter salto), log, gauge vertical
`REACTOR POPULATION` 0–100 con zonas rojas < popMin y > popMax y aguja ◀ con el número, caja `┌ REACTOR AI ┐`
con el comentario (efecto typewriter 20 ms/char), fila de 7 iconos del grimorio con su tecla.

### js/audio.js
```js
export const sfx = { cast(), step(), die(), win(), alarm(), ui() }   // ≤ 600 ms cada uno
export function unlock()                                             // llamar en el primer gesto del usuario
export function toggleMute()
export function music(on)                                            // loop de assets/music/loop.ogg si existe
```
Al arrancar intenta `fetch` de cada `assets/sfx/<name>.wav` y los decodifica; el que falte se reemplaza por su
oscilador 8-bit (`square`/`triangle`, envolvente corta). La música es opcional y arranca en `unlock()`.

### js/tutorial.js
```js
export function showTutorial(root, onDone)     // overlay sobre el tablero, 4 pasos, botón "JUGAR"
```
Referencia visual: `docs/ref-tutorial.jpg`.
Pasos: 1) Eres Clawd, llega a `>`. 2) Las celdas cian están vivas y te matan; siguen las reglas de Conway
(mini-demo animada de 3 generaciones dentro del overlay). 3) Escribe hechizos en la consola; ejemplo tipeado
con typewriter. 4) El reactor explota fuera del rango de población. Navegable con → y Enter.

### js/score.js
```js
export function computeScore(state)            // -> { total, rank: 'S'|'A'|'B'|'C', breakdown: [{ label, points }] }
export function showScore(root, state, onRetry)
```
Fórmula: 1000 base + 25 × turnos sobrantes + 150 × hechizos usados (máx 4) + 300 si nunca salió de rango
de población. Si murió: mismo overlay con título "REACTOR PERDIDO" y solo los puntos acumulados.
Rangos: S ≥ 2200, A ≥ 1800, B ≥ 1400, C resto. Contador animado que sube, botón "OTRA VEZ" (R).
Referencia visual: `docs/ref-score.jpg`.

## Assets (los produce una persona, no un agente; el código los carga con fallback)

Todo asset es **opcional**: cada módulo intenta cargarlo y si falla usa su fallback procedural.
Nombres y specs fijos para que código y arte avancen en paralelo sin hablarse:

| Archivo | Spec | Fallback en código |
|---|---|---|
| `assets/clawd.svg` | Clawd (mascota naranja de Claude), viewBox 32×32, transparente, < 3 KB | cuadrado naranja con 2 ojos |
| `assets/clawd_sheet.png` | sprite sheet 32×32 por frame, 1 fila, 8 frames: idle×2, walk×2, cast×2, dead, win. Fondo transparente, estilo pixel art 1 px de contorno oscuro | `clawd.svg` estático |
| `assets/icons/<spell>.svg` | 7 iconos monocromos (rellena con `currentColor`), viewBox 24×24, uno por id: glider, lwss, block, beehive, blinker, r_pentomino, eater | glyph unicode de `PATTERNS` |
| `assets/logo.svg` | logotipo `CONWAY SPELLCASTER` para tutorial y score, viewBox 400×80, cian con glow, transparente | texto en fuente pixel |
| `assets/rank_S.svg` … `rank_C.svg` | 4 medallas 64×64 para el score | letra en fuente pixel |
| `assets/sfx/cast.wav` `step.wav` `die.wav` `win.wav` `alarm.wav` `ui.wav` | 8-bit, mono, ≤ 600 ms, 44.1 kHz, normalizados a −6 dB. Sugerido: jsfxr (sfxr.me) | osciladores de `audio.js` |
| `assets/music/loop.ogg` | chiptune loop 30–60 s, ~120 BPM, tenso y oscuro, cortado a compás para loop perfecto, ≤ 1 MB. Sugerido: BeepBox | sin música |
| `assets/favicon.png` | 64×64, Clawd sobre negro | ninguno |
| `docs/screenshot-1.png`, `docs/screenshot-2.png`, `docs/demo.gif` | capturas finales del juego real (las toma integración) | — |

Paleta obligatoria para todo el arte: los colores de `css/theme.css`. Clawd siempre `#ff7a1a` con ojos `#050608`.
Estilo: pixel art limpio, contorno de 1 px, sin antialiasing en los PNG, neón sobre negro.

## Tema visual (css/theme.css)

```css
:root {
  --bg: #050608;  --grid: #14181f;  --panel: #0a0c10;  --border: #2a3140;
  --cyan: #19e6ff; --cyan-dim: #0a6b78; --white: #eafcff;
  --magenta: #ff2fa0; --orange: #ff7a1a; --yellow: #ffe14d; --green: #35ff8a; --red: #ff3b3b;
  --font-mono: 'IBM Plex Mono', 'Cascadia Mono', Consolas, monospace;
  --font-pixel: 'Press Start 2P', var(--font-mono);
}
```
Fondo negro, gridlines `--grid`, glow cian, panel derecho con bordes de 1 px `--border` y títulos en cajas
tipo terminal. Overlay CRT: scanlines al 6 % de opacidad + viñeta suave. Google Fonts permitido.
Referencia visual: `docs/mockup-1.png` (estado normal), `docs/mockup-2.png` (caos), `docs/ref-tutorial.jpg`, `docs/ref-score.jpg`.

## Cómo correr

```
python -m http.server 8080
# abrir http://localhost:8080
```
Teclas: flechas/WASD mover · Enter enfoca la consola · 1..7 hechizo por teclado · R reiniciar · M mute · F FPS.
