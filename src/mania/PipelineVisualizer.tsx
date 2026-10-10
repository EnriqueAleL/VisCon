import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight, Play, RotateCcw, Trophy } from 'lucide-react';
import {
  PIPELINE_PRESETS, PIPELINE_PUZZLES, PIPELINE_STAGES,
  parseInstructions, scorePipelinePuzzle, simulatePipeline,
  type PipelineCycle, type PipelineInstruction, type PipelineLectureAnchor, type PipelinePuzzleScore,
} from '../../shared/pipeline';
import './pipeline.css';

export interface PipelineVisualizerProps {
  onSolved?: (result: { puzzleId: string; cycles: number; stalls: number; order: string[] }) => void;
  onReviewLecture?: (anchor?: PipelineLectureAnchor) => void;
  initialPreset?: string;
}

const stageNames = ['Fetch', 'Decode', 'Execute', 'Memory', 'Write back'];

function PipelineStages({ current, instructions }: { current?: PipelineCycle; instructions: PipelineInstruction[] }) {
  const marker = useId().replace(/:/g, '');
  const byId = new Map(instructions.map(instruction => [instruction.id, instruction]));
  return <div className="pipe-stage-scroll"><svg className="pipe-stage-svg" viewBox="0 0 780 157" role="img" aria-label={current ? `Pipeline stages in cycle ${current.cycle}` : 'Empty five-stage pipeline'}>
    <defs><marker id={marker} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#7ee8d4" /></marker></defs>
    {PIPELINE_STAGES.map((stage, index) => {
      const instruction = current?.stages[stage] ? byId.get(current.stages[stage]!) : undefined;
      const hazardous = current?.hazards.some(hazard => hazard.consumerId === instruction?.id || hazard.producerId === instruction?.id);
      const isBubble = stage === 'EX' && current?.bubble;
      return <g key={stage} className={`pipe-stage ${instruction ? 'occupied' : ''} ${hazardous ? 'hazardous' : ''} ${isBubble ? 'bubble' : ''}`}>
        <rect x={10 + index * 154} y="46" width="143" height="88" rx="13" />
        <text x={24 + index * 154} y="68" className="pipe-stage-code">{stage}</text>
        <text x={24 + index * 154} y="86" className="pipe-stage-name">{stageNames[index]}</text>
        <text x={24 + index * 154} y="113" className="pipe-stage-instruction">{isBubble ? '○ bubble' : instruction ? `${instruction.id.toUpperCase()} · ${instruction.opcode}` : '—'}</text>
        {index < 4 && <path d={`M${157 + index * 154},91 h4`} className="pipe-stage-link" />}
      </g>;
    })}
    {current?.forwarding.map((path, index) => {
      const start = 81 + PIPELINE_STAGES.indexOf(path.from) * 154;
      const end = 81 + 2 * 154;
      return <g key={`${path.producerId}-${path.register}`} className="pipe-forward-path">
        <path d={`M${start},45 C${start},${3 + index * 7} ${end},${3 + index * 7} ${end},43`} markerEnd={`url(#${marker})`} />
        <text x={(start + end) / 2} y={12 + index * 13}>{path.register} bypass</text>
      </g>;
    })}
  </svg></div>;
}

function PipelineTimeline({ instructions, cycles, cursor, onSeek }: {
  instructions: PipelineInstruction[]; cycles: PipelineCycle[]; cursor: number; onSeek: (cycle: number) => void;
}) {
  const cell = 42, row = 38, label = 228;
  const width = Math.max(720, label + cycles.length * cell + 16);
  return <div className="pipe-timeline-scroll"><svg className="pipe-timeline" viewBox={`0 0 ${width} ${46 + instructions.length * row}`} style={{ minWidth: width }} role="img" aria-label="Instruction timeline. Cyan cells show execution stages, amber cells show an interlock holding decode.">
    <text x="14" y="23" className="pipe-axis-label">INSTRUCTION / CYCLE</text>
    {cycles.map((cycle, column) => <g key={cycle.cycle} className="pipe-cycle-column" role="button" tabIndex={cycle.cycle <= cursor ? 0 : -1} aria-label={`Show cycle ${cycle.cycle}`} onClick={() => cycle.cycle <= cursor && onSeek(cycle.cycle)} onKeyDown={event => { if (event.key === 'Enter' && cycle.cycle <= cursor) onSeek(cycle.cycle); }}>
      {cycle.cycle === cursor && <rect x={label + column * cell - 1} y="0" width={cell} height={46 + instructions.length * row} rx="6" className="pipe-current-column" />}
      <text x={label + column * cell + 18} y="23" className={cycle.cycle === cursor ? 'pipe-current-number' : 'pipe-cycle-number'}>{cycle.cycle}</text>
    </g>)}
    {instructions.map((instruction, index) => <g key={instruction.id}>
      <text x="14" y={57 + index * row} className="pipe-row-label"><tspan className="pipe-row-id">{instruction.id.toUpperCase()}</tspan><tspan dx="10">{instruction.text}</tspan></text>
      {cycles.map((cycle, column) => {
        const stage = PIPELINE_STAGES.find(item => cycle.stages[item] === instruction.id);
        const stalled = stage === 'ID' && cycle.hazards.some(hazard => hazard.consumerId === instruction.id);
        const revealed = cycle.cycle <= cursor;
        return <g key={cycle.cycle} className={`pipe-cell ${revealed && stage ? 'active' : ''} ${stalled && revealed ? 'stalled' : ''} ${stage === 'WB' && revealed ? 'complete' : ''}`}>
          <rect x={label + column * cell} y={37 + index * row} width="35" height="29" rx="6" />
          {stage && revealed && <text x={label + column * cell + 17.5} y={56 + index * row}>{stalled ? 'ID!' : stage}</text>}
        </g>;
      })}
    </g>)}
  </svg></div>;
}

export function PipelineVisualizer({ onSolved, onReviewLecture, initialPreset }: PipelineVisualizerProps) {
  const initial = PIPELINE_PRESETS.find(item => item.id === initialPreset) ?? PIPELINE_PRESETS[0];
  const [presetId, setPresetId] = useState(initial.id);
  const [source, setSource] = useState(initial.source);
  const [forwarding, setForwarding] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<'explore' | 'puzzle'>('explore');
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const puzzle = PIPELINE_PUZZLES[0];
  const [order, setOrder] = useState(puzzle.instructions.map(item => item.id));
  const [puzzleResult, setPuzzleResult] = useState<PipelinePuzzleScore | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(puzzle.timeLimit);
  const parsed = useMemo(() => {
    try { return { instructions: parseInstructions(source), error: '' }; }
    catch (error) { return { instructions: [], error: (error as Error).message }; }
  }, [source]);
  const activeInstructions = useMemo(() => mode === 'puzzle'
    ? order.map(id => puzzle.instructions.find(item => item.id === id)!) : parsed.instructions, [mode, order, parsed.instructions, puzzle.instructions]);
  const simulation = useMemo(() => simulatePipeline(activeInstructions, { forwarding: mode === 'puzzle' || forwarding }), [activeInstructions, mode, forwarding]);
  const current = simulation.cycles[cursor - 1];
  const next = simulation.cycles[cursor];
  const finished = cursor === simulation.totalCycles && cursor > 0;
  const seenStalls = simulation.cycles.slice(0, cursor).filter(cycle => cycle.hazards.length).length;
  const preset = PIPELINE_PRESETS.find(item => item.id === presetId) ?? initial;
  const timedOut = deadline !== null && timeLeft === 0;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setCursor(value => Math.min(value + 1, simulation.totalCycles)), 650);
    return () => window.clearInterval(timer);
  }, [playing, simulation.totalCycles]);
  useEffect(() => { if (finished) setPlaying(false); }, [finished]);
  useEffect(() => {
    if (deadline === null) return;
    const update = () => setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);

  function resetPlayback() { setCursor(0); setPlaying(false); setFeedback(null); }
  function predict(stall: boolean) {
    if (!next) return;
    const actual = next.hazards.length > 0;
    setFeedback({ correct: stall === actual, text: actual
      ? `Cycle ${next.cycle}: ID holds. ${next.hazards[0].register} is not available in time; a bubble enters EX on the following cycle.`
      : `Cycle ${next.cycle}: no interlock. The instructions can advance.` });
    setCursor(value => Math.min(value + 1, simulation.totalCycles));
    setPlaying(false);
  }
  function moveInstruction(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= order.length || timedOut) return;
    const changed = [...order];
    [changed[index], changed[target]] = [changed[target], changed[index]];
    setOrder(changed); setPuzzleResult(null); resetPlayback();
  }
  function submitPuzzle() {
    if (deadline !== null && Date.now() > deadline) { setTimeLeft(0); return; }
    const result = scorePipelinePuzzle(order, puzzle.id);
    setPuzzleResult(result);
    if (result.valid) {
      setCursor(simulation.totalCycles); setPlaying(false);
      onSolved?.({ puzzleId: result.puzzleId, cycles: result.cycles, stalls: result.stalls, order: result.order });
    }
  }
  return <section className="pipeline-visualizer" aria-label="Pipeline Factory interactive visualizer">
    <div className="pipe-heading"><div><p className="pipe-eyebrow">PIPELINE FACTORY · DDCA</p><h2>Make the invisible <span>visible.</span></h2><p>Follow each instruction. Catch the dependency. Watch the bubble.</p></div>
      <div className="pipe-mode-switch" aria-label="Visualizer mode"><button type="button" className={mode === 'explore' ? 'selected' : ''} onClick={() => { setMode('explore'); resetPlayback(); }}>Explore</button><button type="button" className={mode === 'puzzle' ? 'selected' : ''} onClick={() => { setMode('puzzle'); resetPlayback(); }}><Trophy size={14} /> Cursed puzzle</button></div>
    </div>
    <div className="pipe-workspace">
      <aside className="pipe-program-panel">
        {mode === 'explore' ? <>
          <label className="pipe-label" htmlFor="pipeline-preset">TEACHING EXAMPLE</label>
          <select id="pipeline-preset" value={presetId} onChange={event => {
            const selected = PIPELINE_PRESETS.find(item => item.id === event.target.value)!;
            setPresetId(selected.id); setSource(selected.source); resetPlayback();
          }}>{PIPELINE_PRESETS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <label className="pipe-label pipe-editor-label" htmlFor="pipeline-instructions">YOUR INSTRUCTIONS <span>editable</span></label>
          <textarea id="pipeline-instructions" value={source} spellCheck={false} rows={7} onChange={event => { setSource(event.target.value); resetPlayback(); }} aria-invalid={Boolean(parsed.error)} aria-describedby={parsed.error ? 'pipeline-error' : 'pipeline-help'} />
          {parsed.error ? <p id="pipeline-error" className="pipe-error" role="alert">{parsed.error}</p> : <p id="pipeline-help" className="pipe-help">One instruction per line. Registers r0–r31. LW/SW use offset(base). NOP inserts an explicit instruction.</p>}
          <label className="pipe-forward-toggle"><span><strong>Data forwarding</strong><small>Bypass the register-file wait</small></span><input type="checkbox" checked={forwarding} onChange={event => { setForwarding(event.target.checked); resetPlayback(); }} /><span className="pipe-switch" aria-hidden="true" /></label>
          <div className="pipe-lecture-note"><span className="pipe-label">FROM THE LECTURE</span><p>{preset.description}</p>{onReviewLecture && <button type="button" className="pipe-text-button" onClick={() => onReviewLecture(preset.lecture)}>Watch lecture 11 at {Math.floor(preset.lecture.start / 60)}:{String(Math.floor(preset.lecture.start % 60)).padStart(2, '0')} <ArrowUpRight size={14} /></button>}</div>
        </> : <>
          <p className="pipe-label">CURSED PUZZLE #01</p><h3>{puzzle.title}</h3><p className="pipe-puzzle-intro">{puzzle.description}</p>
          <div className="pipe-timer"><span>{deadline === null ? '60-second challenge' : timedOut ? 'Time’s up' : `${timeLeft}s remaining`}</span><button type="button" onClick={() => { setDeadline(Date.now() + 60_000); setTimeLeft(60); setPuzzleResult(null); }}> {deadline === null ? 'Start timer' : 'Restart timer'}</button></div>
          <ol className="pipe-puzzle-list">{order.map((id, index) => {
            const instruction = puzzle.instructions.find(item => item.id === id)!;
            return <li key={id}><span className="pipe-order-id">{id.toUpperCase()}</span><code>{instruction.text}</code><span className="pipe-order-controls"><button type="button" aria-label={`Move ${id.toUpperCase()} up`} disabled={index === 0 || timedOut} onClick={() => moveInstruction(index, -1)}><ArrowUp size={12} /></button><button type="button" aria-label={`Move ${id.toUpperCase()} down`} disabled={index === order.length - 1 || timedOut} onClick={() => moveInstruction(index, 1)}><ArrowDown size={12} /></button></span></li>;
          })}</ol>
          <div className="pipe-puzzle-actions"><button type="button" className="pipe-button primary" disabled={timedOut} onClick={submitPuzzle}><Trophy size={15} /> Submit result</button><button type="button" className="pipe-icon-button" aria-label="Reset instruction order" onClick={() => { setOrder(puzzle.instructions.map(item => item.id)); setPuzzleResult(null); setDeadline(null); setTimeLeft(60); resetPlayback(); }}><RotateCcw size={15} /></button></div>
          {puzzleResult && <div className={`pipe-result ${puzzleResult.valid ? 'valid' : 'invalid'}`} role="status">{puzzleResult.valid ? <><strong>{puzzleResult.cycles} cycles · {puzzleResult.stalls} stalls</strong><span>{puzzleResult.optimal ? 'Perfect schedule. Every cycle does useful work.' : `Keep going. The ideal schedule takes ${puzzle.optimumCycles} cycles.`}</span></> : puzzleResult.reason}</div>}
          <p className="pipe-help">Dependencies are checked before scoring. The eight-instruction lower bound is 8 + 4 = 12 cycles.</p>
        </>}
      </aside>
      <div className="pipe-simulation-panel">
        <div className="pipe-stats"><div><span>CYCLE</span><strong>{cursor.toString().padStart(2, '0')}<small> / {simulation.totalCycles.toString().padStart(2, '0')}</small></strong></div><div><span>STALLS OBSERVED</span><strong className={seenStalls ? 'amber' : ''}>{seenStalls.toString().padStart(2, '0')}</strong></div><div><span>INSTRUCTIONS DONE</span><strong>{current?.completed ?? 0}<small> / {activeInstructions.length}</small></strong></div></div>
        <PipelineStages current={current} instructions={activeInstructions} />
        <div className={`pipe-live-explanation ${current?.hazards.length ? 'has-hazard' : ''}`} aria-live="polite">
          <span className="pipe-status-dot" /><p>{!current ? 'Ready to run. An instruction enters the pipeline every cycle, unless a dependency holds decode.'
            : current.hazards.length ? `${current.hazards[0].register} dependency: ${current.hazards[0].kind === 'load-use' ? 'the loaded value arrives after MEM. Hold IF and ID; insert one EX bubble.' : 'wait for WB to write, then ID can read in that same cycle.'}`
            : current.bubble ? 'The interlock bubble is in EX. Older instructions keep moving while decode catches up.'
            : current.forwarding.length ? `${current.forwarding.map(path => `${path.register}: ${path.from} → EX`).join(' · ')}. Use the available result before register writeback.`
            : finished ? `Pipeline drained. ${simulation.totalCycles} cycles, ${simulation.stalls} ${simulation.stalls === 1 ? 'stall' : 'stalls'}.`
            : 'No interlock this cycle. Instructions advance through the five stages.'}</p>
        </div>
        <div className="pipe-playback"><div className="pipe-step-controls"><button type="button" className="pipe-icon-button" disabled={cursor === 0} onClick={() => { setCursor(value => Math.max(0, value - 1)); setPlaying(false); setFeedback(null); }} aria-label="Previous cycle"><ChevronLeft size={18} /></button><button type="button" className="pipe-button primary" disabled={!next || Boolean(mode === 'explore' && parsed.error)} onClick={() => { setCursor(value => Math.min(simulation.totalCycles, value + 1)); setPlaying(false); setFeedback(null); }}>Step <ChevronRight size={16} /></button><button type="button" className="pipe-icon-button" disabled={!next} onClick={() => { setPlaying(value => !value); setFeedback(null); }} aria-label={playing ? 'Pause animation' : 'Play animation'}>{playing ? <span className="pipe-pause">Ⅱ</span> : <Play size={16} />}</button><button type="button" className="pipe-icon-button" onClick={resetPlayback} aria-label="Reset playback"><RotateCcw size={16} /></button></div><span className="pipe-forward-badge">Forwarding {mode === 'puzzle' || forwarding ? 'on' : 'off'}</span></div>
        {mode === 'explore' && next && next.stages.ID && !playing && <div className="pipe-predict"><div><span className="pipe-label">PREDICT, THEN STEP</span><p>Will decode stall in cycle {next.cycle}?</p></div><div><button type="button" onClick={() => predict(true)}>Stall</button><button type="button" onClick={() => predict(false)}>No stall</button></div></div>}
        {feedback && <div className={`pipe-feedback ${feedback.correct ? 'correct' : 'incorrect'}`} role="status"><p><strong>{feedback.correct ? 'Correct.' : 'Try the explanation.'}</strong> {feedback.text}</p>{!feedback.correct && onReviewLecture && <button type="button" className="pipe-text-button" onClick={() => onReviewLecture(preset.lecture)}>Review this lecture moment <ArrowUpRight size={13} /></button>}</div>}
        <PipelineTimeline instructions={activeInstructions} cycles={simulation.cycles} cursor={cursor} onSeek={cycle => { setCursor(cycle); setPlaying(false); setFeedback(null); }} />
        <div className="pipe-legend"><span><i className="stage" />Active stage</span><span><i className="stall" />Decode interlock</span><span><i className="done" />Writeback complete</span></div>
      </div>
    </div>
    <details className="pipe-assumptions"><summary>Timing assumptions and supported instructions</summary><p>Single-issue, in-order IF → ID → EX → MEM → WB. Every stage takes one cycle. Separate instruction and data memories; all memory accesses hit. WB writes before ID reads in the same cycle. Forwarding supplies EX operands from EX/MEM and MEM/WB; a load-use pair still stalls once. Store data is selected in EX; there is no additional MEM-stage store bypass. r0 is always zero. ADD, SUB, AND, OR, XOR, SLT, ADDI, LW, SW and NOP are supported. Branch prediction, exceptions and variable-latency operations belong to other models.</p><p>Concepts verified against DDCA lecture 11, chapters 11.6, 11.16 and 11.17. Instruction examples are crafted for this visualizer.</p></details>
  </section>;
}

export default PipelineVisualizer;
