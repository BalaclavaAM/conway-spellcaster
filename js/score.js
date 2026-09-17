/**
 * Score calculation and display overlay for Conway Spellcaster.
 * Exports computeScore (pure) and showScore (DOM-based).
 */

/**
 * Calculate final score from game state (pure function).
 * @param {Object} state - Game state with { phase, turn, maxTurns, spellsCast, everOutOfRange, gen, pop }
 * @returns {{ total: number, rank: string, breakdown: Array<{label: string, value: number, points: number}> }}
 */
export function computeScore(state) {
  const breakdown = [];
  let total = 0;

  const turn = state.turn || 0;
  const maxTurns = state.maxTurns || 30;
  const spellsCast = state.spellsCast || 0;

  // Base points (1000 only if won)
  if (state.phase === 'won') {
    breakdown.push({ label: 'Base', value: null, points: 1000 });
    total += 1000;
  }

  // Turns: 25 × max(0, maxTurns - turn) (only if won)
  if (state.phase === 'won') {
    const turnBonus = Math.max(0, maxTurns - turn);
    const turnPoints = 25 * turnBonus;
    if (turnPoints > 0) {
      breakdown.push({ label: `Turnos sobrantes ${turnBonus} × 25`, value: null, points: turnPoints });
      total += turnPoints;
    }
  }

  // Spells: 150 × min(spellsCast, 4)
  const spellBonus = Math.min(spellsCast, 4);
  const spellPoints = 150 * spellBonus;
  if (spellPoints > 0) {
    breakdown.push({ label: `Hechizos ${spellsCast} × 150`, value: null, points: spellPoints });
    total += spellPoints;
  }

  // Never out of range: 300 if everOutOfRange === false
  if (!state.everOutOfRange) {
    breakdown.push({ label: 'Reactor estable', value: null, points: 300 });
    total += 300;
  }

  // Determine rank
  let rank = 'C';
  if (total >= 2200) rank = 'S';
  else if (total >= 1800) rank = 'A';
  else if (total >= 1400) rank = 'B';

  return { total, rank, breakdown };
}

/**
 * Display score overlay in root element.
 * @param {HTMLElement} root - The #overlay element
 * @param {Object} state - Game state
 * @param {Function} onRetry - Callback when "OTRA VEZ" is pressed or R key is hit
 */
export function showScore(root, state, onRetry) {
  const score = computeScore(state);
  const won = state.phase === 'won';
  const title = won ? 'REACTOR ESTABILIZADO' : 'REACTOR PERDIDO';

  // Color values
  const hexColor = won ? '#ff7a1a' : '#ff3b3b';

  const rankColors = {
    'S': '#ff7a1a',
    'A': '#19e6ff',
    'B': '#35ff8a',
    'C': '#888888'
  };

  // Clear any previous content
  root.innerHTML = '';

  // Inject styles for the score box border, title, and fallback medal
  const styleId = 'score-overlay-styles';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  const medalCssColor = rankColors[score.rank];
  styleEl.textContent = `
    #score-box {
      border: 1px solid ${hexColor} !important;
      box-shadow: 0 0 18px ${hexColor === '#ff7a1a' ? 'rgba(255,122,26,.35)' : 'rgba(255,59,59,.35)'} !important;
      min-width: 420px;
      padding: 28px;
      max-width: 520px;
    }
    #score-box[data-title]::before {
      color: ${hexColor} !important;
    }
    #medal-fallback {
      width: 96px;
      height: 96px;
      border: 4px solid ${medalCssColor};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-pixel);
      font-size: 48px;
      color: ${medalCssColor};
      text-shadow: 0 0 12px ${medalCssColor};
      margin: 0 auto 1.5em;
      position: relative;
    }
    #medal-fallback::after,
    #medal-fallback::before {
      content: '';
      position: absolute;
      width: 16px;
      height: 8px;
      background: ${medalCssColor};
      top: 90%;
    }
    #medal-fallback::before {
      left: 20%;
      transform: rotate(-35deg);
    }
    #medal-fallback::after {
      right: 20%;
      transform: rotate(35deg);
    }
  `;

  // Create the score box with custom styling
  const box = document.createElement('div');
  box.className = 'box';
  box.id = 'score-box';
  box.setAttribute('data-title', title);

  // Rank medal container (image or fallback)
  const medalContainer = document.createElement('div');
  medalContainer.style.cssText = `
    text-align: center;
    margin-bottom: 1.5em;
  `;

  const rankImg = document.createElement('img');
  rankImg.src = `assets/rank_${score.rank}.svg`;
  rankImg.style.cssText = `
    width: 96px;
    height: 96px;
    object-fit: contain;
  `;

  // Create fallback medal
  const medalFallback = document.createElement('div');
  medalFallback.id = 'medal-fallback';
  medalFallback.textContent = score.rank;
  medalFallback.style.display = 'none';

  rankImg.onerror = () => {
    rankImg.style.display = 'none';
    medalFallback.style.display = 'flex';
  };

  medalContainer.appendChild(rankImg);
  medalContainer.appendChild(medalFallback);
  box.appendChild(medalContainer);

  // Breakdown lines (monospace, dotted leaders)
  const breakdownContainer = document.createElement('div');
  breakdownContainer.style.cssText = `
    font-family: var(--font-mono);
    font-size: 16px;
    margin-bottom: 1em;
    color: var(--white);
    line-height: 1.8;
  `;

  score.breakdown.forEach((item, idx) => {
    const line = document.createElement('div');
    line.style.cssText = `
      display: flex;
      justify-content: space-between;
      opacity: 0;
      transition: opacity 0.3s ease;
      align-items: baseline;
      gap: 0.4em;
    `;

    const label = document.createElement('span');
    label.textContent = item.label;
    label.style.cssText = `
      white-space: nowrap;
      flex-shrink: 0;
    `;

    const dots = document.createElement('span');
    dots.style.cssText = `
      flex: 1;
      border-bottom: 2px dotted var(--border);
      margin: 0 6px 4px 6px;
      min-width: 1em;
    `;

    const points = document.createElement('span');
    points.textContent = item.points.toString();
    points.style.cssText = `
      color: var(--white);
      text-align: right;
      white-space: nowrap;
      flex-shrink: 0;
      min-width: 3.5em;
    `;

    line.appendChild(label);
    line.appendChild(dots);
    line.appendChild(points);
    breakdownContainer.appendChild(line);

    // Stagger appearance with timeout (150ms delay)
    setTimeout(() => {
      line.style.opacity = '1';
    }, 150 * (idx + 1));
  });

  box.appendChild(breakdownContainer);

  // Separator line (dashes)
  const separator = document.createElement('div');
  separator.style.cssText = `
    border-top: 1px dashed var(--border);
    margin: 0.8em 0;
  `;
  box.appendChild(separator);

  // Total score (large, animated, cyan with glow)
  const totalContainer = document.createElement('div');
  totalContainer.style.cssText = `
    text-align: center;
    margin-bottom: 1.2em;
  `;

  const totalLabel = document.createElement('div');
  totalLabel.style.cssText = `
    font-family: var(--font-pixel);
    font-size: 34px;
    color: var(--cyan);
    text-shadow: 0 0 12px var(--cyan), 0 0 20px var(--cyan-dim);
    letter-spacing: 0.1em;
  `;

  totalLabel.innerHTML = `TOTAL <span id="counter">0</span>`;
  totalContainer.appendChild(totalLabel);
  box.appendChild(totalContainer);

  // Stats line (small, gray)
  const stats = document.createElement('div');
  stats.style.cssText = `
    text-align: center;
    font-size: 12px;
    color: var(--border);
    margin-bottom: 1.2em;
    font-family: var(--font-mono);
  `;
  stats.textContent = `gen ${state.gen || 0} · turn ${state.turn || 0} / ${state.maxTurns || 30}`;
  box.appendChild(stats);

  // Retry button (green, positioned at bottom right)
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = `
    text-align: right;
  `;

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'OTRA VEZ (R)';
  btn.style.cssText = `
    color: var(--green);
    border-color: var(--green);
    font-family: var(--font-mono);
    font-size: 15px;
  `;

  let animationId = null;

  const cleanup = () => {
    if (animationId) cancelAnimationFrame(animationId);
  };

  const handleRetry = () => {
    cleanup();
    root.innerHTML = '';
    onRetry();
  };

  btn.addEventListener('click', handleRetry);

  btnContainer.appendChild(btn);
  box.appendChild(btnContainer);

  // Animate counter from 0 to total with easeOut
  const counterEl = totalLabel.querySelector('span');
  const startTime = performance.now();
  const duration = 1200; // 1.2 seconds

  const animateCounter = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // easeOut: 1 - (1-t)^3
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const displayValue = Math.floor(easeOut * score.total);

    if (counterEl) {
      counterEl.textContent = displayValue;
    }

    if (progress < 1) {
      animationId = requestAnimationFrame(animateCounter);
    }
  };

  animationId = requestAnimationFrame(animateCounter);

  root.appendChild(box);
}
