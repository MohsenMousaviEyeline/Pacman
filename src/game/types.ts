export interface Vec2 {
  x: number;
  y: number;
}

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'NONE';

export const DIR_VEC: Record<Direction, Vec2> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
  NONE: { x: 0, y: 0 },
};

export type GhostMode = 'SCATTER' | 'CHASE' | 'FRIGHTENED' | 'EATEN';
export type GhostName = 'BLINKY' | 'PINKY' | 'INKY' | 'CLYDE';

export interface Ghost {
  name: GhostName;
  pos: Vec2;        // pixel position
  tilePos: Vec2;    // tile position
  dir: Direction;
  nextDir: Direction;
  mode: GhostMode;
  prevMode: GhostMode;
  frightenedTimer: number;
  eatenTimer: number;
  speed: number;
  color: string;
  glowColor: string;
  scatterTarget: Vec2;
  active: boolean;
  exitTimer: number;
}

export interface Player {
  pos: Vec2;
  tilePos: Vec2;
  dir: Direction;
  nextDir: Direction;
  speed: number;
  mouthAngle: number;
  mouthDir: number;
  animTimer: number;
}

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'WIN' | 'DYING';

export interface GameData {
  score: number;
  highScore: number;
  lives: number;
  level: number;
  dotsEaten: number;
  totalDots: number;
  state: GameState;
  frightenedMultiplier: number;
  modeTimer: number;
  modePhase: number;
  maze: number[][];
}
