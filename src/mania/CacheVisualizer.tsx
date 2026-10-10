import { useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, RotateCcw, Waves, Zap } from 'lucide-react';
import {
  CACHE_DEMO_CONFIG, CACHE_PRESETS, CACHE_PUZZLE_RULES,
  compareCaches, decomposeCacheAddress, emptyCacheSets, parseCacheAddresses,
  scoreCachePuzzle, type CacheLine, type CacheStep,
} from '../../shared/cache';
import './cache.css';

export interface CacheVisualizerProps {
  onSolved?: () => void;
  onReviewLecture?: () => void;
  initialPreset?: string;
}

type Design = 'direct' | 'twoWay' | 'fully';
const DESIGNS: { id: Design; title: string; detail: string }[] = [
  { id: 'direct', title: 'Direct mapped', detail: '8 sets · 1 way' },
  { id: 'twoWay', title: '2-way', detail: '4 sets · 2 ways' },
  { id: 'fully', title: 'Fully associative', detail: '1 set · 8 ways' },
];
const hex = (address: number) => `0x${address.toString(16).padStart(2, '0').toUpperCase()}`;
const format = (addresses: readonly number[]) => addresses.map(hex).join(', ');

function CacheDiagram({ sets, activeSet, activeWay, hit, blockBytes, lruOrder, id }: {
  sets: CacheLine[][]; activeSet: number; activeWay: number | null;
  hit: boolean | null; blockBytes: number; lruOrder: number[]; id: string;
}) {
  const columns = Math.min(sets[0].length, 4);
  const rows = Math.ceil(sets[0].length / columns);
  const lineWidth = (546 - (columns - 1) * 12) / columns;
  const setHeight = rows * 65 + 17;
  const height = sets.length * setHeight + 24;
  return (
    <svg className="cache-viz__diagram" viewBox={`0 0 650 ${height}`} role="img" aria-label={`Cache state: ${sets.length} sets, ${sets[0].length} ways per set. Set ${activeSet} selected.`}>
      <defs>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#123942" /><stop offset="1" stopColor="#10232d" /></linearGradient>
      </defs>
      {sets.map((set, index) => (
        <g key={index} transform={`translate(0 ${12 + index * setHeight})`}>
          <rect x="0" y="0" width="650" height={setHeight - 10} rx="12" className={index === activeSet ? 'cache-viz__set cache-viz__set--active' : 'cache-viz__set'} />
          <text x="18" y="26" className="cache-viz__set-label">SET</text>
          <text x="18" y="47" className={index === activeSet ? 'cache-viz__set-number cache-viz__set-number--active' : 'cache-viz__set-number'}>{index.toString().padStart(2, '0')}</text>
          {set.map((line, way) => {
            const x = 87 + (way % columns) * (lineWidth + 12);
            const y = 8 + Math.floor(way / columns) * 65;
            const active = index === activeSet && way === activeWay;
            return (
              <g key={way} transform={`translate(${x} ${y})`}>
                <rect width={lineWidth} height="55" rx="8" fill={line.valid ? `url(#${id}-line)` : '#0b1a24'} className={`cache-viz__line${active ? hit ? ' cache-viz__line--hit' : ' cache-viz__line--miss' : ''}`} />
                <text x="12" y="19" className="cache-viz__way-label">WAY {way}{line.valid && index === activeSet && lruOrder[0] === way ? ' · MRU' : ''}</text>
                <text x="12" y="40" className="cache-viz__block-label">{line.valid ? hex(line.blockNumber! * blockBytes) : 'Empty'}</text>
                {line.valid && lineWidth > 180 && <text x={lineWidth - 12} y="40" textAnchor="end" className="cache-viz__tag-label">tag {line.tag}</text>}
                <circle cx={lineWidth - 13} cy="16" r="3" className={line.valid ? 'cache-viz__valid' : 'cache-viz__invalid'} />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

export function CacheVisualizer({ onSolved, onReviewLecture, initialPreset }: CacheVisualizerProps) {
  const id = useId().replace(/:/g, '');
  const initial = CACHE_PRESETS.find(preset => preset.id === initialPreset) ?? CACHE_PRESETS[1];
  const [addresses, setAddresses] = useState<number[]>([...initial.addresses]);
  const [input, setInput] = useState(format(initial.addresses));
  const [presetId, setPresetId] = useState<string>(initial.id);
  const [design, setDesign] = useState<Design>('twoWay');
  const [cursor, setCursor] = useState(0);
  const [inputError, setInputError] = useState('');
  const [predictFirst, setPredictFirst] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [correctPredictions, setCorrectPredictions] = useState(0);
  const [puzzleInput, setPuzzleInput] = useState('0, 0, 32, 32, 64, 64, 0, 0, 32, 32, 64, 64, 0, 0, 32, 32');
  const [puzzleResult, setPuzzleResult] = useState<ReturnType<typeof scoreCachePuzzle> | null>(null);
  const [puzzleError, setPuzzleError] = useState('');
  const comparison = useMemo(() => compareCaches(addresses), [addresses]);
  const simulation = comparison[design];
  const last: CacheStep | undefined = cursor ? simulation.steps[cursor - 1] : undefined;
  const next = simulation.steps[cursor];
  const displayAddress = last ?? decomposeCacheAddress(addresses[0], simulation.geometry);
  const sets = last?.sets ?? emptyCacheSets(simulation.geometry);
  const missRate = cursor ? (last!.misses / cursor) * 100 : 0;
  const activePreset = CACHE_PRESETS.find(preset => preset.id === presetId);

  function resetTrace(nextAddresses: number[], nextPreset = 'custom') {
    setAddresses(nextAddresses);
    setInput(format(nextAddresses));
    setPresetId(nextPreset);
    setCursor(0);
    setFeedback(null);
    setCorrectPredictions(0);
    setInputError('');
  }

  function step(prediction?: boolean) {
    if (!next) return;
    if (prediction !== undefined) {
      const correct = prediction === next.hit;
      setFeedback({ correct, message: correct
        ? `Correct: ${hex(next.address)} is a ${next.hit ? 'hit' : 'miss'}. ${next.hit ? 'The matching block is already in this set.' : next.missType === 'compulsory' ? 'This block has never been loaded.' : next.missType === 'conflict' ? 'The block fits in the cache, but was evicted from its set.' : 'The working set outgrew the cache.'}`
        : `${hex(next.address)} is a ${next.hit ? 'hit' : 'miss'}. ${next.hit ? 'Check the tag and valid bit: the block is already present.' : next.evictedBlock !== null ? `Block ${hex(next.evictedBlock * simulation.geometry.blockBytes)} was evicted; LRU chooses the oldest touch.` : 'A free way still needs the block fetched on its first access.'}` });
      const count = correct ? correctPredictions + 1 : 0;
      setCorrectPredictions(count);
      if (count === 3) onSolved?.();
    } else setFeedback(null);
    setCursor(value => value + 1);
  }

  function applySequence() {
    try { resetTrace(parseCacheAddresses(input)); } catch (error) { setInputError((error as Error).message); }
  }

  function testPuzzle() {
    try {
      const trace = parseCacheAddresses(puzzleInput);
      const score = scoreCachePuzzle(trace);
      setPuzzleResult(score);
      setPuzzleError('');
      if (score.valid) {
        resetTrace(trace);
        setDesign('twoWay');
        if (score.score === score.maxScore) onSolved?.();
      }
    } catch (error) { setPuzzleError((error as Error).message); setPuzzleResult(null); }
  }

  return (
    <section className="cache-viz" aria-label="Cache Harbour interactive visualizer">
      <header className="cache-viz__header">
        <span className="cache-viz__icon"><Waves size={23} /></span>
        <div><span className="cache-viz__eyebrow">CURSED CONCEPT / MEMORY HIERARCHY</span><h2>Cache Harbour</h2><p>Follow an address. See what stays, and what gets evicted.</p></div>
        <span className="cache-viz__geometry">64 B capacity<span>8-byte blocks · true LRU</span></span>
      </header>

      <div className="cache-viz__designs" role="tablist" aria-label="Cache design">
        {DESIGNS.map(option => <button key={option.id} type="button" role="tab" aria-selected={design === option.id} className={design === option.id ? 'cache-viz__design cache-viz__design--active' : 'cache-viz__design'} onClick={() => { setDesign(option.id); setCursor(0); setFeedback(null); setCorrectPredictions(0); }}><span>{option.title}</span><small>{option.detail}</small></button>)}
      </div>

      <div className="cache-viz__workspace">
        <div className="cache-viz__main">
          <div className="cache-viz__address-head"><span>BYTE ADDRESS</span><strong>{hex(displayAddress.address)}</strong><span className={`cache-viz__outcome${last ? last.hit ? ' cache-viz__outcome--hit' : ' cache-viz__outcome--miss' : ''}`}>{last ? last.hit ? 'HIT' : `${last.missType?.toUpperCase()} MISS` : 'READY TO TRACE'}</span></div>
          <div className="cache-viz__address" aria-label="Address divided into tag, index and block offset">
            <div className="cache-viz__bits cache-viz__bits--tag" style={{ flex: Math.max(simulation.geometry.tagBits, 1) }}><small>TAG · {simulation.geometry.tagBits} bits</small><strong>{displayAddress.tagBinary || '—'}</strong><span>{displayAddress.tag}</span></div>
            <div className="cache-viz__bits cache-viz__bits--index" style={{ flex: Math.max(simulation.geometry.indexBits, 1) }}><small>INDEX · {simulation.geometry.indexBits} bits</small><strong>{displayAddress.indexBinary || '—'}</strong><span>{simulation.geometry.indexBits ? `set ${displayAddress.index}` : 'all ways checked'}</span></div>
            <div className="cache-viz__bits cache-viz__bits--offset" style={{ flex: simulation.geometry.offsetBits }}><small>OFFSET · {simulation.geometry.offsetBits} bits</small><strong>{displayAddress.offsetBinary}</strong><span>byte {displayAddress.offset}</span></div>
          </div>
          <div className="cache-viz__routing"><ChevronDown size={16} /><span>{simulation.geometry.setCount === 1 ? 'No index bits. Compare the tag in every way.' : `Index selects set ${displayAddress.index}. Compare ${simulation.geometry.ways === 1 ? 'its tag' : `the tag in all ${simulation.geometry.ways} ways`}.`}</span></div>
          <CacheDiagram sets={sets} activeSet={displayAddress.index} activeWay={last?.way ?? null} hit={last?.hit ?? null} blockBytes={simulation.geometry.blockBytes} lruOrder={last?.lruOrder ?? []} id={id} />
          <div className="cache-viz__lru"><span>SELECTED SET</span><strong>MRU</strong>{last?.lruOrder.length ? last.lruOrder.map((way, index) => <span className="cache-viz__lru-chip" key={way}>{index > 0 && <ArrowRight size={11} />}way {way} · {hex(last.sets[last.index][way].blockNumber! * simulation.geometry.blockBytes)}</span>) : <span>No blocks loaded yet</span>}<strong>LRU</strong></div>
          <div className="cache-viz__transport"><button type="button" className="cache-viz__square" aria-label="Reset cache trace" onClick={() => { setCursor(0); setFeedback(null); setCorrectPredictions(0); }} disabled={!cursor}><RotateCcw size={16} /></button><button type="button" className="cache-viz__square" aria-label="Previous cache access" onClick={() => { setCursor(value => Math.max(0, value - 1)); setFeedback(null); setCorrectPredictions(0); }} disabled={!cursor}><ArrowLeft size={16} /></button><span>Access <strong>{cursor}</strong> / {addresses.length}</span><button type="button" className="cache-viz__step" disabled={!next || predictFirst} onClick={() => step()}>{next ? 'Step access' : 'Trace complete'}<ArrowRight size={16} /></button></div>
          <div className="cache-viz__predict"><label><input type="checkbox" checked={predictFirst} onChange={event => setPredictFirst(event.target.checked)} />Predict, then step</label><span>{next ? <>Next: <strong>{hex(next.address)}</strong></> : 'Try the same trace in another design.'}</span>{next && <div><button type="button" onClick={() => step(true)}>Hit</button><button type="button" onClick={() => step(false)}>Miss</button></div>}</div>
          {feedback && <div className={feedback.correct ? 'cache-viz__feedback cache-viz__feedback--correct' : 'cache-viz__feedback'} role="status"><span>{feedback.correct ? <Check size={16} /> : <BookOpen size={16} />}{feedback.message}</span>{!feedback.correct && onReviewLecture && <button type="button" onClick={onReviewLecture}>See the lecture<ArrowRight size={13} /></button>}</div>}
        </div>

        <aside className="cache-viz__aside">
          <div className="cache-viz__stats"><div><span>HITS</span><strong className="cache-viz__lime">{last?.hits ?? 0}</strong></div><div><span>MISSES</span><strong className="cache-viz__amber">{last?.misses ?? 0}</strong></div><div><span>MISS RATE</span><strong>{Math.round(missRate)}<small>%</small></strong></div></div>
          <div className="cache-viz__panel"><h3>Same trace. Three designs.</h3><p>Equal capacity and block size. Rates for the accesses stepped so far.</p>{DESIGNS.map(option => { const step = cursor ? comparison[option.id].steps[cursor - 1] : undefined; const rate = cursor ? step!.misses / cursor * 100 : 0; return <div className="cache-viz__comparison" key={option.id}><div><span>{option.title}</span><strong>{Math.round(rate)}%</strong></div><div className="cache-viz__bar"><span style={{ width: `${rate}%` }} /></div><small>{step?.misses ?? 0} misses / {cursor} accesses</small></div>; })}</div>
          <div className="cache-viz__panel"><h3>Try a teaching example</h3><div className="cache-viz__presets">{CACHE_PRESETS.map(preset => <button type="button" key={preset.id} className={presetId === preset.id ? 'cache-viz__preset--active' : ''} onClick={() => resetTrace([...preset.addresses], preset.id)}>{preset.title}</button>)}</div><p>{activePreset?.description ?? 'Your custom trace. Compare the same reads across cache designs.'}</p>{onReviewLecture && <button className="cache-viz__lecture" type="button" onClick={onReviewLecture}><BookOpen size={14} />Watch the explanation<ArrowRight size={13} /></button>}</div>
        </aside>
      </div>

      <div className="cache-viz__sequence"><label htmlFor={`${id}-addresses`}>ACCESS SEQUENCE <span>Decimal or hex byte addresses · 0–255</span></label><div><textarea id={`${id}-addresses`} rows={2} value={input} onChange={event => setInput(event.target.value)} spellCheck={false} aria-invalid={!!inputError} aria-describedby={inputError ? `${id}-error` : undefined} /><button type="button" onClick={applySequence}>Load trace<ArrowRight size={15} /></button></div>{inputError && <p className="cache-viz__error" id={`${id}-error`} role="alert">{inputError}</p>}<div className="cache-viz__trace" aria-label="Access sequence timeline">{addresses.map((address, index) => <button key={index} type="button" className={index === cursor - 1 ? 'cache-viz__trace--current' : index < cursor ? simulation.steps[index].hit ? 'cache-viz__trace--hit' : 'cache-viz__trace--miss' : ''} aria-label={`Access ${index + 1}: ${hex(address)}${index < cursor ? simulation.steps[index].hit ? ', hit' : ', miss' : ''}`} onClick={() => { setCursor(index + 1); setFeedback(null); setCorrectPredictions(0); }}>{hex(address)}{index < cursor && <i />}</button>)}</div></div>

      <details className="cache-viz__puzzle"><summary><span><Zap size={17} /><strong>Storm the cache</strong><small>CURSED PUZZLE</small></span><span>Build the worst access pattern<ChevronDown size={16} /></span></summary><div className="cache-viz__puzzle-body"><p>{CACHE_PUZZLE_RULES.description} These three blocks all map to set 0. Your score is the number of misses.</p><label htmlFor={`${id}-puzzle`}>YOUR 16 READS</label><textarea id={`${id}-puzzle`} rows={2} value={puzzleInput} onChange={event => { setPuzzleInput(event.target.value); setPuzzleResult(null); setPuzzleError(''); }} spellCheck={false} /><div className="cache-viz__puzzle-actions"><button type="button" onClick={testPuzzle}><Zap size={15} />Test pattern</button><span>More misses = better · maximum 16</span></div>{puzzleError && <p className="cache-viz__error" role="alert">{puzzleError}</p>}{puzzleResult && <div className="cache-viz__puzzle-result" role="status"><strong>{puzzleResult.valid ? `${puzzleResult.score}/16` : 'Check your pattern'}</strong><span>{puzzleResult.message}</span></div>}</div></details>
      <footer className="cache-viz__note">Read-only, initially empty cache. Addresses refer to bytes; a miss loads an entire 8-byte block. True LRU is a teaching model. The geometry follows DDCA lecture 20; presets are teaching adaptations.</footer>
    </section>
  );
}

export default CacheVisualizer;
