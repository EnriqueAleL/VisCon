import test from 'node:test';
import assert from 'node:assert/strict';
import { courseSubjects, parseVersusContext } from '../src/versus/context';

test('Versus carries a galaxy lecture/chapter route and maps only available course banks', () => {
  const route = '/#/computer-architecture/vl-11/kapitel-3';
  const context = parseVersusContext(new URLSearchParams({ course: 'computer-architecture', returnTo: route }).toString());
  assert.equal(context.returnTo, route);
  assert.equal(courseSubjects[context.course], 'ddca');
  assert.equal(courseSubjects['linear-algebra'], 'linear');
  assert.equal(courseSubjects.analysis, undefined);
});

test('return navigation never accepts external URLs or another application route', () => {
  for (const returnTo of ['https://example.org', '//example.org', '/learn', '/%2fexample.org', '/#/<script>', '/\\example.org']) {
    assert.equal(parseVersusContext(new URLSearchParams({ returnTo }).toString()).returnTo, '/');
  }
  assert.deepEqual(parseVersusContext('course=%3Cinvalid%3E'), { course: '', returnTo: '/' });
  assert.equal(parseVersusContext('returnTo=%2F%23%2F').returnTo, '/#/');
});
