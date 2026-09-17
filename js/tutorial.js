// Conway Spellcaster — js/tutorial.js
// Overlay de tutorial de 4 pasos. Issue #9. Solo toca este archivo.
// Estilos propios inyectados una vez vía <style>, usando las variables de css/theme.css.

function injectStyle() {
  if (document.getElementById('tutorial-style')) return;
  const style = document.createElement('style');
  style.id = 'tutorial-style';
  style.textContent = `
.tut-box {
  width: 720px;
  max-width: 92vw;
  max-height: 80vh;
  margin-top: 0.7em;
  display: flex;
  flex-direction: column;
  gap: 1em;
}
/* título centrado (a diferencia del .box genérico, alineado a la izquierda) */
.tut-box[data-title]::before {
  left: 50%;
  transform: translateX(-50%);
}
.tut-body {
  display: flex;
  gap: 1.6em;
  align-items: center;
  min-height: 260px;
}
.tut-visual {
  flex: 0 0 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tut-text {
  flex: 1;
  min-width: 0;
  font-size: 0.95em;
  line-height: 1.55;
  color: var(--white);
}
.tut-text h2 {
  margin: 0 0 0.5em;
  font-size: 1.15em;
  color: var(--white);
}
.tut-goal .exit { color: var(--green); font-weight: bold; }
.tut-hint { margin-top: 0.9em; color: var(--cyan-dim); font-size: 0.85em; }

.tut-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tut-dots {
  flex: 1;
  text-align: center;
  font-size: 1.1em;
  letter-spacing: 0.35em;
  color: var(--border);
}
.tut-dots .on { color: var(--cyan); text-shadow: 0 0 6px var(--cyan-dim); }

img.tut-clawd { width: 200px; height: 200px; image-rendering: pixelated; }
.tut-clawd-fallback {
  width: 200px; height: 200px;
  background: var(--orange);
  border-radius: 28px;
  position: relative;
}
.tut-clawd-fallback::before, .tut-clawd-fallback::after {
  content: '';
  position: absolute;
  top: 66px;
  width: 24px; height: 34px;
  background: var(--bg);
  border-radius: 4px;
}
.tut-clawd-fallback::before { left: 46px; }
.tut-clawd-fallback::after { left: 128px; }

canvas.tut-life { border: 1px solid var(--cyan-dim); background: var(--bg); }

.tut-console-line { color: var(--white); min-height: 1.4em; }
.tut-console-cursor { display: inline-block; width: 0.5em; background: var(--cyan); animation: tut-blink 1s steps(1) infinite; }
.tut-result { margin-top: 0.7em; color: var(--cyan); }
.tut-comment { margin-top: 0.3em; color: var(--orange); }
@keyframes tut-blink { 50% { opacity: 0; } }

.tut-gauge-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.6em; }
.tut-gauge {
  width: 34px; height: 200px;
  border: 1px solid var(--border);
  background: var(--panel);
  position: relative;
  overflow: hidden;
}
.tut-gauge-fill {
  position: absolute; bottom: 0; left: 0; width: 100%;
  background: linear-gradient(to top, var(--yellow), var(--red));
}
.tut-gauge-fill.danger { animation: tut-gauge-blink 0.35s steps(1) infinite; }
@keyframes tut-gauge-blink { 50% { opacity: 0.35; } }
.tut-gauge-label { font-size: 0.75em; color: var(--cyan); }
`;
  document.head.appendChild(style);
}

// ---- mini motor de vida local (B3/S23, toroidal), 12x8, no importa life.js ----
const GW = 12, GH = 8;
function idxOf(x, y) { return ((y % GH + GH) % GH) * GW + ((x % GW + GW) % GW); }
function stamp(grid, cells, ox, oy) { cells.forEach(([dx, dy]) => { grid[idxOf(ox + dx, oy + dy)] = 1; }); }
// Blinker y glider se simulan en grids separados (misma regla) para que nunca
// interactúen entre sí y el loop de 24 gens se vea siempre limpio.
function makeBlinkerGrid() {
  const g = new Uint8Array(GW * GH);
  stamp(g, [[0, 0], [1, 0], [2, 0]], 5, 1);
  return g;
}
function makeGliderGrid() {
  const g = new Uint8Array(GW * GH);
  stamp(g, [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], 0, 0);
  return g;
}
function stepLife(grid) {
  const next = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) n += grid[idxOf(x + dx, y + dy)];
        }
      }
      const alive = grid[idxOf(x, y)];
      next[idxOf(x, y)] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
    }
  }
  return next;
}

const STEPS = 4;

export function showTutorial(root, onDone) {
  injectStyle();

  let step = 0;
  let stepTimers = []; // interval/timeout ids del paso actual

  function clearStepTimers() {
    stepTimers.forEach((id) => { clearInterval(id); clearTimeout(id); });
    stepTimers = [];
  }

  const box = document.createElement('div');
  box.className = 'box tut-box';
  box.innerHTML = `
    <div class="tut-body">
      <div class="tut-visual">
        <img class="tut-clawd" src="assets/clawd.svg" alt="Clawd">
      </div>
      <div class="tut-text"></div>
    </div>
    <div class="tut-footer">
      <div class="tut-dots"></div>
      <button class="btn tut-next"></button>
    </div>
  `;
  root.innerHTML = '';
  root.appendChild(box);

  const textEl = box.querySelector('.tut-text');
  const dotsEl = box.querySelector('.tut-dots');
  const nextBtn = box.querySelector('.tut-next');

  // Clawd es fijo en los 4 pasos; si falta el sprite, cae a placeholder naranja una sola vez.
  const clawdImg = box.querySelector('.tut-clawd');
  clawdImg.onerror = () => {
    const fb = document.createElement('div');
    fb.className = 'tut-clawd-fallback';
    clawdImg.replaceWith(fb);
  };

  function renderDots() {
    let s = '';
    for (let i = 0; i < STEPS; i++) s += i === step ? '<span class="on">●</span> ' : '○ ';
    dotsEl.innerHTML = s.trim();
  }

  function buildStep1() {
    textEl.innerHTML = `
      <h2>Eres Clawd.</h2>
      <p class="tut-goal">Cruza el tablero hasta la salida <span class="exit">&gt;</span> a la derecha.</p>
      <p class="tut-hint">Controles: flechas / WASD para moverte.</p>
    `;
  }

  function buildStep2() {
    textEl.innerHTML = `
      <h2>Las celdas <span style="color:var(--cyan)">cian</span> están vivas. Te matan.</h2>
      <canvas class="tut-life" width="${GW * 30}" height="${GH * 30}"></canvas>
      <p class="tut-hint">Siguen las reglas de Conway: 3 vecinos nace, 2 o 3 sobrevive.</p>
    `;
    const canvas = textEl.querySelector('.tut-life');
    const ctx = canvas.getContext('2d');
    const cell = 30;
    let blinker = makeBlinkerGrid();
    let glider = makeGliderGrid();
    let gens = 0;

    function draw() {
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#14181f';
      for (let x = 0; x <= GW; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, GH * cell); ctx.stroke(); }
      for (let y = 0; y <= GH; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell), ctx.lineTo(GW * cell, y * cell); ctx.stroke(); }
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          if (!blinker[idxOf(x, y)] && !glider[idxOf(x, y)]) continue;
          ctx.fillStyle = 'rgba(25, 230, 255, 0.20)';
          ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
          ctx.strokeStyle = '#19e6ff';
          ctx.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        }
      }
    }
    draw();
    const id = setInterval(() => {
      blinker = stepLife(blinker);
      glider = stepLife(glider);
      gens++;
      if (gens >= 24) { blinker = makeBlinkerGrid(); glider = makeGliderGrid(); gens = 0; }
      draw();
    }, 500);
    stepTimers.push(id);
  }

  function buildStep3() {
    textEl.innerHTML = `
      <h2>Habla con el reactor.</h2>
      <p>Escribe lo que quieres en la consola, en español natural. El reactor traduce tu orden a un hechizo.</p>
      <div class="box" data-title="SPELL CONSOLE" style="margin-top:0.8em">
        <div class="tut-console-line mono"><span class="tut-typed"></span><span class="tut-console-cursor">&nbsp;</span></div>
        <div class="tut-result mono" style="visibility:hidden">→ LWSS (5,21) E</div>
        <div class="tut-comment mono" style="visibility:hidden">Un proyectil. Qué originalidad.</div>
      </div>
      <p class="tut-hint">Atajo sin conexión: teclas 1..7 lanzan un hechizo del grimorio directamente.</p>
    `;
    const typedEl = textEl.querySelector('.tut-typed');
    const resultEl = textEl.querySelector('.tut-result');
    const commentEl = textEl.querySelector('.tut-comment');
    const line = 'lanza un proyectil hacia la derecha';
    const HOLD_MS = 3200;

    function cycle() {
      typedEl.textContent = '';
      resultEl.style.visibility = 'hidden';
      commentEl.style.visibility = 'hidden';
      let i = 0;
      function typeChar() {
        i++;
        typedEl.textContent = line.slice(0, i);
        if (i < line.length) {
          stepTimers.push(setTimeout(typeChar, 40));
        } else {
          stepTimers.push(setTimeout(() => {
            resultEl.style.visibility = 'visible';
            commentEl.style.visibility = 'visible';
            stepTimers.push(setTimeout(cycle, HOLD_MS));
          }, 400));
        }
      }
      typeChar();
    }
    cycle();
  }

  function buildStep4() {
    textEl.innerHTML = `
      <h2>El reactor es inestable.</h2>
      <div style="display:flex; gap:1.2em; align-items:center; margin: 0.6em 0;">
        <div class="tut-gauge-wrap">
          <div class="tut-gauge-label">REACTOR</div>
          <div class="tut-gauge"><div class="tut-gauge-fill" style="height:20%"></div></div>
        </div>
        <p style="margin:0">Población fuera de 10&ndash;60 durante 2 turnos = <span style="color:var(--red)">boom</span>.</p>
      </div>
      <p class="tut-hint">Vigila el gauge del panel derecho mientras juegas.</p>
    `;
    const fill = textEl.querySelector('.tut-gauge-fill');
    let pct = 20;
    let rising = true;
    const id = setInterval(() => {
      if (rising) {
        pct += 8;
        if (pct >= 96) rising = false;
      } else {
        pct = 20;
        rising = true;
      }
      fill.style.height = pct + '%';
      fill.classList.toggle('danger', pct >= 80);
    }, 350);
    stepTimers.push(id);
  }

  const builders = [buildStep1, buildStep2, buildStep3, buildStep4];

  function render() {
    clearStepTimers();
    box.dataset.title = `TUTORIAL ${step + 1}/4`;
    builders[step]();
    renderDots();
    nextBtn.textContent = step === STEPS - 1 ? 'JUGAR' : 'SIGUIENTE →';
  }

  function finish() {
    clearStepTimers();
    window.removeEventListener('keydown', onKeyDown);
    root.innerHTML = '';
    onDone();
  }

  function goNext() {
    if (step < STEPS - 1) { step++; render(); } else { finish(); }
  }
  function goPrev() {
    if (step > 0) { step--; render(); }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(); }
    // cualquier otra tecla (F, M, ...) pasa de largo: no interceptamos el juego.
  }

  nextBtn.addEventListener('click', goNext);
  window.addEventListener('keydown', onKeyDown);

  render();
}
