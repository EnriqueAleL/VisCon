/**
 * A deterministic, single-issue, in-order five-stage teaching pipeline.
 *
 * All stages take one cycle; instruction/data memories are separate and always hit.
 * WB writes in the first half of a cycle and ID reads in the second half (DDCA
 * lecture 11, 01:00:00 and 01:17:11). ALU results can bypass from EX/MEM and
 * MEM/WB to EX; loads only become available after MEM, so an immediate load-use
 * pair needs one bubble (lecture 11, 01:19:34). Store data is selected in EX;
 * this model does not include an additional MEM-stage store-data bypass.
 * Branches, exceptions and variable-latency operations are deliberately outside
 * this model. Instruction strings are parsed as data and are never evaluated.
 */
export const PIPELINE_STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type PipelineOpcode = 'ADD' | 'SUB' | 'AND' | 'OR' | 'XOR' | 'SLT' | 'ADDI' | 'LW' | 'SW' | 'NOP';
export interface PipelineInstruction {
  id: string;
  text: string;
  opcode: PipelineOpcode;
  destination: string | null;
  reads: string[];
  memory: 'load' | 'store' | null;
}
export interface PipelineLectureAnchor {
  lectureId: string;
  chapterId: string;
  start: number;
  title: string;
}
export interface PipelineHazard {
  producerId: string;
  consumerId: string;
  register: string;
  kind: 'load-use' | 'await-writeback';
  producerStage: PipelineStage;
}
export interface PipelineForwarding {
  producerId: string;
  consumerId: string;
  register: string;
  from: 'MEM' | 'WB';
  to: 'EX';
}
export interface PipelineCycle {
  cycle: number;
  stages: Record<PipelineStage, string | null>;
  /** Hazard detected in this cycle: IF/ID hold and a bubble enters EX next cycle. */
  hazards: PipelineHazard[];
  forwarding: PipelineForwarding[];
  /** An interlock bubble currently occupies EX. Empty during fill/drain is not a bubble. */
  bubble: boolean;
  completed: number;
}
export interface PipelineSimulation {
  instructions: PipelineInstruction[];
  cycles: PipelineCycle[];
  totalCycles: number;
  stalls: number;
  forwarding: boolean;
}

function register(raw: string): string {
  const token = raw.trim().toLowerCase();
  if (token === 'zero' || token === '$zero') return 'r0';
  const match = /^(?:r|x|\$)(\d{1,2})$/.exec(token);
  if (!match || Number(match[1]) > 31) throw new Error(`Unknown register “${raw}”. Use r0–r31, x0–x31 or $0–$31.`);
  return `r${Number(match[1])}`;
}

function immediate(raw: string): void {
  if (!/^[+-]?(?:\d+|0x[0-9a-f]+)$/i.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`Invalid integer “${raw}”.`);
  }
}

export function parseInstructions(source: string): PipelineInstruction[] {
  if (source.length > 8_000) throw new Error('Keep the program under 8,000 characters.');
  const instructions: PipelineInstruction[] = [];
  source.split(/\r?\n/).forEach((raw, line) => {
    const text = raw.replace(/(?:#|;|\/\/).*$/, '').trim();
    if (!text) return;
    if (instructions.length >= 32) throw new Error('Use at most 32 instructions.');
    try {
      const parts = /^(\w+)\s*(.*)$/.exec(text);
      if (!parts) throw new Error('Expected an instruction.');
      const opcode = parts[1].toUpperCase() as PipelineOpcode;
      const args = parts[2] ? parts[2].split(',').map(arg => arg.trim()) : [];
      let destination: string | null = null;
      let reads: string[] = [];
      let memory: PipelineInstruction['memory'] = null;
      if (['ADD', 'SUB', 'AND', 'OR', 'XOR', 'SLT'].includes(opcode)) {
        if (args.length !== 3) throw new Error(`${opcode} expects destination, source, source.`);
        destination = register(args[0]);
        reads = [register(args[1]), register(args[2])];
      } else if (opcode === 'ADDI') {
        if (args.length !== 3) throw new Error('ADDI expects destination, source, immediate.');
        destination = register(args[0]);
        reads = [register(args[1])];
        immediate(args[2]);
      } else if (opcode === 'LW' || opcode === 'SW') {
        if (args.length !== 2) throw new Error(`${opcode} expects register, offset(base).`);
        const address = /^([+-]?(?:\d+|0x[0-9a-f]+))\s*\(\s*([^()]+)\s*\)$/i.exec(args[1]);
        if (!address) throw new Error('Use an address such as 0(r20).');
        immediate(address[1]);
        const data = register(args[0]);
        const base = register(address[2]);
        memory = opcode === 'LW' ? 'load' : 'store';
        if (opcode === 'LW') { destination = data; reads = [base]; }
        else reads = [data, base];
      } else if (opcode === 'NOP') {
        if (args.length) throw new Error('NOP takes no operands.');
      } else throw new Error(`Unsupported operation “${parts[1]}”. Use ADD, SUB, AND, OR, XOR, SLT, ADDI, LW, SW or NOP.`);
      // Register zero is hard-wired; attempted writes do not produce a dependency.
      if (destination === 'r0') destination = null;
      instructions.push({ id: `i${instructions.length + 1}`, text, opcode, destination,
        reads: [...new Set(reads.filter(item => item !== 'r0'))], memory });
    } catch (error) {
      throw new Error(`Line ${line + 1}: ${(error as Error).message}`);
    }
  });
  return instructions;
}

export function simulatePipeline(
  input: readonly PipelineInstruction[] | string,
  options: { forwarding?: boolean } = {},
): PipelineSimulation {
  const instructions = typeof input === 'string' ? parseInstructions(input) : input.map(item => ({ ...item, reads: [...item.reads] }));
  if (instructions.length > 32 || new Set(instructions.map(item => item.id)).size !== instructions.length) {
    throw new Error('The pipeline requires at most 32 instructions with unique IDs.');
  }
  const forwardingEnabled = options.forwarding ?? true;
  const cycles: PipelineCycle[] = [];
  if (!instructions.length) return { instructions, cycles, totalCycles: 0, stalls: 0, forwarding: forwardingEnabled };
  let stageIndices: (number | null)[] = [0, null, null, null, null];
  let nextInstruction = 1;
  let completed = 0;
  let bubble = false;
  let stalls = 0;
  const latestProducer = (consumer: number, read: string, allowed: number[]) => allowed
    .map(stage => ({ stage, index: stageIndices[stage] }))
    .filter((entry): entry is { stage: number; index: number } => entry.index !== null
      && entry.index < consumer && instructions[entry.index].destination === read)
    .sort((a, b) => b.index - a.index)[0];

  while (stageIndices.some(index => index !== null)) {
    const hazards: PipelineHazard[] = [];
    const paths: PipelineForwarding[] = [];
    const decode = stageIndices[1];
    if (decode !== null) for (const read of instructions[decode].reads) {
      const producer = latestProducer(decode, read, [2, 3, 4]);
      if (!producer || producer.stage === 4) continue; // WB-before-ID register-file read.
      const loadUse = producer.stage === 2 && instructions[producer.index].memory === 'load';
      if (!forwardingEnabled || loadUse) hazards.push({
        producerId: instructions[producer.index].id, consumerId: instructions[decode].id,
        register: read, kind: forwardingEnabled ? 'load-use' : 'await-writeback',
        producerStage: PIPELINE_STAGES[producer.stage],
      });
    }
    const execute = stageIndices[2];
    if (forwardingEnabled && execute !== null) for (const read of instructions[execute].reads) {
      const producer = latestProducer(execute, read, [3, 4]);
      if (!producer || (producer.stage === 3 && instructions[producer.index].memory === 'load')) continue;
      paths.push({ producerId: instructions[producer.index].id, consumerId: instructions[execute].id,
        register: read, from: producer.stage === 3 ? 'MEM' : 'WB', to: 'EX' });
    }
    if (stageIndices[4] !== null) completed++;
    cycles.push({ cycle: cycles.length + 1,
      stages: Object.fromEntries(PIPELINE_STAGES.map((stage, index) => [stage, stageIndices[index] === null ? null : instructions[stageIndices[index]!].id])) as PipelineCycle['stages'],
      hazards, forwarding: paths, bubble, completed });
    const stall = hazards.length > 0;
    if (stall) stalls++;
    stageIndices = [
      stall ? stageIndices[0] : nextInstruction < instructions.length ? nextInstruction++ : null,
      stall ? stageIndices[1] : stageIndices[0],
      stall ? null : stageIndices[1],
      stageIndices[2], stageIndices[3],
    ];
    bubble = stall;
  }
  return { instructions, cycles, totalCycles: cycles.length, stalls, forwarding: forwardingEnabled };
}

export const PIPELINE_PRESETS: {
  id: string; name: string; source: string; description: string; lecture: PipelineLectureAnchor;
}[] = [
  { id: 'load-use', name: 'The load-use curse',
    source: 'LW r1, 0(r20)\nADD r2, r1, r3\nSUB r4, r2, r5\nOR r6, r4, r7',
    description: 'A crafted example of lecture 11’s load-use dependence. A load produces its value after MEM, too late for the next instruction’s EX stage.',
    lecture: { lectureId: 'lec11', chapterId: 'lec11-chapter-11-17', start: 4720.044, title: 'Load-use stalls and bubbles' } },
  { id: 'forwarding', name: 'A chain of ALU dependencies',
    source: 'ADD r1, r2, r3\nSUB r4, r1, r5\nAND r6, r1, r4\nOR r7, r6, r8',
    description: 'A crafted example of lecture 11’s forwarding paths. Compare a bypassed result with waiting for the register-file write.',
    lecture: { lectureId: 'lec11', chapterId: 'lec11-chapter-11-16', start: 4188.964, title: 'Data forwarding and bypassing' } },
  { id: 'independent', name: 'The ideal pipeline',
    source: 'ADD r1, r2, r3\nSUB r4, r5, r6\nXOR r7, r8, r9\nADDI r10, r11, 4',
    description: 'Four independent instructions overlap. After filling the pipeline, one instruction completes each cycle.',
    lecture: { lectureId: 'lec11', chapterId: 'lec11-chapter-11-6', start: 1049.495, title: 'Five-stage pipeline partitioning' } },
];

export interface PipelineDependency { before: string; after: string; reason: string }
/** Conservative scheduling constraints preserve RAW, WAR, WAW and memory order. */
export function pipelineDependencies(instructions: readonly PipelineInstruction[]): PipelineDependency[] {
  const dependencies: PipelineDependency[] = [];
  for (let a = 0; a < instructions.length; a++) for (let b = a + 1; b < instructions.length; b++) {
    const first = instructions[a], second = instructions[b];
    const reasons: string[] = [];
    if (first.destination && second.reads.includes(first.destination)) reasons.push(`RAW ${first.destination}`);
    if (second.destination && first.reads.includes(second.destination)) reasons.push(`WAR ${second.destination}`);
    if (first.destination && first.destination === second.destination) reasons.push(`WAW ${first.destination}`);
    if (first.memory && second.memory && (first.memory === 'store' || second.memory === 'store')) reasons.push('memory order');
    if (reasons.length) dependencies.push({ before: first.id, after: second.id, reason: reasons.join(', ') });
  }
  return dependencies;
}

export const PIPELINE_PUZZLES = [{
  id: 'pipeline-reorder',
  title: 'Break the stall chain',
  description: 'Reorder these eight instructions to finish in the fewest cycles. Preserve every dependency; forwarding is enabled.',
  instructions: parseInstructions('LW r1, 0(r20)\nADD r2, r1, r3\nLW r4, 4(r20)\nSUB r5, r4, r6\nLW r7, 8(r20)\nXOR r8, r7, r9\nADD r10, r2, r5\nOR r11, r10, r8'),
  optimumCycles: 12,
  timeLimit: 60,
}];
export type PipelinePuzzleScore =
  | { valid: false; puzzleId: string; reason: string; cycles: null; stalls: null; order: string[] }
  | { valid: true; puzzleId: string; cycles: number; stalls: number; score: number; optimal: boolean; order: string[] };

/** The server must call this scorer; client-reported scores are not trusted. */
export function scorePipelinePuzzle(orderIds: readonly string[], puzzleId = 'pipeline-reorder'): PipelinePuzzleScore {
  const order = [...orderIds];
  const invalid = (reason: string): PipelinePuzzleScore => ({ valid: false, puzzleId, reason, cycles: null, stalls: null, order });
  const puzzle = PIPELINE_PUZZLES.find(item => item.id === puzzleId);
  if (!puzzle) return invalid('Unknown puzzle.');
  const byId = new Map(puzzle.instructions.map(instruction => [instruction.id, instruction]));
  if (order.length !== byId.size || new Set(order).size !== byId.size || order.some(id => !byId.has(id))) {
    return invalid('Use every original instruction exactly once.');
  }
  const positions = new Map(order.map((id, index) => [id, index]));
  const violation = pipelineDependencies(puzzle.instructions).find(edge => positions.get(edge.before)! > positions.get(edge.after)!);
  if (violation) return invalid(`${violation.before.toUpperCase()} must precede ${violation.after.toUpperCase()} (${violation.reason}).`);
  const simulation = simulatePipeline(order.map(id => byId.get(id)!), { forwarding: true });
  return { valid: true, puzzleId, cycles: simulation.totalCycles, stalls: simulation.stalls,
    score: 10_000 - simulation.totalCycles * 100, optimal: simulation.totalCycles <= puzzle.optimumCycles, order };
}
