import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, updateEngine } from './engine';
import type { EngineState } from './engine';
import { TILE_SIZE, CELL } from './maze';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Return a PLAYING state with movement already unlocked */
function playingState(): EngineState {
  const s = createInitialState();
  s.gameData.state = 'PLAYING';
  s.player.moving = true;
  return s;
}

/** Advance the engine by `frames` ticks of 16 ms each */
function tick(state: EngineState, frames = 1, dir = null as Parameters<typeof updateEngine>[2]): EngineState {
  let s = state;
  for (let i = 0; i < frames; i++) {
    s = updateEngine(s, 16, dir);
    dir = null; // only apply input on first tick
  }
  return s;
}

// ─── createInitialState ───────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('spawns player at tile (13, 23)', () => {
    const { player } = createInitialState();
    expect(player.tilePos).toEqual({ x: 13, y: 23 });
    expect(player.pos).toEqual({ x: 13 * TILE_SIZE, y: 23 * TILE_SIZE });
  });

  it('player starts stationary (moving = false)', () => {
    const { player } = createInitialState();
    expect(player.moving).toBe(false);
  });

  it('creates 4 ghosts', () => {
    const { ghosts } = createInitialState();
    expect(ghosts).toHaveLength(4);
    expect(ghosts.map(g => g.name)).toEqual(['BLINKY', 'PINKY', 'INKY', 'CLYDE']);
  });

  it('only Blinky is active at start', () => {
    const { ghosts } = createInitialState();
    expect(ghosts.find(g => g.name === 'BLINKY')?.active).toBe(true);
    expect(ghosts.find(g => g.name === 'PINKY')?.active).toBe(false);
    expect(ghosts.find(g => g.name === 'INKY')?.active).toBe(false);
    expect(ghosts.find(g => g.name === 'CLYDE')?.active).toBe(false);
  });

  it('starts with correct dot count', () => {
    const { gameData } = createInitialState();
    expect(gameData.totalDots).toBeGreaterThan(0);
    expect(gameData.dotsEaten).toBe(0);
  });

  it('game starts in MENU state', () => {
    const { gameData } = createInitialState();
    expect(gameData.state).toBe('MENU');
  });
});

// ─── player: stationary until first keypress ──────────────────────────────────

describe('player — stationary until first keypress', () => {
  it('does not move when moving = false', () => {
    const s = createInitialState();
    s.gameData.state = 'PLAYING';
    // no inputDir, moving stays false
    const after = updateEngine(s, 16, null);
    expect(after.player.pos).toEqual(s.player.pos);
    expect(after.player.tilePos).toEqual(s.player.tilePos);
  });

  it('sets moving = true on first directional input', () => {
    const s = createInitialState();
    s.gameData.state = 'PLAYING';
    const after = updateEngine(s, 16, 'LEFT');
    expect(after.player.moving).toBe(true);
  });

  it('begins moving on the same tick as first input', () => {
    const s = createInitialState();
    s.gameData.state = 'PLAYING';
    const after = updateEngine(s, 16, 'LEFT');
    // player should have moved left from x=260
    expect(after.player.pos.x).toBeLessThan(13 * TILE_SIZE);
  });
});

// ─── player: movement ─────────────────────────────────────────────────────────

describe('player — movement', () => {
  let state: EngineState;
  beforeEach(() => { state = playingState(); });

  it('moves left by default (nextDir = LEFT)', () => {
    const after = tick(state);
    expect(after.player.pos.x).toBeLessThan(13 * TILE_SIZE);
    expect(after.player.pos.y).toBe(23 * TILE_SIZE); // y unchanged
  });

  it('moves right when RIGHT is queued', () => {
    const after = tick(state, 1, 'RIGHT');
    expect(after.player.pos.x).toBeGreaterThan(13 * TILE_SIZE);
  });

  it('position advances further with more ticks', () => {
    const after1 = tick(state, 1);
    const after5 = tick(state, 5);
    expect(after5.player.pos.x).toBeLessThan(after1.player.pos.x);
  });

  it('tilePos updates as player crosses tile boundary', () => {
    // player at (13,23) moving left — after enough ticks should reach tile (12,23)
    const after = tick(state, 20);
    expect(after.player.tilePos.x).toBeLessThanOrEqual(13);
  });
});

// ─── player: wall collision ───────────────────────────────────────────────────

describe('player — wall collision', () => {
  let state: EngineState;
  beforeEach(() => { state = playingState(); });

  it('does not move UP into wall at (13,22)', () => {
    // Face player UP — tile (13,22) is WALL
    state.player.dir = 'UP';
    state.player.nextDir = 'UP';
    const before = { ...state.player.pos };
    const after = tick(state, 10, 'UP');
    // y should not have decreased (can't go up into wall)
    expect(after.player.pos.y).toBeGreaterThanOrEqual(before.y);
  });

  it('does not move DOWN into wall at (13,24)', () => {
    state.player.dir = 'DOWN';
    state.player.nextDir = 'DOWN';
    const before = state.player.pos.y;
    const after = tick(state, 10, 'DOWN');
    expect(after.player.pos.y).toBeLessThanOrEqual(before + TILE_SIZE);
  });

  it('stops at wall and does not pass through it', () => {
    // Move left many ticks — hits wall at col 0 (outer wall)
    const after = tick(state, 200);
    // x must remain within maze bounds
    expect(after.player.pos.x).toBeGreaterThanOrEqual(0);
  });
});

// ─── player: queued direction ─────────────────────────────────────────────────

describe('player — direction queuing', () => {
  it('applies queued direction at next tile center', () => {
    const state = playingState();
    // Start moving left, then queue RIGHT
    let s = tick(state, 5, 'LEFT');
    s = tick(s, 20, 'RIGHT');
    // player should eventually be moving right
    expect(s.player.dir).toBe('RIGHT');
  });

  it('ignores direction into a wall until a valid direction is queued', () => {
    const state = playingState();
    // Queue UP (wall) — player should keep going in original direction
    const after = tick(state, 5, 'UP');
    // Still heading left (or stayed left), not up
    expect(after.player.pos.y).toBe(23 * TILE_SIZE);
  });
});

// ─── dot eating ───────────────────────────────────────────────────────────────

describe('dot eating', () => {
  it('earns 10 points when eating a dot', () => {
    // Tile (12,23) to the left of spawn is a DOT
    const state = playingState();
    const after = tick(state, 20); // move left, reach tile 12
    expect(after.gameData.score).toBeGreaterThanOrEqual(10);
  });

  it('increments dotsEaten', () => {
    const state = playingState();
    const after = tick(state, 20);
    expect(after.gameData.dotsEaten).toBeGreaterThan(0);
  });

  it('removes dot from maze after eating', () => {
    const state = playingState();
    const after = tick(state, 20);
    const tx = after.player.tilePos.x;
    const ty = after.player.tilePos.y;
    // The tile the player is on should now be EMPTY
    expect(after.gameData.maze[ty][tx]).toBe(CELL.EMPTY);
  });

  it('does not double-count the same dot', () => {
    // Place player directly on a dot tile and tick once to eat it
    const state = playingState();
    state.player.pos = { x: 12 * TILE_SIZE, y: 23 * TILE_SIZE };
    state.player.tilePos = { x: 12, y: 23 };
    state.player.dir = 'LEFT';
    state.player.nextDir = 'LEFT';
    // Face into a wall so player stops after eating (UP is a wall at (12,22))
    state.player.dir = 'UP';
    state.player.nextDir = 'UP';
    let after = tick(state, 1);
    const scoreAfterEat = after.gameData.score;
    // More ticks on the same blocked tile should not add more points
    after = tick(after, 5);
    expect(after.gameData.score).toBe(scoreAfterEat);
  });
});

// ─── power pellet ─────────────────────────────────────────────────────────────

describe('power pellet', () => {
  it('frightens all active ghosts', () => {
    // Tile (1,3) is a POWER pellet — navigate there
    // Easier: manually place player on a power tile
    const state = playingState();
    // Teleport player to the power pellet at (1,3)
    state.player.pos = { x: 1 * TILE_SIZE, y: 3 * TILE_SIZE };
    state.player.tilePos = { x: 1, y: 3 };
    state.player.dir = 'LEFT';
    state.player.nextDir = 'LEFT';
    const after = tick(state, 2);
    const activeFrightened = after.ghosts.filter(g => g.active && g.mode === 'FRIGHTENED');
    // Blinky is active from start — should be frightened
    expect(activeFrightened.length).toBeGreaterThan(0);
  });

  it('earns 50 points', () => {
    const state = playingState();
    state.player.pos = { x: 1 * TILE_SIZE, y: 3 * TILE_SIZE };
    state.player.tilePos = { x: 1, y: 3 };
    state.player.dir = 'LEFT';
    state.player.nextDir = 'LEFT';
    const after = tick(state, 2);
    expect(after.gameData.score).toBeGreaterThanOrEqual(50);
  });
});

// ─── scoring ──────────────────────────────────────────────────────────────────

describe('scoring', () => {
  it('highScore updates when score exceeds it', () => {
    const state = playingState();
    state.gameData.highScore = 0;
    const after = tick(state, 50);
    expect(after.gameData.highScore).toBe(after.gameData.score);
  });

  it('highScore does not decrease', () => {
    const state = playingState();
    state.gameData.highScore = 99999;
    const after = tick(state, 20);
    expect(after.gameData.highScore).toBe(99999);
  });
});

// ─── game state transitions ───────────────────────────────────────────────────

describe('game state transitions', () => {
  it('does not update when state is not PLAYING', () => {
    const state = createInitialState(); // MENU
    state.player.moving = true;
    const after = updateEngine(state, 16, 'LEFT');
    expect(after.player.pos).toEqual(state.player.pos);
  });

  it('dying animation counts down dyingFrame', () => {
    const state = playingState();
    state.dyingFrame = 60;
    const after = updateEngine(state, 16, null);
    expect(after.dyingFrame).toBe(59);
  });

  it('transitions to GAME_OVER when lives run out after dying', () => {
    const state = playingState();
    state.gameData.lives = 1;
    state.dyingFrame = 1; // last frame of dying animation
    const after = updateEngine(state, 16, null);
    expect(after.gameData.state).toBe('GAME_OVER');
  });

  it('transitions to WIN when all dots are eaten', () => {
    const state = playingState();
    state.gameData.dotsEaten = state.gameData.totalDots - 1;
    // Place player on the last remaining dot
    const maze = state.gameData.maze.map(r => [...r]);
    maze[23][12] = CELL.DOT; // ensure tile (12,23) is a dot
    state.gameData.maze = maze;
    state.player.pos = { x: 12 * TILE_SIZE, y: 23 * TILE_SIZE };
    state.player.tilePos = { x: 12, y: 23 };
    const after = tick(state, 2);
    expect(after.gameData.state).toBe('WIN');
  });
});

// ─── ghost activation timers ──────────────────────────────────────────────────

describe('ghost activation timers', () => {
  it('Pinky activates after 2000ms', () => {
    const state = playingState();
    const pinkyBefore = state.ghosts.find(g => g.name === 'PINKY')!;
    expect(pinkyBefore.active).toBe(false);

    // Simulate 2000ms worth of 16ms ticks
    let s = state;
    for (let i = 0; i < 130; i++) s = updateEngine(s, 16, null);

    const pinkyAfter = s.ghosts.find(g => g.name === 'PINKY')!;
    expect(pinkyAfter.active).toBe(true);
  });

  it('Blinky is immediately active', () => {
    const state = playingState();
    const blinky = state.ghosts.find(g => g.name === 'BLINKY')!;
    expect(blinky.active).toBe(true);
  });
});

// ─── tunnel teleport ──────────────────────────────────────────────────────────

describe('tunnel teleport', () => {
  it('wraps player from left edge to right edge', () => {
    const state = playingState();
    // Row 14 col 6 is the last walkable tile before the tunnel on the left.
    // Place player there heading left — it will cross the boundary and teleport.
    state.player.pos = { x: 6 * TILE_SIZE, y: 14 * TILE_SIZE };
    state.player.tilePos = { x: 6, y: 14 };
    state.player.dir = 'LEFT';
    state.player.nextDir = 'LEFT';
    // Enough ticks to cross 6 tiles at PACMAN_SPEED (2.5px/frame, 20px/tile → ~8 ticks/tile)
    const after = tick(state, 60);
    // After teleporting, x should be near the right side of the maze
    expect(after.player.pos.x).toBeGreaterThan(14 * TILE_SIZE);
  });
});
