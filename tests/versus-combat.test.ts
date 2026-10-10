import test from 'node:test';
import assert from 'node:assert/strict';
import { combatExchange, combatTotals } from '../src/versus/combat';
import type { RoundResult } from '../shared/types';
const round = (a: boolean, b: boolean): RoundResult => ({question: {id:'q',subject:'linear',topic:'sets',title:'Sets',prompt:'One question',format:'quiz',difficulty:'foundation',source:'Test'}, explanation:'Test result',correctAnswer:'a',answers: {a: {correct: a, points: a ? 1000 : 0, value: 'a'}, b: {correct: b, points: b ? 1000 : 0, value: 'b'}}});

test('ship fire mirrors the two pilots and stays private until a round is complete', () => {
  assert.equal(combatExchange(undefined, 'a', 'b').kind, 'idle');
  assert.equal(combatExchange({...round(true,false),answers:{a:round(true,false).answers.a}}, 'a', 'b').kind, 'idle');
  for (const a of [false, true]) for (const b of [false, true]) {
    const result = round(a,b);
    const mine = combatExchange(result, 'a', 'b'), opponent = combatExchange(result, 'b', 'a');
    assert.equal(mine.outgoing, opponent.incoming);
    assert.equal(mine.incoming, opponent.outgoing);
    if (a) assert.equal(mine.outgoing, true);
    if (!a) assert.equal(mine.incoming, true);
  }
  assert.equal(combatExchange(round(true,false),'a','b').kind,'outgoing');
  assert.equal(combatExchange(round(false,true),'a','b').kind,'incoming');
  assert.equal(combatExchange(round(true,true),'a','b').kind,'exchange');
  assert.equal(combatExchange(round(false,false),'a','b').kind,'exchange');
});

test('combat totals reconstruct from completed rounds without altering scores', () => {
  const rounds = [round(true,false),round(true,true),round(false,true),round(false,false)];
  const original = JSON.stringify(rounds);
  assert.deepEqual(combatTotals(rounds, 'a','b'), {dealt:3,taken:3});
  assert.equal(JSON.stringify(rounds),original);
  assert.deepEqual(combatTotals([], 'a','b'), {dealt:0,taken:0});
});
