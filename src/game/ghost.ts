import type { Ghost, Player, Direction, Vec2, GhostMode, GhostName } from './types';
import { MAZE_COLS, MAZE_ROWS, TILE_SIZE, CELL } from './maze';
import {
  GHOST_SPEED, GHOST_FRIGHTENED_SPEED, GHOST_EATEN_SPEED,
  SCATTER_TARGETS, GHOST_HOME_PIXEL, FRIGHTENED_DURATION
} from './constants';

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT', NONE: 'NONE'
};

const DIRECTIONS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

function tileToPixel(tile: Vec2): Vec2 {
  return { x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE };
}

function pixelToTile(pos: Vec2): Vec2 {
  return {
    x: Math.floor((pos.x + TILE_SIZE / 2) / TILE_SIZE),
    y: Math.floor((pos.y + TILE_SIZE / 2) / TILE_SIZE),
  };
}

function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function canMove(maze: number[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= MAZE_COLS || ty < 0 || ty >= MAZE_ROWS) return true; // tunnel
  const cell = maze[ty][tx];
  return cell !== CELL.WALL && cell !== CELL.GHOST_DOOR;
}

function canMoveGhostHouse(maze: number[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= MAZE_COLS || ty < 0 || ty >= MAZE_ROWS) return true;
  const cell = maze[ty][tx];
  return cell !== CELL.WALL;
}

function moveDir(dir: Direction): Vec2 {
  switch (dir) {
    case 'UP': return { x: 0, y: -1 };
    case 'DOWN': return { x: 0, y: 1 };
    case 'LEFT': return { x: -1, y: 0 };
    case 'RIGHT': return { x: 1, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

export function createGhost(name: GhostName): Ghost {
  const homePos = GHOST_HOME_PIXEL[name];
  const colors: Record<GhostName, [string, string]> = {
    BLINKY: ['#ff0000', '#ff4444'],
    PINKY: ['#ff88ff', '#ffaaff'],
    INKY: ['#00ccff', '#44ddff'],
    CLYDE: ['#ff9900', '#ffbb44'],
  };

  return {
    name,
    pos: { ...homePos },
    tilePos: pixelToTile(homePos),
    dir: 'UP',
    nextDir: 'UP',
    mode: 'SCATTER',
    prevMode: 'SCATTER',
    frightenedTimer: 0,
    eatenTimer: 0,
    speed: GHOST_SPEED,
    color: colors[name][0],
    glowColor: colors[name][1],
    scatterTarget: SCATTER_TARGETS[name],
    active: name === 'BLINKY',
    exitTimer: name === 'BLINKY' ? 0 : name === 'PINKY' ? 2000 : name === 'INKY' ? 5000 : 8000,
  };
}

export function updateGhost(ghost: Ghost, player: Player, allGhosts: Ghost[], maze: number[][], dt: number, globalMode: GhostMode): Ghost {
  const g = { ...ghost };

  if (!g.active) {
    // Count down exit timer
    g.exitTimer -= dt;
    if (g.exitTimer <= 0) {
      g.active = true;
    } else {
      return g;
    }
  }

  // Handle frightened timer
  if (g.mode === 'FRIGHTENED') {
    g.frightenedTimer -= dt;
    if (g.frightenedTimer <= 0) {
      g.mode = g.prevMode;
    }
  }

  // Update mode based on global mode (unless frightened or eaten)
  if (g.mode !== 'FRIGHTENED' && g.mode !== 'EATEN') {
    if (g.mode !== globalMode) {
      g.dir = OPPOSITE[g.dir];
      g.mode = globalMode;
    }
  }

  const speed = g.mode === 'FRIGHTENED' ? GHOST_FRIGHTENED_SPEED :
                g.mode === 'EATEN' ? GHOST_EATEN_SPEED : GHOST_SPEED;

  // Which collision function to use (eaten ghosts can pass through ghost-house interior)
  const moveFn = g.mode === 'EATEN' ? canMoveGhostHouse : canMove;

  const target = getTarget(g, player, allGhosts, maze);

  // Move pixel by pixel
  const steps = Math.ceil(speed);
  const stepSize = speed / steps;

  for (let s = 0; s < steps; s++) {
    const tx = Math.round(g.pos.x / TILE_SIZE);
    const ty = Math.round(g.pos.y / TILE_SIZE);
    const atCenter = Math.abs(g.pos.x - tx * TILE_SIZE) < stepSize + 0.5 &&
                     Math.abs(g.pos.y - ty * TILE_SIZE) < stepSize + 0.5;

    if (atCenter) {
      // Snap to tile center
      g.pos.x = tx * TILE_SIZE;
      g.pos.y = ty * TILE_SIZE;
      g.tilePos = { x: tx, y: ty };

      // Teleport tunnels
      if (tx < 0) { g.pos.x = (MAZE_COLS - 1) * TILE_SIZE; g.tilePos.x = MAZE_COLS - 1; }
      if (tx >= MAZE_COLS) { g.pos.x = 0; g.tilePos.x = 0; }

      // Check if eaten ghost reached home
      if (g.mode === 'EATEN') {
        const home = GHOST_HOME_PIXEL[g.name];
        const distHome = Math.abs(g.pos.x - home.x) + Math.abs(g.pos.y - home.y);
        if (distHome < TILE_SIZE) {
          g.pos = { ...home };
          g.mode = g.prevMode === 'FRIGHTENED' ? 'SCATTER' : g.prevMode;
        }
      }

      // Choose next direction at intersection
      const bestDir = chooseBestDir(g, { x: tx, y: ty }, target, maze);
      g.dir = bestDir;
    }

    // Move — only if the next tile is walkable
    const dv = moveDir(g.dir);
    const nx = g.pos.x + dv.x * stepSize;
    const ny = g.pos.y + dv.y * stepSize;
    const ntx = Math.round(nx / TILE_SIZE);
    const nty = Math.round(ny / TILE_SIZE);
    if (moveFn(maze, ntx, nty)) {
      g.pos.x = nx;
      g.pos.y = ny;
    } else {
      // Blocked — snap to current tile center so atCenter fires next step
      g.pos.x = tx * TILE_SIZE;
      g.pos.y = ty * TILE_SIZE;
    }
  }

  return g;
}

function getTarget(ghost: Ghost, player: Player, allGhosts: Ghost[], _maze: number[][]): Vec2 {
  if (ghost.mode === 'EATEN') {
    return GHOST_HOME_PIXEL[ghost.name];
  }
  if (ghost.mode === 'FRIGHTENED') {
    // Random target
    return { x: Math.random() * MAZE_COLS, y: Math.random() * MAZE_ROWS };
  }
  if (ghost.mode === 'SCATTER') {
    return tileToPixel(ghost.scatterTarget);
  }

  // Chase mode
  const px = player.tilePos.x;
  const py = player.tilePos.y;
  const dv = moveDir(player.dir);

  switch (ghost.name) {
    case 'BLINKY':
      return tileToPixel(player.tilePos);
    case 'PINKY': {
      // 4 tiles ahead of pacman
      return tileToPixel({ x: px + dv.x * 4, y: py + dv.y * 4 });
    }
    case 'INKY': {
      // Vector from blinky to 2 tiles ahead of pacman, doubled
      const blinky = allGhosts.find(g => g.name === 'BLINKY');
      const ahead = { x: px + dv.x * 2, y: py + dv.y * 2 };
      if (blinky) {
        const bt = blinky.tilePos;
        return tileToPixel({
          x: ahead.x + (ahead.x - bt.x),
          y: ahead.y + (ahead.y - bt.y),
        });
      }
      return tileToPixel(ahead);
    }
    case 'CLYDE': {
      // If far, chase. If close, scatter
      const dist = dist2(ghost.tilePos, player.tilePos);
      if (dist > 64) return tileToPixel(player.tilePos);
      return tileToPixel(ghost.scatterTarget);
    }
  }
}

function chooseBestDir(ghost: Ghost, tile: Vec2, target: Vec2, maze: number[][]): Direction {
  const opposite = OPPOSITE[ghost.dir];
  let bestDir: Direction = ghost.dir;
  let bestDist = Infinity;

  const checkFn = ghost.mode === 'EATEN' ? canMoveGhostHouse : canMove;

  for (const dir of DIRECTIONS) {
    if (dir === opposite) continue;
    const dv = moveDir(dir);
    const nx = tile.x + dv.x;
    const ny = tile.y + dv.y;
    if (!checkFn(maze, nx, ny)) continue;

    let d: number;
    if (ghost.mode === 'FRIGHTENED') {
      d = Math.random() * 1000; // random
    } else {
      d = dist2({ x: nx * TILE_SIZE, y: ny * TILE_SIZE }, target);
    }

    if (d < bestDist) {
      bestDist = d;
      bestDir = dir;
    }
  }

  return bestDir;
}

export function frightenGhost(ghost: Ghost): Ghost {
  if (ghost.mode === 'EATEN') return ghost;
  return {
    ...ghost,
    prevMode: ghost.mode !== 'FRIGHTENED' ? ghost.mode : ghost.prevMode,
    mode: 'FRIGHTENED',
    frightenedTimer: FRIGHTENED_DURATION,
    dir: OPPOSITE[ghost.dir],
  };
}

export function eatGhost(ghost: Ghost): Ghost {
  return {
    ...ghost,
    mode: 'EATEN',
    prevMode: ghost.prevMode,
  };
}
