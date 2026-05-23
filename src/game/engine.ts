import type { Player, Ghost, GameData, GameState, Direction, Vec2 } from './types';
import { MAZE_DATA, MAZE_COLS, MAZE_ROWS, TILE_SIZE, CELL, countDots } from './maze';
import { PACMAN_SPEED, DOT_SCORE, POWER_SCORE, GHOST_SCORES, MODE_DURATIONS } from './constants';
import { createGhost, updateGhost, frightenGhost, eatGhost } from './ghost';
import type { Particle, ScorePopup } from './renderer';
import { createParticles } from './renderer';

export type { GameState, GameData };

export function dirVec(dir: Direction): Vec2 {
  switch (dir) {
    case 'UP':    return { x: 0, y: -1 };
    case 'DOWN':  return { x: 0, y:  1 };
    case 'LEFT':  return { x: -1, y: 0 };
    case 'RIGHT': return { x:  1, y: 0 };
    default:      return { x: 0, y: 0 };
  }
}

// Tile coords from pixel position — always floor-based
export function pixelToTile(px: number, py: number): Vec2 {
  return {
    x: Math.floor(px / TILE_SIZE),
    y: Math.floor(py / TILE_SIZE),
  };
}

// True when a pixel position is aligned to the tile grid (within tolerance)
function atTileCenter(px: number, py: number): boolean {
  return (px % TILE_SIZE) === 0 && (py % TILE_SIZE) === 0;
}

function canWalk(maze: number[][], tx: number, ty: number): boolean {
  if (ty < 0 || ty >= MAZE_ROWS) return false;
  if (tx < 0 || tx >= MAZE_COLS) return true; // tunnel exit
  const cell = maze[ty][tx];
  return cell !== CELL.WALL && cell !== CELL.GHOST_HOUSE && cell !== CELL.GHOST_DOOR;
}

export function createInitialState(): {
  player: Player;
  ghosts: Ghost[];
  gameData: GameData;
  particles: Particle[];
  scorePopups: ScorePopup[];
  dyingFrame: number;
} {
  const maze = MAZE_DATA.map(row => [...row]);
  const totalDots = countDots();

  return {
    player: {
      pos: { x: 13 * TILE_SIZE, y: 23 * TILE_SIZE },
      tilePos: { x: 13, y: 23 },
      dir: 'LEFT',
      nextDir: 'LEFT',
      moving: false,
      speed: PACMAN_SPEED,
      mouthAngle: 0.2,
      mouthDir: 1,
      animTimer: 0,
    },
    ghosts: [
      createGhost('BLINKY'),
      createGhost('PINKY'),
      createGhost('INKY'),
      createGhost('CLYDE'),
    ],
    gameData: {
      score: 0,
      highScore: parseInt(localStorage.getItem('pacman-hs') || '0'),
      lives: 3,
      level: 1,
      dotsEaten: 0,
      totalDots,
      state: 'MENU',
      frightenedMultiplier: 1,
      modeTimer: 0,
      modePhase: 0,
      maze,
    },
    particles: [],
    scorePopups: [],
    dyingFrame: 0,
  };
}

export interface EngineState {
  player: Player;
  ghosts: Ghost[];
  gameData: GameData;
  particles: Particle[];
  scorePopups: ScorePopup[];
  dyingFrame: number;
}

// Move a character along one axis by `speed` pixels per frame, snapping to
// tile centers and checking walls. Returns the updated pixel coordinate.
function movePlayer(player: Player, maze: number[][], dt: number): Player {
  const p = { ...player, pos: { ...player.pos }, tilePos: { ...player.tilePos } };

  // Scale speed by dt (speed is in pixels per 16ms frame at 60fps)
  const dist = p.speed * (dt / 16);

  let remaining = dist;
  const MAX_ITER = 8; // safety cap
  for (let iter = 0; iter < MAX_ITER && remaining > 0.001; iter++) {
    const { x, y } = p.pos;

    if (atTileCenter(x, y)) {
      // Wrap tunnels
      let tx = x / TILE_SIZE;
      let ty = y / TILE_SIZE;
      if (tx < 0)          { tx = MAZE_COLS - 1; p.pos.x = tx * TILE_SIZE; }
      if (tx >= MAZE_COLS) { tx = 0;              p.pos.x = 0; }
      p.tilePos = { x: tx, y: ty };

      // Try to switch to queued direction
      const ndv = dirVec(p.nextDir);
      if (canWalk(maze, tx + ndv.x, ty + ndv.y)) {
        p.dir = p.nextDir;
      }

      // Can we continue in current direction?
      const dv = dirVec(p.dir);
      if (!canWalk(maze, tx + dv.x, ty + dv.y)) {
        // Blocked — stop here
        remaining = 0;
        break;
      }
    }

    // Move up to the next tile boundary (or remaining distance, whichever is less)
    const dv = dirVec(p.dir);
    const { x: cx, y: cy } = p.pos;

    // How far to the next tile edge in the direction of travel
    let gap: number;
    if (dv.x !== 0) {
      const nextEdge = dv.x > 0
        ? (Math.floor(cx / TILE_SIZE) + 1) * TILE_SIZE
        : Math.ceil(cx / TILE_SIZE - 1) * TILE_SIZE;
      gap = Math.abs(nextEdge - cx);
    } else {
      const nextEdge = dv.y > 0
        ? (Math.floor(cy / TILE_SIZE) + 1) * TILE_SIZE
        : Math.ceil(cy / TILE_SIZE - 1) * TILE_SIZE;
      gap = Math.abs(nextEdge - cy);
    }

    if (gap === 0) gap = TILE_SIZE; // already on edge, move a full tile

    const step = Math.min(remaining, gap);
    p.pos.x += dv.x * step;
    p.pos.y += dv.y * step;
    remaining -= step;

    // Snap to grid to avoid float drift
    if (Math.abs(p.pos.x % TILE_SIZE) < 0.01) p.pos.x = Math.round(p.pos.x);
    if (Math.abs(p.pos.y % TILE_SIZE) < 0.01) p.pos.y = Math.round(p.pos.y);
  }

  // Update tile position
  p.tilePos = pixelToTile(p.pos.x, p.pos.y);
  return p;
}

export interface ParticleColorMap {
  dot:   string;
  power: string;
  death: string;
}

export function updateEngine(
  state: EngineState,
  dt: number,
  inputDir: Direction | null,
  particleColors?: ParticleColorMap,
): EngineState {
  const PC = particleColors ?? { dot: '#00aaff', power: '#ffcc00', death: '#ffee00' };
  const { gameData } = state;
  if (gameData.state !== 'PLAYING') return state;

  let { player, ghosts, particles, scorePopups, dyingFrame } = state;
  let { score, highScore, lives, dotsEaten, totalDots, maze, frightenedMultiplier, modeTimer, modePhase } = gameData;

  // Update mode cycle
  modeTimer += dt;
  let globalMode = modePhase % 2 === 0 ? 'SCATTER' : 'CHASE';
  if (modeTimer >= MODE_DURATIONS[modePhase]) {
    modeTimer = 0;
    modePhase = Math.min(modePhase + 1, MODE_DURATIONS.length - 1);
    globalMode = modePhase % 2 === 0 ? 'SCATTER' : 'CHASE';
  }

  // Handle dying animation
  if (dyingFrame > 0) {
    dyingFrame--;
    if (dyingFrame === 0) {
      lives--;
      if (lives <= 0) {
        if (score > highScore) {
          highScore = score;
          localStorage.setItem('pacman-hs', String(highScore));
        }
        return {
          ...state,
          gameData: { ...gameData, lives: 0, highScore, state: 'GAME_OVER' },
          dyingFrame: 0,
        };
      }
      const reset = createInitialState();
      return {
        ...reset,
        gameData: {
          ...gameData,
          lives,
          score,
          highScore,
          maze,
          dotsEaten,
          totalDots,
          state: 'PLAYING',
          frightenedMultiplier: 1,
        },
        dyingFrame: 0,
      };
    }
    return { ...state, dyingFrame, gameData: { ...gameData, lives } };
  }

  // ---- PLAYER MOVEMENT ----
  // First keypress unlocks movement and queues the direction
  if (inputDir) {
    player = { ...player, nextDir: inputDir, moving: true };
  }

  // Only move once the player has pressed a key
  if (player.moving) {
    player = movePlayer(player, maze, dt);
  }

  // Mouth animation
  player = { ...player };
  player.animTimer += dt;
  if (player.animTimer > 50) {
    player.animTimer = 0;
    player.mouthAngle += player.mouthDir * 0.08;
    if (player.mouthAngle > 0.4 || player.mouthAngle < 0.05) {
      player.mouthDir = -player.mouthDir;
    }
  }

  // ---- EAT DOTS ----
  const ptx = player.tilePos.x;
  const pty = player.tilePos.y;
  if (pty >= 0 && pty < MAZE_ROWS && ptx >= 0 && ptx < MAZE_COLS) {
    const cell = maze[pty][ptx];
    if (cell === CELL.DOT) {
      maze = maze.map((row, r) => r === pty ? row.map((c, col) => col === ptx ? CELL.EMPTY : c) : row);
      score += DOT_SCORE;
      dotsEaten++;
      particles = [...particles, ...createParticles(player.pos.x + TILE_SIZE / 2, player.pos.y + TILE_SIZE / 2, PC.dot, 4)];
      scorePopups = [...scorePopups, { x: player.pos.x + TILE_SIZE / 2, y: player.pos.y, score: DOT_SCORE, life: 1 }];
    } else if (cell === CELL.POWER) {
      maze = maze.map((row, r) => r === pty ? row.map((c, col) => col === ptx ? CELL.EMPTY : c) : row);
      score += POWER_SCORE;
      dotsEaten++;
      frightenedMultiplier = 1;
      ghosts = ghosts.map(g => frightenGhost(g));
      particles = [...particles, ...createParticles(player.pos.x + TILE_SIZE / 2, player.pos.y + TILE_SIZE / 2, PC.power, 12)];
      scorePopups = [...scorePopups, { x: player.pos.x + TILE_SIZE / 2, y: player.pos.y, score: POWER_SCORE, life: 1 }];
    }
  }

  // Win check
  if (dotsEaten >= totalDots) {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('pacman-hs', String(highScore));
    }
    return {
      ...state,
      player,
      ghosts,
      particles,
      scorePopups,
      gameData: { ...gameData, score, highScore, lives, dotsEaten, totalDots, maze, state: 'WIN' },
    };
  }

  // ---- GHOST UPDATE ----
  const newGhosts = ghosts.map(g => updateGhost(g, player, ghosts, maze, dt, globalMode as any));

  // ---- COLLISION ----
  let died = false;
  const collidedGhosts = newGhosts.map(g => {
    if (!g.active) return g;
    const dx = Math.abs(g.pos.x - player.pos.x);
    const dy = Math.abs(g.pos.y - player.pos.y);
    if (dx < TILE_SIZE * 0.7 && dy < TILE_SIZE * 0.7) {
      if (g.mode === 'FRIGHTENED') {
        const ghostScore = GHOST_SCORES[Math.min(frightenedMultiplier - 1, 3)];
        score += ghostScore;
        particles = [...particles, ...createParticles(g.pos.x + TILE_SIZE / 2, g.pos.y + TILE_SIZE / 2, g.color, 16)];
        scorePopups = [...scorePopups, { x: g.pos.x + TILE_SIZE / 2, y: g.pos.y, score: ghostScore, life: 1 }];
        frightenedMultiplier++;
        return eatGhost(g);
      } else if (g.mode !== 'EATEN') {
        died = true;
      }
    }
    return g;
  });

  if (died) {
    particles = [...particles, ...createParticles(player.pos.x + TILE_SIZE / 2, player.pos.y + TILE_SIZE / 2, PC.death, 20)];
    return {
      ...state,
      player,
      ghosts: collidedGhosts,
      particles,
      scorePopups,
      dyingFrame: 60,
      gameData: {
        ...gameData,
        score,
        highScore: Math.max(score, highScore),
        lives,
        dotsEaten,
        maze,
        frightenedMultiplier,
        modeTimer,
        modePhase,
      },
    };
  }

  // Update score popups
  const updatedPopups = scorePopups
    .map(p => ({ ...p, y: p.y - 0.5, life: p.life - dt * 0.001 }))
    .filter(p => p.life > 0);

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('pacman-hs', String(highScore));
  }

  return {
    ...state,
    player,
    ghosts: collidedGhosts,
    particles,
    scorePopups: updatedPopups,
    gameData: {
      ...gameData,
      score,
      highScore,
      lives,
      dotsEaten,
      maze,
      frightenedMultiplier,
      modeTimer,
      modePhase,
    },
  };
}
