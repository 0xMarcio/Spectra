import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const server = spawn('python3', ['-m', 'http.server', '8001'], {
  cwd: process.cwd(),
  stdio: 'ignore'
});

try {
  await delay(1000);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', error => {
    errors.push(error.message);
  });

  await page.goto('http://127.0.0.1:8001/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'artifacts/screenshot.png', fullPage: true });

  const stats = await page.evaluate(() => {
    return window.__airflowSim ? window.__airflowSim.getStats() : null;
  });

  if (errors.length) {
    console.error('Console errors:', errors);
    process.exitCode = 1;
  }

  const hasParticles = await page.evaluate(() => {
    const rendererCanvas = document.querySelector('canvas');
    if (!rendererCanvas) return false;
    return !!(
      rendererCanvas.getContext('webgl2') ||
      rendererCanvas.getContext('webgl') ||
      rendererCanvas.getContext('experimental-webgl')
    );
  });

  console.log('Canvas present:', hasParticles);
  console.log('Sim stats:', stats);

  await browser.close();
} finally {
  server.kill();
}
