import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from './lecture-catalog';
import type { ExamInfo, LectureMoment, RecallQuestion, WorldCity, WorldData, WorldRoad } from '../shared/world';

interface IndexedChapter { id: string; title: string; summary: string; start: number; end: number; key_terms: string[] }
interface IndexedLecture { lecture: number; chapters: IndexedChapter[] }
export interface BankRecallQuestion extends RecallQuestion { answer: string; explanation: string }
export interface WorldBundle { world: WorldData; bank: BankRecallQuestion[]; chapterCity: Map<string, string> }

// Explicitly exclude logistics and breaks, rather than discarding a chapter just because its
// substantive title also mentions a recap or closing. The underlying index has 512 moments.
export const excludedChapterIds = new Set([
  '1.2', '1.5', '1.8', '1.11', '2.1', '2.9', '2.19', '3.11', '4.1', '4.14', '4.15', '4.19',
  '5.9', '6.1', '6.13', '6.20', '7.12', '8.1', '8.12', '9.1',
  '9.23', '10.1', '11.10', '12.1', '12.13', '13.1', '13.12', '14.1', '14.14',
  '15.1', '15.11', '16.1', '16.21', '16.22', '17.11', '18.1', '18.12', '19.1', '19.20',
  '20.1', '20.10', '20.18', '21.11', '22.1', '22.12', '22.26', '23.1', '23.12', '24.20',
]);

type Definition = Pick<WorldCity, 'id' | 'name' | 'description' | 'landmark' | 'visualizer'>;
const definitions: Definition[] = [
  { id: 'foundations', name: 'Architecture Heights', description: 'From problems and algorithms to electrons: the whole computer stack.', landmark: 'Transformation Tower' },
  { id: 'logic-gates', name: 'Logic Grove', description: 'Transistors, CMOS gates, power, and the Boolean foundations of computing.', landmark: 'CMOS Gardens' },
  { id: 'combinational', name: 'Boolean Borough', description: 'Build logic with decoders, multiplexers, truth tables, and Boolean algebra.', landmark: 'Multiplexer Market' },
  { id: 'alu', name: 'ALU Foundry', description: 'Adders, arithmetic, and the modular building blocks of an ALU.', landmark: 'Carry Bridge' },
  { id: 'sequential', name: 'State Square', description: 'Latches, flip-flops, registers, and finite-state machines remember the past.', landmark: 'Clock Tower' },
  { id: 'hdl-fpga', name: 'Hardware Workshop', description: 'Describe, simulate, and synthesize hardware with Verilog and FPGAs.', landmark: 'FPGA Fabric' },
  { id: 'timing', name: 'Timing Terrace', description: 'Critical paths, setup and hold constraints, metastability, and verification.', landmark: 'Setup Observatory' },
  { id: 'isa', name: 'Instruction Island', description: 'The ISA contract: registers, memory, instructions, and execution models.', landmark: 'Program Counter Pier' },
  { id: 'datapaths', name: 'Datapath Docks', description: 'Follow instructions through the single-cycle MIPS datapath and its control.', landmark: 'Control House' },
  { id: 'multicycle', name: 'Multicycle Quarter', description: 'Reuse hardware across cycles with FSM control and microprogramming.', landmark: 'Microcode Mill' },
  { id: 'pipelining', name: 'Pipeline City', description: 'Five stages, data hazards, forwarding, bubbles, and throughput.', landmark: 'Pipeline Factory', visualizer: 'pipeline' },
  { id: 'exceptions', name: 'Exception Exchange', description: 'Interrupts, traps, and precise state preserve the sequential ISA contract.', landmark: 'Retirement Gate' },
  { id: 'reorder-buffer', name: 'Rename Ridge', description: 'Reorder buffers, in-order retirement, and elimination of false dependences.', landmark: 'ROB Registry' },
  { id: 'out-of-order', name: 'Tomasulo Town', description: 'Reservation stations let ready instructions execute before older stalled ones.', landmark: 'Reservation Station' },
  { id: 'dataflow', name: 'Parallel Plaza', description: 'Dataflow architectures and superscalar issue expose instruction parallelism.', landmark: 'Token Fountain' },
  { id: 'branch-prediction', name: 'Prediction Point', description: 'Guess the next PC with branch history, counters, and modern predictors.', landmark: 'Branch Observatory' },
  { id: 'vliw', name: 'Compiler Crossing', description: 'VLIW bundles, trace scheduling, predication, and hardware/software tradeoffs.', landmark: 'Bundle Bridge' },
  { id: 'systolic', name: 'Systolic Springs', description: 'Move and reuse data rhythmically through arrays for matrix computations.', landmark: 'Matrix Waterworks' },
  { id: 'simd', name: 'Vector Valley', description: 'SIMD, vector lanes, banking, chaining, masks, and data parallelism.', landmark: 'Vector Viaduct' },
  { id: 'gpu', name: 'Warp Ward', description: 'SIMT warps, GPU scheduling, divergence, and memory coalescing.', landmark: 'Warp Terminal' },
  { id: 'dram', name: 'Memory Meadows', description: 'Memory technologies, DRAM organization, row buffers, and data movement.', landmark: 'DRAM Reservoir' },
  { id: 'caches', name: 'Cache Harbour', description: 'Locality, address decomposition, associativity, replacement, and misses.', landmark: 'Cache Harbour', visualizer: 'cache' },
  { id: 'prefetching', name: 'Prefetch Park', description: 'Predict future memory requests and overlap latency with useful work.', landmark: 'Runahead Railway' },
  { id: 'virtual-memory', name: 'Virtual Vista', description: 'Pages, address translation, TLBs, protection, and page-table walks.', landmark: 'Page Walk Palace', visualizer: 'virtual-memory' },
];

function cityFor(lecture: number, n: number): string {
  if (lecture === 1 || (lecture === 24 && n >= 16)) return 'foundations';
  if (lecture === 2) return n < 10 ? 'logic-gates' : 'combinational';
  if (lecture === 3) return n >= 14 ? 'sequential' : [3, 4, 5, 9].includes(n) ? 'alu' : 'combinational';
  if (lecture === 4) return n >= 16 ? 'hdl-fpga' : 'sequential';
  if (lecture === 5) return 'hdl-fpga';
  if (lecture === 6 && n === 2) return 'hdl-fpga';
  if (lecture === 6) return n <= 6 ? 'sequential' : 'timing';
  if (lecture === 7) return n <= 2 ? 'timing' : 'isa';
  if (lecture === 8) return n >= 8 && n <= 16 ? 'dataflow' : 'isa';
  if (lecture === 9) return 'datapaths';
  if (lecture === 10) return n >= 19 ? 'pipelining' : 'multicycle';
  if (lecture === 11) return 'pipelining';
  if (lecture === 12) return n >= 12 ? 'reorder-buffer' : 'exceptions';
  if (lecture === 13) return [2, 8, 9, 17, 18].includes(n) ? 'reorder-buffer' : 'out-of-order';
  if (lecture === 14) return n >= 15 ? 'branch-prediction' : n >= 8 ? 'dataflow' : n === 3 ? 'reorder-buffer' : 'out-of-order';
  if (lecture === 15) return 'branch-prediction';
  if (lecture === 16) return n >= 23 ? 'systolic' : n <= 3 ? 'dataflow' : 'vliw';
  if (lecture === 17) return 'simd';
  if (lecture === 18) return n <= 5 ? 'simd' : 'gpu';
  if (lecture === 19) return n <= 2 ? 'gpu' : 'dram';
  if (lecture === 20) return n <= 7 ? 'dram' : 'caches';
  if (lecture === 21) return 'caches';
  if (lecture === 22) return n >= 13 ? 'prefetching' : 'caches';
  if (lecture === 23) return n >= 13 ? 'virtual-memory' : 'prefetching';
  return 'virtual-memory';
}

export function examInfo(now = Date.now(), configuredDate = process.env.EXAM_DATE): ExamInfo {
  const date = configuredDate && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(configuredDate) && Number.isFinite(Date.parse(configuredDate)) ? configuredDate : null;
  const daysRemaining = date ? Math.max(0, Math.ceil((Date.parse(date) - now) / 86_400_000)) : null;
  return { date, configured: !!date, daysRemaining, label: process.env.EXAM_LABEL || 'Basisprüfung', mockExamMode: daysRemaining !== null && daysRemaining <= 14 };
}

// Suggested conceptual learning connections authored for this map, not official course
// prerequisites or access requirements; every city remains available from the start.
const dependencies: [string, string, string][] = [
  ['foundations', 'logic-gates', 'Computer layers lead to digital building blocks'],
  ['logic-gates', 'combinational', 'Gates implement Boolean functions'], ['combinational', 'alu', 'Arithmetic units combine logic blocks'],
  ['logic-gates', 'sequential', 'Storage is built from transistor-level circuits'], ['sequential', 'hdl-fpga', 'HDL describes combinational and sequential hardware'],
  ['sequential', 'timing', 'Register boundaries define setup and hold constraints'], ['alu', 'datapaths', 'Datapaths contain arithmetic and logic units'],
  ['isa', 'datapaths', 'An ISA specifies what the datapath must implement'], ['datapaths', 'multicycle', 'Multicycle execution reuses datapath resources'],
  ['multicycle', 'pipelining', 'Pipelining overlaps the phases of execution'], ['timing', 'pipelining', 'Pipeline stage timing limits throughput'],
  ['pipelining', 'exceptions', 'Overlapped execution must preserve precise state'], ['exceptions', 'reorder-buffer', 'In-order retirement preserves precise exceptions'],
  ['reorder-buffer', 'out-of-order', 'Renaming and retirement support correct reordering'], ['isa', 'dataflow', 'Execution models expose different parallelism'],
  ['out-of-order', 'dataflow', 'Superscalar execution exploits instruction parallelism'], ['pipelining', 'branch-prediction', 'Control dependences limit pipeline throughput'],
  ['dataflow', 'vliw', 'Compiler scheduling exposes instruction parallelism'], ['alu', 'systolic', 'Arrays reuse arithmetic units and data'],
  ['dataflow', 'simd', 'Data parallelism complements instruction parallelism'], ['simd', 'gpu', 'GPU warps use SIMD-like hardware'],
  ['dram', 'caches', 'A hierarchy bridges memory latency and processor speed'], ['caches', 'prefetching', 'Prefetching brings future blocks into the hierarchy'],
  ['dram', 'virtual-memory', 'Physical frames back the virtual address space'], ['caches', 'virtual-memory', 'TLBs cache translations'],
];

export async function loadWorld(root = projectRoot): Promise<WorldBundle> {
  const index = JSON.parse(await readFile(join(root, 'qa/data/index.json'), 'utf8')) as { lectures: Record<string, IndexedLecture> };
  const lectures = Object.values(index.lectures).sort((a, b) => a.lecture - b.lecture);
  const moments = lectures.flatMap(lecture => lecture.chapters.filter(chapter => !excludedChapterIds.has(chapter.id)).map(chapter => ({
    rawId: chapter.id, cityId: cityFor(lecture.lecture, Number(chapter.id.split('.')[1])),
    id: `lec${lecture.lecture}-chapter-${chapter.id.replaceAll('.', '-')}`,
    chapterId: `lec${lecture.lecture}-chapter-${chapter.id.replaceAll('.', '-')}`, lectureId: `lec${lecture.lecture}`,
    lecture: lecture.lecture, title: chapter.title, summary: chapter.summary, start: chapter.start, end: chapter.end, keyTerms: chapter.key_terms,
  })));
  const colors = ['#64dac3', '#b2e58b', '#e6cd85', '#f3a978', '#b3aff7', '#a9cff5'];
  const cities: WorldCity[] = definitions.map((definition, order) => {
    const selected = moments.filter(moment => moment.cityId === definition.id);
    const chapters = selected.map(({ rawId: _raw, cityId: _city, ...moment }) => moment);
    // A deterministic golden-angle layout spreads distinct course cities across the globe.
    const latitude = Math.asin(1 - 2 * (order + 0.5) / definitions.length) * 180 / Math.PI;
    const longitude = ((order * 137.507764 + 40) % 360) - 180;
    const phi = latitude * Math.PI / 180, theta = longitude * Math.PI / 180;
    return { ...definition, order, color: colors[order % colors.length], latitude, longitude,
      position: [Math.cos(phi) * Math.cos(theta), Math.sin(phi), Math.cos(phi) * Math.sin(theta)],
      chapters, chapterIds: chapters.map(chapter => chapter.id), keyTerms: [...new Set(chapters.flatMap(chapter => chapter.keyTerms))].slice(0, 30),
      duration: chapters.reduce((sum, chapter) => sum + chapter.end - chapter.start, 0),
    };
  });
  const byRawId = new Map(moments.map(({ rawId, cityId: _city, ...moment }) => [rawId, moment]));
  const bank = questionSpecifications.map((spec, index) => {
    const [cityId, rawId, prompt, right, wrong, explanation] = spec;
    const source = byRawId.get(rawId);
    if (!source || !cities.find(city => city.id === cityId)?.chapterIds.includes(source.id)) throw new Error(`Recall question has invalid source: ${cityId}/${rawId}`);
    const values = [right, ...wrong];
    const shift = index % values.length;
    const options = values.slice(shift).concat(values.slice(0, shift)).map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
    return { id: `${cityId}-recall-${index + 1}`, cityId, prompt, options, source, answer: options.find(option => option.text === right)!.id, explanation };
  });
  const totalChapters = lectures.reduce((sum, lecture) => sum + lecture.chapters.length, 0);
  const world: WorldData = { id: 'basisjahr-ddca', version: 1, name: 'Your Semester Galaxy', courseId: 'computer-architecture', courseName: 'Digital Design & Computer Architecture',
    cities, roads: dependencies.map(([from, to, reason]) => ({ id: `${from}-${to}`, from, to, reason, kind: 'prerequisite' } satisfies WorldRoad)),
    planets: [
      { id: 'computer-architecture', name: 'Digital Design & Computer Architecture', shortName: 'DDCA', available: true, color: '#64dac3', description: '24 real lectures, grounded chapters, and interactive landmarks.' },
      { id: 'analysis', name: 'Analysis', shortName: 'Analysis', available: false, color: '#9e98b8', description: 'Coming soon · no course material indexed yet.' },
      { id: 'linear-algebra', name: 'Linear Algebra', shortName: 'Linear Algebra', available: false, color: '#919db1', description: 'Coming soon · no course material indexed yet.' },
      { id: 'discrete-mathematics', name: 'Discrete Mathematics', shortName: 'Discrete Maths', available: false, color: '#aa9a92', description: 'Coming soon · no course material indexed yet.' },
    ], stats: { lectures: lectures.length, totalChapters, contentChapters: moments.length, excludedChapters: totalChapters - moments.length, seconds: cities.reduce((sum, city) => sum + city.duration, 0) }, exam: examInfo(),
  };
  return { world, bank, chapterCity: new Map(moments.map(moment => [moment.id, moment.cityId])) };
}

type QuestionSpec = [cityId: string, chapter: string, prompt: string, correct: string, distractors: string[], explanation: string];
const questionSpecifications: QuestionSpec[] = [
  ['foundations', '1.4', 'Which pair is a cross-layer design choice?', 'Co-designing an algorithm and its hardware accelerator', ['Changing only the colour of an application', 'Treating software and hardware as unrelated', 'Ignoring the instruction set'], 'Cross-layer design considers interactions between algorithms, software, architecture, logic, and devices.'],
  ['foundations', '1.7', 'What does computer architecture describe?', 'How computing components are organized to execute workloads', ['Only the physical appearance of a computer', 'Only one programming language', 'Only the operating system user interface'], 'Architecture concerns the organization and behaviour of computing systems across multiple layers.'],
  ['foundations', '1.13', 'What is a common tradeoff of a special-purpose processor?', 'Higher efficiency for a narrower class of workloads', ['Unlimited flexibility with no cost', 'It cannot contain logic gates', 'It must always run every program faster'], 'Specialization trades generality for efficiency on selected computations.'],
  ['logic-gates', '2.3', 'What controls the conducting state of a MOS transistor?', 'The voltage at its gate', ['The name of the software variable', 'The number of instructions in memory', 'The colour of its package'], 'A MOS transistor acts as a voltage-controlled switch.'],
  ['logic-gates', '2.4', 'What does a CMOS inverter output for a logic-high input?', 'Logic low', ['Logic high', 'Always high impedance', 'The clock frequency'], 'The inverter implements logical NOT; complementary pull-up and pull-down networks invert the input.'],
  ['logic-gates', '2.7', 'Which change reduces dynamic switching power, all else equal?', 'Lowering the supply voltage', ['Increasing both voltage and frequency', 'Increasing switched capacitance', 'Increasing switching activity'], 'Dynamic power is proportional to switching activity, capacitance, frequency, and the square of supply voltage.'],
  ['combinational', '2.16', 'What does a multiplexer do?', 'Select one input and route it to the output', ['Store a value indefinitely without feedback', 'Always add all of its inputs', 'Translate virtual addresses'], 'Select signals choose which data input reaches the multiplexer output.'],
  ['combinational', '2.14', 'What does a binary decoder normally produce?', 'One selected output corresponding to the input code', ['One extra bit of carry for every input', 'A persistent register value', 'A predicted program counter'], 'A decoder converts an encoded input into a corresponding selected output, often used for addressing.'],
  ['combinational', '2.11', 'Which expression is equivalent to NOT(A AND B)?', '(NOT A) OR (NOT B)', ['(NOT A) AND (NOT B)', 'A OR B', 'A AND (NOT B)'], 'De Morgan’s law complements each input and swaps AND with OR.'],
  ['alu', '3.3', 'Which inputs does a one-bit full adder use?', 'Two operand bits and a carry-in', ['Only two operand bits, never a carry', 'A page number and a frame number', 'Only a clock signal'], 'A full adder combines A, B, and carry-in to produce sum and carry-out.'],
  ['alu', '3.4', 'What is the main delay limitation of a ripple-carry adder?', 'Carry propagation through successive bit positions', ['An obligatory cache miss', 'The number of register names', 'Branch predictor training'], 'Each bit may have to wait for the carry from the previous bit.'],
  ['alu', '3.9', 'What selects which ALU operation is performed?', 'Function-select control inputs', ['A cache replacement policy', 'The physical memory capacity', 'The page-table depth'], 'The ALU combines arithmetic and logic blocks and selects their outputs with control signals.'],
  ['sequential', '3.18', 'When is a gated D latch transparent?', 'While its enable is active', ['Only at every rising clock edge regardless of enable', 'Only when the processor has a cache miss', 'It is never transparent'], 'An enabled D latch follows its data input; when disabled it holds the prior value.'],
  ['sequential', '4.11', 'When does a rising-edge D flip-flop sample data?', 'At the rising clock edge', ['During the entire high level of the clock', 'At every change of the data input', 'Only when a branch is taken'], 'An edge-triggered flip-flop captures data at a clock transition, unlike a level-sensitive latch.'],
  ['sequential', '4.12', 'What determines the output of a Moore state machine?', 'Its current state', ['Only its current input, with no state', 'The instruction cache index', 'A future state that has not occurred'], 'Moore outputs depend on state; Mealy outputs may depend on both state and current inputs.'],
  ['hdl-fpga', '4.21', 'What is an FPGA lookup table used for?', 'Implementing a configurable Boolean function', ['Caching virtual-to-physical page translations', 'Predicting the next branch target', 'Replacing the operating system'], 'Lookup tables store the truth table of a small configurable logic function.'],
  ['hdl-fpga', '5.8', 'What does synthesis do to an HDL design?', 'Maps the hardware description into an implementation of hardware', ['Executes it as sequential software only', 'Guarantees every timing constraint without analysis', 'Creates new ISA instructions automatically'], 'Synthesis translates a hardware description into an implementable hardware netlist.'],
  ['hdl-fpga', '5.14', 'Which assignment style is normally used for clocked register updates in Verilog?', 'Nonblocking assignments', ['Blocking assignments for every clocked register', 'No assignments are allowed', 'Only arithmetic addition'], 'Nonblocking assignments model simultaneous register updates and help avoid ordering-dependent simulation behaviour.'],
  ['timing', '6.9', 'Which combinational path limits the maximum clock frequency?', 'The critical path with the largest propagation delay', ['The path with the fewest wires, always', 'The path with the shortest contamination delay', 'Any path selected at random'], 'The longest register-to-register propagation path determines the minimum safe clock period, including register timing overhead.'],
  ['timing', '6.15', 'Can a hold-time violation generally be fixed just by lowering clock frequency?', 'No; it depends on the minimum data-path delay', ['Yes; hold time depends only on clock period', 'Yes; a cache flush always fixes it', 'No; hold time is unrelated to registers'], 'The hold constraint depends on minimum clock-to-Q and contamination delay, rather than the clock period.'],
  ['timing', '6.14', 'What can happen when a flip-flop input changes too close to its sampling edge?', 'Metastability', ['A guaranteed new instruction is issued', 'The cache becomes fully associative', 'The ISA automatically changes'], 'Violating setup or hold requirements can leave a flip-flop in a metastable state.'],
  ['isa', '7.7', 'What does endianness specify?', 'The byte order of a multi-byte value in memory', ['The number of pipeline stages', 'The order in which cache sets are evicted', 'The transistor voltage threshold'], 'Endianness describes how bytes of a multi-byte value map to successive memory addresses.'],
  ['isa', '7.17', 'What address does base-plus-offset addressing compute?', 'A base register value plus an encoded offset', ['A cache tag minus the clock period', 'Always the address zero', 'Only the destination register number'], 'Load/store instructions can compute an effective memory address by adding an immediate offset to a base register.'],
  ['isa', '8.17', 'Which is generally an ISA property rather than an implementation choice?', 'The programmer-visible instruction encodings', ['The number of physical pipeline stages', 'The cache replacement circuitry', 'The reservation-station capacity'], 'The ISA specifies the architectural contract; different microarchitectures can implement the same ISA.'],
  ['datapaths', '9.4', 'What sets the clock period in a single-cycle processor?', 'The delay required by its slowest instruction path', ['The fastest instruction only', 'The average instruction path without a margin', 'The number of software functions'], 'Every instruction must finish in one clock cycle, so the clock must accommodate the longest instruction path.'],
  ['datapaths', '9.7', 'What does processor control logic select?', 'The datapath operations and routes needed for an instruction', ['Only the monitor resolution', 'The exam date', 'Only virtual page permissions'], 'Control signals configure multiplexers, enables, and operations so that the datapath carries out the instruction.'],
  ['datapaths', '9.16', 'Which instruction reads data memory into a register?', 'Load word', ['Store word', 'An unconditional jump', 'A register-only AND'], 'A load reads memory and writes the value to its destination register; a store writes register data to memory.'],
  ['multicycle', '10.5', 'What distinguishes a multicycle processor from a single-cycle processor?', 'An instruction is executed over several shorter clock cycles', ['Every instruction must complete in one long cycle', 'It has no control logic', 'It cannot execute load instructions'], 'Multicycle execution splits an instruction into states and can reuse functional units over time.'],
  ['multicycle', '10.7', 'What tracks the current execution phase in a hardwired multicycle controller?', 'A finite-state machine', ['Only a cache valid bit', 'A branch-history counter alone', 'A web-session cookie'], 'The controller FSM selects signals for each instruction-processing phase and advances between states.'],
  ['multicycle', '10.16', 'Where are microprogrammed control sequences represented?', 'In a control store containing microinstructions', ['Only in the data cache tags', 'In the user interface', 'In a virtual page offset'], 'A microprogrammed controller reads microinstructions from a control store to sequence datapath actions.'],
  ['pipelining', '11.6', 'What does pipelining primarily improve?', 'Instruction throughput by overlapping execution stages', ['The ISA-visible result of each instruction', 'It always reduces the latency of one instruction', 'It eliminates every dependence'], 'Pipelining overlaps instructions; ideally more instructions finish per unit time, even though one instruction still traverses all stages.'],
  ['pipelining', '11.16', 'How does forwarding resolve many ALU data hazards?', 'It routes an available producer result directly to a dependent consumer', ['It guesses any unavailable value', 'It changes the instruction’s architectural result', 'It discards the dependent instruction'], 'Forwarding bypasses register-file write-back using results from later pipeline stages.'],
  ['pipelining', '11.17', 'Why does an immediately dependent instruction stall after a load in the classic five-stage pipeline?', 'The loaded value is not ready until the end of the memory stage', ['Forwarding is prohibited by the ISA', 'Every load necessarily takes five extra cycles', 'The dependent instruction never needs the value'], 'Even with forwarding, a load-use dependence needs a bubble because the consumer needs the value before the load produces it.'],
  ['exceptions', '12.4', 'What is a common distinction between an exception and an interrupt?', 'An exception is typically tied to an instruction; an interrupt is typically external', ['Both always mean branch misprediction', 'An interrupt can never affect a processor', 'An exception only occurs in a cache'], 'Exceptions arise from instruction execution, while interrupts usually signal external asynchronous events.'],
  ['exceptions', '12.6', 'What is required when handling a precise instruction fault before retrying it?', 'Older instructions have completed; the faulting and younger instructions have not committed effects', ['Every younger instruction must already commit', 'The register file is discarded entirely', 'Instruction order is irrelevant'], 'Precise state corresponds to a sequential boundary that allows reliable handling, debugging, and restart.'],
  ['exceptions', '12.10', 'What does the exception program counter help record?', 'The instruction address needed to resume or handle the exception', ['The LRU order of all cache sets', 'The number of transistors in the ALU', 'Only the current memory row'], 'EPC preserves an exception-related instruction address, while cause information identifies the event.'],
  ['reorder-buffer', '12.12', 'Why retire instructions in order using a reorder buffer?', 'To preserve precise architectural state despite execution finishing out of order', ['To prohibit all parallel execution', 'To make every branch perfectly predictable', 'To remove the need for memory'], 'A ROB delays architectural commitment until instructions reach the in-order retirement boundary.'],
  ['reorder-buffer', '12.18', 'What does a ROB tag identify during register renaming?', 'The pending producer of a register value', ['Only the register’s text colour', 'A cache line’s byte offset', 'The final exam room'], 'Tags redirect dependents to the particular pending producer instead of confusing multiple versions of an architectural register.'],
  ['reorder-buffer', '12.20', 'Which dependences can register renaming remove?', 'False WAR and WAW dependences', ['Every true RAW dependence', 'All control dependences', 'All memory latency'], 'Renaming creates distinct storage for different register versions, removing name dependences while preserving true data flow.'],
  ['out-of-order', '13.6', 'What lets an instruction wait for operands without blocking every later instruction?', 'A reservation station', ['Only the architectural program counter', 'A single unbuffered input wire', 'A page-table permission bit'], 'Reservation stations hold operations and operand readiness, allowing independent ready operations to proceed.'],
  ['out-of-order', '13.11', 'What wakes dependent operations in Tomasulo’s algorithm?', 'Broadcast of a matching producer tag and result', ['A timer that ignores operands', 'Changing the cache block size', 'Writing every register to zero'], 'Waiting operands match broadcast tags, capture results, and become ready to execute.'],
  ['out-of-order', '14.5', 'Why can out-of-order execution tolerate a long-latency operation?', 'Independent younger instructions can execute while it waits', ['It makes every memory operation instantaneous', 'It removes all data dependences', 'It always skips the stalled instruction permanently'], 'Scheduling around unavailable operands overlaps independent work with latency while preserving architectural correctness.'],
  ['dataflow', '8.9', 'When is an operation ready in a dataflow execution model?', 'When its required input operands are available', ['Only when it has the next sequential PC', 'Only at the end of the semester', 'Whenever the cache index is zero'], 'Data availability, rather than a purely sequential program counter, drives execution of dataflow nodes.'],
  ['dataflow', '14.11', 'What is N-wide superscalar execution?', 'The ability to issue up to N instructions per cycle', ['Executing exactly one instruction every N seconds', 'Using N-bit virtual addresses only', 'A cache with N compulsory misses'], 'A superscalar machine has multiple issue slots and functional resources to execute instruction-level parallelism.'],
  ['dataflow', '14.13', 'What can limit the benefit of wider superscalar issue?', 'Insufficient independent instructions and dependence handling', ['The absence of any clock', 'The fact that all programs have unlimited parallelism', 'Only the browser viewport size'], 'Wider issue still depends on available parallelism, prediction, scheduling, and hardware costs.'],
  ['branch-prediction', '15.3', 'What does a branch target buffer help predict?', 'A likely next instruction address for a branch', ['A register’s arithmetic carry-out', 'The page offset of all data', 'The voltage of a transistor gate'], 'A BTB caches branch target information to support next-PC prediction during fetch.'],
  ['branch-prediction', '15.9', 'Why use a two-bit saturating counter rather than a one-bit last-outcome predictor?', 'To add hysteresis so one unusual outcome need not flip a strong prediction', ['To predict every branch without error', 'To remove all branch instructions', 'To provide infinite history in two bits'], 'Two-bit states encode strength, so repeated contrary outcomes are needed to reverse a strong prediction.'],
  ['branch-prediction', '15.12', 'What does global branch history capture?', 'Recent outcomes of multiple branches', ['Only the byte offset of a cache block', 'Only the compiler version', 'Future outcomes with certainty'], 'Global history can reveal correlations between different branches for a pattern-history predictor.'],
  ['vliw', '16.4', 'Who usually chooses independent operations in a VLIW instruction bundle?', 'The compiler', ['Only a dynamic out-of-order scheduler', 'The cache replacement controller', 'The page-fault handler'], 'VLIW exposes parallel operation slots and relies on compiler scheduling to fill them.'],
  ['vliw', '16.9', 'Why do variable-latency memory operations complicate lockstep VLIW bundles?', 'One operation’s delay can hold up bundled operations', ['All operations always finish in zero cycles', 'Bundles do not contain operations', 'Memory latency is encoded only in a colour'], 'Lockstep assumptions are harder to maintain when an operation does not complete at a predictable latency.'],
  ['vliw', '16.15', 'What does trace scheduling optimize?', 'A likely execution path across multiple basic blocks', ['Only virtual-to-physical mappings', 'The transistor truth table alone', 'The number of available browser tabs'], 'Trace scheduling schedules operations over a frequently executed path and handles deviations with compensation.'],
  ['systolic', '16.26', 'What characterizes a systolic array?', 'Regular movement of data between processing elements for repeated computation', ['Every operation fetches every operand from distant memory independently', 'It can perform only branch prediction', 'It has no processing elements'], 'Systolic computation coordinates local processing and data flow to exploit reuse.'],
  ['systolic', '16.25', 'What key resource does systolic data reuse help conserve?', 'External memory and I/O bandwidth', ['The number of variable names', 'The length of an ISA opcode only', 'The screen refresh rate'], 'Reusing operands across nearby processing elements reduces repeated transfers from external storage.'],
  ['systolic', '16.32', 'Which computation naturally fits a two-dimensional systolic array?', 'Matrix multiplication', ['Only string formatting', 'Only changing a page-table permission', 'Only counting browser users'], 'Grid-arranged multiply-accumulate elements can pass matrix operands and accumulate partial results.'],
  ['simd', '17.3', 'What is data parallelism?', 'Applying similar operations to many data elements', ['Executing only one data element forever', 'Renaming every architectural register', 'Replacing all memory with a program counter'], 'Data-parallel workloads repeat computation over multiple elements, which SIMD/vector execution can exploit.'],
  ['simd', '17.10', 'What does a vector mask control?', 'Which vector elements participate in an operation', ['The branch target address of every instruction', 'The physical colour of memory cells', 'Only the number of instruction opcodes'], 'Masks enable selected lanes or elements while leaving others inactive.'],
  ['simd', '17.19', 'Why can strided vector accesses cause bank conflicts?', 'Several requested elements may map to the same memory bank', ['Every stride automatically visits distinct banks', 'Banks are unrelated to addresses', 'A mask permanently deletes the banks'], 'Address mapping and stride determine which banks serve successive elements; conflicts limit parallel access.'],
  ['gpu', '18.9', 'What does SIMT mean for a GPU programmer?', 'Scalar threads are grouped to execute on SIMD-like hardware', ['Every thread has a fully independent superscalar processor', 'Threads never share an instruction stream', 'All instructions are hardware description language'], 'SIMT exposes threads while the hardware groups their execution into warps or wavefronts.'],
  ['gpu', '18.16', 'What happens when threads in one warp take different branch paths?', 'The paths can execute with different active masks, reducing utilization', ['Every path finishes simultaneously with no cost', 'The processor discards all threads', 'The cache turns into an ALU'], 'Divergence means some lanes are inactive while other lanes execute a path.'],
  ['gpu', '18.14', 'What is memory coalescing intended to achieve?', 'Combine nearby thread accesses into fewer memory transactions', ['Guarantee every load hits in L1', 'Remove all page tables', 'Always execute each thread’s load in isolation'], 'Coalescing exploits spatially related addresses across threads to use memory transactions efficiently.'],
  ['dram', '19.18', 'Which technology requires periodic refresh to retain stored data?', 'DRAM', ['An ideal static CMOS SRAM cell while powered', 'A combinational multiplexer', 'An ALU carry chain'], 'DRAM stores charge in cells that must be refreshed as charge leaks.'],
  ['dram', '19.28', 'What does activating a DRAM row do?', 'Brings the selected row into its bank’s row buffer', ['Writes every register in the CPU', 'Creates a new virtual address space', 'Invalidates every cache unconditionally'], 'ACTIVATE opens a row into the sense amplifiers/row buffer before column accesses.'],
  ['dram', '19.21', 'Why organize memory into multiple banks?', 'To allow some accesses to proceed in parallel or overlap', ['To eliminate every possible access conflict', 'To make addresses unnecessary', 'To turn every store into an interrupt'], 'Banking exposes concurrency, though mapping and shared buses still impose constraints.'],
  ['caches', '20.16', 'Which address field selects a direct-mapped cache entry?', 'The index', ['The full byte offset alone', 'The dirty bit', 'The replacement score'], 'The index selects the entry; the tag checks identity; the offset selects bytes within the block.'],
  ['caches', '20.17', 'Where can a block reside in a two-way set-associative cache?', 'Either of two ways in its indexed set', ['In every set at once', 'Only at one fixed way regardless of replacement', 'Only in the processor’s program counter'], 'The index selects a set, and tag comparison checks its two candidate ways.'],
  ['caches', '21.5', 'Which block does true LRU evict from a full set?', 'The block accessed least recently', ['Always the block with the smallest tag', 'Always the newest block', 'A random block regardless of history'], 'LRU maintains recency information and selects the least recently accessed resident block.'],
  ['prefetching', '22.13', 'What does prefetching try to do?', 'Bring data into the hierarchy before a demand access needs it', ['Guarantee every prediction is correct', 'Modify the required result of a program', 'Replace all architectural loads'], 'Prefetching anticipates accesses to hide memory latency while preserving correctness.'],
  ['prefetching', '22.20', 'What is prefetch pollution?', 'Useful cache blocks are displaced by prefetched data that is not useful enough', ['A precise exception at every branch', 'An instruction set encoding format', 'A mandatory reset of all registers'], 'Incorrect or poorly timed prefetches can consume bandwidth and evict useful resident data.'],
  ['prefetching', '23.8', 'Why checkpoint state in runahead execution?', 'To explore future accesses temporarily and return to the correct execution state', ['To commit invalid results as final architectural values', 'To remove all demand misses permanently', 'To avoid needing any instructions'], 'Runahead executes speculatively during a long miss to generate useful memory requests, then restores the checkpoint.'],
  ['virtual-memory', '23.16', 'What normally remains unchanged when translating a virtual address within a page?', 'The page offset', ['The entire virtual page number', 'Every permission bit', 'The program counter of all threads'], 'Translation maps a virtual page to a physical frame while preserving the offset within the page.'],
  ['virtual-memory', '24.9', 'What does a translation lookaside buffer cache?', 'Recent virtual-to-physical address translations', ['Only instruction arithmetic results', 'Only branch outcomes', 'Only memory data bytes without translations'], 'A TLB caches page translation and permission information to avoid repeated page-table walks.'],
  ['virtual-memory', '23.18', 'Why use multilevel page tables?', 'To avoid allocating one huge flat page table for unused address regions', ['To eliminate all TLB misses', 'To guarantee all pages stay resident', 'To turn virtual addresses into instruction opcodes'], 'Hierarchical page tables allocate lower levels only for represented portions of a sparse address space.'],
];
