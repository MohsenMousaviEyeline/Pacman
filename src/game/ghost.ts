import type { Ghost, Player, Direction, Vec2, GhostMode, GhostName } from './types';
import { MAZE_COLS, MAZE_ROWS, TILE_SIZE, CELL } from './maze';
import {
  GHOST_SPEED, GHOST_FRIGHTENED_SPEED, GHOST_EATEN_SPEED,
  SCATTER_TARGETS, GHOST_HOME_PIXEL, FRIGHTENED_DURATION
} from './constants';
import { dirVec, pixelToTile } from './engine';

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT', NONE: 'NONE'
};

const DIRECTIONS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

function tileToPixel(tile: Vec2): Vec2 {
  return { x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE };
}

function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Normal ghosts cannot enter WALL or GHOST_DOOR (except when exiting house)
function canMove(maze: number[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= MAZE_COLS || ty < 0 || ty >= MAZE_ROWS) return true; // tunnel
  const cell = maze[ty][tx];
  return cell !== CELL.WALL && cell !== CELL.GHOST_DOOR;
}

// Eaten ghosts need to re-enter the house through the door
function canMoveGhostHouse(maze: number[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= MAZE_COLS || ty < 0 || ty >= MAZE_ROWS) return true;
  const cell = maze[ty][tx];
  return cell !== CELL.WALL;
}

export function createGhost(name: GhostName): Ghost {
  const homePos = GHOST_HOME_PIXEL[name];
  const colors: Record<GhostName, [string, string]> = {
    BLINKY: ['#ff0000', '#ff4444'],
    PINKY:  ['#ff88ff', '#ffaaff'],
    INKY:   ['#00ccff', '#44ddff'],
    CLYDE:  ['#ff9900', '#ffbb44'],
  };

  return {
    name,
    pos: { ...homePos },
    tilePos: pixelToTile(homePos.x, homePos.y),
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

// Returns true when pixel position is exactly on the tile grid
function atTileCenter(px: number, py: number): boolean {
  return (px % TILE_SIZE) === 0 && (py % TILE_SIZE) === 0;
}

export function updateGhost(
  ghost: Ghost,
  player: Player,
  allGhosts: Ghost[],
  maze: number[][],
  dt: number,
  globalMode: GhostMode,
): Ghost {
  const g = { ...ghost, pos: { ...ghost.pos }, tilePos: { ...ghost.tilePos } };

  // Count down exit timer for ghosts still in house
  if (!g.active) {
    g.exitTimer -= dt;
    if (g.exitTimer <= 0) {
      g.active = true;
    } else {
      return g;
    }
  }

  // Frightened timer countdown
  if (g.mode === 'FRIGHTENED') {
    g.frightenedTimer -= dt;
    if (g.frightenedTimer <= 0) {
      g.mode = g.prevMode;
    }
  }

  // Sync mode with global cycle (not while frightened/eaten)
  if (g.mode !== 'FRIGHTENED' && g.mode !== 'EATEN') {
    if (g.mode !== globalMode) {
      g.dir = OPPOSITE[g.dir];
      g.mode = globalMode as GhostMode;
    }
  }

  const speed = g.mode === 'FRIGHTENED' ? GHOST_FRIGHTENED_SPEED
              : g.mode === 'EATEN'      ? GHOST_EATEN_SPEED
              : GHOST_SPEED;

  const moveFn = g.mode === 'EATEN' ? canMoveGhostHouse : canMove;
  const target  = getTarget(g, player, allGhosts);

  // Distance to travel this frame (speed is px per 16ms at 60fps)
  let remaining = speed * (dt / 16);
  const MAX_ITER = 8;

  for (let iter = 0; iter < MAX_ITER && remaining > 0.001; iter++) {
    const { x, y } = g.pos;

    if (atTileCenter(x, y)) {
      let tx = x / TILE_SIZE;
      let ty = y / TILE_SIZE;

      // Tunnel teleport
      if (tx < 0)          { tx = MAZE_COLS - 1; g.pos.x = tx * TILE_SIZE; }
      if (tx >= MAZE_COLS) { tx = 0;              g.pos.x = 0; }
      g.tilePos = { x: tx, y: ty };

      // Eaten ghost: check if back home
      if (g.mode === 'EATEN') {
        const home = GHOST_HOME_PIXEL[g.name];
        if (g.pos.x === home.x && g.pos.y === home.y) {
          g.mode = g.prevMode === 'FRIGHTENED' ? 'SCATTER' : g.prevMode;
        }
      }

      // Choose best direction at this intersection
      g.dir = chooseBestDir(g, { x: tx, y: ty }, target, maze, moveFn);
    }

    // How far to the next tile boundary in the direction of travel
    const dv = dirVec(g.dir);
    const cx = g.pos.x;
    const cy = g.pos.y;

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
    if (gap === 0) gap = TILE_SIZE;

    // Check that the next tile (where we're heading) is walkable
    const nextTileX = Math.round((cx + dv.x * (gap + 0.1)) / TILE_SIZE);
    const nextTileY = Math.round((cy + dv.y * (gap + 0.1)) / TILE_SIZE);
    if (!moveFn(maze, nextTileX, nextTileY)) {
      // Blocked — stop at current position until next atTileCenter picks new dir
      remaining = 0;
      break;
    }

    const step = Math.min(remaining, gap);
    g.pos.x += dv.x * step;
    g.pos.y += dv.y * step;
    remaining -= step;

    // Snap to grid to prevent float drift
    if (Math.abs(g.pos.x % TILE_SIZE) < 0.01) g.pos.x = Math.round(g.pos.x);
    if (Math.abs(g.pos.y % TILE_SIZE) < 0.01) g.pos.y = Math.round(g.pos.y);
  }

  g.tilePos = pixelToTile(g.pos.x, g.pos.y);
  return g;
}

function getTarget(ghost: Ghost, player: Player, allGhosts: Ghost[]): Vec2 {
  if (ghost.mode === 'EATEN') {
    return GHOST_HOME_PIXEL[ghost.name];
  }
  if (ghost.mode === 'FRIGHTENED') {
    // Random: return a random corner so chooseBestDir randomises at each junction
    return {
      x: (Math.random() > 0.5 ? 0 : MAZE_COLS - 1) * TILE_SIZE,
      y: (Math.random() > 0.5 ? 0 : MAZE_ROWS - 1) * TILE_SIZE,
    };
  }
  if (ghost.mode === 'SCATTER') {
    return tileToPixel(ghost.scatterTarget);
  }

  // Chase mode
  const px = player.tilePos.x;
  const py = player.tilePos.y;
  const dv = dirVec(player.dir);

  switch (ghost.name) {
    case 'BLINKY':
      return tileToPixel(player.tilePos);
    case 'PINKY':
      return tileToPixel({ x: px + dv.x * 4, y: py + dv.y * 4 });
    case 'INKY': {
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
      const dist = dist2(ghost.tilePos, player.tilePos);
      if (dist > 64) return tileToPixel(player.tilePos);
      return tileToPixel(ghost.scatterTarget);
    }
  }
}

function chooseBestDir(
  ghost: Ghost,
  tile: Vec2,
  target: Vec2,
  maze: number[][],
  moveFn: (maze: number[][], tx: number, ty: number) => boolean,
): Direction {
  const opposite = OPPOSITE[ghost.dir];
  let bestDir: Direction = ghost.dir;
  let bestDist = Infinity;
  let foundAny = false;

  for (const dir of DIRECTIONS) {
    if (dir === opposite) continue;
    const dv = dirVec(dir);
    const nx = tile.x + dv.x;
    const ny = tile.y + dv.y;
    if (!moveFn(maze, nx, ny)) continue;

    foundAny = true;
    const d = ghost.mode === 'FRIGHTENED'
      ? Math.random() * 10000
      : dist2({ x: nx * TILE_SIZE, y: ny * TILE_SIZE }, target);

    if (d < bestDist) {
      bestDist = d;
      bestDir = dir;
    }
  }

  // If no forward direction is valid, allow reversing
  if (!foundAny) {
    const dv = dirVec(opposite);
    const nx = tile.x + dv.x;
    const ny = tile.y + dv.y;
    if (moveFn(maze, nx, ny)) return opposite;
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
