import { buildGuidePath, planCellBypass, threatensCentreLine } from './HazardPlanner.js';

export const CELL = 100;
export const WALL = 12;
export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export class MazeGenerator {
  constructor(cols, rows, random = Math.random) {
    this.cols = cols; this.rows = rows; this.random = random;
    this.grid = Array.from({ length: rows * cols }, (_, id) => ({ id, col: id % cols, row: Math.floor(id / cols), walls: [true, true, true, true] }));
  }
  generateMaze() {
    const visited = new Set([0]), stack = [this.grid[0]];
    while (stack.length) {
      const current = stack[stack.length - 1];
      const neighbors = this.neighbors(current).filter(({ cell }) => !visited.has(cell.id));
      if (!neighbors.length) { stack.pop(); continue; }
      const { cell, direction } = neighbors[Math.floor(this.random() * neighbors.length)];
      current.walls[direction] = false; cell.walls[(direction + 2) % 4] = false;
      visited.add(cell.id); stack.push(cell);
    }
    return this;
  }
  neighbors(cell) {
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].flatMap(([x, y], direction) => {
      const col = cell.col + x, row = cell.row + y;
      return col >= 0 && row >= 0 && col < this.cols && row < this.rows ? [{ cell: this.grid[row * this.cols + col], direction }] : [];
    });
  }
  pathTo(endId) {
    const parents = new Map([[0, null]]), queue = [this.grid[0]];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      for (const next of this.neighbors(cell)) if (!cell.walls[next.direction] && !parents.has(next.cell.id)) {
        parents.set(next.cell.id, cell.id); queue.push(next.cell);
      }
    }
    const path = [];
    for (let id = endId; id !== null && id !== undefined; id = parents.get(id)) path.unshift(id);
    return path;
  }
  center(id) { return { x: (id % this.cols + .5) * CELL, y: (Math.floor(id / this.cols) + .5) * CELL }; }
  createWalls() {
    const width = this.cols * CELL, height = this.rows * CELL;
    // The perimeter belongs to the maze, not the browser viewport.
    const walls = [{ x: 0, y: 0, w: width, h: WALL }, { x: 0, y: height - WALL, w: width, h: WALL }, { x: 0, y: 0, w: WALL, h: height }, { x: width - WALL, y: 0, w: WALL, h: height }];
    for (const cell of this.grid) {
      if (cell.row > 0 && cell.walls[0]) walls.push({ x: cell.col * CELL - WALL / 2, y: cell.row * CELL - WALL / 2, w: CELL + WALL, h: WALL });
      if (cell.col > 0 && cell.walls[3]) walls.push({ x: cell.col * CELL - WALL / 2, y: cell.row * CELL - WALL / 2, w: WALL, h: CELL + WALL });
    }
    return walls;
  }
}
export const STAGES = [
  { name: 'First light', cols: 5, rows: 7, target: 20, holes: 0, description: 'Find your feet. Roll into the green pocket to finish the board.' },
  { name: 'Taking turns', cols: 5, rows: 8, target: 26, holes: 1, description: 'A few more corners. Ease off before the turn and let the marble settle.' },
  { name: 'The long way', cols: 6, rows: 8, target: 32, holes: 2, description: 'Some holes lie along the way. Slow down and steer around their edges.' },
  { name: 'A steady hand', cols: 6, rows: 9, target: 38, holes: 3, description: 'Roll over the gold diamond to save your place. It turns green when saved.' },
  { name: 'Quiet corners', cols: 7, rows: 9, target: 44, holes: 4, description: 'More paths to ponder. There is always a safe way through.' },
  { name: 'In the groove', cols: 7, rows: 10, target: 50, holes: 5, description: 'You know the feeling now. Small movements, satisfying turns.' },
  { name: 'Almost there', cols: 8, rows: 10, target: 56, holes: 6, description: 'A little patience goes a long way. Follow your curiosity.' },
  { name: 'Finding balance', cols: 8, rows: 11, target: 64, holes: 7, description: 'One last labyrinth. Take your time and bring the marble home.' }
];
export function createBoard(stageIndex, seed, difficulty = 'balanced') {
  const stage = STAGES[stageIndex], adjustment = difficulty === 'gentle' ? -1 : difficulty === 'intricate' ? 1 : 0;
  const cols = Math.max(4, stage.cols + adjustment), rows = Math.max(6, stage.rows + adjustment), random = seededRandom(seed);
  const target = Math.round(stage.target * (difficulty === 'gentle' ? .72 : difficulty === 'intricate' ? 1.22 : 1));
  let maze, route, score = Infinity;
  for (let attempt = 0; attempt < 35; attempt++) {
    const candidate = new MazeGenerator(cols, rows, random).generateMaze(), path = candidate.pathTo(cols * rows - 1), difference = Math.abs(path.length - target);
    if (difference < score) { maze = candidate; route = path; score = difference; }
    if (score <= 2) break;
  }
  const walls = maze.createWalls();
  const checkpoints = stageIndex >= 3 ? [route[Math.floor(route.length / 2)]] : [];
  const onRoute = new Set(route), deadEnds = maze.grid.filter(cell => !onRoute.has(cell.id) && cell.walls.filter(Boolean).length === 3);
  for (let i = deadEnds.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deadEnds[i], deadEnds[j]] = [deadEnds[j], deadEnds[i]]; }
  const holeCount = difficulty === 'gentle' ? 0 : stage.holes + (difficulty === 'intricate' ? 2 : 0);
  const holes = deadEnds.slice(0, holeCount).map(cell => ({ ...maze.center(cell.id), id: cell.id, r: 24, kind: 'dead-end' }));
  const bypasses = new Map(), selectedIndices = [];
  const hard = difficulty === 'intricate';
  const routeTarget = difficulty === 'gentle' || (!hard && stageIndex === 0) ? 0
    : hard ? Math.min(16, Math.max(3, Math.floor(route.length / (stageIndex >= 4 ? 5 : 6))))
      : Math.min(7, 1 + Math.floor(stageIndex / 2) + Math.floor(route.length / 22));
  const checkpointIndex = checkpoints.length ? route.indexOf(checkpoints[0]) : -100;
  const candidates = route.map((id, index) => ({ id, index }))
    .filter(({ index }) => index >= 3 && index < route.length - 3 && Math.abs(index - checkpointIndex) > 2);
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  const radius = (hard ? 18 : 16) + Math.floor(stageIndex / 3);
  const offset = hard ? radius - 10 : radius - 6;
  for (const { id, index } of candidates) {
    if (bypasses.size >= routeTarget) break;
    if (selectedIndices.some(other => Math.abs(other - index) < 3)) continue;
    const cell = maze.grid[id], center = maze.center(id);
    const entry = maze.neighbors(cell).find(next => next.cell.id === route[index - 1]).direction;
    const exit = maze.neighbors(cell).find(next => next.cell.id === route[index + 1]).direction;
    // Try both sides and the closed corners; accept only fully passable placements.
    const offsets = [[offset, 0], [-offset, 0], [0, offset], [0, -offset], [offset, offset], [-offset, offset], [offset, -offset], [-offset, -offset]];
    for (let i = offsets.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [offsets[i], offsets[j]] = [offsets[j], offsets[i]]; }
    for (const [dx, dy] of offsets) {
      const hole = { x: center.x + dx, y: center.y + dy, id, r: radius, kind: 'route' };
      if (!threatensCentreLine(maze, route, index, hole)) continue;
      const bypass = planCellBypass(maze, id, hole, walls, entry, exit, CELL);
      if (!bypass) continue;
      holes.push(hole); bypasses.set(id, bypass); selectedIndices.push(index); break;
    }
  }
  const guidePath = buildGuidePath(maze, route, bypasses);
  // Leave room for the FINISH label between the pocket and the bottom rail.
  const finish = maze.center(cols * rows - 1); finish.y -= 8;
  guidePath[guidePath.length - 1] = finish;
  return { maze, route, walls, holes, guidePath, checkpoints: checkpoints.map(id => ({ ...maze.center(id), id, active: false })), width: cols * CELL, height: rows * CELL, start: maze.center(0), finish, stageIndex, seed, difficulty, par: Math.round(route.length * 1.65 + bypasses.size * 2 + 12) };
}
