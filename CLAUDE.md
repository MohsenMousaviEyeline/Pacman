# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CYBER-PAC is a sci-fi/cyberpunk-themed Pac-Man game built with React 19, TypeScript, and Vite. The game renders via HTML5 Canvas with React overlays for the HUD.

## Commands

```bash
npm run dev       # Start dev server with HMR (http://localhost:5173)
npm run build     # TypeScript check + production build → dist/
npm run preview   # Serve the production build locally
npm run lint      # ESLint check
```

No test framework is configured — verification is done by running the app.

## Architecture

### Source Layout

```
src/
├── game/
│   ├── types.ts      # All TypeScript interfaces (Vec2, Direction, GhostMode, GameState, Ghost, Player, GameData)
│   ├── constants.ts  # Speeds, scores, colors, ghost scatter targets
│   ├── maze.ts       # 28×31 hardcoded grid with cell type enum (WALL, DOT, POWER, GHOST_HOUSE, GHOST_DOOR, TELEPORT)
│   ├── engine.ts     # Pure game state update logic — called each frame
│   ├── ghost.ts      # Ghost AI: mode management, direction selection, per-ghost targeting
│   └── renderer.ts   # All Canvas 2D drawing (walls, dots, Pac-Man, ghosts, particles, overlays)
├── PacmanGame.tsx    # React component: canvas setup (560×620px), requestAnimationFrame loop, keyboard/touch input, HUD
├── App.tsx           # Root wrapper
└── main.tsx          # React entry point
```

### Game Loop

`PacmanGame.tsx` owns the `requestAnimationFrame` loop. Each tick it calls `engine.ts` update functions with delta-time, then calls `renderer.ts` draw functions on the canvas context. The React HUD (score, lives) is rendered as DOM overlays on top of the canvas.

### State Model

Game state lives in a `GameData` object (defined in `types.ts`) that is reconstructed immutably on each update. State flows: `PacmanGame (ref)` → `engine.ts (update)` → `renderer.ts (draw)`.

### Ghost AI

Ghosts cycle through global modes — SCATTER → CHASE alternating on a timer (7s/20s/7s/20s/5s/20s/5s/∞). Four personalities:
- **Blinky (Red):** Direct chase to Pac-Man's position
- **Pinky (Pink):** Intercept 4 tiles ahead of Pac-Man
- **Inky (Cyan):** Targets using Blinky's position as a pivot
- **Clyde (Orange):** Chases when >8 tiles away, scatters when close

Direction decisions use a distance heuristic at each intersection; reverse is triggered on mode transitions.

### Maze Coordinate System

Tiles are 20×20px. The maze is 28 columns × 31 rows = 560×620px canvas. Row 14 has teleport tunnels on both sides. The ghost house is hardcoded in the center.

### Key Constants (`constants.ts`)

| Constant | Value |
|----------|-------|
| Pac-Man speed | 2.5 px/frame-unit |
| Ghost speed | 2.0 |
| Frightened ghost | 1.2 |
| Eaten ghost | 4.0 |
| Dot score | 10 |
| Power pellet | 50 |
| Ghost scores | 200/400/800/1600 (multiplying chain) |

High score persists via `localStorage`.

## TypeScript Configuration

- Target: ES2023, module resolution: `bundler`
- Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Two tsconfig files: `tsconfig.app.json` (browser/game code) and `tsconfig.node.json` (Vite config)
