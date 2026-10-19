export const MARBLE_RADIUS = 14;
export function resetMarble(ball, point) { Object.assign(ball, point, { vx: 0, vy: 0, r: MARBLE_RADIUS }); }
export function overlapsWall(ball, wall) {
  const x = Math.max(wall.x, Math.min(ball.x, wall.x + wall.w)), y = Math.max(wall.y, Math.min(ball.y, wall.y + wall.h));
  return Math.hypot(ball.x - x, ball.y - y) < ball.r - .001;
}

function resolveWall(ball, wall) {
  const nearestX = Math.max(wall.x, Math.min(ball.x, wall.x + wall.w));
  const nearestY = Math.max(wall.y, Math.min(ball.y, wall.y + wall.h));
  const dx = ball.x - nearestX, dy = ball.y - nearestY, distance = Math.hypot(dx, dy);
  if (distance >= ball.r) return false;

  let nx, ny, depth;
  if (distance > 0) {
    nx = dx / distance; ny = dy / distance; depth = ball.r - distance;
  } else {
    // Recover toward the nearest face if a marble ever starts inside a rail.
    const faces = [
      { depth: ball.x - wall.x, nx: -1, ny: 0 },
      { depth: wall.x + wall.w - ball.x, nx: 1, ny: 0 },
      { depth: ball.y - wall.y, nx: 0, ny: -1 },
      { depth: wall.y + wall.h - ball.y, nx: 0, ny: 1 }
    ];
    const face = faces.reduce((nearest, candidate) => candidate.depth < nearest.depth ? candidate : nearest);
    ({ nx, ny } = face); depth = ball.r + face.depth;
  }
  ball.x += nx * depth; ball.y += ny * depth;
  // Keep tangential momentum, including around rounded wall tips. Removing
  // only inward velocity avoids repeated tiny rebounds under steady tilt.
  const inward = ball.vx * nx + ball.vy * ny;
  if (inward < 0) { ball.vx -= inward * nx; ball.vy -= inward * ny; }
  return true;
}

export function stepMarble(ball, input, walls, dt, maxSpeed = 185) {
  const length = Math.hypot(input.x, input.y), scale = length > 1 ? 1 / length : 1, damping = Math.exp(-6 * dt);
  ball.vx = (ball.vx + input.x * scale * 1450 * dt) * damping;
  ball.vy = (ball.vy + input.y * scale * 1450 * dt) * damping;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > maxSpeed) { ball.vx *= maxSpeed / speed; ball.vy *= maxSpeed / speed; }
  // Small steps prevent tunneling at lively speed. Resolve the circle against
  // the actual contact normal, rather than snapping each axis to a wall face.
  const steps = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / (ball.r / 3)));
  for (let i = 0; i < steps; i++) {
    ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
    // Adjacent rails can both touch the marble at a right-angle junction.
    for (let pass = 0; pass < 8; pass++) {
      let contact = false;
      for (const wall of walls) if (resolveWall(ball, wall)) contact = true;
      if (!contact) break;
    }
  }
}
export function holeCaptureRadius(hole) { return hole.r * .72; }
export function detectPocket(ball, board) {
  if (board.holes.some(hole => Math.hypot(ball.x - hole.x, ball.y - hole.y) < holeCaptureRadius(hole))) return 'fall';
  if (Math.hypot(ball.x - board.finish.x, ball.y - board.finish.y) < 23) return 'finish';
  return null;
}
