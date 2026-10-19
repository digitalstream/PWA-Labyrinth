import { MARBLE_RADIUS, holeCaptureRadius, overlapsWall } from './Physics.js';

// Conservative planning keeps the whole marble supported beside each hole.
// Collision detection itself only drops the marble when its centre enters one.
const MARGIN = 1;
export function threatensCentreLine(maze, route, index, hole) {
  const points = [maze.center(route[index - 1]), maze.center(route[index]), maze.center(route[index + 1])];
  return points.slice(1).some((b, i) => {
    const a = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((hole.x - a.x) * dx + (hole.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(hole.x - a.x - t * dx, hole.y - a.y - t * dy) < holeCaptureRadius(hole) - .5;
  });
}

export function hasClearance(point, walls, holes, margin = MARGIN) {
  const marble = { ...point, r: MARBLE_RADIUS + margin };
  return !walls.some(wall => overlapsWall(marble, wall)) &&
    holes.every(hole => Math.hypot(point.x - hole.x, point.y - hole.y) >= hole.r + MARBLE_RADIUS + margin);
}

export function segmentIsClear(a, b, walls, holes, margin = MARGIN) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!hasClearance({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, walls, holes, margin)) return false;
  }
  return true;
}

function simplify(points, walls, holes) {
  const result = [points[0]];
  let from = 0;
  while (from < points.length - 1) {
    let next = points.length - 1;
    while (next > from + 1 && !segmentIsClear(points[from], points[next], walls, holes)) next--;
    result.push(points[next]); from = next;
  }
  return result;
}

export function planCellBypass(maze, id, hole, walls, entryDirection, exitDirection, size = 100) {
  const cell = maze.grid[id], left = cell.col * size, top = cell.row * size;
  const nearbyWalls = walls.filter(wall => wall.x <= left + size + MARBLE_RADIUS && wall.x + wall.w >= left - MARBLE_RADIUS && wall.y <= top + size + MARBLE_RADIUS && wall.y + wall.h >= top - MARBLE_RADIUS);
  // Include exact opening centres alongside a four-unit sampling grid.
  const axis = [...new Set([...Array.from({ length: size / 4 + 1 }, (_, i) => i * 4), size / 2])].sort((a, b) => a - b);
  const n = axis.length, mid = axis.indexOf(size / 2);
  const portalIds = [mid, mid * n + n - 1, (n - 1) * n + mid, mid * n];
  const point = node => ({ x: left + axis[node % n], y: top + axis[Math.floor(node / n)] });
  const clear = new Int8Array(n * n).fill(-1);
  const available = node => {
    if (clear[node] === -1) clear[node] = hasClearance(point(node), nearbyWalls, [hole]) ? 1 : 0;
    return clear[node] === 1;
  };
  const start = portalIds[entryDirection], end = portalIds[exitDirection];
  if (!available(start) || !available(end)) return null;
  const parents = new Int32Array(n * n).fill(-1), queue = [start]; parents[start] = start;
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i], x = node % n, y = Math.floor(node / n);
    const neighbors = [];
    if (x > 0) neighbors.push(node - 1); if (x < n - 1) neighbors.push(node + 1);
    if (y > 0) neighbors.push(node - n); if (y < n - 1) neighbors.push(node + n);
    for (const next of neighbors) {
      if (parents[next] !== -1 || !available(next)) continue;
      if (!segmentIsClear(point(node), point(next), nearbyWalls, [hole])) continue;
      parents[next] = node; queue.push(next);
    }
  }
  // Preserve access between every opening, including branches off the main route.
  if (cell.walls.some((closed, direction) => !closed && parents[portalIds[direction]] === -1)) return null;
  const path = [];
  for (let node = end; ; node = parents[node]) {
    path.unshift(point(node)); if (node === start) break;
  }
  return simplify(path, nearbyWalls, [hole]);
}

export function buildGuidePath(maze, route, bypasses) {
  return route.flatMap(id => bypasses.get(id) || [maze.center(id)]);
}
