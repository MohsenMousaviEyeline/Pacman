import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { Direction } from './game/types';
import { TILE_SIZE, MAZE_COLS, MAZE_ROWS } from './game/maze';
import {
  renderMaze, renderPacman, renderGhost, renderParticles,
  renderOverlay, updatePowerPulse, renderStarfield, renderScorePopup,
  createStars, updateParticles,
} from './game/renderer';
import type { Star } from './game/renderer';
import { createInitialState, updateEngine } from './game/engine';
import type { EngineState } from './game/engine';
import { getColors, type Theme } from './game/constants';

const CANVAS_W = MAZE_COLS * TILE_SIZE;
const CANVAS_H = MAZE_ROWS * TILE_SIZE;

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  KeyW: 'UP', KeyS: 'DOWN', KeyA: 'LEFT', KeyD: 'RIGHT',
  w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
};

export default function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<EngineState>(createInitialState());
  const inputDirRef = useRef<Direction | null>(null);
  const lastTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const starsRef = useRef<Star[]>(createStars(80, CANVAS_W, CANVAS_H));
  const globalTimerRef = useRef<number>(0);

  // Theme state: useState drives JSX re-render; themeRef is read inside the animation loop
  const [themeState, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('pacman-theme') as Theme) ?? 'CYBER'
  );
  const themeRef = useRef<Theme>(themeState);

  const [uiState, setUiState] = useState({
    score: 0,
    highScore: 0,
    lives: 3,
    level: 1,
    gameState: 'MENU' as string,
  });

  const startGame = useCallback(() => {
    const init = createInitialState();
    init.gameData.state = 'PLAYING';
    stateRef.current = init;
    inputDirRef.current = null;
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = themeRef.current === 'CYBER' ? 'CLASSIC' : 'CYBER';
    themeRef.current = next;
    localStorage.setItem('pacman-theme', next);
    setThemeState(next);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const dir = KEY_MAP[e.code] || KEY_MAP[e.key];
    if (dir) {
      e.preventDefault();
      inputDirRef.current = dir;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      const gs = stateRef.current.gameData.state;
      if (gs === 'MENU' || gs === 'GAME_OVER' || gs === 'WIN') {
        startGame();
      } else if (gs === 'PLAYING') {
        stateRef.current = {
          ...stateRef.current,
          gameData: { ...stateRef.current.gameData, state: 'PAUSED' },
        };
      } else if (gs === 'PAUSED') {
        stateRef.current = {
          ...stateRef.current,
          gameData: { ...stateRef.current.gameData, state: 'PLAYING' },
        };
      }
    }
    if (e.code === 'Escape') {
      const gs = stateRef.current.gameData.state;
      if (gs === 'PLAYING' || gs === 'PAUSED') {
        stateRef.current = {
          ...stateRef.current,
          gameData: { ...stateRef.current.gameData, state: 'MENU' },
        };
      }
    }
    // T key: toggle theme
    if (e.code === 'KeyT') {
      const next: Theme = themeRef.current === 'CYBER' ? 'CLASSIC' : 'CYBER';
      themeRef.current = next;
      localStorage.setItem('pacman-theme', next);
      setThemeState(next);
    }
  }, [startGame]);

  const handleKeyUp = useCallback((_e: KeyboardEvent) => {
    // Keep last direction pressed
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Touch controls
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < 10 && ady < 10) {
      // Tap = start/pause
      const gs = stateRef.current.gameData.state;
      if (gs === 'MENU' || gs === 'GAME_OVER' || gs === 'WIN') startGame();
    } else if (adx > ady) {
      inputDirRef.current = dx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      inputDirRef.current = dy > 0 ? 'DOWN' : 'UP';
    }
    touchStartRef.current = null;
  }, [startGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const loop = (timestamp: number) => {
      const dt = Math.min(timestamp - lastTimeRef.current, 50);
      lastTimeRef.current = timestamp;
      globalTimerRef.current += dt;

      updatePowerPulse(dt);

      const state = stateRef.current;
      const { gameData } = state;
      const theme = themeRef.current;

      // Particle colors depend on the active theme
      const pc = theme === 'CLASSIC'
        ? { dot: '#ffff00', power: '#ffffff', death: '#ffff00' }
        : { dot: '#00aaff', power: '#ffcc00', death: '#ffee00' };

      // Update game state
      if (gameData.state === 'PLAYING') {
        const newState = updateEngine(state, dt, inputDirRef.current, pc);
        stateRef.current = newState;

        // Update UI every few frames
        if (globalTimerRef.current % 100 < dt) {
          setUiState({
            score: newState.gameData.score,
            highScore: newState.gameData.highScore,
            lives: newState.gameData.lives,
            level: newState.gameData.level,
            gameState: newState.gameData.state,
          });
        } else {
          setUiState(prev => ({
            ...prev,
            score: newState.gameData.score,
            highScore: newState.gameData.highScore,
            lives: newState.gameData.lives,
            gameState: newState.gameData.state,
          }));
        }
      } else {
        setUiState(prev => ({
          ...prev,
          gameState: gameData.state,
          score: gameData.score,
          highScore: gameData.highScore,
          lives: gameData.lives,
        }));
      }

      // RENDER
      const s = stateRef.current;
      const C = getColors(theme);

      // Background fill (theme-aware)
      ctx.fillStyle = C.BG;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Starfield only in CYBER mode on the menu
      if (s.gameData.state === 'MENU' && theme !== 'CLASSIC') {
        renderStarfield(ctx, starsRef.current, CANVAS_W, CANVAS_H);
      }

      renderMaze(ctx, s.gameData.maze, theme);

      // Update and render particles
      const updatedParticles = updateParticles(s.particles, dt);
      stateRef.current = { ...stateRef.current, particles: updatedParticles };
      renderParticles(ctx, updatedParticles, theme);

      // Render score popups
      renderScorePopup(ctx, s.scorePopups, theme);

      // Render ghosts
      for (const ghost of s.ghosts) {
        renderGhost(ctx, ghost, globalTimerRef.current, theme);
      }

      // Render pacman
      renderPacman(ctx, s.player, s.dyingFrame, theme);

      // Overlays
      if (s.gameData.state === 'MENU') {
        renderOverlay(ctx, 'CYBER-PAC', 'PRESS SPACE / ENTER TO START', CANVAS_W, CANVAS_H, theme);
      } else if (s.gameData.state === 'PAUSED') {
        renderOverlay(ctx, 'PAUSED', 'PRESS SPACE TO RESUME', CANVAS_W, CANVAS_H, theme);
      } else if (s.gameData.state === 'GAME_OVER') {
        renderOverlay(ctx, 'GAME OVER', 'PRESS SPACE TO RETRY', CANVAS_W, CANVAS_H, theme);
      } else if (s.gameData.state === 'WIN') {
        renderOverlay(ctx, 'YOU WIN!', 'PRESS SPACE TO PLAY AGAIN', CANVAS_W, CANVAS_H, theme);
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const lifeIcons = Array.from({ length: uiState.lives }, (_, i) => i);

  return (
    <div className="game-container" data-theme={themeState}>
      <div className="game-header">
        <div className="score-box">
          <div className="score-label">SCORE</div>
          <div className="score-value">{uiState.score.toString().padStart(6, '0')}</div>
        </div>
        <div className="title-center">
          <span className="game-title">CYBER</span>
          <span className="game-title-accent">PAC</span>
        </div>
        <div className="score-box score-box--right">
          <div className="score-label">HIGH SCORE</div>
          <div className="score-value">{uiState.highScore.toString().padStart(6, '0')}</div>
        </div>
      </div>

      <div className="canvas-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="game-canvas"
        />
      </div>

      <div className="game-footer">
        <div className="lives-container">
          <span className="lives-label">LIVES</span>
          {lifeIcons.map(i => (
            <span key={i} className="life-icon">◑</span>
          ))}
        </div>
        <div className="controls-hint">
          WASD / ↑↓←→ • SPACE pause • T theme
        </div>
        <div className="footer-right">
          <button
            className={`theme-toggle theme-toggle--${themeState.toLowerCase()}`}
            onClick={toggleTheme}
            title={themeState === 'CYBER' ? 'Switch to Classic arcade mode' : 'Switch to Cyber mode'}
          >
            {themeState === 'CYBER' ? '🕹 CLASSIC' : '⚡ CYBER'}
          </button>
          <div className="level-display">
            <span className="lives-label">LEVEL</span>
            <span className="level-value">{uiState.level}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
