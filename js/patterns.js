// Grimorio: patrones canónicos (LifeWiki, naves viajando al ESTE) + rotación + selftest.
// Coordenadas verificadas con js/life.js (B3/S23 toroidal): ver selftest().

export const PATTERNS = {
  glider: {
    name: 'Glider', glyph: '◢',
    cells: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
    moves: 'diagonal', desc: 'Proyectil diagonal',
  },
  lwss: {
    name: 'LWSS', glyph: '➤',
    cells: [[0, 0], [3, 0], [4, 1], [0, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3]],
    moves: 'straight', desc: 'Nave recta, rompe muros',
  },
  block: {
    name: 'Block', glyph: '■',
    cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
    moves: 'static', desc: 'Muro',
  },
  beehive: {
    name: 'Beehive', glyph: '⬢',
    cells: [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2]],
    moves: 'static', desc: 'Muro resistente',
  },
  blinker: {
    name: 'Blinker', glyph: '┃',
    cells: [[0, 0], [1, 0], [2, 0]],
    moves: 'oscillator', desc: 'Faro',
  },
  r_pentomino: {
    name: 'R-pentomino', glyph: '✸',
    cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
    moves: 'chaos', desc: 'Bomba de caos',
  },
  eater: {
    name: 'Eater', glyph: '◘',
    cells: [[0, 0], [1, 0], [1, 1], [1, 2], [3, 2], [2, 3], [3, 3]],
    moves: 'static', desc: 'Devora proyectiles',
  },
};

// El orden de las claves define las teclas 1..7.
export const SPELL_IDS = Object.keys(PATTERNS);

// Rotación 90° (x,y) -> (-y,x): en pantalla (x derecha, y abajo) manda E->S->W->N.
// Para el glider (canónico = SE) el mismo giro manda SE->SW->NW->NE, que es
// exactamente el mapeo N->NE, E->SE, S->SW, W->NW pedido en CLAUDE.md.
const DIR_STEPS = { E: 0, S: 1, W: 2, N: 3 };

function normalize(cells) {
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function rotateOnce(cells) {
  return cells.map(([x, y]) => [-y, x]);
}

export function oriented(id, dir) {
  const pattern = PATTERNS[id];
  if (!pattern) throw new Error(`oriented: patrón desconocido "${id}"`);
  const steps = DIR_STEPS[dir];
  if (steps === undefined) throw new Error(`oriented: dirección desconocida "${dir}"`);
  let cells = pattern.cells;
  for (let i = 0; i < steps; i++) cells = rotateOnce(cells);
  return normalize(cells);
}

function centroid(grid, W, H, idx) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[idx(x, y)]) { sx += x; sy += y; n += 1; }
    }
  }
  return n ? { x: sx / n, y: sy / n, n } : { x: 0, y: 0, n: 0 };
}

function sameShape(gridA, gridB) {
  for (let i = 0; i < gridA.length; i++) if (gridA[i] !== gridB[i]) return false;
  return true;
}

export async function selftest() {
  const failures = [];
  const life = await import('./life.js');
  const { createGrid, stamp, step, W, H, idx } = life;

  const OX = 20;
  const OY = 12;
  const EXPECT = {
    N: { dx: 0, dy: -1 },
    S: { dx: 0, dy: 1 },
    E: { dx: 1, dy: 0 },
    W: { dx: -1, dy: 0 },
  };

  // Naves: centroide debe moverse en la dirección pedida tras 8 steps.
  for (const id of ['glider', 'lwss']) {
    for (const dir of ['N', 'E', 'S', 'W']) {
      let grid = createGrid();
      grid = stamp(grid, oriented(id, dir), OX, OY);
      let age;
      const before = centroid(grid, W, H, idx);
      for (let i = 0; i < 8; i++) ({ grid, age } = step(grid, age));
      const after = centroid(grid, W, H, idx);
      const exp = EXPECT[dir];
      const ddx = after.x - before.x;
      const ddy = after.y - before.y;
      // Distancia toroidal más corta (por si el desplazamiento cruza el borde).
      const wrap = (d, size) => {
        let r = d;
        if (r > size / 2) r -= size;
        if (r < -size / 2) r += size;
        return r;
      };
      const sdx = wrap(ddx, W);
      const sdy = wrap(ddy, H);
      const okPop = after.n === before.n;
      // El glider viaja en diagonal (N->NE, E->SE, S->SW, W->NW): solo se exige
      // el signo de la componente principal pedida; la ortogonal se valida
      // aparte como "diagonal" (debe ser significativa, no nula).
      const okAxis = id === 'glider'
        ? (exp.dx !== 0 ? Math.sign(sdx) === exp.dx : true)
          && (exp.dy !== 0 ? Math.sign(sdy) === exp.dy : true)
        : (exp.dx !== 0 ? Math.sign(sdx) === exp.dx : Math.abs(sdx) < 0.5)
          && (exp.dy !== 0 ? Math.sign(sdy) === exp.dy : Math.abs(sdy) < 0.5);
      // El glider además debe moverse en diagonal (ambas componentes no nulas).
      const okDiag = id !== 'glider' || (Math.abs(sdx) > 0.5 && Math.abs(sdy) > 0.5);
      if (!okPop || !okAxis || !okDiag) {
        failures.push(`${id} dir=${dir}: dx=${sdx.toFixed(2)} dy=${sdy.toFixed(2)} n0=${before.n} n1=${after.n}`);
      }
    }
  }

  // LWSS al E: debe avanzar 2 celdas cada 4 generaciones, sin deformarse.
  {
    let grid = createGrid();
    grid = stamp(grid, oriented('lwss', 'E'), OX, OY);
    let age;
    for (let i = 0; i < 4; i++) ({ grid, age } = step(grid, age));
    let shifted = createGrid();
    shifted = stamp(shifted, oriented('lwss', 'E'), OX + 2, OY);
    if (!sameShape(grid, shifted)) {
      failures.push('lwss E: no se traslada 2 celdas exactas cada 4 generaciones sin deformarse');
    }
  }

  // Estáticos: idénticos tras 2 steps, en las 4 orientaciones.
  for (const id of ['block', 'beehive', 'eater']) {
    for (const dir of ['N', 'E', 'S', 'W']) {
      let grid = createGrid();
      const cells = oriented(id, dir);
      grid = stamp(grid, cells, OX, OY);
      const before = grid.slice();
      let age;
      for (let i = 0; i < 2; i++) ({ grid, age } = step(grid, age));
      if (!sameShape(grid, before)) {
        failures.push(`${id} dir=${dir}: no es estático tras 2 steps`);
      }
    }
  }

  // Blinker: periodo 2.
  {
    let grid = createGrid();
    grid = stamp(grid, oriented('blinker', 'E'), OX, OY);
    const before = grid.slice();
    let age;
    for (let i = 0; i < 2; i++) ({ grid, age } = step(grid, age));
    if (!sameShape(grid, before)) failures.push('blinker: no vuelve a su forma tras 2 steps (periodo 2)');
  }

  return { ok: failures.length === 0, failures };
}
