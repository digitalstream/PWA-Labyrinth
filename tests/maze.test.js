import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, STAGES } from '../modules/MazeGenerator.js';
import { detectPocket, overlapsWall, resetMarble, stepMarble } from '../modules/Physics.js';
import { segmentIsClear } from '../modules/HazardPlanner.js';

test('mazes are connected, enclosed, and fair across difficulties and seeds', () => {
  for (const difficulty of ['gentle', 'balanced', 'intricate']) for (let stage = 0; stage < STAGES.length; stage++) for (let seed = 1; seed <= 30; seed++) {
    const board = createBoard(stage, seed, difficulty), { maze, route } = board;
    const visited = new Set([0]), queue = [maze.grid[0]];
    for (let i = 0; i < queue.length; i++) for (const next of maze.neighbors(queue[i])) {
      assert.equal(queue[i].walls[next.direction], next.cell.walls[(next.direction + 2) % 4]);
      if (!queue[i].walls[next.direction] && !visited.has(next.cell.id)) { visited.add(next.cell.id); queue.push(next.cell); }
    }
    assert.equal(visited.size, maze.cols * maze.rows); assert.equal(route[0], 0); assert.equal(route.at(-1), maze.cols * maze.rows - 1);
    for (let i = 1; i < route.length; i++) {
      const previous = maze.grid[route[i - 1]], next = maze.neighbors(previous).find(item => item.cell.id === route[i]);
      assert.ok(next && !previous.walls[next.direction]);
    }
    assert.ok(board.holes.filter(hole => hole.kind === 'dead-end').every(hole => !route.includes(hole.id)));
    for (const hole of board.holes.filter(hole => hole.kind === 'route')) {
      const index = route.indexOf(hole.id); assert.ok(index >= 3 && index < route.length - 3);
      assert.ok(board.checkpoints.every(point => Math.abs(route.indexOf(point.id) - index) > 2));
    }
    assert.ok(board.checkpoints.every(point => route.includes(point.id)));
    if (difficulty === 'gentle' || (stage === 0 && difficulty === 'balanced')) assert.equal(board.holes.length, 0);
    for (const cell of maze.grid) assert.ok(board.walls.every(wall => !overlapsWall({ ...maze.center(cell.id), r: 14 }, wall)));
  }
});

test('the same seed reproduces a board exactly', () => {
  const a = createBoard(5, 98235), b = createBoard(5, 98235);
  assert.deepEqual(a.route, b.route); assert.deepEqual(a.walls, b.walls); assert.deepEqual(a.holes, b.holes);
  assert.notDeepEqual(a.walls, createBoard(5, 98236).walls);
});

test('marbles cannot cross rails or escape at any speed', () => {
  const board = createBoard(0, 14);
  for (const maxSpeed of [135, 185, 235]) for (const input of [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 1 }]) {
    const ball = {}; resetMarble(ball, board.start);
    for (let i = 0; i < 3000; i++) {
      stepMarble(ball, input, board.walls, 1 / 120, maxSpeed);
      assert.ok(ball.x >= ball.r && ball.x <= board.width - ball.r); assert.ok(ball.y >= ball.r && ball.y <= board.height - ball.r);
      assert.ok(Math.hypot(ball.vx, ball.vy) <= maxSpeed + .001); assert.ok(board.walls.every(wall => !overlapsWall(ball, wall)));
    }
  }
});

test('all stages can be physically traversed around holes at every speed', () => {
  for (const difficulty of ['gentle', 'balanced', 'intricate']) for (let stage = 0; stage < 8; stage++) for (const maxSpeed of [135, 185, 235]) {
    const board = createBoard(stage, 687 + stage, difficulty), ball = {}; resetMarble(ball, board.start);
    for (const target of board.guidePath.slice(1)) {
      let reached = false;
      for (let tick = 0; tick < 1200; tick++) {
        const dx = target.x - ball.x, dy = target.y - ball.y;
        if (Math.hypot(dx, dy) < 2 && Math.hypot(ball.vx, ball.vy) < 12) { reached = true; break; }
        const input = { x: Math.max(-1, Math.min(1, dx * .045 - ball.vx * .009)), y: Math.max(-1, Math.min(1, dy * .045 - ball.vy * .009)) };
        stepMarble(ball, input, board.walls, 1 / 120, maxSpeed); assert.notEqual(detectPocket(ball, board), 'fall');
      }
      assert.ok(reached, `${difficulty}, board ${stage + 1}, speed ${maxSpeed}, waypoint ${target.x},${target.y}`);
    }
    assert.equal(detectPocket(ball, board), 'finish');
  }
});

test('hint paths provide full marble clearance across varied seeds', () => {
  for (const difficulty of ['balanced', 'intricate']) for (let stage = 0; stage < 8; stage++) for (let seed = 1; seed <= 12; seed++) {
    const board = createBoard(stage, seed * 1987, difficulty);
    for (let i = 1; i < board.guidePath.length; i++) assert.ok(segmentIsClear(board.guidePath[i - 1], board.guidePath[i], board.walls, board.holes));
    if (difficulty === 'intricate' || stage > 0) assert.ok(board.holes.some(hole => hole.kind === 'route'));
  }
});

test('Tough adds more route hazards as the journey progresses', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const count = (stage, difficulty) => createBoard(stage, seed, difficulty).holes.filter(hole => hole.kind === 'route').length;
    const early = count(0, 'intricate'), late = count(7, 'intricate');
    assert.ok(early >= 3); assert.ok(late >= 10); assert.ok(late > count(7, 'balanced')); assert.ok(late > early);
  }
});

test('route holes require steering away from the centre line', () => {
  for (const difficulty of ['balanced', 'intricate']) for (let stage = 0; stage < 8; stage++) for (let seed = 1; seed <= 6; seed++) {
    const board = createBoard(stage, seed, difficulty);
    for (const hole of board.holes.filter(hole => hole.kind === 'route')) {
      const index = board.route.indexOf(hole.id), points = board.route.slice(index - 1, index + 2).map(id => board.maze.center(id));
      let wouldFall = false;
      for (let i = 1; i < points.length; i++) for (let step = 0; step <= 100; step++) {
        const t = step / 100, a = points[i - 1], b = points[i];
        if (detectPocket({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: 14 }, board) === 'fall') wouldFall = true;
      }
      assert.ok(wouldFall);
    }
  }
});

test('pockets trigger on entry without catching a brush of the rim', () => {
  const board = createBoard(6, 32), hole = board.holes[0]; assert.ok(hole);
  assert.equal(detectPocket({ ...board.finish, r: 14 }, board), 'finish');
  assert.equal(detectPocket({ x: hole.x + 30, y: hole.y, r: 14 }, board), null); assert.equal(detectPocket({ ...hole, r: 14 }, board), 'fall');
});

test('dark pockets are hazards while starts and checkpoints remain safe', () => {
  for (let stage = 0; stage < 8; stage++) for (let seed = 1; seed <= 20; seed++) {
    const board = createBoard(stage, seed); assert.equal(detectPocket({ ...board.start, r: 14 }, board), null);
    for (const hole of board.holes) assert.equal(detectPocket({ ...hole, r: 14 }, board), 'fall');
    for (const checkpoint of board.checkpoints) {
      assert.equal(detectPocket({ ...checkpoint, r: 14 }, board), null); checkpoint.active = true; assert.equal(detectPocket({ ...checkpoint, r: 14 }, board), null);
    }
  }
});
