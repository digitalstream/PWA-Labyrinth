export const MARBLE_RADIUS = 14;
export function resetMarble(ball, point) { Object.assign(ball, point, { vx: 0, vy: 0, r: MARBLE_RADIUS }); }
export function overlapsWall(ball, wall) {
  const x = Math.max(wall.x, Math.min(ball.x, wall.x + wall.w)), y = Math.max(wall.y, Math.min(ball.y, wall.y + wall.h));
  return Math.hypot(ball.x - x, ball.y - y) < ball.r - .001;
}
export function stepMarble(ball, input, walls, dt, maxSpeed = 185) {
  const length = Math.hypot(input.x, input.y), scale = length > 1 ? 1 / length : 1, damping = Math.exp(-6 * dt);
  ball.vx = (ball.vx + input.x * scale * 1450 * dt) * damping;
  ball.vy = (ball.vy + input.y * scale * 1450 * dt) * damping;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > maxSpeed) { ball.vx *= maxSpeed / speed; ball.vy *= maxSpeed / speed; }
  // Small, axis-separated steps prevent tunneling at lively speed.
  const steps = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / (ball.r / 3)));
  for (let i = 0; i < steps; i++) {
    ball.x += ball.vx * dt / steps;
    for (const wall of walls) if (overlapsWall(ball, wall)) {
      if (ball.vx > 0) ball.x = wall.x - ball.r; else if (ball.vx < 0) ball.x = wall.x + wall.w + ball.r;
      ball.vx *= -.08;
    }
    ball.y += ball.vy * dt / steps;
    for (const wall of walls) if (overlapsWall(ball, wall)) {
      if (ball.vy > 0) ball.y = wall.y - ball.r; else if (ball.vy < 0) ball.y = wall.y + wall.h + ball.r;
      ball.vy *= -.08;
    }
  }
}
export function holeCaptureRadius(hole) { return hole.r * .72; }
export function detectPocket(ball, board) {
  if (board.holes.some(hole => Math.hypot(ball.x - hole.x, ball.y - hole.y) < holeCaptureRadius(hole))) return 'fall';
  if (Math.hypot(ball.x - board.finish.x, ball.y - board.finish.y) < 23) return 'finish';
  return null;
}
