import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { translate, type MessageKey } from '../web-interface/src/i18n';

// The dictionary is declared with `as const`, so read the keys back from the source rather than duplicating them here.
const source = readFileSync(new URL('../web-interface/src/i18n.tsx', import.meta.url), 'utf8');
const keys = [...source.matchAll(/^\s{2}'([\w.]+)':/gm)].map(match => match[1] as MessageKey);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('the page has an English and a German text for every message', () => {
  assert.ok(keys.length > 100, `found only ${keys.length} messages`);
  for (const key of keys) {
    const de = translate('de', key);
    const en = translate('en', key);
    assert.ok(de.trim() && en.trim(), `${key} is missing a language`);
    assert.deepEqual(placeholders(en), placeholders(de), `${key} uses different placeholders in en and de`);
  }
});

test('placeholders are filled in and unknown ones are left visible', () => {
  assert.equal(translate('en', 'workspace.counts', { lectures: 24, courses: 3 }), '24 lectures · 3 courses');
  assert.equal(translate('de', 'workspace.counts', { lectures: 24, courses: 3 }), '24 Vorlesungen · 3 Kurse');
  assert.equal(translate('en', 'card.openAt', { title: 'Pipelining' }), 'Open Pipelining at {time}');
});

test('English and German differ where they should', () => {
  assert.equal(translate('de', 'ask.submit'), 'Frage stellen');
  assert.equal(translate('en', 'ask.submit'), 'Ask');
});
