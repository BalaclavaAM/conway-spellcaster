// Motor Conway puro, toroidal 40x24. Cero DOM, cero dependencias.
export const W = 40, H = 24;

export function createGrid() {
  return new Uint8Array(W * H);
}

export function idx(x, y) {
  return ((y % H) + H) % H * W + (((x % W) + W) % W);
}

export function step(grid, age) {
  const newGrid = new Uint8Array(W * H);
  const newAge = new Uint16Array(W * H);
  const hasAge = age instanceof Uint16Array;

  for (let y = 0; y < H; y++) {
    const yUp = (y === 0 ? H - 1 : y - 1) * W;
    const yMid = y * W;
    const yDown = (y === H - 1 ? 0 : y + 1) * W;

    for (let x = 0; x < W; x++) {
      const xLeft = x === 0 ? W - 1 : x - 1;
      const xRight = x === W - 1 ? 0 : x + 1;

      const n =
        grid[yUp + xLeft] + grid[yUp + x] + grid[yUp + xRight] +
        grid[yMid + xLeft]                 + grid[yMid + xRight] +
        grid[yDown + xLeft] + grid[yDown + x] + grid[yDown + xRight];

      const i = yMid + x;
      const alive = grid[i] === 1;
      const willLive = alive ? (n === 2 || n === 3) : n === 3;

      if (willLive) {
        newGrid[i] = 1;
        newAge[i] = alive ? ((hasAge ? age[i] : 0) + 1) : 1;
      }
      // muerta: newGrid[i] = 0, newAge[i] = 0 (ya inicializados)
    }
  }

  return { grid: newGrid, age: newAge };
}

export function population(grid) {
  let count = 0;
  for (let i = 0; i < grid.length; i++) count += grid[i];
  return count;
}

export function stamp(grid, cells, ox, oy) {
  for (let k = 0; k < cells.length; k++) {
    const [dx, dy] = cells[k];
    grid[idx(ox + dx, oy + dy)] = 1;
  }
  return grid;
}

export function clearRect(grid, x, y, w, h) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      grid[idx(x + i, y + j)] = 0;
    }
  }
  return grid;
}
