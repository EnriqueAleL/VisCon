import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Clock3, Copy, Crown, ExternalLink, GitBranch, LoaderCircle, Maximize2, Play, RotateCcw, Trophy, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { PIPELINE_PUZZLES, PIPELINE_STAGES, pipelineDependencies, scorePipelinePuzzle, simulatePipeline } from '../../shared/pipeline';
import { CACHE_PUZZLE_RULES, scoreCachePuzzle, simulateCache } from '../../shared/cache';
import type { CityMayor, GlobalLeaderboardEntry, PuzzleCatalogItem, PuzzleId, PuzzleLeaderboardEntry, PuzzleSession, PuzzleSubmissionResponse } from '../../shared/social';
import { maniaApi } from './api';
import './puzzle.css';

interface Props { demo: boolean; onProgress: () => void; onReviewLecture: (kind: 'pipeline' | 'cache') => void }
interface BoardResponse { entries: PuzzleLeaderboardEntry[]; mayor: CityMayor | null; personalBest: PuzzleLeaderboardEntry | null; serverTime: number }
type Feedback = { kind: 'success' | 'error'; message: string } | null;

const pipelinePuzzle = PIPELINE_PUZZLES[0];
const fallbackCatalog: PuzzleCatalogItem[] = [
  { id: 'pipeline-reorder', title: pipelinePuzzle.title, description: pipelinePuzzle.description, kind: 'pipeline', cityId: 'pipelining', timeLimit: 60,
    maxScore: 10_000 - pipelinePuzzle.optimumCycles * 100, optimumCycles: pipelinePuzzle.optimumCycles, instructions: pipelinePuzzle.instructions.map(({ id, text }) => ({ id, text })) },
  { id: 'cache-conflict', title: CACHE_PUZZLE_RULES.title, description: CACHE_PUZZLE_RULES.description, kind: 'cache', cityId: 'caches', timeLimit: 60,
    maxScore: 16, accessCount: CACHE_PUZZLE_RULES.accessCount, allowedAddresses: [...CACHE_PUZZLE_RULES.allowedAddresses] },
];
const initialOrder = () => pipelinePuzzle.instructions.map(instruction => instruction.id);
const initialAddresses = () => Array.from({ length: CACHE_PUZZLE_RULES.accessCount }, () => 0);
const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const performance = (entry: PuzzleLeaderboardEntry) => entry.cycles !== null ? `${entry.cycles} cycles` : `${entry.misses ?? 0}/16 misses`;

/** Every QR module is generated locally, including its error-correction data. */
function PuzzleQR({ url }: { url: string }) {
  const modules = useMemo(() => {
    try {
      const code = qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
      const size = code.getModuleCount(), cells: string[] = [];
      for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
        if (code.isDark(row, col)) cells.push(`M${col + 4} ${row + 4}h1v1h-1z`);
      }
      return { size: size + 8, path: cells.join('') };
    } catch { return null; }
  }, [url]);
  if (!modules) return <p className="puzzle-qr-fallback">Open the puzzle link below to join.</p>;
  return <svg className="puzzle-qr" viewBox={`0 0 ${modules.size} ${modules.size}`} role="img" aria-label="Scan this QR code to open the puzzle" shapeRendering="crispEdges">
    <rect width={modules.size} height={modules.size} fill="#fff" /><path d={modules.path} fill="#101a20" />
  </svg>;
}

function Leaderboard({ entries, loading, problem, compact = false }: { entries: PuzzleLeaderboardEntry[]; loading: boolean; problem: string; compact?: boolean }) {
  if (loading && !entries.length) return <div className="puzzle-board-empty"><LoaderCircle size={20} className="spin" /><p>Loading the city board…</p></div>;
  if (!entries.length) return <div className="puzzle-board-empty"><Trophy size={28} /><p>{problem ? 'The board is unavailable.' : 'This city is waiting for its first mayor.'}</p><span>{problem || 'Finish a timed attempt to put your name here.'}</span></div>;
  return <ol className={`puzzle-leaderboard${compact ? ' compact' : ''}`} aria-label="Puzzle leaderboard">
    {entries.slice(0, compact ? 8 : 10).map(entry => <li key={entry.userId}>
      <span className={`puzzle-rank rank-${entry.rank}`}>{entry.rank === 1 ? <Crown size={17} aria-label="First place" /> : String(entry.rank).padStart(2, '0')}</span>
      <span className="puzzle-player"><strong>{entry.name}</strong><small>{(entry.elapsedMs / 1000).toFixed(1)}s · {entry.puzzleId === 'pipeline-reorder' ? `${entry.stalls ?? 0} stalls` : `${entry.hits ?? 0} hits`}</small></span>
      <strong className="puzzle-board-score">{performance(entry)}</strong>
    </li>)}
  </ol>;
}

export default function PuzzleHub({ demo, onProgress, onReviewLecture }: Props) {
  const [selected, setSelected] = useState<PuzzleId>(() => new URLSearchParams(location.search).get('puzzle') === 'cache-conflict' ? 'cache-conflict' : 'pipeline-reorder');
  const [catalog, setCatalog] = useState(fallbackCatalog), [catalogReady, setCatalogReady] = useState(false), [catalogError, setCatalogError] = useState('');
  const [order, setOrder] = useState(initialOrder), [addresses, setAddresses] = useState(initialAddresses);
  const [session, setSession] = useState<PuzzleSession | null>(null), [submitted, setSubmitted] = useState(false), [busy, setBusy] = useState(false);
  const [clockOffset, setClockOffset] = useState(0), [now, setNow] = useState(Date.now), [feedback, setFeedback] = useState<Feedback>(null);
  const [board, setBoard] = useState<PuzzleLeaderboardEntry[]>([]), [globalBoard, setGlobalBoard] = useState<GlobalLeaderboardEntry[]>([]);
  const [mayor, setMayor] = useState<CityMayor | null>(null), [personalBest, setPersonalBest] = useState<PuzzleLeaderboardEntry | null>(null);
  const [period, setPeriod] = useState<'all' | 'week'>('all'), [boardLoading, setBoardLoading] = useState(true), [boardError, setBoardError] = useState('');
  const [projector, setProjector] = useState(() => new URLSearchParams(location.search).get('projector') === '1');
  const [roomDeadline, setRoomDeadline] = useState<number | null>(null), [copied, setCopied] = useState(false), [cacheStep, setCacheStep] = useState(15);
  const [previewOpen, setPreviewOpen] = useState(true);
  const mounted = useRef(true), boardVersion = useRef(0), requestVersion = useRef(0), copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectorPanel = useRef<HTMLDivElement>(null);
  const puzzle = catalog.find(item => item.id === selected) ?? fallbackCatalog[0];
  const pipeline = useMemo(() => scorePipelinePuzzle(order), [order]);
  const instructionsById = useMemo(() => new Map(pipelinePuzzle.instructions.map(instruction => [instruction.id, instruction])), []);
  const simulation = useMemo(() => simulatePipeline(order.map(id => instructionsById.get(id)!), { forwarding: true }), [order, instructionsById]);
  const dependencies = useMemo(() => pipelineDependencies(pipelinePuzzle.instructions), []);
  const cache = useMemo(() => simulateCache(addresses, CACHE_PUZZLE_RULES.config), [addresses]);
  const cacheScore = useMemo(() => scoreCachePuzzle(addresses), [addresses]);
  const remaining = session ? Math.max(0, Math.ceil((Date.parse(session.expiresAt) - now - clockOffset) / 1000)) : puzzle.timeLimit;
  const roomRemaining = roomDeadline ? Math.max(0, Math.ceil((roomDeadline - now) / 1000)) : puzzle.timeLimit;
  const active = Boolean(session && !submitted && remaining > 0), expired = Boolean(session && !submitted && remaining === 0);
  const roomActive = Boolean(roomDeadline && roomRemaining > 0);
  const editingDisabled = busy || expired || submitted;
  const localValid = selected === 'pipeline-reorder' ? pipeline.valid : cacheScore.valid;
  const joinUrl = useMemo(() => {
    const url = new URL('/', location.origin); url.searchParams.set('puzzle', selected); return url.toString();
  }, [selected]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);

  useEffect(() => {
    const controller = new AbortController(); setCatalogReady(false); setCatalogError('');
    maniaApi<{ puzzles: PuzzleCatalogItem[]; serverTime: number }>('/api/puzzles', undefined, controller.signal)
      .then(result => { if (result.puzzles.length) { setCatalog(result.puzzles); setCatalogReady(true); } else setCatalogError('No live puzzles are available yet. You can still practice below.'); })
      .catch(error => { if (error.name !== 'AbortError') setCatalogError(`Live puzzles are unavailable. Practice still works. ${message(error)}`); });
    return () => controller.abort();
  }, [demo]);

  const refreshBoards = useCallback(async (signal?: AbortSignal) => {
    if (demo) return;
    const version = ++boardVersion.current;
    try {
      const [cityResult, weekResult] = await Promise.all([
        maniaApi<BoardResponse>(`/api/puzzles/${selected}/leaderboard?period=${period}`, undefined, signal),
        maniaApi<{ entries: GlobalLeaderboardEntry[] }>('/api/puzzles/leaderboard?period=week', undefined, signal),
      ]);
      if (!mounted.current || signal?.aborted || version !== boardVersion.current) return;
      setBoard(cityResult.entries); setMayor(cityResult.mayor); setPersonalBest(cityResult.personalBest); setGlobalBoard(weekResult.entries); setBoardError('');
    } catch (error) { if (!signal?.aborted && mounted.current && version === boardVersion.current) setBoardError(message(error)); }
    finally { if (mounted.current && version === boardVersion.current) setBoardLoading(false); }
  }, [demo, selected, period]);

  useEffect(() => {
    const controller = new AbortController(); setBoard([]); setMayor(null); setPersonalBest(null); setGlobalBoard([]); setBoardError(''); setBoardLoading(!demo);
    if (!demo) void refreshBoards(controller.signal);
    const interval = demo ? null : setInterval(() => { if (!document.hidden) void refreshBoards(controller.signal); }, 8000);
    return () => { controller.abort(); boardVersion.current++; if (interval) clearInterval(interval); };
  }, [refreshBoards, demo]);

  useEffect(() => {
    if (!active && !roomActive) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [active, roomActive]);

  useEffect(() => {
    if (!projector) return;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    projectorPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setProjector(false); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(projectorPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', keyboard); previousFocus?.focus(); };
  }, [projector]);

  useEffect(() => {
    requestVersion.current++; setSession(null); setSubmitted(false); setBusy(false); setFeedback(null); setClockOffset(0); setOrder(initialOrder()); setAddresses(initialAddresses()); setCacheStep(15);
  }, [demo]);

  const selectPuzzle = (id: PuzzleId) => {
    requestVersion.current++; setSelected(id); setSession(null); setSubmitted(false); setBusy(false); setFeedback(null); setRoomDeadline(null);
    setOrder(initialOrder()); setAddresses(initialAddresses()); setCacheStep(15);
    const url = new URL(location.href); url.searchParams.set('puzzle', id); history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const resetPractice = () => { requestVersion.current++; setSession(null); setSubmitted(false); setBusy(false); setFeedback(null); setOrder(initialOrder()); setAddresses(initialAddresses()); setCacheStep(15); };
  const move = (index: number, direction: -1 | 1) => {
    if (editingDisabled || index + direction < 0 || index + direction >= order.length) return;
    setOrder(previous => { const next = [...previous]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; }); setFeedback(null);
  };
  const startAttempt = async () => {
    const version = ++requestVersion.current; setBusy(true); setFeedback(null);
    try {
      const start = demo ? Date.now() : 0;
      const result: PuzzleSession = demo ? { sessionId: 'local-demo', puzzleId: selected, startedAt: new Date(start).toISOString(), expiresAt: new Date(start + puzzle.timeLimit * 1000).toISOString(), serverTime: start, timeLimit: puzzle.timeLimit }
        : await maniaApi<PuzzleSession>(`/api/puzzles/${selected}/start`, {});
      if (!mounted.current || version !== requestVersion.current) return;
      setOrder(initialOrder()); setAddresses(initialAddresses()); setCacheStep(15); setSubmitted(false); setSession(result); setClockOffset(result.serverTime - Date.now()); setNow(Date.now());
    } catch (error) { if (mounted.current && version === requestVersion.current) setFeedback({ kind: 'error', message: message(error) }); }
    finally { if (mounted.current && version === requestVersion.current) setBusy(false); }
  };
  const finish = async () => {
    const result = selected === 'pipeline-reorder' ? pipeline : cacheScore;
    if (!result.valid) { setFeedback({ kind: 'error', message: 'reason' in result ? result.reason : result.message }); return; }
    const summary = selected === 'pipeline-reorder' && pipeline.valid ? `${pipeline.cycles} cycles, ${pipeline.stalls} stalls. ${pipeline.optimal ? 'An optimal schedule. The load-use curse is broken.' : 'Try placing independent work between a load and its consumer.'}` : cacheScore.message;
    if (!session || demo) {
      if (session && remaining === 0) { setFeedback({ kind: 'error', message: 'Time is up. Start another attempt or return to practice.' }); return; }
      setFeedback({ kind: 'success', message: `${summary} ${demo ? 'Demo result stays on this device.' : 'Practice result. Start a timed attempt to join the board.'}` });
      if (session) setSubmitted(true);
      return;
    }
    if (remaining === 0 || submitted || busy) return;
    const version = ++requestVersion.current; setBusy(true); setFeedback(null);
    try {
      const response = await maniaApi<PuzzleSubmissionResponse>(`/api/puzzles/${selected}/submit`, { sessionId: session.sessionId, ...(selected === 'pipeline-reorder' ? { orderIds: order } : { addresses }) });
      if (!mounted.current || version !== requestVersion.current) return;
      setSubmitted(true); setBoard(period === 'week' ? response.weekLeaderboard : response.leaderboard); setMayor(response.mayor); setPersonalBest(response.personalBest);
      setFeedback({ kind: 'success', message: `${summary} Your result is on the city board.` }); onProgress(); void refreshBoards();
    } catch (error) { if (mounted.current && version === requestVersion.current) setFeedback({ kind: 'error', message: message(error) }); }
    finally { if (mounted.current && version === requestVersion.current) setBusy(false); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(joinUrl); setCopied(true); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2400); }
    catch { setFeedback({ kind: 'error', message: 'Copy the puzzle link shown beside the QR code.' }); }
  };
  const currentCacheStep = cache.steps[Math.min(cacheStep, cache.steps.length - 1)];

  return <section className="puzzle-hub" aria-label="Cursed puzzles">
    <div className="puzzle-tabs" role="tablist" aria-label="Choose a cursed puzzle">
      {catalog.map(item => <button key={item.id} role="tab" aria-selected={selected === item.id} className={selected === item.id ? 'selected' : ''} onClick={() => selectPuzzle(item.id)}>
        <span className="puzzle-tab-icon" aria-hidden="true">{item.kind === 'pipeline' ? <GitBranch size={19} /> : <span className="cache-tab-glyph">▦</span>}</span>
        <span><strong>{item.title}</strong><small>{item.kind === 'pipeline' ? 'PIPELINING CITY' : 'CACHE HARBOUR'}</small></span><ChevronRight size={17} />
      </button>)}
    </div>
    {demo && <div className="puzzle-mode-note"><span>DEMO PROFILE</span> Practice and timed demo attempts stay local. Leave the demo profile to compete with your real name.</div>}
    {catalogError && <div className="puzzle-mode-note warning" role="status">{catalogError}</div>}
    <div className="puzzle-workspace">
      <article className="puzzle-challenge">
        <header className="puzzle-challenge-heading"><div><div className="puzzle-kicker">{session ? demo ? 'TIMED DEMO' : 'TIMED ATTEMPT' : 'THE CURSED PUZZLE'}</div><h2>{puzzle.title}</h2></div><span className={`puzzle-timer${active ? ' ticking' : ''}${remaining <= 10 && session && !submitted ? ' urgent' : ''}`}><Clock3 size={17} /><strong>{session ? submitted ? 'Done' : `${remaining}s` : `${puzzle.timeLimit}s`}</strong></span></header>
        <p className="puzzle-description">{puzzle.description}</p>
        <div className="puzzle-rule-strip"><span>{selected === 'pipeline-reorder' ? '8 instructions · forwarding on' : '16 reads · 2-way LRU · cold cache'}</span><span>{selected === 'pipeline-reorder' ? `Target: ${puzzle.optimumCycles ?? 12} cycles` : 'Target: every read misses'}</span></div>
        {selected === 'pipeline-reorder' ? <>
          <div className="puzzle-editor-label"><span>YOUR INSTRUCTION ORDER</span><small>Move independent work between dependencies.</small></div>
          <ol className="puzzle-instructions" aria-label="Instruction order">
            {order.map((id, index) => <li key={id}><span className="puzzle-order-index">{String(index + 1).padStart(2, '0')}</span><code><span>{id.toUpperCase()}</span>{instructionsById.get(id)?.text}</code><div className="puzzle-move-controls"><button aria-label={`Move instruction ${id.toUpperCase()} up`} onClick={() => move(index, -1)} disabled={editingDisabled || index === 0}><ArrowUp size={15} /></button><button aria-label={`Move instruction ${id.toUpperCase()} down`} onClick={() => move(index, 1)} disabled={editingDisabled || index === order.length - 1}><ArrowDown size={15} /></button></div></li>)}
          </ol>
          {!pipeline.valid && <div className="puzzle-dependency-error" role="status"><GitBranch size={17} /><div><strong>The program changes its meaning.</strong><p>{pipeline.reason} Restore this dependency before submitting.</p></div></div>}
          <details className="puzzle-dependencies"><summary>Why does order matter? <span>{dependencies.length} dependencies</span></summary><p>RAW: a value must be produced before it is read. WAR: a read must precede an overwrite. WAW: writes keep their original order.</p><div>{dependencies.map(edge => <span key={`${edge.before}-${edge.after}`} className={order.indexOf(edge.before) > order.indexOf(edge.after) ? 'violated' : ''}>{edge.before.toUpperCase()} → {edge.after.toUpperCase()} <small>{edge.reason}</small></span>)}</div></details>
        </> : <>
          <div className="puzzle-editor-label"><span>YOUR ACCESS TRACE</span><small>Choose the address of each read.</small></div>
          <div className="puzzle-access-grid">{addresses.map((address, index) => <label key={index} className={`puzzle-access${cache.steps[index].hit ? ' hit' : ' miss'}${cacheStep === index ? ' focused' : ''}`}><span>READ {String(index + 1).padStart(2, '0')}</span><select aria-label={`Address of read ${index + 1}`} value={address} disabled={editingDisabled} onFocus={() => setCacheStep(index)} onChange={event => { const value = Number(event.target.value); setAddresses(previous => previous.map((item, position) => position === index ? value : item)); setCacheStep(index); setFeedback(null); }}>{(puzzle.allowedAddresses ?? [...CACHE_PUZZLE_RULES.allowedAddresses]).map(value => <option key={value} value={value}>{value}</option>)}</select><small>{cache.steps[index].hit ? 'HIT' : 'MISS'}</small></label>)}</div>
          <p className="puzzle-cache-hint">Addresses 0, 32 and 64 all map to set 0. Only two blocks fit. A hit moves its block to the front of the LRU order.</p>
        </>}
        <div className="puzzle-preview-header"><button onClick={() => setPreviewOpen(!previewOpen)} aria-expanded={previewOpen}><Play size={14} />Simulation preview <ChevronRight size={14} className={previewOpen ? 'open' : ''} /></button><span>{selected === 'pipeline-reorder' ? `${simulation.totalCycles} cycles · ${simulation.stalls} stalls` : `${cache.misses}/16 misses · ${Math.round(cache.missRate * 100)}% miss rate`}{!localValid ? ' · invalid order' : ''}</span></div>
        {previewOpen && (selected === 'pipeline-reorder' ? <div className={`puzzle-pipeline-preview${pipeline.valid ? '' : ' invalid'}`}><div className="puzzle-preview-scroll"><table aria-label="Cycle-by-cycle pipeline preview"><thead><tr><th>Cycle</th>{simulation.cycles.map(cycle => <th key={cycle.cycle} className={cycle.hazards.length ? 'stall-cycle' : ''}>{cycle.cycle}</th>)}</tr></thead><tbody>{order.map(id => <tr key={id}><th>{id.toUpperCase()}</th>{simulation.cycles.map(cycle => { const stage = PIPELINE_STAGES.find(item => cycle.stages[item] === id); return <td key={cycle.cycle} className={cycle.hazards.length ? 'stall-cycle' : ''}>{stage && <span className={`puzzle-stage stage-${stage.toLowerCase()}`}>{stage}</span>}</td>; })}</tr>)}</tbody></table></div><p>{pipeline.valid ? 'Each column is one cycle. Highlighted columns hold IF/ID and insert an EX bubble on the next cycle.' : 'The simulator can run this order, but it no longer preserves the original program. Fix the dependency above.'}</p></div> : <div className="puzzle-cache-preview"><div className="puzzle-cache-step"><label htmlFor="puzzle-cache-scrub">Inspect read {cacheStep + 1}: address {currentCacheStep.address}</label><input id="puzzle-cache-scrub" type="range" min={0} max={15} value={cacheStep} onChange={event => setCacheStep(Number(event.target.value))} /><span className={currentCacheStep.hit ? 'hit' : 'miss'}>{currentCacheStep.hit ? 'Hit' : `${currentCacheStep.missType} miss`}</span></div><div className="puzzle-cache-set"><span>SET {currentCacheStep.index}</span>{currentCacheStep.sets[currentCacheStep.index].map(line => <span className={currentCacheStep.way === line.way ? 'selected' : ''} key={line.way}><small>WAY {line.way}</small><strong>{line.valid ? `block ${line.blockNumber}` : 'empty'}</strong></span>)}<p>MRU → LRU: {currentCacheStep.lruOrder.map(way => `way ${way}`).join(' → ')}{currentCacheStep.evictedBlock !== null ? ` · evicted block ${currentCacheStep.evictedBlock}` : ''}</p></div></div>)}
        {expired && <div className="puzzle-feedback error" role="status"><Clock3 size={18} /><p>Time is up. This attempt was not submitted. Start another round, or keep exploring in practice.</p></div>}
        {feedback && <div className={`puzzle-feedback ${feedback.kind}`} role="status">{feedback.kind === 'success' ? <Check size={18} /> : <GitBranch size={18} />}<p>{feedback.message}</p></div>}
        <div className="puzzle-actions">
          {active ? <button className="puzzle-primary" onClick={() => void finish()} disabled={busy || !localValid}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{demo ? 'Finish demo attempt' : 'Submit to the city board'}</button> : <button className="puzzle-primary" onClick={() => void startAttempt()} disabled={busy || (!demo && !catalogReady)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Clock3 size={16} />}{session ? 'Try another 60s round' : demo ? 'Try a timed demo' : 'Start a 60s attempt'}</button>}
          {!session && <button className="puzzle-secondary" onClick={() => void finish()} disabled={busy}>Check my solution</button>}
          <button className="puzzle-text-button" onClick={resetPractice} disabled={busy}><RotateCcw size={14} />{session ? 'Back to practice' : 'Reset'}</button>
        </div>
        <div className="puzzle-footer"><span>{demo ? 'Demo attempts are checked locally and stay on this device.' : active ? 'The server checks your solution and your timer.' : 'Practice freely. Timed attempts earn a place on the board.'}</span><button onClick={() => onReviewLecture(puzzle.kind)}>Review the lecture <ExternalLink size={12} /></button></div>
      </article>
      <aside className="puzzle-aside">
        <section className="puzzle-board-card"><div className="puzzle-board-heading"><h3>City board</h3><Trophy size={18} /></div><p className="puzzle-board-caption">{demo ? 'Live competition uses real student profiles.' : 'Best valid result per student. Faster attempts break ties.'}</p>
          {demo ? <div className="puzzle-board-empty"><Crown size={28} /><p>Your demo has no public rank.</p><span>Return to your own profile to claim this city.</span></div> : <><div className="puzzle-board-period"><button className={period === 'all' ? 'selected' : ''} onClick={() => setPeriod('all')}>All time</button><button className={period === 'week' ? 'selected' : ''} onClick={() => setPeriod('week')}>This week</button></div>{mayor && <div className="puzzle-mayor"><Crown size={20} /><div><small>MAYOR OF {selected === 'pipeline-reorder' ? 'PIPELINING' : 'CACHE HARBOUR'}</small><strong>{mayor.name}</strong></div></div>}<Leaderboard entries={board} loading={boardLoading} problem={boardError} />{personalBest && <div className="puzzle-personal-best"><span>Your personal best</span><strong>{performance(personalBest)}</strong><small>{personalBest.rank > 0 ? `#${personalBest.rank} on the all-time board` : 'Saved to your profile'}</small></div>}{boardError && Boolean(board.length) && <p className="puzzle-board-error" role="status">Showing the last update. {boardError}</p>}<div className="puzzle-board-status"><span className={boardError ? '' : 'online'} />{boardError ? 'Waiting to reconnect' : 'Refreshes every 8 seconds'}</div></>}
        </section>
        <section className="puzzle-join-card"><div><span className="puzzle-kicker">A CURSE IS BETTER SHARED</span><h3>Can your friends beat it?</h3><p>Scan to join this puzzle. Every player gets their own 60-second clock.</p></div><div className="puzzle-share-row"><a href={joinUrl} aria-label="Open the shared puzzle"><PuzzleQR url={joinUrl} /></a><div><a className="puzzle-join-url" href={joinUrl}>{joinUrl}</a><button className="puzzle-secondary" onClick={() => void copyLink()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Link copied' : 'Copy puzzle link'}</button></div></div><button className="puzzle-projector-button" onClick={() => setProjector(true)}><Maximize2 size={16} />Put it on the big screen<ChevronRight size={15} /></button></section>
      </aside>
    </div>
    {!demo && <section className="puzzle-weekly"><div className="puzzle-weekly-intro"><div className="puzzle-kicker">THIS WEEK AT ETH</div><h3>Two machines. One board.</h3><p>The sum of your best normalized puzzle scores this week. Up to 1,000 per puzzle.</p></div>{globalBoard.length ? <ol>{globalBoard.slice(0, 5).map(entry => <li key={entry.userId}><span>{entry.rank === 1 ? <Crown size={16} /> : `0${entry.rank}`}</span><strong>{entry.name}</strong><small>{entry.puzzlesSolved} {entry.puzzlesSolved === 1 ? 'puzzle' : 'puzzles'}</small><b>{entry.normalizedScore.toLocaleString()}</b></li>)}</ol> : <p className="puzzle-weekly-empty">{boardLoading ? 'Loading this week’s results…' : boardError ? 'The weekly board is temporarily unavailable.' : 'No timed results this week yet. Yours could be the first.'}</p>}</section>}
    {projector && <div ref={projectorPanel} className="puzzle-projector" role="dialog" aria-modal="true" aria-labelledby="puzzle-projector-title"><div className="puzzle-projector-bar"><span>THE MANIA <small>LIVE CURSED PUZZLE</small></span><button aria-label="Close projector mode" onClick={() => setProjector(false)}><X size={24} /></button></div><div className="puzzle-projector-layout"><div className="puzzle-projector-challenge"><div className="puzzle-kicker">{selected === 'pipeline-reorder' ? 'REORDER. REMOVE THE STALLS.' : 'THREE BLOCKS. TWO WAYS.'}</div><h2 id="puzzle-projector-title">{puzzle.title}</h2><p>{selected === 'pipeline-reorder' ? 'Eight instructions. Fewest cycles. Your name on the board.' : 'Sixteen reads. Most misses. Your name on the board.'}</p><div className="puzzle-projector-join"><PuzzleQR url={joinUrl} /><div><span className={`puzzle-room-timer${roomRemaining <= 10 && roomDeadline ? ' urgent' : ''}`}>{String(roomRemaining).padStart(2, '0')}<small>SECONDS</small></span><button className="puzzle-primary" onClick={() => { setRoomDeadline(Date.now() + puzzle.timeLimit * 1000); setNow(Date.now()); }}><Play size={17} />{roomDeadline ? 'Restart room countdown' : 'Start room countdown'}</button></div></div><a className="puzzle-projector-link" href={joinUrl}>{joinUrl}</a><p className="puzzle-projector-instruction">Scan → start your own 60-second attempt → submit before it ends.</p>{roomDeadline && roomRemaining === 0 && <p className="puzzle-round-complete" role="status">Room countdown finished. Watch the final results arrive.</p>}{demo && <div className="puzzle-mode-note">Demo profile · no live competition shown</div>}</div><section className="puzzle-projector-board"><div className="puzzle-board-heading"><h3>Live city board</h3><span>{period === 'week' ? 'THIS WEEK' : 'ALL TIME'}</span></div>{demo ? <div className="puzzle-board-empty"><Trophy size={40} /><p>Switch to a real profile to host the live board.</p></div> : <Leaderboard entries={board} loading={boardLoading} problem={boardError} compact />}<p className="puzzle-projector-board-note">{demo ? 'Demo attempts stay local.' : 'Real students. Server-checked solutions. Updated every 8 seconds.'}</p></section></div></div>}
  </section>;
}
