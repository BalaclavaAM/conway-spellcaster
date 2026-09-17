// Conway Spellcaster — js/ui.js
// Panel derecho: consola de hechizos, log, gauge de población, caja de IA, grimorio.
// Issue #7. Solo toca este archivo; estilos propios inyectados vía <style> (usa vars de css/theme.css).

// ponytail: lista literal de fallback si js/patterns.js aún no existe o falla el import dinámico.
const FALLBACK_PATTERNS = {
  glider:      { name: 'Glider',      glyph: '◢', desc: 'Proyectil diagonal' },
  lwss:        { name: 'LWSS',        glyph: '➤', desc: 'Nave recta, rompe muros' },
  block:       { name: 'Block',       glyph: '■', desc: 'Muro' },
  beehive:     { name: 'Beehive',     glyph: '⬢', desc: 'Muro resistente' },
  blinker:     { name: 'Blinker',     glyph: '┃', desc: 'Faro' },
  r_pentomino: { name: 'R-pentomino', glyph: '✸', desc: 'Bomba de caos' },
  eater:       { name: 'Eater',       glyph: '◘', desc: 'Devora proyectiles' },
};
const FALLBACK_SPELL_IDS = Object.keys(FALLBACK_PATTERNS);

let els = null;
let twTimer = null;
let lastAiComment = null;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function injectStyle() {
  if (document.getElementById('ui-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'ui-panel-style';
  style.textContent = `
#panel { display: flex; flex-direction: column; gap: 0.8em; font-size: 13px; }
#panel .box { margin-top: 0; }

.console-wrap { position: relative; }
.spell-textarea {
  width: 100%;
  resize: none;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--white);
  font-family: var(--font-mono);
  font-size: 1em;
  padding: 0.5em;
  line-height: 1.4;
}
.spell-textarea:focus { outline: none; border-color: var(--cyan-dim); }
.spell-textarea:disabled { color: transparent; }

.casting-indicator {
  display: none;
  position: absolute;
  inset: 1px;
  align-items: center;
  padding: 0.5em;
  background: var(--panel);
  color: var(--cyan);
  font-family: var(--font-mono);
  pointer-events: none;
}
.casting-indicator.active { display: flex; }
.casting-indicator .cursor { animation: ui-blink 1s steps(1) infinite; margin-left: 0.3em; }

@keyframes ui-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

.log-list { display: flex; flex-direction: column; gap: 0.2em; word-break: break-word; }
.log-line { line-height: 1.35; }
.log-cast { color: var(--cyan); }
.log-ai { color: var(--orange); }
.log-sys { color: var(--border); }

.gauge { display: flex; align-items: stretch; height: 220px; gap: 0.6em; }
.gauge-labels {
  display: flex; flex-direction: column; justify-content: space-between;
  font-size: 0.7em; color: var(--white); opacity: 0.6; text-align: right;
}
.gauge-track-wrap { position: relative; width: 22px; }
.gauge-track {
  width: 100%; height: 100%;
  border: 1px solid var(--border);
  box-sizing: border-box;
}
.gauge-track.gauge-alarm { animation: ui-alarm-blink 0.5s steps(1) infinite; }
@keyframes ui-alarm-blink {
  0%, 49% { background: var(--red) !important; }
  50%, 100% { background: transparent !important; border-color: var(--red); }
}
.gauge-needle {
  position: absolute;
  left: calc(100% + 4px);
  transform: translateY(50%);
  bottom: 0%;
  transition: bottom 0.3s ease;
  color: var(--white);
  white-space: nowrap;
  font-size: 0.85em;
}
.gauge-side {
  display: flex; flex-direction: column; justify-content: space-between;
  font-size: 0.65em; letter-spacing: 0.03em; text-align: left; margin-left: 2.4em;
}
.gauge-side-label.over { color: var(--red); }
.gauge-side-label.safe { color: var(--green); }
.gauge-side-label.under { color: var(--red); }

.ai-text { color: var(--orange); min-height: 3.6em; line-height: 1.4; white-space: pre-wrap; }

.grimoire-row { display: flex; gap: 0.4em; flex-wrap: wrap; }
.btn.spell {
  flex: 1 1 0;
  display: flex; flex-direction: column; align-items: center; gap: 0.3em;
  padding: 0.5em 0.3em;
}
.btn.spell img, .btn.spell .spell-glyph { width: 22px; height: 22px; }
.spell-glyph { display: flex; align-items: center; justify-content: center; font-size: 1.1em; color: var(--cyan); }
.spell-key { font-size: 0.75em; opacity: 0.7; }

.apikey-box { max-width: 360px; }
.apikey-text { margin: 0 0 0.8em; line-height: 1.4; }
.apikey-input {
  width: 100%; background: transparent; border: 1px solid var(--border); color: var(--white);
  font-family: var(--font-mono); padding: 0.5em; margin-bottom: 0.8em;
}
.apikey-input:focus { outline: none; border-color: var(--cyan-dim); }
.apikey-actions { display: flex; flex-direction: column; gap: 0.5em; align-items: stretch; }
.apikey-skip { color: var(--border); border-color: var(--border); font-size: 0.78em; }
.apikey-skip:hover { color: var(--cyan); border-color: var(--cyan-dim); }
`;
  document.head.appendChild(style);
}

function renderLog(log) {
  if (!els || !els.logList) return;
  els.logList.innerHTML = '';
  const items = Array.isArray(log) ? log.slice(-8) : [];
  for (const entry of items) {
    const kind = (entry && entry.kind) || 'sys';
    const text = (entry && entry.text) || '';
    const div = document.createElement('div');
    div.className = 'log-line log-' + kind;
    div.textContent = kind === 'cast' ? '> ' + text : text;
    els.logList.appendChild(div);
  }
}

function updateGauge(state) {
  if (!els) return;
  const pop = clamp(Number(state.pop) || 0, 0, 100);
  const min = clamp(state.popMin != null ? Number(state.popMin) : 10, 0, 100);
  const max = clamp(state.popMax != null ? Number(state.popMax) : 80, 0, 100);
  els.gaugeTrack.style.background =
    `linear-gradient(to top, var(--red) 0%, var(--red) ${min}%, var(--green) ${min}%, var(--green) ${max}%, var(--red) ${max}%, var(--red) 100%)`;
  els.gaugeNeedle.style.bottom = pop + '%';
  els.gaugeNeedleNum.textContent = String(Math.round(Number(state.pop) || 0));
  const outOfRange = Number(state.pop) < min || Number(state.pop) > max;
  els.gaugeTrack.classList.toggle('gauge-alarm', !!outOfRange);
}

function typewrite(el, text) {
  const value = text || '';
  if (value === lastAiComment) return;
  lastAiComment = value;
  clearInterval(twTimer);
  el.textContent = '';
  if (!value) return;
  let i = 0;
  twTimer = setInterval(() => {
    el.textContent += value[i];
    i += 1;
    if (i >= value.length) clearInterval(twTimer);
  }, 20);
}

async function buildGrimoire(container, onKey) {
  let patterns = FALLBACK_PATTERNS;
  let ids = FALLBACK_SPELL_IDS;
  try {
    const mod = await import('./patterns.js');
    if (mod && mod.PATTERNS) {
      patterns = mod.PATTERNS;
      ids = mod.SPELL_IDS || Object.keys(mod.PATTERNS);
    }
  } catch (e) {
    // fallback ya asignado
  }

  container.innerHTML = '';
  ids.forEach((id, i) => {
    const p = patterns[id] || {};
    const key = String(i + 1);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn spell';
    btn.title = p.desc || p.name || id;
    btn.dataset.id = id;

    const img = document.createElement('img');
    img.src = `assets/icons/${id}.svg`;
    img.alt = p.name || id;
    img.onerror = () => {
      const glyph = document.createElement('span');
      glyph.className = 'spell-glyph';
      glyph.textContent = p.glyph || '?';
      img.replaceWith(glyph);
    };

    const keySpan = document.createElement('span');
    keySpan.className = 'spell-key';
    keySpan.textContent = key;

    btn.appendChild(img);
    btn.appendChild(keySpan);
    btn.addEventListener('click', () => {
      if (typeof onKey === 'function') onKey(key);
    });
    container.appendChild(btn);
  });
}

export function mountUI(root, handlers = {}) {
  const { onSpell, onKey } = handlers;
  injectStyle();
  lastAiComment = null;
  clearInterval(twTimer);
  root.innerHTML = '';

  // SPELL CONSOLE
  const consoleBox = document.createElement('div');
  consoleBox.className = 'box';
  consoleBox.dataset.title = 'SPELL CONSOLE';
  const consoleWrap = document.createElement('div');
  consoleWrap.className = 'console-wrap';
  const textarea = document.createElement('textarea');
  textarea.className = 'spell-textarea';
  textarea.rows = 3;
  textarea.placeholder = 'lanza un hechizo...';
  const castingIndicator = document.createElement('div');
  castingIndicator.className = 'casting-indicator';
  castingIndicator.innerHTML = 'casting<span class="cursor">▌</span>';
  consoleWrap.appendChild(textarea);
  consoleWrap.appendChild(castingIndicator);
  consoleBox.appendChild(consoleWrap);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = textarea.value.trim();
      if (text && typeof onSpell === 'function') onSpell(text);
      textarea.value = '';
    } else if (e.key === 'Escape') {
      textarea.blur();
    }
  });

  // LOG
  const logBox = document.createElement('div');
  logBox.className = 'box log-box';
  logBox.dataset.title = 'LOG';
  const logList = document.createElement('div');
  logList.className = 'log-list';
  logBox.appendChild(logList);

  // REACTOR POPULATION
  const gaugeBox = document.createElement('div');
  gaugeBox.className = 'box';
  gaugeBox.dataset.title = 'REACTOR POPULATION';
  const gauge = document.createElement('div');
  gauge.className = 'gauge';

  const gaugeLabels = document.createElement('div');
  gaugeLabels.className = 'gauge-labels';
  for (let v = 100; v >= 0; v -= 10) {
    const span = document.createElement('span');
    span.textContent = String(v);
    gaugeLabels.appendChild(span);
  }

  const gaugeTrackWrap = document.createElement('div');
  gaugeTrackWrap.className = 'gauge-track-wrap';
  const gaugeTrack = document.createElement('div');
  gaugeTrack.className = 'gauge-track';
  const gaugeNeedle = document.createElement('div');
  gaugeNeedle.className = 'gauge-needle';
  gaugeNeedle.innerHTML = '◀ <span class="gauge-needle-num">0</span>';
  gaugeTrackWrap.appendChild(gaugeTrack);
  gaugeTrackWrap.appendChild(gaugeNeedle);

  const gaugeSide = document.createElement('div');
  gaugeSide.className = 'gauge-side';
  gaugeSide.innerHTML =
    '<span class="gauge-side-label over">SOBRECARGA</span>' +
    '<span class="gauge-side-label safe">SAFE</span>' +
    '<span class="gauge-side-label under">MUERTE TÉRMICA</span>';

  gauge.appendChild(gaugeLabels);
  gauge.appendChild(gaugeTrackWrap);
  gauge.appendChild(gaugeSide);
  gaugeBox.appendChild(gauge);

  // REACTOR AI
  const aiBox = document.createElement('div');
  aiBox.className = 'box';
  aiBox.dataset.title = 'REACTOR AI';
  const aiText = document.createElement('div');
  aiText.className = 'ai-text';
  aiBox.appendChild(aiText);

  // GRIMOIRE
  const grimoire = document.createElement('div');
  grimoire.className = 'grimoire-row';

  root.appendChild(consoleBox);
  root.appendChild(logBox);
  root.appendChild(gaugeBox);
  root.appendChild(aiBox);
  root.appendChild(grimoire);

  els = {
    textarea,
    castingIndicator,
    logList,
    gaugeTrack,
    gaugeNeedle,
    gaugeNeedleNum: gaugeNeedle.querySelector('.gauge-needle-num'),
    aiText,
    grimoire,
    gen: document.getElementById('gen'),
    turn: document.getElementById('turn'),
    maxturn: document.getElementById('maxturn'),
  };

  buildGrimoire(grimoire, onKey);
}

export function updateUI(state) {
  if (!els || !state) return;
  if (els.gen) els.gen.textContent = String(state.gen != null ? state.gen : 0);
  if (els.turn) els.turn.textContent = String(state.turn != null ? state.turn : 0);
  if (els.maxturn && state.maxTurns != null) els.maxturn.textContent = String(state.maxTurns);
  renderLog(state.log);
  updateGauge(state);
  typewrite(els.aiText, state.aiComment);
}

export function setBusy(bool) {
  if (!els) return;
  els.textarea.disabled = !!bool;
  els.castingIndicator.classList.toggle('active', !!bool);
  if (!bool) els.textarea.focus();
}

export function focusConsole() {
  if (els && els.textarea) els.textarea.focus();
}

export function promptApiKey() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('overlay');
    if (!overlay) { resolve(''); return; }
    injectStyle();

    const box = document.createElement('div');
    box.className = 'box apikey-box';
    box.dataset.title = 'REACTOR LINK';
    box.innerHTML =
      '<p class="apikey-text">Conecta tu API key de Anthropic para invocar al Reactor AI.</p>' +
      '<input type="password" class="apikey-input" placeholder="sk-ant-..." autocomplete="off" />' +
      '<div class="apikey-actions">' +
      '<button type="button" class="btn apikey-connect">CONECTAR</button>' +
      '<button type="button" class="btn apikey-skip">jugar sin API (modo teclado 1..7)</button>' +
      '</div>';
    overlay.appendChild(box);

    const input = box.querySelector('.apikey-input');
    const connectBtn = box.querySelector('.apikey-connect');
    const skipBtn = box.querySelector('.apikey-skip');

    function cleanup() {
      document.removeEventListener('keydown', onKeydown);
      box.remove();
    }
    function finish(value) {
      cleanup();
      resolve(value);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') finish('');
    }

    connectBtn.addEventListener('click', () => finish(input.value.trim()));
    skipBtn.addEventListener('click', () => finish(''));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim()); }
    });
    document.addEventListener('keydown', onKeydown);
    input.focus();
  });
}
