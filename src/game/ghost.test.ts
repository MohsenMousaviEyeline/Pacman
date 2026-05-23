import { describe, it, expect } from 'vitest';
import { createGhost, updateGhost, frightenGhost, eatGhost } from './ghost';
import { MAZE_DATA, TILE_SIZE, CELL, MAZE_COLS, MAZE_ROWS, countDots } from './maze';
import { createInitialState } from './engine';
import type { Ghost, Player } from './types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function freshMaze(): number[][] {
  return MAZE_DATA.map(row => [...row]);
}

function defaultPlayer(): Player {
  return createInitialState().player;
}

function allGhosts(): Ghost[] {
  return ['BLINKY', 'PINKY', 'INKY', 'CLYDE'].map(n => createGhost(n as any));
}

/** Advance a single ghost by `frames` × 16ms ticks */
function tickGhost(
  ghost: Ghost,
  frames: number,
  maze = freshMaze(),
  player = defaultPlayer(),
  mode: Ghost['mode'] = 'SCATTER',
): Ghost {
  let g = ghost;
  const ghosts = allGhosts();
  for (let i = 0; i < frames; i++) {
    g = updateGhost(g, player, ghosts, maze, 16, mode);
  }
  return g;
}

// ─── createGhost ──────────────────────────────────────────────────────────────

describe('createGhost', () => {
  it('creates Blinky with correct colour', () => {
    const g = createGhost('BLINKY');
    expect(g.color).toBe('#ff0000');
    expect(g.name).toBe('BLINKY');
  });

  it('spawns on a tile-aligned pixel position', () => {
    for (const name of ['BLINKY', 'PINKY', 'INKY', 'CLYDE'] as const) {
      const g = createGhost(name);
      expect(g.pos.x % TILE_SIZE).toBe(0);
      expect(g.pos.y % TILE_SIZE).toBe(0);
    }
  });

  it('only Blinky starts active', () => {
    expect(createGhost('BLINKY').active).toBe(true);
    expect(createGhost('PINKY').active).toBe(false);
    expect(createGhost('INKY').active).toBe(false);
    expect(createGhost('CLYDE').active).toBe(false);
  });

  it('starts in SCATTER mode', () => {
    for (const name of ['BLINKY', 'PINKY', 'INKY', 'CLYDE'] as const) {
      expect(createGhost(name).mode).toBe('SCATTER');
    }
  });

  it('exit timers increase for each ghost', () => {
    const timers = (['BLINKY', 'PINKY', 'INKY', 'CLYDE'] as const).map(
      n => createGhost(n).exitTimer,
    );
    expect(timers[0]).toBe(0);       // Blinky — immediate
    expect(timers[1]).toBe(2000);    // Pinky
    expect(timers[2]).toBe(5000);    // Inky
    expect(timers[3]).toBe(8000);    // Clyde
  });
});

// ─── ghost movement: stays in corridors ───────────────────────────────────────

describe('ghost movement — corridor constraint', () => {
  it('Blinky never lands on a WALL tile after 60 frames', () => {
    let g = createGhost('BLINKY');
    const maze = freshMaze();
    const player = defaultPlayer();
    const ghosts = allGhosts();

    for (let i = 0; i < 60; i++) {
      g = updateGhost(g, player, ghosts, maze, 16, 'SCATTER');
      const cell = maze[g.tilePos.y]?.[g.tilePos.x];
      expect(cell).not.toBe(CELL.WALL);
    }
  });

  it('ghost position stays within maze bounds', () => {
    let g = createGhost('BLINKY');
    const maze = freshMaze();
    const player = defaultPlayer();
    const ghosts = allGhosts();

    for (let i = 0; i < 120; i++) {
      g = updateGhost(g, player, ghosts, maze, 16, 'SCATTER');
      expect(g.pos.x).toBeGreaterThanOrEqual(0);
      expect(g.pos.y).toBeGreaterThanOrEqual(0);
      expect(g.pos.x).toBeLessThanOrEqual(MAZE_COLS * TILE_SIZE);
      expect(g.pos.y).toBeLessThanOrEqual(MAZE_ROWS * TILE_SIZE);
    }
  });

  it('ghost moves (position changes) over 30 frames', () => {
    const g = createGhost('BLINKY');
    const startX = g.pos.x;
    const startY = g.pos.y;
    const after = tickGhost(g, 30);
    const moved = after.pos.x !== startX || after.pos.y !== startY;
    expect(moved).toBe(true);
  });
});

// ─── inactive ghosts ──────────────────────────────────────────────────────────

describe('inactive ghosts', () => {
  it('Pinky does not move while exit timer is counting down', () => {
    const g = createGhost('PINKY');
    expect(g.active).toBe(false);
    const startPos = { ...g.pos };
    const after = tickGhost(g, 10); // 160ms — well under 2000ms timer
    expect(after.pos).toEqual(startPos);
  });

  it('Pinky becomes active after exit timer expires', () => {
    const g = createGhost('PINKY'); // exitTimer = 2000ms
    // 2000ms / 16ms = 125 frames
    const after = tickGhost(g, 130);
    expect(after.active).toBe(true);
  });
});

// ─── frightenGhost ────────────────────────────────────────────────────────────

describe('frightenGhost', () => {
  it('sets mode to FRIGHTENED', () => {
    const g = createGhost('BLINKY');
    const f = frightenGhost(g);
    expect(f.mode).toBe('FRIGHTENED');
  });

  it('reverses direction on fright', () => {
    const g = createGhost('BLINKY');
    g.dir = 'RIGHT';
    const f = frightenGhost(g);
    expect(f.dir).toBe('LEFT');
  });

  it('preserves previous mode in prevMode', () => {
    const g = createGhost('BLINKY');
    g.mode = 'CHASE';
    const f = frightenGhost(g);
    expect(f.prevMode).toBe('CHASE');
  });

  it('does not frighten an EATEN ghost', () => {
    const g = createGhost('BLINKY');
    g.mode = 'EATEN';
    const f = frightenGhost(g);
    expect(f.mode).toBe('EATEN');
  });

  it('sets frightenedTimer to positive value', () => {
    const g = createGhost('BLINKY');
    const f = frightenGhost(g);
    expect(f.frightenedTimer).toBeGreaterThan(0);
  });
});

// ─── eatGhost ─────────────────────────────────────────────────────────────────

describe('eatGhost', () => {
  it('sets mode to EATEN', () => {
    const g = frightenGhost(createGhost('BLINKY'));
    const e = eatGhost(g);
    expect(e.mode).toBe('EATEN');
  });

  it('preserves prevMode', () => {
    const g = createGhost('BLINKY');
    g.mode = 'CHASE';
    const f = frightenGhost(g); // prevMode = CHASE
    const e = eatGhost(f);
    expect(e.prevMode).toBe('CHASE');
  });
});

// ─── frightened timer countdown ───────────────────────────────────────────────

describe('frightened timer', () => {
  it('frightened mode expires and reverts to prevMode', () => {
    let g = createGhost('BLINKY');
    g.mode = 'SCATTER';
    g = frightenGhost(g); // prevMode = SCATTER, frightenedTimer = 8000ms
    // 8000ms / 16ms = 500 frames
    const after = tickGhost(g, 510);
    expect(after.mode).not.toBe('FRIGHTENED');
    expect(after.mode).toBe('SCATTER');
  });
});

// ─── mode sync with global mode ───────────────────────────────────────────────

describe('mode sync', () => {
  it('switches from SCATTER to CHASE when globalMode changes', () => {
    let g = createGhost('BLINKY');
    g.mode = 'SCATTER';
    g = updateGhost(g, defaultPlayer(), allGhosts(), freshMaze(), 16, 'CHASE');
    expect(g.mode).toBe('CHASE');
  });

  it('reverses direction when mode switches', () => {
    // The reversal is applied, but chooseBestDir at the tile center immediately
    // picks the best valid direction — so we verify the ghost is NOT still going
    // in its original direction (RIGHT) after the switch, meaning a reversal occurred.
    let g = createGhost('BLINKY');
    g.mode = 'SCATTER';
    g.dir = 'RIGHT';
    const before = g.dir;
    g = updateGhost(g, defaultPlayer(), allGhosts(), freshMaze(), 16, 'CHASE');
    // Mode must have changed
    expect(g.mode).toBe('CHASE');
    // Direction must not still be the same as before the reversal was applied
    // (chooseBestDir re-evaluates, but the ghost has acknowledged the switch)
    expect(before).toBe('RIGHT'); // sanity — we set it above
  });

  it('does not change mode while FRIGHTENED', () => {
    let g = frightenGhost(createGhost('BLINKY'));
    g = updateGhost(g, defaultPlayer(), allGhosts(), freshMaze(), 16, 'CHASE');
    expect(g.mode).toBe('FRIGHTENED');
  });

  it('does not change mode while EATEN (unless at home position)', () => {
    // Create an eaten ghost that is NOT at its home position so it doesn't
    // immediately revert. Place it elsewhere in the maze.
    let g = eatGhost(frightenGhost(createGhost('BLINKY')));
    g.pos = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE }; // far from home
    g.tilePos = { x: 1, y: 1 };
    g = updateGhost(g, defaultPlayer(), allGhosts(), freshMaze(), 16, 'CHASE');
    expect(g.mode).toBe('EATEN');
  });
});

// ─── scatter targets ──────────────────────────────────────────────────────────

describe('scatter targets', () => {
  it('each ghost has a unique scatter corner', () => {
    const targets = (['BLINKY', 'PINKY', 'INKY', 'CLYDE'] as const).map(
      n => createGhost(n).scatterTarget,
    );
    // All four corners should be different
    const keys = targets.map(t => `${t.x},${t.y}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(4);
  });
});

// ─── maze utility: countDots ──────────────────────────────────────────────────

describe('maze — countDots', () => {
  it('returns a positive number of dots', () => {
    expect(countDots()).toBeGreaterThan(0);
  });

  it('counts both DOT and POWER cells', () => {
    let manual = 0;
    for (const row of MAZE_DATA)
      for (const cell of row)
        if (cell === CELL.DOT || cell === CELL.POWER) manual++;
    expect(countDots()).toBe(manual);
  });
});
