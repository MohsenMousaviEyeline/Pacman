import { MAZE_COLS, MAZE_ROWS, TILE_SIZE, CELL } from './maze';
import type { Ghost, Player, Direction } from './types';
import { getColors, type Theme, type ThemeColors } from './constants';

const WALL = CELL.WALL;

function isWall(maze: number[][], row: number, col: number): boolean {
  if (row < 0 || row >= MAZE_ROWS || col < 0 || col >= MAZE_COLS) return true;
  return maze[row][col] === WALL;
}

export function renderMaze(ctx: CanvasRenderingContext2D, maze: number[][], theme: Theme) {
  const C = getColors(theme);
  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, MAZE_COLS * TILE_SIZE, MAZE_ROWS * TILE_SIZE);

  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const cell = maze[row][col];
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;

      if (cell === CELL.WALL) {
        drawWall(ctx, maze, row, col, x, y, C, theme);
      } else if (cell === CELL.DOT) {
        drawDot(ctx, x, y, C, theme);
      } else if (cell === CELL.POWER) {
        drawPowerPellet(ctx, x, y, C, theme);
      } else if (cell === CELL.GHOST_DOOR) {
        drawGhostDoor(ctx, x, y, theme);
      }
    }
  }
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  maze: number[][],
  row: number,
  col: number,
  x: number,
  y: number,
  C: ThemeColors,
  theme: Theme,
) {
  const ts = TILE_SIZE;

  // Fill wall background
  ctx.fillStyle = C.WALL;
  ctx.fillRect(x, y, ts, ts);

  // Classic mode: solid fill only, no neon border
  if (theme === 'CLASSIC') return;

  // Draw neon border lines on exposed edges
  ctx.strokeStyle = C.WALL_BORDER;
  ctx.lineWidth = 2;
  ctx.shadowColor = C.WALL_GLOW;
  ctx.shadowBlur = 8;

  const top = !isWall(maze, row - 1, col);
  const bottom = !isWall(maze, row + 1, col);
  const left = !isWall(maze, row, col - 1);
  const right = !isWall(maze, row, col + 1);

  ctx.beginPath();
  if (top) {
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x + ts, y + 1);
  }
  if (bottom) {
    ctx.moveTo(x, y + ts - 1);
    ctx.lineTo(x + ts, y + ts - 1);
  }
  if (left) {
    ctx.moveTo(x + 1, y);
    ctx.lineTo(x + 1, y + ts);
  }
  if (right) {
    ctx.moveTo(x + ts - 1, y);
    ctx.lineTo(x + ts - 1, y + ts);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, C: ThemeColors, theme: Theme) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  ctx.fillStyle = C.DOT;
  if (theme !== 'CLASSIC') {
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 6;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

let powerPulse = 0;
export function updatePowerPulse(dt: number) {
  powerPulse = (powerPulse + dt * 0.003) % (Math.PI * 2);
}

function drawPowerPellet(ctx: CanvasRenderingContext2D, x: number, y: number, C: ThemeColors, theme: Theme) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  // Classic: static radius; Cyber: pulsing radius
  const r = theme === 'CLASSIC' ? 5 : 5 + Math.sin(powerPulse) * 1.5;
  ctx.fillStyle = C.POWER;
  if (theme !== 'CLASSIC') {
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 15 + Math.sin(powerPulse) * 5;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawGhostDoor(ctx: CanvasRenderingContext2D, x: number, y: number, theme: Theme) {
  if (theme === 'CLASSIC') {
    // Classic: plain light pink bar, no glow
    ctx.fillStyle = '#ffb8ff';
    ctx.fillRect(x + 2, y + TILE_SIZE / 2 - 1, TILE_SIZE - 4, 2);
    return;
  }
  ctx.fillStyle = '#ff88ff';
  ctx.shadowColor = '#ff44ff';
  ctx.shadowBlur = 6;
  ctx.fillRect(x + 2, y + TILE_SIZE / 2 - 1, TILE_SIZE - 4, 2);
  ctx.shadowBlur = 0;
}

export function renderPacman(ctx: CanvasRenderingContext2D, player: Player, dyingFrame: number, theme: Theme) {
  const C = getColors(theme);
  const cx = player.pos.x + TILE_SIZE / 2;
  const cy = player.pos.y + TILE_SIZE / 2;
  const r = TILE_SIZE / 2 - 1;

  let startAngle = 0;
  let endAngle = Math.PI * 2;
  let mouthOpen = player.mouthAngle;

  if (dyingFrame > 0) {
    // Dying animation: mouth opens wide then closes
    mouthOpen = (dyingFrame / 60) * Math.PI;
    if (dyingFrame > 30) mouthOpen = Math.PI * 2 * (1 - (dyingFrame - 30) / 30);
  }

  const rotation = getDirAngle(player.dir);
  startAngle = rotation + mouthOpen;
  endAngle = rotation + Math.PI * 2 - mouthOpen;

  // Glow effect (cyber only)
  if (theme !== 'CLASSIC') {
    ctx.shadowColor = C.PACMAN_GLOW;
    ctx.shadowBlur = 20;
  }

  ctx.fillStyle = C.PACMAN;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.closePath();
  ctx.fill();

  // Eye
  const eyeAngle = rotation - Math.PI / 4;
  const eyeX = cx + Math.cos(eyeAngle) * r * 0.5;
  const eyeY = cy + Math.sin(eyeAngle) * r * 0.5;
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
}

function getDirAngle(dir: Direction): number {
  switch (dir) {
    case 'RIGHT': return 0.2;
    case 'DOWN': return Math.PI / 2 + 0.2;
    case 'LEFT': return Math.PI + 0.2;
    case 'UP': return -Math.PI / 2 + 0.2;
    default: return 0.2;
  }
}

export function renderGhost(ctx: CanvasRenderingContext2D, ghost: Ghost, globalTimer: number, theme: Theme) {
  if (!ghost.active) return;

  const cx = ghost.pos.x + TILE_SIZE / 2;
  const cy = ghost.pos.y + TILE_SIZE / 2;
  const r = TILE_SIZE / 2 - 1;
  const ts = TILE_SIZE;

  let bodyColor = ghost.color;
  let eyeColor = '#fff';
  let pupilColor = '#00f';

  if (ghost.mode === 'FRIGHTENED') {
    const timeLeft = ghost.frightenedTimer;
    const flashing = timeLeft < 2000 && Math.floor(globalTimer / 250) % 2 === 0;
    if (theme === 'CLASSIC') {
      bodyColor = flashing ? '#ffffff' : '#0000cc';
    } else {
      bodyColor = flashing ? '#ffffff' : '#1a0060';
    }
    eyeColor = theme === 'CLASSIC' ? '#ffffff' : '#ff4444';
    pupilColor = theme === 'CLASSIC' ? '#ffffff' : '#ff0000';
  } else if (ghost.mode === 'EATEN') {
    // Just draw eyes when eaten
    drawGhostEyes(ctx, cx, cy, r, '#fff', '#00f');
    return;
  }

  // Glow (cyber only)
  if (theme !== 'CLASSIC') {
    ctx.shadowColor = ghost.mode === 'FRIGHTENED' ? '#4400ff' : ghost.glowColor;
    ctx.shadowBlur = 15;
  }

  // Ghost body - dome top + wavy bottom
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0, false);
  // Wavy bottom
  const wave = 3;
  const bottom = cy + r * 0.9;
  const left = cx - r;
  const right = cx + r;
  ctx.lineTo(right, bottom);
  for (let i = 0; i < 3; i++) {
    const wx = right - (i + 0.5) * (ts / 3);
    const wy = bottom - wave * (i % 2 === 0 ? 1 : -1);
    ctx.quadraticCurveTo(wx + ts / 6, wy, wx, bottom);
    ctx.quadraticCurveTo(wx - ts / 6, wy, wx - ts / 6, bottom);
  }
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.fill();

  // Circuit stripes (cyber only, not frightened)
  if (ghost.mode !== 'FRIGHTENED' && theme !== 'CLASSIC') {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    for (let i = 0; i < 2; i++) {
      const lx = cx - r * 0.5 + i * r * 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, cy - r * 0.3);
      ctx.lineTo(lx, cy + r * 0.5);
      ctx.stroke();
    }
  }

  drawGhostEyes(ctx, cx, cy, r, eyeColor, pupilColor);

  // Frightened face — classic: white wavy mouth; cyber: red
  if (ghost.mode === 'FRIGHTENED') {
    ctx.strokeStyle = theme === 'CLASSIC' ? '#ffffff' : '#ff6666';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy + r * 0.3);
    for (let i = 0; i < 5; i++) {
      const fx = cx - r * 0.5 + i * (r / 4);
      const fy = cy + r * 0.3 + (i % 2 === 0 ? 3 : -3);
      ctx.lineTo(fx, fy);
    }
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

function drawGhostEyes(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, white: string, pupil: string) {
  const eyeY = cy - r * 0.15;
  const eyeOffX = r * 0.35;
  const eyeR = r * 0.28;
  const pupilR = eyeR * 0.55;
  const pupilOff = eyeR * 0.3;

  ctx.shadowBlur = 0;
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.arc(cx - eyeOffX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeOffX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = pupil;
  ctx.beginPath();
  ctx.arc(cx - eyeOffX + pupilOff * 0.5, eyeY + pupilOff * 0.3, pupilR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeOffX + pupilOff * 0.5, eyeY + pupilOff * 0.3, pupilR, 0, Math.PI * 2);
  ctx.fill();
}

// HUD is rendered in React overlay

export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  subText: string,
  canvasW: number,
  canvasH: number,
  theme: Theme,
) {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.textAlign = 'center';

  if (theme === 'CLASSIC') {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(text, canvasW / 2, canvasH / 2 - 20);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#ffff00';
    ctx.fillText(subText, canvasW / 2, canvasH / 2 + 20);
  } else {
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 20;
    ctx.font = 'bold 36px "Orbitron", monospace';
    ctx.fillText(text, canvasW / 2, canvasH / 2 - 20);

    ctx.shadowBlur = 10;
    ctx.font = '16px "Orbitron", monospace';
    ctx.fillStyle = '#88ccff';
    ctx.fillText(subText, canvasW / 2, canvasH / 2 + 20);

    ctx.shadowBlur = 0;
  }
}

export function renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[], theme: Theme) {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    if (theme !== 'CLASSIC') {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export function createParticles(x: number, y: number, color: string, count = 8): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 1 + Math.random() * 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
      size: 3 + Math.random() * 3,
    });
  }
  return particles;
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles
    .map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + 0.05,
      life: p.life - dt * 0.001,
    }))
    .filter(p => p.life > 0);
}

export function renderStarfield(ctx: CanvasRenderingContext2D, stars: Star[], _canvasW: number, _canvasH: number) {
  for (const s of stars) {
    ctx.globalAlpha = s.brightness;
    ctx.fillStyle = '#aaccff';
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
}

export function createStars(count: number, w: number, h: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() < 0.3 ? 2 : 1,
      brightness: 0.1 + Math.random() * 0.4,
    });
  }
  return stars;
}

export function renderScorePopup(ctx: CanvasRenderingContext2D, popups: ScorePopup[], theme: Theme) {
  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = theme === 'CLASSIC' ? '#ffffff' : '#ffee00';
    if (theme !== 'CLASSIC') {
      ctx.shadowColor = '#ff9900';
      ctx.shadowBlur = 15;
    }
    ctx.font = theme === 'CLASSIC'
      ? 'bold 14px monospace'
      : 'bold 14px "Orbitron", monospace';
    ctx.fillText('+' + p.score, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

export interface ScorePopup {
  x: number;
  y: number;
  score: number;
  life: number;
}
