#!/usr/bin/env node
/**
 * CYBER-PAC driver script
 * Usage:
 *   node .claude/skills/run-pacman/driver.mjs [command] [args...]
 *
 * Commands:
 *   screenshot [file]      Capture current state → screenshots/<file>.png (default: snap.png)
 *   smoke                  Launch, wait for canvas, screenshot, exit 0
 *   key <key> [count]      Press a keyboard key N times (e.g. ArrowLeft, Space)
 *   theme <classic|cyber>  Click the theme toggle button
 *   wait <ms>              Sleep for N milliseconds
 *   info                   Print canvas size and page title
 *   sequence               Run a demo sequence: start → move → screenshot
 *
 * Environment:
 *   BASE_URL   Override game URL (default: http://localhost:5173)
 *   HEADLESS   Set to "false" to watch in a visible browser (default: true)
 *   SS_DIR     Directory for screenshots (default: ./screenshots)
 *
 * The script manages a single persistent browser page. Commands are processed
 * sequentially from argv. If no command is given, runs `smoke`.
 *
 * Exit codes: 0 = success, 1 = error/assertion failed
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS !== 'false';
const SS_DIR = resolve(process.env.SS_DIR ?? join(ROOT, 'screenshots'));

await mkdir(SS_DIR, { recursive: true });

let browser, page;

async function launch() {
  if (page) return;
  browser = await chromium.launch({ headless: HEADLESS });
  page = await browser.newPage();
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  // Wait for the canvas element (the game)
  await page.waitForSelector('canvas', { timeout: 15000 });
  // Give React a moment to render the full HUD
  await page.waitForTimeout(800);
}

async function screenshot(name = 'snap') {
  await launch();
  const filename = name.endsWith('.png') ? name : `${name}.png`;
  const outPath = join(SS_DIR, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`screenshot → ${outPath}`);
  return outPath;
}

async function pressKey(key, count = 1) {
  await launch();
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
  }
  console.log(`key ${key} ×${count}`);
}

async function clickTheme(variant) {
  await launch();
  // Theme toggle button contains "Classic" or "CYBER" text
  const label = variant === 'classic' ? 'Classic' : 'CYBER';
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (await btn.count() === 0) {
    // Try the toggle regardless of label
    const anyToggle = page.locator('button').filter({ hasText: /classic|cyber/i }).first();
    await anyToggle.click();
  } else {
    await btn.click();
  }
  await page.waitForTimeout(300);
  console.log(`theme → clicked ${label} toggle`);
}

async function info() {
  await launch();
  const title = await page.title();
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { width: c.width, height: c.height, style: c.getAttribute('style') } : null;
  });
  const score = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="score"], .score, #score');
    return el?.textContent ?? 'n/a';
  });
  console.log(JSON.stringify({ title, canvas: canvasInfo, score }, null, 2));
}

async function runSmoke() {
  console.log(`smoke: connecting to ${BASE_URL}`);
  await launch();
  const title = await page.title();
  console.log(`  title: ${title}`);
  const canvasCount = await page.locator('canvas').count();
  if (canvasCount === 0) throw new Error('No <canvas> found — game did not render');
  console.log(`  canvas: found ${canvasCount}`);
  await screenshot('smoke');
  // Press a couple of arrow keys to start the game
  await pressKey('ArrowLeft', 1);
  await page.waitForTimeout(500);
  await screenshot('smoke-after-keypress');
  console.log('smoke: PASS');
}

async function runSequence() {
  console.log('sequence: launch → move → screenshot');
  await launch();
  await screenshot('seq-00-initial');
  await pressKey('ArrowLeft', 1);
  await page.waitForTimeout(300);
  await screenshot('seq-01-left');
  await pressKey('ArrowUp', 1);
  await page.waitForTimeout(300);
  await screenshot('seq-02-up');
  await pressKey('Space', 1);
  await page.waitForTimeout(300);
  await screenshot('seq-03-space');
  console.log('sequence: done');
}

// ── Command dispatch ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0] ?? 'smoke';

try {
  switch (cmd) {
    case 'smoke':
      await runSmoke();
      break;
    case 'screenshot':
      await screenshot(args[1] ?? 'snap');
      break;
    case 'key':
      if (!args[1]) throw new Error('key: missing key name');
      await pressKey(args[1], parseInt(args[2] ?? '1', 10));
      await screenshot(`after-${args[1].toLowerCase()}`);
      break;
    case 'theme':
      if (!args[1]) throw new Error('theme: specify "classic" or "cyber"');
      await clickTheme(args[1]);
      await screenshot(`theme-${args[1]}`);
      break;
    case 'wait':
      await launch();
      await page.waitForTimeout(parseInt(args[1] ?? '1000', 10));
      break;
    case 'info':
      await info();
      break;
    case 'sequence':
      await runSequence();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Valid commands: smoke, screenshot, key, theme, wait, info, sequence');
      process.exit(1);
  }
} finally {
  if (browser) await browser.close();
}
