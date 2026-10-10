import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPELINE_PUZZLES, parseInstructions, pipelineDependencies,
  scorePipelinePuzzle, simulatePipeline,
} from '../shared/pipeline';

test('independent instructions complete in n + 4 cycles and occupy every stage once', () => {
  const result = simulatePipeline('ADD r1, r2, r3\nSUB r4, r5, r6\nXOR r7, r8, r9');
  assert.equal(result.totalCycles, 7);
  assert.equal(result.stalls, 0);
  assert.equal(result.cycles.at(-1)?.completed, 3);
  for (const instruction of result.instructions) {
    const stages = result.cycles.flatMap(cycle => Object.entries(cycle.stages).filter(([, id]) => id === instruction.id).map(([stage]) => stage));
    assert.deepEqual(stages, ['IF', 'ID', 'EX', 'MEM', 'WB']);
  }
  assert.equal(simulatePipeline('').totalCycles, 0);
  assert.equal(simulatePipeline('NOP').totalCycles, 5);
});

test('ALU forwarding removes RAW stalls and supplies EX/MEM then MEM/WB', () => {
  const result = simulatePipeline('ADD r1, r2, r3\nSUB r4, r1, r5\nAND r6, r1, r7');
  assert.equal(result.stalls, 0);
  assert.equal(result.totalCycles, 7);
  assert.deepEqual(result.cycles[3].forwarding, [{ producerId: 'i1', consumerId: 'i2', register: 'r1', from: 'MEM', to: 'EX' }]);
  assert.deepEqual(result.cycles[4].forwarding, [{ producerId: 'i1', consumerId: 'i3', register: 'r1', from: 'WB', to: 'EX' }]);
});

test('an immediate load-use pair stalls exactly once even with forwarding', () => {
  const result = simulatePipeline('LW r1, 0(r20)\nADD r2, r1, r3\nSUB r4, r5, r6');
  assert.equal(result.stalls, 1);
  assert.equal(result.totalCycles, 8);
  const detection = result.cycles[2];
  assert.deepEqual(detection.hazards.map(hazard => [hazard.kind, hazard.register]), [['load-use', 'r1']]);
  assert.equal(detection.stages.IF, 'i3');
  assert.equal(detection.stages.ID, 'i2');
  const bubble = result.cycles[3];
  assert.equal(bubble.bubble, true);
  assert.equal(bubble.stages.EX, null);
  assert.equal(bubble.stages.ID, 'i2');
  assert.equal(bubble.stages.IF, 'i3');
  assert.equal(bubble.stages.MEM, 'i1');
  assert.equal(result.cycles[4].stages.EX, 'i2');
  assert.equal(result.cycles[4].forwarding[0].from, 'WB');
});

test('one independent instruction hides load latency with forwarding', () => {
  const result = simulatePipeline('LW r1, 0(r20)\nADD r8, r9, r10\nSUB r2, r1, r3');
  assert.equal(result.stalls, 0);
  assert.equal(result.totalCycles, 7);
  assert.equal(result.cycles[4].forwarding[0].register, 'r1');
});

test('without forwarding an adjacent ALU dependency waits twice and reads in the WB cycle', () => {
  const result = simulatePipeline('ADD r1, r2, r3\nSUB r4, r1, r5', { forwarding: false });
  assert.equal(result.totalCycles, 8);
  assert.equal(result.stalls, 2);
  assert.equal(result.cycles[2].hazards[0].producerStage, 'EX');
  assert.equal(result.cycles[3].hazards[0].producerStage, 'MEM');
  assert.equal(result.cycles[4].stages.WB, 'i1');
  assert.equal(result.cycles[4].stages.ID, 'i2');
  assert.deepEqual(result.cycles[4].hazards, []);
  assert.equal(result.cycles[5].stages.EX, 'i2');
  assert.equal(result.cycles.every(cycle => cycle.forwarding.length === 0), true);
});

test('WB-before-ID also avoids a stall for a dependency separated by two instructions', () => {
  const result = simulatePipeline('ADD r1, r2, r3\nADD r8, r9, r10\nADD r11, r12, r13\nSUB r4, r1, r5', { forwarding: false });
  assert.equal(result.stalls, 0);
  assert.equal(result.cycles[4].stages.WB, 'i1');
  assert.equal(result.cycles[4].stages.ID, 'i4');
});

test('forwarding always selects the youngest matching producer', () => {
  const result = simulatePipeline('ADD r1, r2, r3\nSUB r1, r4, r5\nXOR r6, r1, r7');
  const paths = result.cycles[4].forwarding;
  assert.deepEqual(paths, [{ producerId: 'i2', consumerId: 'i3', register: 'r1', from: 'MEM', to: 'EX' }]);
  const loadShadow = simulatePipeline('ADD r1, r2, r3\nLW r1, 0(r20)\nXOR r6, r1, r7');
  assert.equal(loadShadow.stalls, 1);
  assert.equal(loadShadow.cycles[3].hazards[0].producerId, 'i2');
  assert.equal(loadShadow.cycles[5].forwarding[0].producerId, 'i2');
});

test('register zero and immediate operands never create false dependencies', () => {
  const result = simulatePipeline('LW x0, 0(x20)\nADDI x1, x0, 0\nADDI r2, r3, 1');
  assert.equal(result.instructions[0].destination, null);
  assert.deepEqual(result.instructions[1].reads, []);
  assert.equal(result.stalls, 0);
  assert.deepEqual(parseInstructions('ADD $1, $0, $2')[0].reads, ['r2']);
});

test('store base and EX-selected store data obey the documented load-use timing', () => {
  assert.equal(simulatePipeline('LW r1, 0(r20)\nSW r1, 4(r20)').stalls, 1);
  assert.equal(simulatePipeline('LW r1, 0(r20)\nSW r2, 4(r1)').stalls, 1);
  assert.equal(simulatePipeline('ADD r1, r2, r3\nSW r1, 4(r20)').stalls, 0);
  assert.equal(simulatePipeline('ADD r1, r2, r3\nSW r1, 4(r20)', { forwarding: false }).stalls, 2);
});

test('a two-source hazard creates a single bubble per cycle, not one per operand', () => {
  const result = simulatePipeline('LW r1, 0(r20)\nADD r2, r1, r1');
  assert.equal(result.stalls, 1);
  assert.equal(result.cycles[2].hazards.length, 1);
});

test('parser rejects malformed or unsupported programs instead of guessing instruction semantics', () => {
  for (const source of ['MUL r1, r2, r3', 'ADD r32, r1, r2', 'ADD r1, r2', 'NOP r1', 'LW r1, r2', 'ADDI r1, r2, 1/2', 'ADD r1, r2, alert(1)']) {
    assert.throws(() => parseInstructions(source), /Line 1:/);
  }
  assert.throws(() => parseInstructions(Array.from({ length: 33 }, () => 'NOP').join('\n')), /at most 32/);
  assert.equal(parseInstructions('# comment\n\nADD r1, r2, r3 ; explanation\nNOP // another')[1].opcode, 'NOP');
});

test('puzzle scores come from server-reproducible schedules and reject dependency-breaking shortcuts', () => {
  const baseline = scorePipelinePuzzle(PIPELINE_PUZZLES[0].instructions.map(item => item.id));
  assert.equal(baseline.valid, true);
  assert.equal(baseline.cycles, 15);
  assert.equal(baseline.stalls, 3);
  const optimal = scorePipelinePuzzle(['i1', 'i3', 'i5', 'i2', 'i4', 'i6', 'i7', 'i8']);
  assert.equal(optimal.valid, true);
  assert.equal(optimal.cycles, 12);
  assert.equal(optimal.stalls, 0);
  if (optimal.valid) assert.equal(optimal.optimal, true);
  assert.equal(scorePipelinePuzzle(['i2', 'i1', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8']).valid, false);
  assert.equal(scorePipelinePuzzle(['i1', 'i1', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8']).valid, false);
  assert.equal(scorePipelinePuzzle(['i1']).valid, false);
  assert.equal(scorePipelinePuzzle(['i1'], 'missing').valid, false);
});

test('scheduling dependencies preserve anti-dependencies, repeated writes and conservative store order', () => {
  const program = parseInstructions('ADD r1, r2, r3\nADD r2, r4, r5\nADD r1, r6, r7\nSW r8, 0(r20)\nLW r9, 0(r20)');
  const edges = pipelineDependencies(program);
  assert.ok(edges.some(edge => edge.before === 'i1' && edge.after === 'i2' && edge.reason.includes('WAR r2')));
  assert.ok(edges.some(edge => edge.before === 'i1' && edge.after === 'i3' && edge.reason.includes('WAW r1')));
  assert.ok(edges.some(edge => edge.before === 'i4' && edge.after === 'i5' && edge.reason.includes('memory order')));
});

test('the advertised 12-cycle optimum is achievable and no legal schedule beats the n + 4 bound', () => {
  const ids = PIPELINE_PUZZLES[0].instructions.map(item => item.id);
  const edges = pipelineDependencies(PIPELINE_PUZZLES[0].instructions);
  let minimum = Infinity;
  let legalSchedules = 0;
  const enumerate = (order: string[], remaining: string[]) => {
    if (!remaining.length) {
      const score = scorePipelinePuzzle(order);
      assert.equal(score.valid, true);
      if (score.valid) { minimum = Math.min(minimum, score.cycles); legalSchedules++; }
      return;
    }
    for (const id of remaining) {
      if (edges.some(edge => edge.after === id && !order.includes(edge.before))) continue;
      enumerate([...order, id], remaining.filter(item => item !== id));
    }
  };
  enumerate([], ids);
  assert.ok(legalSchedules > 20);
  assert.equal(minimum, 12);
});
