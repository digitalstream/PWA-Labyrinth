import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, formatTime } from '../modules/Game.js';

class Element {
  constructor() { this.style = { setProperty() {} }; this.classList = { add() {}, remove() {} }; this.children = []; this.hidden = true; this.attrs = {}; }
  focus() {} setAttribute(name, value) { this.attrs[name] = value; } removeAttribute(name) { delete this.attrs[name]; }
  replaceChildren(...children) { this.children = children; } append(...children) { this.children.push(...children); }
  querySelectorAll() { return []; }
  querySelector() { return this.children[0] ||= new Element(); }
  showModal() { this.open = true; } close() { this.open = false; }
}

function gameHarness() {
  const elements = new Map(), storage = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  globalThis.document = { getElementById: get, querySelector: get, body: new Element(), createElement: () => new Element(), createTextNode: text => text };
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const game = Object.create(Game.prototype);
  Object.assign(game, { settings: { speed: 185, sensitivity: 1, difficulty: 'balanced', sound: false }, state: 'welcome', seed: 101, ball: {}, track: Array.from({ length: 8 }, () => new Element()), renderer: { setBoard() {} }, clearInput() {}, requestWakeLock() {}, releaseWakeLock() {}, newSeed: () => 12498, tiltEnabled: false });
  game.startJourney();
  return { game, get, storage };
}

test('finish advances all eight boards and saves only a completed run', () => {
  const { game, get, storage } = gameHarness();
  for (let stage = 0; stage < 8; stage++) {
    assert.equal(game.stageIndex, stage); assert.equal(game.state, 'playing');
    game.elapsed += 40; game.levelElapsed = 40;
    game.enterPocket('finish', performance.now());
    assert.equal(game.state, 'settling');
    game.enterPocket('finish', performance.now()); game.resolvePocket();
    if (stage < 7) {
      assert.equal(game.state, 'board-complete'); assert.equal(storage.size, 0); assert.equal(get('game-overlay').open, true);
      get('overlay-action').onclick();
      assert.equal(game.stageIndex, stage + 1); assert.equal(game.state, 'playing');
      assert.equal(get('game-overlay').hidden, true); assert.equal(get('game-overlay').open, false);
    } else {
      assert.equal(game.state, 'complete'); assert.equal(storage.get('labyrinth.best.balanced'), '320');
      assert.match(get('result-stats').textContent, /5:20/); assert.ok(game.track.every(item => item.className === 'done'));
    }
  }
});

test('fall retries preserve the board and restore the checkpoint', () => {
  const { game, get } = gameHarness(); game.loadBoard(4);
  const board = game.board, checkpoint = board.checkpoints[0], hole = board.holes[0];
  checkpoint.active = true; game.respawn = checkpoint;
  Object.assign(game.ball, { x: hole.x, y: hole.y }); game.elapsed = 93; game.levelElapsed = 22;
  game.enterPocket('fall', performance.now()); game.resolvePocket();
  assert.equal(game.falls, 1); assert.equal(game.levelFalls, 1); assert.equal(game.state, 'fallen');
  get('overlay-action').onclick();
  assert.equal(game.board, board); assert.equal(game.elapsed, 93); assert.equal(game.levelElapsed, 22);
  assert.equal(game.ball.x, checkpoint.x); assert.equal(game.ball.y, checkpoint.y); assert.equal(game.ball.vx, 0); assert.equal(game.state, 'playing');
});

test('pause and resume preserve progress and the maze', () => {
  const { game, get } = gameHarness(); const board = game.board;
  game.ball.x = 70; game.ball.vx = 120; game.elapsed = 55; game.pause();
  assert.equal(game.state, 'paused'); assert.equal(game.ball.vx, 0); assert.equal(get('game-overlay').hidden, false);
  get('overlay-action').onclick();
  assert.equal(game.state, 'playing'); assert.equal(game.elapsed, 55); assert.equal(game.ball.x, 70); assert.equal(game.board, board);
});

test('clock includes complete minutes', () => {
  assert.equal(formatTime(0), '0:00'); assert.equal(formatTime(65.9), '1:05'); assert.equal(formatTime(609), '10:09');
});

function setDevice({ touch = true, secure = true, requestPermission, coarse = touch } = {}) {
  globalThis.window = { isSecureContext: secure, matchMedia: () => ({ matches: coarse }) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { maxTouchPoints: touch ? 5 : 0 } });
  globalThis.DeviceOrientationEvent = requestPermission ? { requestPermission } : {};
  globalThis.screen = { orientation: { angle: 0 } };
}

test('mobile start requests permission within the tap and waits before starting', async () => {
  const { game, get } = gameHarness(); game.home();
  let resolvePermission, requests = 0;
  setDevice({ requestPermission: () => { requests++; return new Promise(resolve => { resolvePermission = resolve; }); } });
  const start = game.beginJourney();
  assert.equal(requests, 1); assert.equal(game.state, 'welcome'); assert.equal(get('start-btn').disabled, true);
  await game.beginJourney(); assert.equal(requests, 1);
  resolvePermission('granted'); await start;
  assert.equal(game.state, 'playing'); assert.equal(game.tiltEnabled, true); assert.equal(game.elapsed, 0); assert.equal(get('start-btn').disabled, false);
  assert.match(get('status').textContent, /tilt gently/);
  game.handleOrientation({ gamma: 10, beta: 40 }); assert.deepEqual(game.calibration, { x: 10, y: 40 }); assert.deepEqual(game.tilt, { x: 0, y: 0 });
  game.handleOrientation({ gamma: 20, beta: 40 }); assert.ok(game.tilt.x > 0);
});

test('denied motion permission leaves a playable fallback without repeated prompts', async () => {
  const { game, get } = gameHarness(); game.home(); let requests = 0;
  setDevice({ requestPermission: async () => { requests++; return 'denied'; } });
  await game.beginJourney(); assert.equal(game.state, 'playing'); assert.equal(game.tiltEnabled, false); assert.match(get('status').textContent, /thumb pad/);
  game.home(); await game.beginJourney(); assert.equal(requests, 1);
});

test('mobile browsers without a permission API enable tilt directly', async () => {
  const { game } = gameHarness(); game.home(); setDevice(); await game.beginJourney();
  assert.equal(game.state, 'playing'); assert.equal(game.tiltEnabled, true);
  game.handleOrientation({ gamma: 0, beta: 35 }); assert.deepEqual(game.calibration, { x: 0, y: 35 });
});

test('desktop starts without requesting motion access', async () => {
  const { game } = gameHarness(); game.home(); let requests = 0;
  setDevice({ touch: false, requestPermission: async () => { requests++; return 'granted'; } });
  await game.beginJourney(); assert.equal(game.state, 'playing'); assert.equal(requests, 0); assert.equal(game.tiltEnabled, false);
});

test('manually disabling tilt is respected on the next journey', async () => {
  const { game } = gameHarness(); game.home(); let requests = 0;
  setDevice({ requestPermission: async () => { requests++; return 'granted'; } });
  game.tiltEnabled = true; await game.enableTilt(); await game.beginJourney();
  assert.equal(game.state, 'playing'); assert.equal(game.tiltEnabled, false); assert.equal(requests, 0);
});

test('insecure contexts and permission errors do not block play', async () => {
  for (const secure of [false, true]) {
    const { game, get } = gameHarness(); game.home();
    setDevice({ secure, requestPermission: async () => { throw new Error('Unavailable'); } }); await game.beginJourney();
    assert.equal(game.state, 'playing'); assert.equal(game.tiltEnabled, false); assert.match(get('status').textContent, /HTTPS|could not be enabled/); assert.equal(get('start-btn').disabled, false);
  }
});
