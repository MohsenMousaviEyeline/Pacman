import type { Vec2 } from './types';
import { TILE_SIZE, MAZE_COLS, MAZE_ROWS } from './maze';

export const CANVAS_W = MAZE_COLS * TILE_SIZE;
export const CANVAS_H = MAZE_ROWS * TILE_SIZE;

export const PACMAN_SPEED = 2.5;
export const GHOST_SPEED = 2.0;
export const GHOST_FRIGHTENED_SPEED = 1.2;
export const GHOST_EATEN_SPEED = 4.0;

export const FRIGHTENED_DURATION = 8000; // ms
export const DOT_SCORE = 10;
export const POWER_SCORE = 50;
export const GHOST_SCORES = [200, 400, 800, 1600];

// Ghost scatter targets (corners)
export const SCATTER_TARGETS: Record<string, Vec2> = {
  BLINKY: { x: 25, y: 0 },
  PINKY: { x: 2, y: 0 },
  INKY: { x: 27, y: 30 },
  CLYDE: { x: 0, y: 30 },
};

// Ghost home positions (pixel) — must be exact multiples of TILE_SIZE so
// ghosts snap to tile centers and chooseBestDir() is actually called.
export const GHOST_HOME_PIXEL: Record<string, Vec2> = {
  BLINKY: { x: 13 * TILE_SIZE, y: 11 * TILE_SIZE },
  PINKY:  { x: 13 * TILE_SIZE, y: 14 * TILE_SIZE },
  INKY:   { x: 11 * TILE_SIZE, y: 14 * TILE_SIZE },
  CLYDE:  { x: 15 * TILE_SIZE, y: 14 * TILE_SIZE },
};

export const GHOST_HOUSE_DOOR: Vec2 = { x: 13, y: 16 };
export const GHOST_EXIT: Vec2 = { x: 13 * TILE_SIZE, y: 11 * TILE_SIZE };

// Mode cycle durations in ms [scatter, chase, scatter, chase, ...]
export const MODE_DURATIONS = [7000, 20000, 7000, 20000, 5000, 20000, 5000, Infinity];

// Colors
export const COLORS = {
  BG: '#000010',
  WALL: '#0a0a3a',
  WALL_BORDER: '#00d4ff',
  WALL_GLOW: '#0066ff',
  DOT: '#aaeeff',
  POWER: '#ffcc00',
  PACMAN: '#fe0090',
  PACMAN_GLOW: '#ff9900',
  TEXT: '#00ffcc',
  HUD_BG: '#000820',
};

export const TILE_SIZE_EXPORT = TILE_SIZE;
