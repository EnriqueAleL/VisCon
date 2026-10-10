import test from 'node:test';
import assert from 'node:assert/strict';
import { authoredBank, bank, correct, publicQuestion, validateBank } from '../server/questions';

test('four private Versus banks each supply 30 distinct questions across varied topics', () => {
  assert.equal(authoredBank.length, 120);
  for (const subject of ['discrete', 'linear', 'programming', 'ddca']) {
    const questions = authoredBank.filter(q => q.subject === subject);
    assert.equal(questions.length, 30, subject);
    assert.equal(new Set(questions.map(q => q.prompt.trim().toLowerCase())).size, 30);
    assert.equal(new Set(questions.map(q => q.title)).size, 30);
    assert.ok(new Set(questions.map(q => q.topic)).size >= 10, subject);
    assert.equal(new Set(questions.map(q => q.difficulty)).size, 3);
    assert.deepEqual(validateBank(questions), questions);
    for (const q of questions) {
      assert.equal(q.format, 'quiz');
      assert.equal(q.options!.length, 4);
      assert.equal(new Set(q.options!.map(o => o.text)).size, 4);
      assert.equal(q.options!.filter(o => correct(q, o.id)).length, 1);
      const visible = publicQuestion(q);
      assert.equal('answer' in visible, false);
      assert.equal('explanation' in visible, false);
      assert.ok(q.source.includes('authored practice'));
    }
    const answerCounts = questions.reduce<Record<string, number>>((counts,q) => ({...counts,[q.answer]:(counts[q.answer]||0)+1}),{});
    assert.ok(Object.values(answerCounts).every(count => count >= 7 && count <= 8));
  }
});

test('default bank includes every authored quiz and retains numeric and Java formats', () => {
  if (process.env.QUESTION_BANK_PATH) return;
  assert.ok(authoredBank.every(q => bank.some(item => item.id === q.id)));
  assert.ok(!bank.some(q => q.id.startsWith('sets-')));
  for (const subject of ['discrete', 'linear', 'programming']) {
    assert.ok(bank.some(q => q.subject === subject && q.format === 'numeric'));
  }
  assert.ok(bank.some(q => q.subject === 'programming' && q.format === 'java'));
});
