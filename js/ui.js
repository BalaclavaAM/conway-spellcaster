// Panel derecho: consola de hechizos, log, gauge de población y grimorio.
// Ver contrato en CLAUDE.md / issue #7.

const FALLBACK_PATTERNS = {
  glider: { name: 'Glider', glyph: '◢', desc: 'Proyectil diagonal' },
  lwss: { name: 'LWSS', glyph: '➤', desc: 'Nave recta, rompe muros' },
  block: { name: 'Block', glyph: '■', desc: 'Muro' },
  beehive: { name: 'Beehive', glyph: '⬢', desc: 'Muro resistente' },
  blinker: { name: 'Blinker', glyph: '┃', desc: 'Faro' },
  r_pentomino: { name: 'R-pentomino', glyph: '✸', desc: 'Bomba de caos' },
  eater: { name: 'Eater', glyph: '◘', desc: 'Devora proyectiles' },
};
const FALLBACK_SPELL_IDS = Object.keys(FALLBACK_PATTERNS);

const STYLE_ID = 'ui-panel-styles';
const LOG_SIZE = 8;
const TYPE_SPEED_MS = 20;

let els = null;

async function loadPatterns() {
  try {
    const mod = await import('./patterns.js');
    if (mod.PATTERNS && mod.SPELL_IDS) {
      return { PATTERNS: mod.PATTERNS, SPELL_IDS: mod.SPELL_IDS };
    }
  } catch {
    // js/patterns.js todavía no existe (issue en paralelo): usa la lista literal de CLAUDE.md.
  }
  return { PATTERNS: FALLBACK_PATTERNS, SPELL_IDS: FALLBACK_SPELL_IDS };
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ui-panel { display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; }
    .ui-panel * { box-sizing: border-box; }
    /* #12: el panel desbordaba a 1080p (fila de iconos por debajo del fold); menos padding. */
    .ui-panel .box { padding: 1.1em 0.7em 0.6em; margin-top: 0.6em; }
    .ui-box-body { padding: 6px 8px; }

    .ui-log { display: flex; flex-direction: column; gap: 2px; min-height: calc(${LOG_SIZE} * 1.1em); font-size: 0.8em; }
    .ui-log-line { white-space: pre-wrap; word-break: break-word; }
    .ui-log-line--cast { color: var(--cyan, #19e6ff); }
    .ui-log-line--ai { color: var(--orange, #ff7a1a); }
    .ui-log-line--sys { color: #7a8494; }

    .ui-console-input-wrap { position: relative; margin-top: 8px; }
    .ui-console-input {
      width: 100%; resize: none; background: transparent;
      border: 1px solid var(--border, #2a3140); color: var(--white, #eafcff);
      padding: 6px; font-size: 0.9em; font-family: inherit;
    }
    .ui-console-input:disabled { opacity: 0.4; }
    .ui-console-status {
      position: absolute; inset: 0; display: flex; align-items: center;
      padding: 6px; color: var(--cyan, #19e6ff); background: var(--panel, #0a0c10);
    }
    .ui-console-status[hidden] { display: none; }
    .ui-caret { margin-left: 2px; animation: ui-blink 1s step-end infinite; }
    @keyframes ui-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

    .ui-gauge { display: flex; gap: 8px; height: 150px; }
    .ui-gauge-ticks {
      display: flex; flex-direction: column; justify-content: space-between;
      font-size: 0.7em; color: var(--border, #2a3140); text-align: right;
    }
    .ui-gauge-track {
      position: relative; width: 14px;
      border: 1px solid var(--border, #2a3140);
    }
    .ui-gauge-track--alarm { animation: ui-alarm-blink 0.5s steps(1) infinite; }
    @keyframes ui-alarm-blink { 0%, 49% { border-color: var(--red, #ff3b3b); } 50%, 100% { border-color: var(--border, #2a3140); } }
    .ui-gauge-needle {
      position: absolute; left: 100%; margin-left: 4px; white-space: nowrap;
      transform: translateY(50%); transition: bottom 300ms ease;
      font-size: 0.85em; color: var(--white, #eafcff);
    }
    .ui-gauge-needle--danger { color: var(--red, #ff3b3b); }
    .ui-gauge-labels { position: relative; font-size: 0.72em; }
    .ui-gauge-label { position: absolute; left: 0; transform: translateY(50%); white-space: nowrap; }
    .ui-gauge-label--over { color: var(--red, #ff3b3b); }
    .ui-gauge-label--safe { color: var(--green, #35ff8a); }
    .ui-gauge-label--under { color: var(--red, #ff3b3b); }

    .ui-ai-comment { min-height: 2.4em; color: var(--orange, #ff7a1a); font-size: 0.85em; margin: 0; }

    .ui-grimoire { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .ui-spell-icon {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: transparent; border: 1px solid var(--border, #2a3140);
      padding: 4px; cursor: pointer; color: var(--cyan, #19e6ff);
    }
    .ui-spell-icon img, .ui-spell-glyph { width: 22px; height: 22px; line-height: 22px; text-align: center; }
    .ui-spell-key { font-size: 0.7em; color: var(--cyan-dim, #0a6b78); }

    .ui-api-modal { max-width: 320px; }
    .ui-api-modal p { margin: 0 0 8px; font-size: 0.9em; }
    .ui-api-modal input {
      width: 100%; margin-bottom: 8px; padding: 6px; background: transparent;
      border: 1px solid var(--border, #2a3140); color: var(--white, #eafcff); font-family: inherit;
    }
    .ui-api-modal a { display: block; margin-top: 10px; font-size: 0.8em; color: var(--cyan-dim, #0a6b78); }
  `;
  document.head.appendChild(style);
}

function buildBox(title, id) {
  const el = document.createElement('div');
  el.className = 'box ui-box';
  el.id = id;
  el.dataset.title = title;
  const body = document.createElement('div');
  body.className = 'ui-box-body';
  el.appendChild(body);
  return { el, body };
}

export async function mountUI(root, { onSpell, onKey } = {}) {
  injectStyles();
  if (els?.typeTimer) clearInterval(els.typeTimer);
  root.innerHTML = '';
  root.classList.add('ui-panel');

  const consoleBox = buildBox('SPELL CONSOLE', 'ui-console-box');
  const textarea = document.createElement('textarea');
  textarea.className = 'ui-console-input';
  textarea.rows = 3;
  textarea.placeholder = 'Escribe un hechizo...';
  const status = document.createElement('div');
  status.className = 'ui-console-status';
  status.hidden = true;
  status.innerHTML = 'casting<span class="ui-caret">_</span>';
  const inputWrap = document.createElement('div');
  inputWrap.className = 'ui-console-input-wrap';
  inputWrap.append(textarea, status);
  consoleBox.body.appendChild(inputWrap);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textarea.blur();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    onSpell?.(text);
    textarea.value = '';
  });

  const logBox = buildBox('LOG', 'ui-log-box');
  const log = document.createElement('div');
  log.className = 'ui-log';
  const logLines = Array.from({ length: LOG_SIZE }, () => {
    const line = document.createElement('div');
    line.className = 'ui-log-line';
    line.hidden = true;
    log.appendChild(line);
    return line;
  });
  logBox.body.appendChild(log);

  const gaugeBox = buildBox('REACTOR POPULATION', 'ui-gauge-box');
  const gauge = document.createElement('div');
  gauge.className = 'ui-gauge';

  const ticks = document.createElement('div');
  ticks.className = 'ui-gauge-ticks';
  for (let v = 100; v >= 0; v -= 10) {
    const tick = document.createElement('span');
    tick.textContent = String(v);
    ticks.appendChild(tick);
  }

  const track = document.createElement('div');
  track.className = 'ui-gauge-track';
  const needle = document.createElement('div');
  needle.className = 'ui-gauge-needle';
  needle.innerHTML = '<span class="ui-gauge-value">0</span> ◀';
  track.appendChild(needle);

  const labels = document.createElement('div');
  labels.className = 'ui-gauge-labels';
  const labelOver = document.createElement('span');
  labelOver.className = 'ui-gauge-label ui-gauge-label--over';
  labelOver.textContent = 'SOBRECARGA';
  const labelSafe = document.createElement('span');
  labelSafe.className = 'ui-gauge-label ui-gauge-label--safe';
  labelSafe.textContent = 'SAFE';
  const labelUnder = document.createElement('span');
  labelUnder.className = 'ui-gauge-label ui-gauge-label--under';
  labelUnder.textContent = 'MUERTE TÉRMICA';
  labels.append(labelOver, labelSafe, labelUnder);

  gauge.append(ticks, track, labels);
  gaugeBox.body.appendChild(gauge);

  const aiBox = buildBox('REACTOR AI', 'ui-ai-box');
  const aiComment = document.createElement('p');
  aiComment.className = 'ui-ai-comment';
  aiBox.body.appendChild(aiComment);

  const grimoire = document.createElement('div');
  grimoire.className = 'ui-grimoire';

  root.append(consoleBox.el, logBox.el, gaugeBox.el, aiBox.el, grimoire);

  els = {
    logLines,
    textarea,
    status,
    track,
    needle,
    needleValue: needle.querySelector('.ui-gauge-value'),
    labelOver,
    labelSafe,
    labelUnder,
    aiComment,
    gen: document.getElementById('gen'),
    turn: document.getElementById('turn'),
    maxturn: document.getElementById('maxturn'),
    typeTimer: null,
    lastAiComment: '',
  };

  const { PATTERNS, SPELL_IDS } = await loadPatterns();
  SPELL_IDS.forEach((id, i) => {
    const spell = PATTERNS[id];
    const key = String(i + 1);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ui-spell-icon btn';
    btn.title = spell.desc || spell.name;
    btn.dataset.key = key;

    const img = document.createElement('img');
    img.src = `assets/icons/${id}.svg`;
    img.alt = spell.name;
    img.onerror = () => {
      const glyph = document.createElement('span');
      glyph.className = 'ui-spell-glyph';
      glyph.textContent = spell.glyph;
      img.replaceWith(glyph);
    };

    const keyLabel = document.createElement('span');
    keyLabel.className = 'ui-spell-key';
    keyLabel.textContent = key;

    btn.append(img, keyLabel);
    btn.addEventListener('click', () => onKey?.(key));
    grimoire.appendChild(btn);
  });
}

function pct(n) {
  return Math.max(0, Math.min(100, n));
}

function updateGauge(state) {
  const pop = Number(state.pop) || 0;
  const popMin = pct(state.popMin ?? 10);
  const popMax = pct(state.popMax ?? 80);
  const clampedPop = pct(pop);
  const outOfRange = pop < popMin || pop > popMax;

  els.track.style.background = `linear-gradient(to top,
    var(--red, #ff3b3b) 0%, var(--red, #ff3b3b) ${popMin}%,
    var(--green, #35ff8a) ${popMin}%, var(--green, #35ff8a) ${popMax}%,
    var(--red, #ff3b3b) ${popMax}%, var(--red, #ff3b3b) 100%)`;
  els.track.classList.toggle('ui-gauge-track--alarm', outOfRange);

  els.needle.style.bottom = `${clampedPop}%`;
  els.needleValue.textContent = String(Math.round(pop));
  els.needle.classList.toggle('ui-gauge-needle--danger', outOfRange);

  els.labelOver.style.bottom = `${popMax + (100 - popMax) / 2}%`;
  els.labelSafe.style.bottom = `${popMin + (popMax - popMin) / 2}%`;
  els.labelUnder.style.bottom = `${popMin / 2}%`;
}

function updateLog(log = []) {
  const entries = log.slice(-LOG_SIZE);
  els.logLines.forEach((line, i) => {
    const entry = entries[i];
    if (!entry) {
      line.hidden = true;
      line.textContent = '';
      return;
    }
    const kind = entry.kind || 'sys';
    line.hidden = false;
    line.textContent = kind === 'cast' ? `> ${entry.text}` : entry.text;
    line.className = `ui-log-line ui-log-line--${kind}`;
  });
}

function updateAiComment(comment = '') {
  if (comment === els.lastAiComment) return;
  els.lastAiComment = comment;
  if (els.typeTimer) {
    clearInterval(els.typeTimer);
    els.typeTimer = null;
  }
  els.aiComment.textContent = '';
  if (!comment) return;
  let i = 0;
  els.typeTimer = setInterval(() => {
    els.aiComment.textContent += comment[i];
    i += 1;
    if (i >= comment.length) {
      clearInterval(els.typeTimer);
      els.typeTimer = null;
    }
  }, TYPE_SPEED_MS);
}

export function updateUI(state) {
  if (!els || !state) return;
  if (els.gen && state.gen != null) els.gen.textContent = String(state.gen);
  if (els.turn && state.turn != null) els.turn.textContent = String(state.turn);
  if (els.maxturn && state.maxTurns != null) els.maxturn.textContent = String(state.maxTurns);
  updateGauge(state);
  updateLog(state.log);
  updateAiComment(state.aiComment);
}

export function setBusy(bool) {
  if (!els) return;
  els.textarea.disabled = bool;
  els.status.hidden = !bool;
  if (!bool) els.textarea.focus();
}

export function focusConsole() {
  els?.textarea?.focus();
}

export function promptApiKey() {
  const overlay = document.getElementById('overlay');
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'box ui-api-modal';
    modal.dataset.title = 'ANTHROPIC API KEY';
    modal.innerHTML = `
      <p>Pega tu API key para invocar al reactor.</p>
      <input type="password" autocomplete="off" placeholder="sk-ant-..." />
      <button type="button" class="btn">CONECTAR</button>
      <a href="#">jugar sin API (modo teclado)</a>
    `;

    const input = modal.querySelector('input');
    const submit = modal.querySelector('button');
    const skip = modal.querySelector('a');

    function onKeydown(e) {
      if (e.key === 'Escape') close('');
    }

    function close(value) {
      document.removeEventListener('keydown', onKeydown);
      overlay.innerHTML = '';
      resolve(value);
    }

    submit.addEventListener('click', () => close(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value.trim());
    });
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      close('');
    });
    document.addEventListener('keydown', onKeydown);

    overlay.innerHTML = '';
    overlay.appendChild(modal);
    input.focus();
  });
}
