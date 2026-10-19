import { createBoard, STAGES } from './MazeGenerator.js';
import { stepMarble, resetMarble, detectPocket } from './Physics.js';
import { BoardRenderer } from './BoardRenderer.js';

const $ = id => document.getElementById(id);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function formatTime(seconds) {
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
const DIRECTIONS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const DEFAULTS = { difficulty: 'balanced', speed: 185, sensitivity: 1, sound: false };
const difficultyName = value => ({ gentle: 'Gentle', balanced: 'Balanced', intricate: 'Tough' })[value];
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('labyrinth.settings') || '{}');
    return { difficulty: ['gentle', 'balanced', 'intricate'].includes(saved.difficulty) ? saved.difficulty : 'balanced', speed: [135, 185, 235].includes(saved.speed) ? saved.speed : 185, sensitivity: Number.isFinite(saved.sensitivity) ? clamp(saved.sensitivity, .5, 1.8) : 1, sound: saved.sound === true };
  } catch { return { ...DEFAULTS }; }
}

export class Game {
  constructor() {
    this.settings = readSettings();
    this.state = 'welcome'; this.stageIndex = 0; this.elapsed = 0; this.levelElapsed = 0;
    this.falls = 0; this.levelFalls = 0; this.stars = 0; this.ball = {};
    this.keys = new Set(); this.touch = new Map(); this.tilt = { x: 0, y: 0 };
    this.calibration = null; this.lastOrientation = null; this.tiltEnabled = false;
    this.autoTiltAttempted = false; this.startingJourney = false;
    this.seed = this.newSeed(); this.runDifficulty = this.settings.difficulty;
    this.hintUntil = 0; this.animation = null; this.accumulator = 0;
    this.renderer = new BoardRenderer($('board'));
    this.track = STAGES.map((stage, i) => {
      const li = document.createElement('li'); li.title = `${i + 1}. ${stage.name}`;
      li.setAttribute('aria-label', `Board ${i + 1}: ${stage.name}`); $('journey-track').append(li); return li;
    });
    this.loadBoard(0); this.bindControls(); this.syncSettings(); this.showBest(); this.setPlayable(false);
    this.previousFrame = performance.now();
    this.frame = this.frame.bind(this); requestAnimationFrame(this.frame);
  }

  newSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
  saveSettings() { try { localStorage.setItem('labyrinth.settings', JSON.stringify(this.settings)); } catch { /* Private storage can be unavailable. */ } }
  status(message) { $('status').textContent = message; }

  showBest() {
    try {
      const key = `labyrinth.best.${this.settings.difficulty}`;
      const best = Number(localStorage.getItem(key));
      $('best-display').textContent = best > 0 ? `Your best ${difficultyName(this.settings.difficulty)} journey: ${formatTime(best)}` : 'A fresh path, every time.';
    } catch { /* Keep the default message. */ }
  }

  bindControls() {
    $('start-btn').addEventListener('click', () => this.beginJourney());
    $('pause-btn').addEventListener('click', () => this.pause());
    $('restart-btn').addEventListener('click', () => {
      if (this.state !== 'playing') return;
      this.pause();
      this.showOverlay('START THIS BOARD AGAIN?', 'A fresh attempt.', 'The maze stays the same. Your journey time and falls are kept.', 'Restart board ↺', () => {
        resetMarble(this.ball, this.board.start); this.respawn = this.board.start;
        this.board.checkpoints.forEach(c => c.active = false); this.resume(); this.status('Back to the start. You know a little more of the way.');
      }, 'Keep playing', () => this.resume(), '↺');
    });
    $('hint-btn').addEventListener('click', () => {
      if (this.state !== 'playing' || performance.now() < this.hintUntil) return;
      this.hintUntil = performance.now() + 4500; this.elapsed += 5; this.levelElapsed += 5;
      this.status('A glimpse of the route. Five seconds added to your time.');
    });
    $('settings-btn').addEventListener('click', () => {
      if (this.state === 'playing') this.pause();
      this.syncSettings(); $('settings-dialog').showModal();
    });
    $('settings-dialog').addEventListener('close', () => {
      if (this.tiltEnabled) this.calibrate();
      this.status(this.state === 'paused' ? 'Settings saved. Resume when you are ready.' : 'Settings saved.');
    });
    $('about-btn').addEventListener('click', () => {
      $('about-dialog').showModal();
      $('about-content').scrollTop = 0;
    });
    $('about-close-btn').addEventListener('click', () => $('about-dialog').close());
    $('maze-difficulty').addEventListener('change', e => {
      this.settings.difficulty = e.target.value; this.saveSettings(); this.showBest();
      if (this.state === 'welcome') { this.runDifficulty = this.settings.difficulty; this.loadBoard(0); }
    });
    $('speed-setting').addEventListener('change', e => { this.settings.speed = Number(e.target.value); this.saveSettings(); });
    $('sensitivity').addEventListener('input', e => {
      this.settings.sensitivity = Number(e.target.value); $('sensitivity-value').textContent = `${this.settings.sensitivity.toFixed(1)}×`; this.saveSettings();
    });
    $('sound-setting').addEventListener('change', e => { this.settings.sound = e.target.checked; this.saveSettings(); this.tone('checkpoint'); });
    $('tilt-btn').addEventListener('click', () => this.enableTilt());
    $('calibrate-btn').addEventListener('click', () => this.calibrate());
    $('game-overlay').addEventListener('cancel', event => {
      event.preventDefault();
      if (this.state === 'paused') this.resume();
    });

    window.addEventListener('keydown', e => {
      if ($('settings-dialog').open || $('about-dialog').open || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (DIRECTIONS[e.code] && this.state === 'playing') { e.preventDefault(); this.keys.add(e.code); }
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
        e.preventDefault();
        if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume();
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.clearInput(); if (this.state === 'playing') this.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    for (const button of $('thumb-pad').querySelectorAll('button')) {
      button.addEventListener('pointerdown', e => {
        if (this.state !== 'playing') return;
        e.preventDefault(); button.setPointerCapture(e.pointerId);
        this.touch.set(e.pointerId, button.dataset.direction); button.classList.add('pressed');
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => {
        this.touch.delete(e.pointerId); button.classList.remove('pressed');
      });
      // Keyboard/screen-reader activation gives a short directional nudge.
      button.addEventListener('click', e => {
        if (e.detail !== 0 || this.state !== 'playing') return;
        const token = `nudge-${button.dataset.direction}`;
        this.touch.set(token, button.dataset.direction);
        setTimeout(() => this.touch.delete(token), 150);
      });
    }
    window.addEventListener('deviceorientation', e => this.handleOrientation(e));
    screen.orientation?.addEventListener('change', () => {
      this.calibration = null;
      if (this.state === 'playing') this.pause();
      this.status('Orientation changed. Resume to recalibrate.');
    });
  }

  clearInput() { this.keys.clear(); this.touch.clear(); this.tilt = { x: 0, y: 0 }; document.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed')); }

  syncSettings() {
    $('maze-difficulty').value = this.settings.difficulty; $('speed-setting').value = String(this.settings.speed);
    $('sensitivity').value = this.settings.sensitivity; $('sensitivity-value').textContent = `${this.settings.sensitivity.toFixed(1)}×`;
    $('sound-setting').checked = this.settings.sound;
    $('difficulty-note').textContent = this.state === 'welcome' ? 'Choose the feel of your eight-board journey.' : `Current journey: ${difficultyName(this.runDifficulty)}. Changes apply to your next journey.`;
  }

  async beginJourney() {
    if (this.startingJourney || !['welcome', 'complete'].includes(this.state)) return;
    this.startingJourney = true;
    $('start-btn').disabled = true;
    let tiltMessage = null;
    try {
      const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches;
      if (touchDevice && !this.autoTiltAttempted) {
        this.autoTiltAttempted = true;
        // Call directly from the start tap, before awaiting anything else: iOS
        // requires transient user activation for the motion permission prompt.
        const granted = await this.requestTiltAccess();
        tiltMessage = granted ? 'Hold your device comfortably, then tilt gently to roll. The thumb pad works too.' : $('sensor-status').textContent;
      }
      this.startJourney();
      if (tiltMessage) this.status(tiltMessage);
    } finally {
      this.startingJourney = false;
      $('start-btn').disabled = false;
    }
  }

  startJourney() {
    this.seed = this.newSeed(); this.elapsed = 0; this.falls = 0; this.stars = 0; this.runDifficulty = this.settings.difficulty;
    $('welcome-panel').hidden = true; $('playing-panel').hidden = false; $('board-cover').hidden = true;
    document.body.classList.add('playing');
    this.loadBoard(0); this.resume(); this.tone('checkpoint');
    this.status(this.tiltEnabled ? 'Hold your device comfortably, then tilt gently to roll. The thumb pad works too.' : 'Follow the corridors to the green pocket. Arrows, WASD, or the thumb pad to roll.');
  }

  loadBoard(index) {
    this.stageIndex = index;
    this.board = createBoard(index, (this.seed + index * 7919) >>> 0, this.runDifficulty);
    this.respawn = this.board.start; this.levelElapsed = 0; this.levelFalls = 0; this.hintUntil = 0;
    resetMarble(this.ball, this.board.start); this.animation = null;
    const number = String(index + 1).padStart(2, '0'), stage = STAGES[index];
    $('board-label').textContent = `BOARD ${number} / 08`; $('stage-number').textContent = number;
    $('stage-name').textContent = stage.name; $('stage-description').textContent = stage.description;
    $('board-caption').textContent = stage.name + ' / ' + difficultyName(this.runDifficulty);
    document.querySelector('.engraving').textContent = `L / ${number}`;
    $('board-frame').style.aspectRatio = `${this.board.width} / ${this.board.height}`;
    $('board-frame').style.setProperty('--board-ratio', this.board.width / this.board.height);
    $('board').setAttribute('aria-label', `Board ${index + 1}, ${stage.name}. Start at the top left, finish at the bottom right. ${this.board.holes.length} holes to avoid. Use arrow keys, WASD, thumb pad, or tilt.`);
    this.track.forEach((li, i) => {
      li.className = i < index ? 'done' : i === index ? 'current' : '';
      if (i === index) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    this.renderer.setBoard(this.board, this.ball); this.updateHud();
  }

  resume() {
    this.clearInput(); if (this.tiltEnabled) this.calibrate();
    this.state = 'playing'; this.accumulator = 0;
    this.hideOverlay(); this.setPlayable(true);
    $('board').tabIndex = 0; $('board').focus({ preventScroll: true }); this.requestWakeLock();
  }

  setPlayable(playing) {
    for (const id of ['pause-btn', 'restart-btn', 'hint-btn']) $(id).disabled = !playing;
    for (const button of $('thumb-pad').querySelectorAll('button')) button.disabled = !playing;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; this.clearInput(); this.ball.vx = this.ball.vy = 0; this.setPlayable(false); this.releaseWakeLock();
    this.showOverlay('A MOMENT TO YOURSELF', 'Take a breath.', 'Your marble will be right here. The clock is paused.', 'Keep rolling →', () => this.resume(), 'End this journey', () => this.confirmEnd(), 'Ⅱ');
  }

  confirmEnd() {
    this.showOverlay('BACK TO THE BEGINNING?', 'Leave this journey?', 'Your current journey will be lost. Your saved best stays with you.', 'End journey', () => this.home(), 'Keep rolling', () => this.resume(), '↺');
  }

  home() {
    this.state = 'welcome'; this.clearInput(); this.setPlayable(false); this.releaseWakeLock();
    this.hideOverlay(); $('welcome-panel').hidden = false; $('playing-panel').hidden = true; $('board-cover').hidden = false;
    document.body.classList.remove('playing'); this.seed = this.newSeed(); this.runDifficulty = this.settings.difficulty;
    this.elapsed = this.falls = 0; this.loadBoard(0); this.showBest(); this.status('A fresh path, whenever you are ready.'); $('start-btn').focus({ preventScroll: true });
  }

  showOverlay(eyebrow, title, message, action, callback, secondary = null, secondaryCallback = null, symbol = '✓') {
    this.clearInput(); $('overlay-eyebrow').textContent = eyebrow; $('overlay-title').textContent = title; $('overlay-message').textContent = message;
    $('overlay-action').textContent = action; $('overlay-action').onclick = callback;
    $('overlay-secondary').hidden = !secondary; $('overlay-secondary').textContent = secondary || ''; $('overlay-secondary').onclick = secondaryCallback;
    $('result-symbol').textContent = symbol; $('result-stats').replaceChildren(); $('game-overlay').hidden = false;
    // The result belongs to the viewport, so its actions don't depend on maze size.
    if (!$('game-overlay').open) $('game-overlay').showModal();
    $('game-overlay').querySelector('.result-content').scrollTop = 0;
    $('board').tabIndex = -1; $('overlay-action').focus({ preventScroll: true });
  }

  hideOverlay() {
    const overlay = $('game-overlay');
    if (overlay.open) overlay.close();
    overlay.hidden = true;
  }

  updateHud() {
    $('time-display').textContent = formatTime(this.elapsed); $('falls-display').textContent = this.falls;
  }

  input() {
    const directions = new Set([...this.keys].map(code => DIRECTIONS[code]).concat([...this.touch.values()]));
    if (directions.size) return { x: Number(directions.has('right')) - Number(directions.has('left')), y: Number(directions.has('down')) - Number(directions.has('up')) };
    if (!this.tiltEnabled || performance.now() - (this.lastSensorTime || 0) > 500) return { x: 0, y: 0 };
    return this.tilt;
  }

  frame(now) {
    const delta = Math.min((now - this.previousFrame) / 1000, .1); this.previousFrame = now;
    if (this.state === 'playing') {
      this.accumulator += delta;
      const input = this.input();
      while (this.accumulator >= 1 / 120 && this.state === 'playing') {
        stepMarble(this.ball, input, this.board.walls, 1 / 120, this.settings.speed);
        this.elapsed += 1 / 120; this.levelElapsed += 1 / 120; this.accumulator -= 1 / 120;
        for (const checkpoint of this.board.checkpoints) if (!checkpoint.active && Math.hypot(this.ball.x - checkpoint.x, this.ball.y - checkpoint.y) < 25) {
          checkpoint.active = true; this.respawn = checkpoint; this.status('Checkpoint saved. A fall will bring you back here.'); this.tone('checkpoint');
        }
        const pocket = detectPocket(this.ball, this.board);
        if (pocket) this.enterPocket(pocket, now);
      }
      this.updateHud();
    }
    if (this.animation && now - this.animation.start >= 420) this.resolvePocket();
    this.renderer.draw(this.ball, now, now < this.hintUntil, this.animation);
    requestAnimationFrame(this.frame);
  }

  enterPocket(kind, now) {
    if (this.state !== 'playing') return;
    this.state = 'settling'; this.clearInput(); this.setPlayable(false);
    this.ball.vx = this.ball.vy = 0;
    const target = kind === 'finish' ? this.board.finish : this.board.holes.find(h => Math.hypot(this.ball.x - h.x, this.ball.y - h.y) < h.r);
    this.ball.x = target.x; this.ball.y = target.y;
    this.animation = { kind, start: now }; this.tone(kind);
  }

  resolvePocket() {
    const kind = this.animation.kind; this.animation = null; this.releaseWakeLock();
    if (kind === 'fall') {
      this.state = 'fallen'; this.falls++; this.levelFalls++; this.updateHud();
      const hasCheckpoint = this.respawn !== this.board.start;
      this.showOverlay('A SMALL DETOUR', 'Lost your marble?', hasCheckpoint ? 'Your checkpoint is safe. Pick up where you left off.' : 'It happens. The same board is waiting for another try.', hasCheckpoint ? 'From checkpoint →' : 'Try this board again →', () => { resetMarble(this.ball, this.respawn); this.resume(); this.status('Steady does it. There is a safe route to the finish.'); }, null, null, '○');
      return;
    }
    const earned = this.levelFalls === 0 && this.levelElapsed <= this.board.par ? 3 : this.levelFalls <= 2 ? 2 : 1;
    this.stars += earned;
    if (this.stageIndex === STAGES.length - 1) {
      this.state = 'complete'; this.track.forEach(li => { li.className = 'done'; li.removeAttribute('aria-current'); });
      let personalBest = false;
      try {
        const key = `labyrinth.best.${this.runDifficulty}`, best = Number(localStorage.getItem(key));
        if (!best || this.elapsed < best) { localStorage.setItem(key, String(this.elapsed)); personalBest = true; }
      } catch { /* A completed run still works without storage. */ }
      this.showOverlay(personalBest ? 'A NEW PERSONAL BEST' : 'EIGHT BOARDS. ONE LITTLE ESCAPE.', 'You found your balance.', `All eight labyrinths, beautifully navigated. ${difficultyName(this.runDifficulty)} journey complete.`, 'A new journey ↗', () => this.beginJourney(), 'Back to the beginning', () => this.home(), '✳');
      $('result-stats').textContent = `${formatTime(this.elapsed)} · ${this.falls} ${this.falls === 1 ? 'fall' : 'falls'} · ${this.stars} / 24 stars`;
      this.status('Journey complete. A new set of mazes is ready when you are.');
    } else {
      this.state = 'board-complete';
      this.showOverlay('BEAUTIFULLY NAVIGATED', 'A turn well taken.', `Board ${this.stageIndex + 1} complete. Up next: ${STAGES[this.stageIndex + 1].name}.`, 'Next board →', () => { this.loadBoard(this.stageIndex + 1); this.resume(); this.status(STAGES[this.stageIndex].description); });
      const stars = document.createElement('div'); stars.className = 'stars'; stars.setAttribute('aria-label', `${earned} of 3 stars`);
      stars.textContent = '★'.repeat(earned); const empty = document.createElement('span'); empty.textContent = '☆'.repeat(3 - earned); stars.append(empty);
      $('result-stats').append(stars, document.createTextNode(`${formatTime(this.levelElapsed)} · ${this.levelFalls} falls`));
    }
  }

  async enableTilt() {
    // A manual choice takes precedence over automatic setup for this visit.
    this.autoTiltAttempted = true;
    if (this.tiltEnabled) {
      this.tiltEnabled = false; this.tilt = { x: 0, y: 0 }; $('tilt-btn').textContent = 'Enable tilt controls'; $('calibrate-btn').hidden = true;
      $('sensor-status').textContent = 'Tilt disabled. Keyboard and touch controls are available.'; return;
    }
    return this.requestTiltAccess();
  }

  async requestTiltAccess() {
    if (this.tiltEnabled) return true;
    if (!window.isSecureContext || typeof DeviceOrientationEvent === 'undefined') {
      $('sensor-status').textContent = 'Tilt is unavailable here. Try your phone over HTTPS, or use keyboard and touch.'; return false;
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') { $('sensor-status').textContent = 'Tilt permission was not granted. The thumb pad still works. You can retry in settings.'; return false; }
      }
      this.tiltEnabled = true; this.calibration = null; this.lastOrientation = null;
      $('tilt-btn').textContent = 'Disable tilt controls'; $('calibrate-btn').hidden = false;
      $('sensor-status').textContent = 'Hold your phone comfortably. It calibrates when you start or resume.';
      setTimeout(() => {
        if (this.tiltEnabled && !this.lastOrientation) {
          const message = 'No motion data received. Use the thumb pad, or check motion access in your browser settings.';
          $('sensor-status').textContent = message;
          if (this.state === 'playing') this.status(message);
        }
      }, 2500);
      return true;
    } catch {
      $('sensor-status').textContent = 'Tilt could not be enabled. Keyboard and touch controls are ready.';
      return false;
    }
  }

  calibrate() {
    this.calibration = this.lastOrientation ? { ...this.lastOrientation } : null; this.tilt = { x: 0, y: 0 };
    $('sensor-status').textContent = this.lastOrientation ? 'Calibrated. This comfortable position is now neutral.' : 'Waiting for your phone’s first motion reading.';
  }

  handleOrientation(event) {
    if (!this.tiltEnabled || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
    const firstReading = !this.lastOrientation;
    this.lastSensorTime = performance.now();
    this.lastOrientation = { x: event.gamma, y: event.beta };
    if (!this.calibration) this.calibration = { ...this.lastOrientation };
    const deadZone = value => Math.abs(value) < .035 ? 0 : value;
    const x = deadZone(clamp((event.gamma - this.calibration.x) / 22 * this.settings.sensitivity, -1, 1));
    const y = deadZone(clamp((event.beta - this.calibration.y) / 22 * this.settings.sensitivity, -1, 1));
    const angle = (screen.orientation?.angle || 0) * Math.PI / 180;
    const rotated = { x: x * Math.cos(angle) + y * Math.sin(angle), y: y * Math.cos(angle) - x * Math.sin(angle) };
    this.tilt.x += (rotated.x - this.tilt.x) * .25; this.tilt.y += (rotated.y - this.tilt.y) * .25;
    if (firstReading) {
      $('sensor-status').textContent = 'Tilt is ready. Your current position is neutral.';
      if (this.state === 'playing') this.status('Tilt gently to roll into the green pocket. Recalibrate in settings whenever you need.');
    }
  }

  async requestWakeLock() {
    if (!('wakeLock' in navigator) || document.hidden || this.wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.state !== 'playing') { await lock.release(); return; }
      this.wakeLock = lock; lock.addEventListener('release', () => { if (this.wakeLock === lock) this.wakeLock = null; });
    } catch { /* The game works without a screen wake lock. */ }
  }
  releaseWakeLock() { const lock = this.wakeLock; this.wakeLock = null; lock?.release().catch(() => {}); }

  tone(kind) {
    if (!this.settings.sound) return;
    try {
      this.audio ||= new (window.AudioContext || window.webkitAudioContext)();
      this.audio.resume().catch(() => {});
      const notes = kind === 'finish' ? [440, 554, 659] : kind === 'fall' ? [220, 165] : [523];
      notes.forEach((frequency, i) => {
        const oscillator = this.audio.createOscillator(), gain = this.audio.createGain(), start = this.audio.currentTime + i * .1;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.06, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + .23);
        oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(start); oscillator.stop(start + .25);
      });
    } catch { /* Optional sound must never interrupt play. */ }
  }
}
