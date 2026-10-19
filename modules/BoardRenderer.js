import { seededRandom } from './MazeGenerator.js';

function circle(ctx, x, y, r, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.surface = document.createElement('canvas');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  setBoard(board, ball) {
    this.board = board; this.lastFrame = null; this.makeSurface(); this.resize();
    if (ball) this.draw(ball, performance.now());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
    if (width !== this.canvas.width || height !== this.canvas.height) {
      this.canvas.width = width; this.canvas.height = height;
      // Canvas resizing clears its pixels. Repaint immediately during layout changes.
      if (this.lastFrame) {
        const { ball, now, hint, animation } = this.lastFrame;
        this.draw(ball, now, hint, animation);
      }
    }
  }

  makeSurface() {
    const board = this.board, c = this.surface.getContext('2d');
    this.surface.width = board.width; this.surface.height = board.height;
    const floor = c.createLinearGradient(0, 0, board.width, board.height);
    floor.addColorStop(0, '#eee8d7'); floor.addColorStop(.4, '#e8dfca'); floor.addColorStop(1, '#ddd4bd');
    c.fillStyle = floor; c.fillRect(0, 0, board.width, board.height);
    const random = seededRandom(board.seed);
    // Fine mineral veins, drawn once per board rather than once per frame.
    for (let i = 0; i < 55; i++) {
      let x = random() * board.width * 1.6 - board.width * .3, y = -40;
      c.beginPath(); c.moveTo(x, y);
      while (y < board.height + 50) {
        const nx = x + (random() - .57) * 160, ny = y + 65 + random() * 110;
        c.quadraticCurveTo(x + 40, y + 35, nx, ny); x = nx; y = ny;
      }
      c.strokeStyle = i % 3 === 0 ? '#b6aa8b20' : '#fffaf02b';
      c.lineWidth = 1 + random() * 4; c.stroke();
    }
    for (let i = 0; i < 7000; i++) {
      c.fillStyle = i % 2 ? '#8b82660a' : '#fffdf01c';
      c.fillRect(random() * board.width, random() * board.height, 1, 1);
    }
    // Flat start brackets rather than a ring that resembles a pocket.
    c.strokeStyle = '#b3a57d'; c.lineWidth = 1.5;
    const { x: sx, y: sy } = board.start;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      c.beginPath(); c.moveTo(sx + dx * 16, sy + dy * 23); c.lineTo(sx + dx * 23, sy + dy * 23); c.lineTo(sx + dx * 23, sy + dy * 16); c.stroke();
    }
    c.fillStyle = '#9a906e'; c.font = '10px Arial'; c.textAlign = 'center';
    c.fillText('START', sx, sy + 38);
    for (const hole of board.holes) {
      circle(c, hole.x, hole.y + 1, hole.r + 4, '#b0a080', '#cfc3a5', 2);
      const g = c.createRadialGradient(hole.x - 5, hole.y - 7, 1, hole.x, hole.y, hole.r);
      g.addColorStop(0, '#111a16'); g.addColorStop(.75, '#292d24'); g.addColorStop(1, '#484837');
      circle(c, hole.x, hole.y, hole.r, g, '#756e54', 1.5);
      c.beginPath(); c.arc(hole.x, hole.y + 1, hole.r - 2, .15, 2.8); c.strokeStyle = '#f6e5bc35'; c.lineWidth = 2; c.stroke();
    }
    const { x, y } = board.finish;
    circle(c, x, y, 31, '#c7ccb5', '#8b9e7b', 1.5);
    const finish = c.createRadialGradient(x - 8, y - 8, 2, x, y, 24);
    finish.addColorStop(0, '#426b53'); finish.addColorStop(1, '#244d3c');
    circle(c, x, y, 24, finish, '#e1e3cd', 2);
    c.strokeStyle = '#e3ead4'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x - 2, y + 6); c.lineTo(x + 9, y - 7); c.stroke();
    c.fillStyle = '#63795b'; c.fillText('FINISH', x, y + 42);
    // Dark raised rails with a narrow lit edge and an offset shadow.
    c.shadowColor = '#39392d65'; c.shadowBlur = 6; c.shadowOffsetX = 3; c.shadowOffsetY = 5;
    for (const wall of board.walls) {
      c.fillStyle = '#555849'; c.fillRect(wall.x, wall.y, wall.w, wall.h);
    }
    c.shadowColor = 'transparent';
    for (const wall of board.walls) {
      c.fillStyle = '#80816a'; c.fillRect(wall.x, wall.y, wall.w, 2);
      c.fillStyle = '#626552'; c.fillRect(wall.x, wall.y, 2, wall.h);
    }
  }

  draw(ball, now, hint = false, animation = null) {
    if (!this.board) return;
    this.lastFrame = { ball: { ...ball }, now, hint, animation };
    const c = this.ctx, b = this.board;
    c.setTransform(this.canvas.width / b.width, 0, 0, this.canvas.height / b.height, 0, 0);
    c.drawImage(this.surface, 0, 0);
    if (hint) {
      c.save(); c.strokeStyle = '#528b6fa0'; c.lineWidth = 5; c.setLineDash([5, 10]); c.lineCap = 'round'; c.beginPath();
      b.guidePath.forEach((point, i) => { if (i === 0) c.moveTo(point.x, point.y); else c.lineTo(point.x, point.y); });
      c.stroke(); c.restore();
    }
    for (const checkpoint of b.checkpoints) {
      // A flat diamond changes gold to green; only the finish uses a tick.
      c.save(); c.translate(checkpoint.x, checkpoint.y); c.rotate(Math.PI / 4);
      c.fillStyle = checkpoint.active ? '#508164' : '#c8a357';
      c.strokeStyle = checkpoint.active ? '#2f6348' : '#967130'; c.lineWidth = 2;
      c.fillRect(-15, -15, 30, 30); c.strokeRect(-15, -15, 30, 30);
      c.strokeStyle = checkpoint.active ? '#b6d6b6' : '#f2dfaa'; c.lineWidth = 1; c.strokeRect(-10, -10, 20, 20);
      c.restore();
      c.fillStyle = checkpoint.active ? '#386451' : '#927039'; c.font = '10px Arial'; c.textAlign = 'center';
      c.fillText(checkpoint.active ? 'SAVED' : 'SAVE', checkpoint.x, checkpoint.y + 37);
    }
    if (!this.reducedMotion) {
      circle(c, b.finish.x, b.finish.y, 34 + Math.sin(now * .002) * 2, null, '#769e6c55', 1.5);
    }
    const progress = animation ? Math.min(1, (now - animation.start) / 400) : 0;
    const r = ball.r * (1 - progress * .92);
    c.save(); c.globalAlpha = 1 - progress * .8;
    circle(c, ball.x + 4 * (1 - progress), ball.y + 6 * (1 - progress), r + 1, '#272d2645');
    const marble = c.createRadialGradient(ball.x - r * .35, ball.y - r * .4, r * .04, ball.x + r * .13, ball.y + r * .2, r * 1.1);
    marble.addColorStop(0, '#fffef4'); marble.addColorStop(.24, '#e6ece4'); marble.addColorStop(.52, '#abb9ad'); marble.addColorStop(.76, '#5e7266'); marble.addColorStop(.9, '#344c41'); marble.addColorStop(1, '#b5bfb0');
    circle(c, ball.x, ball.y, r, marble, '#5d6e5c', .7);
    c.beginPath(); c.ellipse(ball.x - r * .29, ball.y - r * .35, r * .3, r * .16, -.6, 0, Math.PI * 2); c.fillStyle = '#ffffefb0'; c.fill();
    c.restore();
  }
}
