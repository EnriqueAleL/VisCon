import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.VISCON_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
await mkdir('web-interface/artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/translate-api/**', async route => {
    const payload = route.request().postDataJSON();
    requests.push({ path: new URL(route.request().url()).pathname, payload });
    const endpoint = route.request().url().split('/').pop();
    const body = endpoint === 'translate' ? { translation: 'Translated passage for the selection test.' }
      : endpoint === 'ask' ? { found: true, answer: 'The cited definition appears on page 10.', page: 10 }
      : { status: 'ready' };
    await route.fulfill({ json: body });
  });
  await page.goto(baseURL);
  await page.locator('#list button').first().waitFor();
  assert.equal(await page.locator('#open-documents').count(), 0);
  assert.equal(await page.locator('#course-documents').isVisible(), false);
  await page.goto(`${baseURL}/#/analysis`);
  await page.locator('#course-documents:not([hidden])').waitFor();
  await page.locator('#document-empty').filter({ hasText: 'Noch keine Dokumente' }).waitFor();
  assert.equal(await page.locator('#document-list .course-document').count(), 0);
  await page.goto(`${baseURL}/#/informatics`);
  await page.locator('#document-list .course-document').waitFor();
  assert.equal(await page.locator('#document-count').textContent(), '1');
  const routeBefore = page.url();
  await page.locator('#document-list .course-document').click();
  const frame = page.frameLocator('#document-frame');
  await frame.locator('.pdf-page[aria-busy="false"]').first().waitFor();
  assert.equal(await frame.locator('.pdf-page').count(), 357);
  const assertFits = async () => {
    assert.equal(await frame.locator('#viewer').evaluate(viewer => {
      const sheet = viewer.querySelector('.pdf-page');
      return sheet.clientWidth <= viewer.clientWidth - 31 && sheet.clientHeight <= viewer.clientHeight - 31;
    }), true);
  };
  await assertFits();
  await page.screenshot({ path: 'web-interface/artifacts/galaxy-document.png' });
  await frame.locator('#chat-toggle').click();
  await page.waitForTimeout(250);
  await frame.locator('#chat-input').fill('Where is the definition?');
  await frame.locator('#chat-form').evaluate(form => form.requestSubmit());
  await frame.getByRole('button', { name: 'Go to page 10' }).click();
  await frame.locator('#viewer[data-current-page="10"]').waitFor();
  await frame.locator('[data-page-number="10"][aria-busy="false"]').waitFor();
  await frame.locator('[data-page-number="10"] .textLayer').evaluate(layer => {
    const span = [...layer.querySelectorAll('span')].find(item => item.textContent.trim().length > 30);
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    layer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await frame.getByText('Translated passage for the selection test.').waitFor();
  assert.equal(requests.find(item => item.path.endsWith('/translate')).payload.pdf, 'ti_book.pdf');
  await page.screenshot({ path: 'web-interface/artifacts/galaxy-document-translation.png' });
  await frame.getByRole('button', { name: 'Close translation' }).click();
  await frame.locator('#chat-close').click();
  await frame.getByRole('link', { name: 'Return to galaxy' }).click();
  await page.waitForFunction(() => !document.getElementById('document-workspace').open);
  assert.equal(await page.locator('#document-workspace').evaluate(dialog => dialog.open), false);
  assert.equal(page.url(), routeBefore);
  await page.locator('#document-list .course-document').click();
  assert.equal(await frame.locator('#viewer').getAttribute('data-current-page'), '10');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await assertFits();
  assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await frame.locator('#chat-toggle').click();
  await frame.locator('#chat-close').click();
  await page.screenshot({ path: 'web-interface/artifacts/galaxy-document-mobile.png' });
  await frame.locator('#file-input').setInputFiles({ name: 'local.pdf', mimeType: 'application/pdf', buffer: await (await page.request.get(`${baseURL}/translation/ti_book.pdf`)).body() });
  await frame.locator('#document-name').filter({ hasText: 'local.pdf' }).waitFor();
  await frame.locator('#chat-toggle').click();
  assert.equal(await frame.locator('#chat-input').isDisabled(), true);
  assert.equal(await frame.locator('#chat-scope').textContent(), 'Local PDF: selection translation is available. Document questions require an indexed book.');
  await frame.getByRole('link', { name: 'Return to galaxy' }).click();
  await page.waitForFunction(() => !document.getElementById('document-workspace').open);
  await page.locator('#document-list .course-document').click();
  await frame.locator('#document-name').filter({ hasText: 'Theoretische Informatik' }).waitFor();
  await frame.locator('.pdf-page[aria-busy="false"]').first().waitFor();
  assert.deepEqual(errors, []);
  console.log('Passed: galaxy/course entry, PDF rendering and fit, selection translation, cited Q&A, return context, mobile panel, local PDF scope.');
} finally { await browser.close(); }
