import test from 'node:test';
import assert from 'node:assert/strict';
import { overlapsWall, resetMarble, stepMarble } from '../modules/Physics.js';

test('marble slides past wall tips without sideways snaps in every direction and speed', () => {
  for (const speed of [135, 185, 235]) for (const swapped of [false, true]) for (const signX of [-1, 1]) for (const signY of [-1, 1]) {
    const point = (x, y) => swapped ? { x: y * signX, y: x * signY } : { x: x * signX, y: y * signY };
    const corners = [point(0, 0), point(12, 140)];
    const wall = { x: Math.min(...corners.map(p => p.x)), y: Math.min(...corners.map(p => p.y)), w: Math.abs(corners[1].x - corners[0].x), h: Math.abs(corners[1].y - corners[0].y) };
    const ball = {}; resetMarble(ball, point(-10, -10));
    const input = point(1, .35);
    for (let tick = 0; tick < 180; tick++) {
      const previous = { x: ball.x, y: ball.y };
      stepMarble(ball, input, [wall], 1 / 120, speed);
      assert.ok(!overlapsWall(ball, wall));
      assert.ok(Math.hypot(ball.x - previous.x, ball.y - previous.y) <= speed / 120 + .001, `corner snap at speed ${speed}`);
    }
    const along = swapped ? ball.y * signY : ball.x * signX;
    assert.ok(along > 80, `stuck at a wall tip at speed ${speed}`);
  }
});

test('steady pressure into a right-angle corner settles without shaking and allows escape', () => {
  for (const speed of [135, 185, 235]) for (const reverse of [false, true]) {
    const walls = [{ x: 100, y: 0, w: 12, h: 112 }, { x: 0, y: 100, w: 112, h: 12 }];
    if (reverse) walls.reverse();
    const ball = {}; resetMarble(ball, { x: 70, y: 70 });
    for (let tick = 0; tick < 360; tick++) {
      stepMarble(ball, { x: 1, y: 1 }, walls, 1 / 120, speed);
      assert.ok(walls.every(wall => !overlapsWall(ball, wall)));
      if (tick > 180) {
        assert.ok(Math.abs(ball.x - 86) < 1e-6 && Math.abs(ball.y - 86) < 1e-6);
        assert.ok(Math.hypot(ball.vx, ball.vy) < 1e-6);
      }
    }
    for (let tick = 0; tick < 60; tick++) stepMarble(ball, { x: -1, y: 1 }, walls, 1 / 120, speed);
    assert.ok(ball.x < 50); assert.ok(walls.every(wall => !overlapsWall(ball, wall)));
  }
});

test('sustained wall pressure preserves sliding momentum without a bouncing normal velocity', () => {
  const wall = { x: 0, y: 100, w: 1000, h: 12 }, ball = {};
  resetMarble(ball, { x: 50, y: 86 });
  for (let tick = 0; tick < 240; tick++) {
    stepMarble(ball, { x: 1, y: 1 }, [wall], 1 / 120, 235);
    assert.equal(ball.y, 86); assert.ok(Math.abs(ball.vy) < 1e-9);
    assert.ok(!overlapsWall(ball, wall));
  }
  assert.ok(ball.x > 300); assert.ok(ball.vx > 100);
});
