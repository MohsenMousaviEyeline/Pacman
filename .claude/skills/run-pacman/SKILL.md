---
name: run-pacman
description: Run, start, build, launch, screenshot, test, verify, or drive the CYBER-PAC Pac-Man game. Use this skill when asked to run the app, take a screenshot, verify a UI change, or check that a feature works.
---

# run-pacman

CYBER-PAC is a React 19 + Vite + TypeScript Pac-Man game that renders via HTML5 Canvas. The app is driven by **Playwright** via `.claude/skills/run-pacman/driver.mjs`. Start the Vite dev server first, then run driver commands to screenshot or interact.

Paths below are relative to the repo root (`F:/Development/Claude/pacman` or wherever the repo lives).

---

## Prerequisites

Node 18+ and npm. Playwright chromium is already cached at `%LOCALAPPDATA%\ms-playwright\`.

If chromium is missing on a new machine:
```
npx playwright install chromium
```

---

## Build

```bash
npm run build          # TypeScript check + Vite production bundle → dist/
npm run lint           # ESLint check
npm run test           # Vitest — 58 tests, ~500 ms
```

Build was verified clean: `✓ built in 245ms`, 0 type errors, 58/58 tests pass.

---

## Run (agent path) — Playwright driver

### 1. Start the dev server (background)

```bash
npm run dev &
curl -s http://localhost:5173/health   # wait until {"status":"ok",...}
```

The server exposes a `/health` JSON endpoint — poll it to know when it's ready. Default port is `5173`.

### 2. Drive with the driver script

```bash
node .claude/skills/run-pacman/driver.mjs <command> [args]
```

All screenshots land in `screenshots/` (auto-created).

| Command | What it does |
|---|---|
| `smoke` | Launch → wait for `<canvas>` → screenshot × 2 → exit 0 if OK |
| `screenshot [name]` | Capture current page state → `screenshots/<name>.png` |
| `sequence` | 4-step flow: initial → ArrowLeft → ArrowUp → Space, one screenshot each |
| `key <Key> [n]` | Press a keyboard key N times (e.g. `ArrowLeft`, `Space`, `ArrowUp`) |
| `theme classic\|cyber` | Click the theme toggle button, then screenshot |
| `info` | Print page title + canvas dimensions + score element (JSON) |
| `wait <ms>` | Sleep inside the browser page for N ms |

**Environment variables:**

| Var | Default | Use |
|---|---|---|
| `BASE_URL` | `http://localhost:5173` | Point at preview server instead |
| `HEADLESS` | `true` | Set to `false` to watch in a visible window |
| `SS_DIR` | `./screenshots` | Override screenshot output directory |

**Verified commands (this session):**
```bash
node .claude/skills/run-pacman/driver.mjs smoke
# smoke: PASS — screenshots/smoke.png, screenshots/smoke-after-keypress.png

node .claude/skills/run-pacman/driver.mjs info
# {"title":"CYBER-PAC // Sci-Fi Pac-Man","canvas":{"width":560,"height":620},"score":"n/a"}

node .claude/skills/run-pacman/driver.mjs sequence
# → screenshots/seq-00-initial.png through seq-03-space.png

node .claude/skills/run-pacman/driver.mjs theme classic
# → screenshots/theme-classic.png
```

---

## Run (human path)

```bash
npm run dev        # → http://localhost:5173 in a browser
npm run preview    # → serves dist/ after a build
```

Not useful headless — opens a browser window.

---

## Health check (curl-only smoke, no Playwright)

```bash
curl http://localhost:5173/health
# {"status":"ok","version":"0.0.0","uptime_ms":...,"uptime_s":...}
```

Use this to confirm the server started before running the driver.

---

## Test suite

```bash
npm run test       # vitest run — 58 tests in ~500 ms
npm run lint       # ESLint — 0 warnings
npm run build      # tsc + vite — must be clean before any PR
```

---

## Gotchas

- **Game starts in "waiting" state** — the first `ArrowLeft`/`ArrowRight` keypress kicks off the animation loop. `smoke` sends one `ArrowLeft` to show a non-idle frame; `sequence` also does this. Screenshots before any keypress show the title-screen/waiting overlay.
- **Canvas size is 560×620 px** — viewport is set to 900×700 so the full canvas is always in frame. Changing `setViewportSize` can clip it.
- **Score element has no stable selector** — `info` tries `[data-testid="score"]`, `.score`, and `#score`; currently returns `"n/a"` because the HUD is rendered as raw DOM text without those selectors. Read score via canvas OCR or by adding a `data-testid` to the component.
- **Theme toggle label flips** — After switching to Classic mode the button reads "CYBER"; after switching back it reads "Classic". The driver handles this: it clicks whichever button matches the requested variant's label.
- **`npm run dev` on Windows may emit CRLF** in console output — the `curl` health check always works cleanly regardless.
- **`screenshots/` is gitignored** (confirmed in `.gitignore`) — driver output does not clutter the repo.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: No <canvas> found` | Dev server not started, or React render failed. Check `curl http://localhost:5173/health`. |
| `connect ECONNREFUSED 127.0.0.1:5173` | Start `npm run dev` first. |
| Playwright `browserType.launch` error | Run `npx playwright install chromium`. |
| Screenshot is all black (0 bytes) | `HEADLESS=false` to debug; usually a timing issue — increase the `waitForTimeout(800)` in `launch()`. |
| `theme` command clicks nothing | Game may have been refactored; find the toggle button selector in `PacmanGame.tsx` and update `clickTheme()`. |
