import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const baseURL = process.env.VISCON_TEST_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
await mkdir('artifacts', { recursive: true });

const eigenvaluesQuestion = 'Wie hängen Eigenwerte und Eigenvektoren zusammen?';
const chainRuleQuestion = 'Wie funktioniert die Kettenregel beim Ableiten?';
const navigationLabels = [
  'Neuer Chat',
  'Chat',
  'Kurse',
  'Meine Vorlesungen',
  'Gespeicherte Stellen',
  'Arena',
  'Über VisCon',
];

async function checkLanding(page) {
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Frage stellen', exact: true })).toBeDisabled();
  await expect(page.locator('.lecture-card')).toHaveCount(0);
  await expect(page.locator('.results-section')).toHaveCount(0);
  await expect(page.getByRole('heading')).toHaveCount(0);
  await expect(page.locator('.sidebar')).toBeVisible();
  for (const name of navigationLabels) {
    await expect(page.locator('.sidebar').getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Chatverlauf', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Navigation öffnen', exact: true })).toHaveCount(0);
  for (const text of [
    'VisCon Lernraum',
    'DEIN LERNRAUM',
    'Was möchtest du verstehen?',
    'Herbstsemester 2026 · ETH Zürich',
    'Eigenwerte verstehen',
    'Kettenregel',
    'Rekursion',
    'Integrale',
    'Beispielinhalte · Keine offiziellen ETH-Aufzeichnungen',
    'Demo-Modus',
  ]) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
}

async function openPicker(page, interaction = 'hover') {
  const courses = page.getByRole('button', { name: 'Kurse', exact: true });
  if (interaction === 'tap') await courses.tap();
  else if (interaction === 'click') await courses.click();
  else await courses.hover();
  const picker = page.getByRole('dialog', { name: 'Kursauswahl', exact: true });
  await expect(picker).toBeVisible();
  return picker;
}

async function openHistory(page, interaction = 'hover') {
  const chat = page.getByRole('button', { name: 'Chat', exact: true });
  if (interaction === 'tap') await chat.tap();
  else if (interaction === 'click') await chat.click();
  else await chat.hover();
  const history = page.getByRole('dialog', { name: 'Chatverlauf', exact: true });
  await expect(history).toBeVisible();
  return history;
}

async function moveIntoPanel(page, triggerName, panel) {
  const iconBounds = await page
    .getByRole('button', { name: triggerName, exact: true })
    .boundingBox();
  const panelBounds = await panel.boundingBox();
  assert.ok(iconBounds && panelBounds, `${triggerName} icon and panel must have visible bounds`);
  await page.mouse.move(iconBounds.x + iconBounds.width / 2, iconBounds.y + iconBounds.height / 2);
  await page.mouse.move(panelBounds.x + 12, panelBounds.y + 20, { steps: 12 });
  // Let a delayed mouseleave handler run so crossing the icon/panel gap is checked.
  await page.waitForTimeout(300);
  await expect(panel).toBeVisible();
}

async function leavePanels(page) {
  const viewport = page.viewportSize();
  assert.ok(viewport);
  await page.mouse.move(viewport.width - 12, viewport.height - 12);
}

async function submitQuestion(page, question) {
  await page.getByLabel('Nachricht eingeben', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Frage stellen', exact: true }).click();
}

async function chooseStudyYear(page, picker, degree = 'bsc', year = 1, interaction = 'click') {
  await expect(picker.getByRole('group', { name: 'Studienjahr', exact: true })).toBeVisible();
  await expect(picker.getByRole('group', { name: 'Fach', exact: true })).toHaveCount(0);
  await expect(
    picker.getByRole('group', { name: 'Bachelor (BSc)', exact: true }).getByRole('button'),
  ).toHaveText(['1', '2', '3']);
  await expect(
    picker.getByRole('group', { name: 'Master (MSc)', exact: true }).getByRole('button'),
  ).toHaveText(['1', '2']);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
  const button = picker.getByRole('button', {
    name: `${degree === 'bsc' ? 'Bachelor (BSc)' : 'Master (MSc)'}, ${year}. Studienjahr`,
    exact: true,
  });
  if (interaction === 'tap') await button.tap();
  else await button.click();
  await expect(picker.getByRole('heading', { name: 'Fach auswählen', exact: true })).toBeVisible();
  await expect(picker.getByRole('group', { name: 'Fach', exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
}

async function chooseSubject(page, picker, subject, interaction = 'click') {
  const activate = async (button) => {
    if (interaction === 'tap') await button.tap();
    else await button.click();
  };
  await expect(picker.getByRole('group', { name: 'Jahr', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Herbstsemester', exact: true })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: subject, exact: true })).toHaveCount(0);
  await activate(picker.getByRole('button', { name: '2026', exact: true }));
  await expect(picker.getByRole('group', { name: 'Semester', exact: true })).toBeVisible();
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
  await activate(picker.getByRole('button', { name: 'Herbstsemester', exact: true }));
  await chooseStudyYear(page, picker, 'bsc', 1, interaction);
  await expect(picker.getByRole('group', { name: 'Fach', exact: true })).toBeVisible();
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
  await activate(picker.getByRole('button', { name: subject, exact: true }));
  await expect(picker).toHaveCount(0);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: `Stell eine Frage zu ${subject}`, exact: true }),
  ).toBeVisible();
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL);
  await checkLanding(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'artifacts/desktop-landing.png', fullPage: true });

  const emptyHistory = await openHistory(page);
  await expect(
    emptyHistory.getByText('Noch keine Fragen gestellt.', { exact: true }),
  ).toBeVisible();
  await leavePanels(page);
  await expect(emptyHistory).toHaveCount(0);

  const dismissedPicker = await openPicker(page);
  await moveIntoPanel(page, 'Kurse', dismissedPicker);
  await dismissedPicker.getByRole('button', { name: '2026', exact: true }).focus();
  await expect(dismissedPicker.getByRole('button', { name: '2026', exact: true })).toBeFocused();
  await leavePanels(page);
  await expect(dismissedPicker).toHaveCount(0);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();

  const picker = await openPicker(page);
  await moveIntoPanel(page, 'Kurse', picker);
  await expect(
    picker.getByRole('group', { name: 'Jahr', exact: true }).getByRole('button'),
  ).toHaveText(['2026', '2025']);
  await expect(picker.getByRole('group', { name: 'Semester', exact: true })).toHaveCount(0);
  await expect(picker.getByRole('group', { name: 'Fach', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/desktop-picker-years.png', fullPage: true });
  await picker.getByRole('button', { name: '2025', exact: true }).click();
  await expect(picker.getByRole('button', { name: '2026', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Herbstsemester', exact: true }).click();
  await chooseStudyYear(page, picker);
  await expect(picker.getByRole('status')).toContainText('Herbstsemester 2025');
  await expect(
    picker.getByRole('group', { name: 'Fach', exact: true }).getByRole('button'),
  ).toHaveCount(0);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
  await picker.getByRole('button', { name: 'Jahr ändern', exact: true }).click();
  await picker.getByRole('button', { name: '2026', exact: true }).click();
  await page.screenshot({ path: 'artifacts/desktop-picker-semesters.png', fullPage: true });
  await picker.getByRole('button', { name: 'Frühlingssemester', exact: true }).click();
  await chooseStudyYear(page, picker);
  await expect(picker.getByRole('status')).toContainText('Frühlingssemester 2026');
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
  await picker.getByRole('button', { name: 'Semester ändern', exact: true }).click();
  await picker.getByRole('button', { name: 'Herbstsemester', exact: true }).click();
  await page.screenshot({ path: 'artifacts/desktop-picker-study-years.png', fullPage: true });
  for (const [degree, year] of [
    ['bsc', 2],
    ['bsc', 3],
    ['msc', 1],
    ['msc', 2],
  ]) {
    await chooseStudyYear(page, picker, degree, year);
    await expect(picker.getByRole('status')).toContainText(
      `${year}. Studienjahr (${degree === 'bsc' ? 'BSc' : 'MSc'})`,
    );
    await expect(
      picker.getByRole('group', { name: 'Fach', exact: true }).getByRole('button'),
    ).toHaveCount(0);
    await picker.getByRole('button', { name: 'Studienjahr ändern', exact: true }).click();
  }
  await chooseStudyYear(page, picker);
  await expect(
    picker.getByRole('group', { name: 'Fach', exact: true }).getByRole('button'),
  ).toHaveText(['Lineare Algebra I', 'Analysis I', 'Informatik I']);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/desktop-picker.png', fullPage: true });
  await picker.getByRole('button', { name: 'Lineare Algebra I', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Stell eine Frage zu Lineare Algebra I', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/desktop-selected-subject.png', fullPage: true });
  await submitQuestion(page, eigenvaluesQuestion);
  await expect(page.locator('.lecture-card')).toHaveCount(3);
  await expect(page.locator('.lecture-title').first()).toHaveText('Eigenwerte und Eigenvektoren');
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
  await expect(page.locator('.lecture-card')).toHaveCount(1);
  await expect(page.locator('.segment-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toHaveValue(
    eigenvaluesQuestion,
  );
  await expect(page.locator('.lecture-card')).toHaveCount(3);
  await expect(page.locator('.lecture-title').first()).toHaveText('Eigenwerte und Eigenvektoren');

  const changePicker = await openPicker(page);
  await chooseSubject(page, changePicker, 'Analysis I');
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeEnabled();
  await expect(page.locator('.lecture-card')).toHaveCount(0);
  await expect(page.locator('.results-section')).toHaveCount(0);
  await submitQuestion(page, chainRuleQuestion);
  await expect(page.locator('.lecture-card')).toHaveCount(1);
  await expect(page.locator('.lecture-title')).toHaveText('Ableitungen und die Kettenregel');
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

  const history = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('viscon.question-history.v4')),
  );
  assert.equal(
    history.some(
      (item) =>
        item.question === eigenvaluesQuestion &&
        item.courseId === 'linear-algebra' &&
        item.year === '2026' &&
        item.degree === 'bsc' &&
        item.studyYear === 1 &&
        item.semester === 'autumn',
    ),
    true,
  );
  assert.equal(
    history.some(
      (item) =>
        item.question === chainRuleQuestion &&
        item.courseId === 'analysis' &&
        item.year === '2026' &&
        item.degree === 'bsc' &&
        item.studyYear === 1 &&
        item.semester === 'autumn',
    ),
    true,
  );

  const dismissedHistory = await openHistory(page);
  await moveIntoPanel(page, 'Chat', dismissedHistory);
  await expect(dismissedHistory.getByText(eigenvaluesQuestion, { exact: true })).toBeVisible();
  await expect(dismissedHistory.getByText(chainRuleQuestion, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/desktop-history.png', fullPage: true });
  await dismissedHistory
    .getByRole('button', { name: 'Chatverlauf schliessen', exact: true })
    .focus();
  await leavePanels(page);
  await expect(dismissedHistory).toHaveCount(0);

  const restoreEigenvalues = await openHistory(page);
  await restoreEigenvalues.getByRole('button', { name: eigenvaluesQuestion, exact: false }).click();
  await expect(restoreEigenvalues).toHaveCount(0);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toHaveValue(
    eigenvaluesQuestion,
  );
  await expect(page.locator('.lecture-card')).toHaveCount(3);
  await expect(page.locator('.lecture-title').first()).toHaveText('Eigenwerte und Eigenvektoren');
  await expect(
    page.getByRole('heading', { name: 'Stell eine Frage zu Lineare Algebra I', exact: true }),
  ).toBeVisible();
  const restoredPicker = await openPicker(page);
  await expect(page.getByRole('button', { name: 'Fach wechseln', exact: true })).toHaveAttribute(
    'title',
    /Bachelor \(BSc\), 1\. Studienjahr/,
  );
  await expect(restoredPicker.getByRole('group', { name: 'Jahr', exact: true })).toBeVisible();
  await leavePanels(page);
  await expect(restoredPicker).toHaveCount(0);

  const restoreChainRule = await openHistory(page);
  await restoreChainRule.getByRole('button', { name: chainRuleQuestion, exact: false }).click();
  await expect(restoreChainRule).toHaveCount(0);
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toHaveValue(
    chainRuleQuestion,
  );
  await expect(page.locator('.lecture-card')).toHaveCount(1);
  await expect(page.locator('.lecture-title')).toHaveText('Ableitungen und die Kettenregel');

  await submitQuestion(page, 'Eigenwerte');
  await page.getByRole('heading', { name: 'Keine passenden Vorlesungen gefunden.' }).waitFor();
  await page.getByRole('button', { name: 'Neuer Chat', exact: true }).click();
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Nachricht eingeben', { exact: true })).toBeEnabled();
  await expect(page.locator('.lecture-card')).toHaveCount(0);
  await expect(page.locator('.results-section')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Stell eine Frage zu Analysis I', exact: true }),
  ).toBeVisible();
  const retainedPicker = await openPicker(page);
  await expect(retainedPicker.getByRole('group', { name: 'Jahr', exact: true })).toBeVisible();
  await retainedPicker.getByRole('button', { name: 'Kursauswahl schliessen', exact: true }).click();
  await expect(retainedPicker).toHaveCount(0);

  await page.reload();
  await checkLanding(page);
  await page.getByRole('button', { name: 'Gespeicherte Stellen', exact: true }).click();
  await expect(page.locator('.lecture-card')).toHaveCount(1);
  await expect(page.locator('.segment-row')).toHaveCount(1);
  await page
    .getByRole('button', { name: `${firstSegment}: Stelle entfernen`, exact: true })
    .click();
  await page.getByRole('heading', { name: 'Hier ist Platz für deine Aha-Momente.' }).waitFor();

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
    await checkLanding(mobile);
    await mobile.evaluate(() => document.fonts.ready);
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `Horizontal overflow at ${width}px`,
    );
    await mobile.screenshot({ path: `artifacts/mobile-${width}.png`, fullPage: true });
    const interaction = width < 760 ? 'tap' : 'click';
    const mobilePicker = await openPicker(mobile, interaction);
    await expect(
      mobilePicker.getByRole('group', { name: 'Jahr', exact: true }).getByRole('button'),
    ).toHaveText(['2026', '2025']);
    if (interaction === 'tap')
      await mobilePicker.getByRole('button', { name: '2026', exact: true }).tap();
    else await mobilePicker.getByRole('button', { name: '2026', exact: true }).click();
    if (interaction === 'tap')
      await mobilePicker.getByRole('button', { name: 'Herbstsemester', exact: true }).tap();
    else await mobilePicker.getByRole('button', { name: 'Herbstsemester', exact: true }).click();
    await mobile.screenshot({ path: `artifacts/mobile-study-years-${width}.png`, fullPage: true });
    const studyBounds = await mobilePicker.boundingBox();
    assert.ok(
      studyBounds && studyBounds.x >= 0 && studyBounds.x + studyBounds.width <= width,
      `Study year overflow at ${width}px`,
    );
    await chooseStudyYear(mobile, mobilePicker, 'bsc', 1, interaction);
    await expect(mobile.getByLabel('Nachricht eingeben', { exact: true })).toBeDisabled();
    const bounds = await mobilePicker.boundingBox();
    assert.ok(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= width,
      `Picker overflow at ${width}px`,
    );
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `Horizontal picker overflow at ${width}px`,
    );
    await mobile.screenshot({ path: `artifacts/mobile-picker-${width}.png`, fullPage: true });
    if (interaction === 'tap')
      await mobilePicker.getByRole('button', { name: 'Lineare Algebra I', exact: true }).tap();
    else await mobilePicker.getByRole('button', { name: 'Lineare Algebra I', exact: true }).click();
    await expect(mobilePicker).toHaveCount(0);
    await expect(mobile.getByLabel('Nachricht eingeben', { exact: true })).toBeEnabled();
    const mobileHistory = await openHistory(mobile, interaction);
    await expect(
      mobileHistory.getByText('Noch keine Fragen gestellt.', { exact: true }),
    ).toBeVisible();
    const historyBounds = await mobileHistory.boundingBox();
    assert.ok(
      historyBounds && historyBounds.x >= 0 && historyBounds.x + historyBounds.width <= width,
      `History overflow at ${width}px`,
    );
    const closeHistory = mobileHistory.getByRole('button', {
      name: 'Chatverlauf schliessen',
      exact: true,
    });
    if (interaction === 'tap') await closeHistory.tap();
    else await closeHistory.click();
    await expect(mobileHistory).toHaveCount(0);
    if (width === 390) {
      await submitQuestion(mobile, eigenvaluesQuestion);
      await expect(mobile.locator('.lecture-card')).toHaveCount(3);
      await expect(mobile.locator('.lecture-title').first()).toHaveText(
        'Eigenwerte und Eigenvektoren',
      );
      await mobile.reload();
      await checkLanding(mobile);
      const persistedHistory = await openHistory(mobile, interaction);
      await persistedHistory.getByRole('button', { name: eigenvaluesQuestion, exact: false }).tap();
      await expect(persistedHistory).toHaveCount(0);
      await expect(mobile.getByLabel('Nachricht eingeben', { exact: true })).toBeEnabled();
      await expect(mobile.getByLabel('Nachricht eingeben', { exact: true })).toHaveValue(
        eigenvaluesQuestion,
      );
      await expect(mobile.locator('.lecture-card')).toHaveCount(3);
      await expect(mobile.locator('.lecture-title').first()).toHaveText(
        'Eigenwerte und Eigenvektoren',
      );
      await expect(
        mobile.getByRole('heading', { name: 'Stell eine Frage zu Lineare Algebra I', exact: true }),
      ).toBeVisible();
      await mobile.getByRole('button', { name: 'Meine Vorlesungen', exact: true }).click();
      await expect(mobile.locator('.lecture-card')).toHaveCount(8);
      await expect(mobile.locator('.sidebar')).toBeVisible();
    }
    await mobileContext.close();
  }

  for (const invalidValue of [
    'null',
    '{}',
    '[4]',
    '[{"question":"Frage","lectureId":"unknown"}]',
    '[{"question":"Frage","courseId":"analysis","year":"2025","semester":"autumn"}]',
    '[{"question":"Frage","courseId":"analysis","year":"2026","semester":"invalid"}]',
    '[{"question":"Frage","courseId":"analysis","year":"2026","semester":"autumn","degree":"msc","studyYear":3}]',
    '[{"question":"Frage","courseId":"analysis","year":"2026","semester":"autumn","degree":"bsc","studyYear":2}]',
  ]) {
    await page.evaluate((value) => {
      localStorage.setItem('viscon.saved-segments.v1', value);
      localStorage.setItem('viscon.question-history.v4', value);
    }, invalidValue);
    await page.reload();
    await checkLanding(page);
  }

  const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const legacyPage = await legacyContext.newPage();
  legacyPage.on('pageerror', (error) => errors.push(error.message));
  await legacyPage.goto(baseURL);
  await legacyPage.evaluate((question) => {
    localStorage.setItem(
      'viscon.question-history.v2',
      JSON.stringify([
        { question, lectureId: 'eigenvalues-introduction' },
        { question, lectureId: 'diagonalization' },
        { question: 'Ungültige Vorlesung', lectureId: 'unknown' },
      ]),
    );
  }, eigenvaluesQuestion);
  await legacyPage.reload();
  const legacyHistory = await openHistory(legacyPage);
  await expect(legacyHistory.getByText(eigenvaluesQuestion, { exact: true })).toHaveCount(1);
  await expect(legacyHistory.getByText('Ungültige Vorlesung', { exact: true })).toHaveCount(0);
  await legacyHistory.getByRole('button', { name: eigenvaluesQuestion, exact: false }).click();
  await expect(
    legacyPage.getByRole('heading', { name: 'Stell eine Frage zu Lineare Algebra I', exact: true }),
  ).toBeVisible();
  await expect(legacyPage.locator('.lecture-card')).toHaveCount(3);
  const clearLegacyHistory = await openHistory(legacyPage);
  await clearLegacyHistory
    .getByRole('button', { name: 'Frageverlauf löschen', exact: true })
    .click();
  await legacyPage.reload();
  const clearedHistory = await openHistory(legacyPage);
  await expect(
    clearedHistory.getByText('Noch keine Fragen gestellt.', { exact: true }),
  ).toBeVisible();
  await leavePanels(legacyPage);
  await expect(clearedHistory).toHaveCount(0);

  await legacyPage.evaluate((question) => {
    localStorage.removeItem('viscon.question-history.v4');
    localStorage.setItem(
      'viscon.question-history.v3',
      JSON.stringify([{ question, courseId: 'analysis', year: '2026', semester: 'autumn' }]),
    );
  }, chainRuleQuestion);
  await legacyPage.reload();
  const migratedCourseHistory = await openHistory(legacyPage);
  await migratedCourseHistory
    .getByRole('button', { name: chainRuleQuestion, exact: false })
    .click();
  await expect(
    legacyPage.getByRole('button', { name: 'Fach wechseln', exact: true }),
  ).toHaveAttribute('title', /Bachelor \(BSc\), 1\. Studienjahr/);
  await submitQuestion(legacyPage, chainRuleQuestion);
  const migratedEntry = await legacyPage.evaluate(
    () => JSON.parse(localStorage.getItem('viscon.question-history.v4'))[0],
  );
  assert.equal(migratedEntry.degree, 'bsc');
  assert.equal(migratedEntry.studyYear, 1);
  const clearMigratedHistory = await openHistory(legacyPage);
  await clearMigratedHistory
    .getByRole('button', { name: 'Frageverlauf löschen', exact: true })
    .click();
  await legacyPage.reload();
  const emptyMigratedHistory = await openHistory(legacyPage);
  await expect(
    emptyMigratedHistory.getByText('Noch keine Fragen gestellt.', { exact: true }),
  ).toBeVisible();
  await leavePanels(legacyPage);
  await expect(emptyMigratedHistory).toHaveCount(0);

  const keyboardPicker = await openPicker(legacyPage, 'click');
  await keyboardPicker.getByRole('button', { name: '2026', exact: true }).focus();
  await legacyPage.keyboard.press('Enter');
  await expect(
    keyboardPicker.getByRole('button', { name: 'Frühlingssemester', exact: true }),
  ).toBeFocused();
  await legacyPage.keyboard.press('Tab');
  await legacyPage.keyboard.press('Enter');
  await expect(
    keyboardPicker.getByRole('button', { name: 'Bachelor (BSc), 1. Studienjahr', exact: true }),
  ).toBeFocused();
  await legacyPage.keyboard.press('Enter');
  await expect(
    keyboardPicker.getByRole('button', { name: 'Lineare Algebra I', exact: true }),
  ).toBeFocused();
  await legacyPage.keyboard.press('Enter');
  await expect(keyboardPicker).toHaveCount(0);
  await expect(legacyPage.getByLabel('Nachricht eingeben', { exact: true })).toBeFocused();
  await legacyContext.close();
  assert.deepEqual(errors, []);
  console.log(
    'Interface checks passed: icon navigation, chat history hover and restore, panel transitions and mouseleave despite focus, year/semester/degree/study year/subject steps and empty periods, subject heading and scoped search, context changes, timestamps, bookmarks and persistence, preview, library, sorting, touch/click panels, invalid storage.',
  );
  console.log(
    'Screenshots: artifacts/desktop{,-landing,-picker,-history}.png and artifacts/mobile{,-picker}-{390,320,768}.png',
  );
} finally {
  await browser.close();
}
