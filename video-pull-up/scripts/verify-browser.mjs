// Uses the interface's existing Playwright dev dependency and installed Chrome.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { ROOT } from '../src/server.mjs';
import path from 'node:path';

const require = createRequire(new URL('../../web-interface/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const artifacts = path.join(ROOT, 'artifacts');
await mkdir(artifacts, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.DEMO_URL ?? 'http://127.0.0.1:8787'}/demo`);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(17, 19, 21)');
  assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /Inter/);
  await page.getByText('Erklärung aus Transkriptquellen', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Erklären & Video öffnen', exact: true }).click();
  await page.getByText('Bereit ab 0:30. Mit Play starten. Stummes Demo-Video.', { exact: true }).waitFor();
  console.log('Eigenwerte: Erklärung und Video bei 0:30 geladen.');
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - 30) < .1;
  });
  assert.equal(await page.locator('#player').evaluate(video => video.duration), 90);
  assert.match(await page.locator('#paragraphs').textContent(), /det\(A − λI\) = 0/);
  await page.screenshot({ path: path.join(artifacts, 'video-pull-up-desktop.png'), fullPage: true });
  await page.locator('#player').evaluate(video => video.play());
  await page.waitForFunction(() => document.querySelector('video').currentTime > 30.5);
  await page.locator('#player').evaluate(video => video.pause());
  console.log('Videowiedergabe bestätigt.');

  await page.getByRole('button', { name: 'Kettenregel', exact: true }).click();
  await page.getByText('Bereit ab 0:30. Mit Play starten. Stummes Demo-Video.', { exact: true }).waitFor();
  assert.match(await page.locator('#video-title').textContent(), /Kettenregel/);
  await page.getByRole('button', { name: 'Analysis I · 1:00 – 1:30 Produktregel mit Kettenregel kombinieren', exact: true }).click();
  await page.getByText('Bereit ab 1:00. Mit Play starten. Stummes Demo-Video.', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime - 60) < .1);
  console.log('Quellenwechsel auf 1:00 bestätigt.');

  await page.getByLabel('Vorlesung', { exact: true }).selectOption('recursion');
  await page.getByLabel('Was möchtest du verstehen?', { exact: true }).fill('Wie funktioniert die Kettenregel?');
  await page.getByRole('button', { name: 'Erklären & Video öffnen', exact: true }).click();
  await page.getByText('Keine passende Videostelle gefunden.', { exact: true }).waitFor();
  assert.equal(await page.locator('#player-card').isVisible(), false);

  await page.getByRole('button', { name: 'Rekursion', exact: true }).click();
  await page.getByText('Bereit ab 0:00. Mit Play starten. Stummes Demo-Video.', { exact: true }).waitFor();
  assert.match(await page.locator('#transcript').textContent(), /Basisfall/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Eigenwerte', exact: true }).click();
  await page.getByText('Bereit ab 0:30. Mit Play starten. Stummes Demo-Video.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(artifacts, 'video-pull-up-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Browserprüfung bestanden: H.264-Wiedergabe, Zeitmarken 0:00 / 0:30 / 1:00, Quellenwechsel, Vorlesungsfilter, Desktop und Mobil.');
} finally { await browser.close(); }
