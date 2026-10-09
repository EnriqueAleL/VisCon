import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.VISCON_TEST_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
await mkdir('artifacts', { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByLabel('Nachricht eingeben', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Nachricht eingeben').inputValue(), '');
  assert.equal(await page.locator('.lecture-card').count(), 0);
  assert.equal(await page.locator('.results-section').count(), 0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'artifacts/desktop-landing.png', fullPage: true });
  await page
    .getByLabel('Nachricht eingeben')
    .fill('Wie hängen Eigenwerte und Eigenvektoren zusammen?');
  await page.getByRole('button', { name: 'Frage stellen', exact: true }).click();
  await page.locator('.lecture-card').first().waitFor();
  assert.equal(await page.locator('.lecture-card').count(), 3);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page
      .locator('.lecture-thumbnail img')
      .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
    true,
  );
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });

  const firstSegment = 'Was bleibt bei einer linearen Abbildung gleich?';
  await page
    .getByRole('button', { name: `${firstSegment}: Stelle speichern`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Gespeicherte Stellen', exact: false }).click();
  assert.equal(await page.locator('.lecture-card').count(), 1);
  assert.equal(await page.locator('.segment-row').count(), 1);
  await page.reload();
  await page.getByRole('button', { name: 'Gespeicherte Stellen', exact: false }).click();
  assert.equal(await page.locator('.segment-row').count(), 1);
  await page
    .getByRole('button', { name: `${firstSegment}: Stelle entfernen`, exact: true })
    .click();
  await page.getByRole('heading', { name: 'Hier ist Platz für deine Aha-Momente.' }).waitFor();

  await page.getByRole('button', { name: 'Fragen & Videos', exact: true }).click();
  await page
    .getByLabel('Nachricht eingeben')
    .fill('Wie funktioniert die Kettenregel beim Ableiten?');
  await page.getByRole('button', { name: 'Frage stellen', exact: true }).click();
  await page
    .getByRole('button', { name: 'Die Kettenregel an einem Beispiel ab 22:38 öffnen', exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('.topic-note')
      .getByText('Bei einer zusammengesetzten Funktion', { exact: false })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Von der Sekante zur Tangente ab 7:05 öffnen', exact: true })
      .count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Die Kettenregel an einem Beispiel ab 22:38 öffnen', exact: true })
    .click();
  await page.locator('.viewer-dialog[open]').waitFor();
  assert.match(await page.locator('.preview-position').textContent(), /22:38/);
  assert.equal(await page.locator('.viewer-segment').count(), 2);
  await page.getByRole('button', { name: 'Transkript', exact: true }).click();
  assert.equal(
    await page.locator('.viewer-dialog').getByText('Für sin(x²)', { exact: false }).count(),
    1,
  );
  await page.getByRole('button', { name: 'Vorschau anzeigen', exact: true }).click();
  await page
    .getByText('Für diese Beispielvorlesung ist noch kein Video hinterlegt.', { exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.viewer-dialog').count(), 0);

  await page.getByLabel('Nachricht eingeben', { exact: true }).fill('Quantenverschränkung');
  await page.getByRole('button', { name: 'Frage stellen', exact: true }).click();
  await page.getByRole('heading', { name: 'Keine passenden Vorlesungen gefunden.' }).waitFor();
  await page.getByRole('button', { name: 'Neue Frage', exact: false }).click();
  assert.equal(await page.getByLabel('Nachricht eingeben').inputValue(), '');
  assert.equal(await page.locator('.lecture-card').count(), 0);
  assert.equal(await page.locator('.results-section').count(), 0);

  await page.getByRole('button', { name: 'Meine Vorlesungen', exact: false }).click();
  assert.equal(await page.locator('.lecture-card').count(), 8);
  assert.equal(await page.locator('.best-match').count(), 0);
  await page.getByRole('button', { name: 'Listenansicht', exact: true }).click();
  assert.equal(await page.locator('.lecture-card-list').count(), 8);
  await page.getByLabel('Vorlesungen sortieren').selectOption('newest');
  assert.match(await page.locator('.lecture-title').first().textContent(), /Symmetrische/);
  await page.getByLabel('Vorlesungen durchsuchen').fill('Hashtabelle');
  assert.equal(await page.locator('.lecture-card').count(), 1);
  await page.getByRole('button', { name: 'Über VisCon', exact: true }).click();
  await page.locator('.help-dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.help-dialog[open]').count(), 0);

  for (const width of [390, 320, 768]) {
    const mobileContext = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: width < 760,
      hasTouch: width < 760,
    });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', (error) => errors.push(error.message));
    await mobile.goto(baseURL);
    await mobile.getByLabel('Nachricht eingeben', { exact: true }).waitFor();
    assert.equal(await mobile.locator('.lecture-card').count(), 0);
    assert.equal(await mobile.locator('.results-section').count(), 0);
    await mobile.evaluate(() => document.fonts.ready);
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `Horizontal overflow at ${width}px`,
    );
    await mobile.screenshot({ path: `artifacts/mobile-${width}.png`, fullPage: true });
    if (width === 390) {
      assert.equal(await mobile.locator('.sidebar').isVisible(), false);
      await mobile.getByRole('button', { name: 'Navigation öffnen', exact: true }).click();
      await mobile.getByRole('button', { name: 'Meine Vorlesungen', exact: false }).click();
      assert.equal(await mobile.locator('.lecture-card').count(), 8);
      assert.equal(await mobile.locator('.sidebar').isVisible(), false);
    }
    await mobileContext.close();
  }

  for (const invalidValue of ['null', '{}', '[4]']) {
    await page.evaluate((value) => {
      localStorage.setItem('viscon.saved-segments.v1', value);
      localStorage.setItem('viscon.question-history.v1', value);
    }, invalidValue);
    await page.reload();
    await page.getByLabel('Nachricht eingeben', { exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Interface checks passed: search and exact timestamps, bookmarks and persistence, preview, library, sorting, mobile layouts, invalid storage.',
  );
  console.log('Screenshots: artifacts/desktop.png and artifacts/mobile-{390,320,768}.png');
} finally {
  await browser.close();
}
