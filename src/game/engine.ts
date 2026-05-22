import type { Player, Ghost, GameData, GameState, Direction, Vec2 } from './types';
import { MAZE_DATA, MAZE_COLS, MAZE_ROWS, TILE_SIZE, CELL, countDots } from './maze';
import { PACMAN_SPEED, DOT_SCORE, POWER_SCORE, GHOST_SCORES, MODE_DURATIONS } from './constants';
import { createGhost, updateGhost, frightenGhost, eatGhost } from './ghost';
import type { Particle, ScorePopup } from './renderer';
import { createParticles } from './renderer';

export type { GameState, GameData };

function moveDir(dir: Direction): Vec2 {
  switch (dir) {
    case 'UP': return { x: 0, y: -1 };
    case 'DOWN': return { x: 0, y: 1 };
    case 'LEFT': return { x: -1, y: 0 };
    case 'RIGHT': return { x: 1, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

function canWalk(maze: number[][], tx: number, ty: number): boolean {
  if (ty < 0 || ty >= MAZE_ROWS) return false;
  // Tunnels on sides
  if (tx < 0 || tx >= MAZE_COLS) return true;
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

export function updateEngine(state: EngineState, dt: number, inputDir: Direction | null): EngineState {
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
      // Reset positions
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
  if (inputDir) player = { ...player, nextDir: inputDir };

  player = { ...player };
  const steps = Math.ceil(player.speed);
  const stepSize = player.speed / steps;

  for (let s = 0; s < steps; s++) {
    const px = Math.round(player.pos.x / TILE_SIZE);
    const py = Math.round(player.pos.y / TILE_SIZE);
    const atCenter = Math.abs(player.pos.x - px * TILE_SIZE) < stepSize + 0.5 &&
                     Math.abs(player.pos.y - py * TILE_SIZE) < stepSize + 0.5;

    if (atCenter) {
      player.pos.x = px * TILE_SIZE;
      player.pos.y = py * TILE_SIZE;

      // Tunnel teleport
      if (px < 0) { player.pos.x = (MAZE_COLS - 1) * TILE_SIZE; }
      if (px >= MAZE_COLS) { player.pos.x = 0; }

      const tx = Math.round(player.pos.x / TILE_SIZE);
      const ty = py;
      player.tilePos = { x: tx, y: ty };

      // Try next direction
      const nd = player.nextDir;
      const ndv = moveDir(nd);
      if (canWalk(maze, tx + ndv.x, ty + ndv.y)) {
        player.dir = nd;
      }
    }

    const dv = moveDir(player.dir);
    const nx = player.pos.x + dv.x * stepSize;
    const ny = player.pos.y + dv.y * stepSize;
    const ntx = Math.round(nx / TILE_SIZE);
    const nty = Math.round(ny / TILE_SIZE);

    if (canWalk(maze, ntx, nty)) {
      player.pos.x = nx;
      player.pos.y = ny;
    }
  }

  // Mouth animation
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
      particles = [...particles, ...createParticles(player.pos.x + TILE_SIZE / 2, player.pos.y + TILE_SIZE / 2, '#00aaff', 4)];
      scorePopups = [...scorePopups, { x: player.pos.x + TILE_SIZE / 2, y: player.pos.y, score: DOT_SCORE, life: 1 }];
    } else if (cell === CELL.POWER) {
      maze = maze.map((row, r) => r === pty ? row.map((c, col) => col === ptx ? CELL.EMPTY : c) : row);
      score += POWER_SCORE;
      dotsEaten++;
      frightenedMultiplier = 1;
      ghosts = ghosts.map(g => frightenGhost(g));
      particles = [...particles, ...createParticles(player.pos.x + TILE_SIZE / 2, player.pos.y + TILE_SIZE / 2, '#ffcc00', 12)];
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
    particles = [...particles, ...createParticles(player.pos.x + TILE_SIZE / 2, player.pos.y + TILE_SIZE / 2, '#ffee00', 20)];
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
