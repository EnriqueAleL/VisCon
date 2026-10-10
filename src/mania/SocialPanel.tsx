import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CloudLightning, Copy, Crown, Globe2, LoaderCircle, MapPin, Plus, Radio, RotateCcw, Swords, Users, X } from 'lucide-react';
import type { WorldCity } from '../../shared/world';
import type { SharedVisualizerState, SocialSnapshot, StudyAck, StudyTable } from '../../shared/social';
import type { RoomView } from '../../shared/types';
import { PIPELINE_PRESETS, PIPELINE_STAGES, simulatePipeline } from '../../shared/pipeline';
import { CACHE_DEMO_CONFIG, CACHE_PRESETS, emptyCacheSets, simulateCache } from '../../shared/cache';
import './social.css';

export interface SocialPanelProps { cityId: string; cityName: string; demo: boolean; cities?: WorldCity[] }
const PLACES = ['HG library', 'CAB', 'Polyterrasse', 'Online'];
const CACHE_DESIGNS = [{ id: 'direct', name: 'Direct mapped' }, { id: 'twoWay', name: '2-way' }, { id: 'fully', name: 'Fully associative' }] as const;
const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
const initialState = (kind: SharedVisualizerState['kind']): SharedVisualizerState => kind === 'cache'
  ? { kind, step: 0, preset: 'conflicts', design: 'twoWay' }
  : kind === 'virtual-memory' ? { kind, step: 0, preset: 'page-walk' }
    : { kind: 'pipeline', step: 0, preset: 'load-use', forwarding: true };

function localTimeInput() {
  const date = new Date(Date.now() + 15 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function meetingTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }).format(date) : 'Time unavailable';
}
async function socialRequest<T>(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', signal, method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

function SharedVisualizer({ table, canControl, busy, onState }: {
  table: StudyTable; canControl: boolean; busy: boolean; onState: (state: SharedVisualizerState) => void;
}) {
  const state = table.state;
  const model = useMemo(() => {
    try {
      if (state.kind === 'pipeline') {
        const preset = PIPELINE_PRESETS.find(item => item.id === state.preset) ?? PIPELINE_PRESETS[0];
        const simulation = simulatePipeline(state.source ?? preset.source, { forwarding: state.forwarding });
        return { kind: 'pipeline' as const, simulation, error: '' };
      }
      if (state.kind === 'cache') {
        const preset = CACHE_PRESETS.find(item => item.id === state.preset) ?? CACHE_PRESETS[0];
        const addresses = state.addresses ?? [...preset.addresses];
        const config = { ...CACHE_DEMO_CONFIG, ...state.config,
          associativity: state.design === 'direct' ? 1 : state.design === 'twoWay' ? 2 : 'fully' as const };
        return { kind: 'cache' as const, simulation: simulateCache(addresses, config), addresses, error: '' };
      }
      return { kind: 'virtual-memory' as const, error: '' };
    } catch (error) { return { kind: 'error' as const, error: (error as Error).message }; }
  }, [state]);
  const maxStep = model.kind === 'pipeline' ? model.simulation.totalCycles : model.kind === 'cache' ? model.simulation.steps.length : 4;
  const changePreset = (preset: string) => {
    if (state.kind === 'pipeline') onState({ kind: state.kind, step: 0, preset, forwarding: state.forwarding });
    else if (state.kind === 'cache') onState({ kind: state.kind, step: 0, preset, design: state.design });
  };
  const locked = !canControl || busy;
  return <section className="study-shared" aria-label="Synchronized study visualizer">
    <div className="study-shared-heading"><div><span className="section-kicker">ONE TABLE / ONE SHARED VIEW</span><h3>{state.kind === 'pipeline' ? 'Pipeline Factory' : state.kind === 'cache' ? 'Cache Harbour' : 'Page Walk'}</h3></div><span className="study-version">Shared with the table</span></div>
    <p className="study-host-note">{canControl ? 'You host this table. Every step you take appears for everyone.' : `${table.hostName} controls the shared steps. Follow along and discuss what happens next.`}</p>
    {canControl && <div className="study-kind-picker" aria-label="Shared concept">
      {[{ kind: 'pipeline' as const, name: 'Pipeline' }, { kind: 'cache' as const, name: 'Cache' }, { kind: 'virtual-memory' as const, name: 'Page walk' }].map(item => <button type="button" key={item.kind} disabled={busy} className={state.kind === item.kind ? 'active' : ''} onClick={() => onState(initialState(item.kind))}>{item.name}</button>)}
    </div>}
    {state.kind !== 'virtual-memory' && <div className="study-shared-options"><label>Teaching example<select value={state.preset} disabled={locked} onChange={event => changePreset(event.target.value)}>{state.kind === 'pipeline' ? PIPELINE_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>) : CACHE_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.title}</option>)}</select></label>
      {state.kind === 'pipeline' ? <label className="study-forwarding"><input type="checkbox" checked={state.forwarding} disabled={locked} onChange={event => onState({ ...state, step: 0, forwarding: event.target.checked })} />Forwarding</label> : <label>Cache design<select value={state.design} disabled={locked} onChange={event => onState({ ...state, step: 0, design: event.target.value as 'direct' | 'twoWay' | 'fully' })}>{CACHE_DESIGNS.map(design => <option key={design.id} value={design.id}>{design.name}</option>)}</select></label>}
    </div>}
    {model.kind === 'error' && <p className="mania-error" role="alert">{model.error}</p>}
    {model.kind === 'pipeline' && (() => {
      const cycle = model.simulation.cycles[state.step - 1];
      const instruction = (id: string | null) => model.simulation.instructions.find(item => item.id === id);
      const stalls = model.simulation.cycles.slice(0, state.step).filter(item => item.hazards.length).length;
      return <div className="study-pipeline"><div className="study-pipeline-stages" aria-label={`Pipeline at cycle ${state.step}`}>{PIPELINE_STAGES.map(stage => <div key={stage} className={`study-pipeline-stage ${stage === 'EX' && cycle?.bubble ? 'bubble' : ''}`}><span>{stage}</span><strong>{instruction(cycle?.stages[stage] ?? null)?.id.toUpperCase() ?? (stage === 'EX' && cycle?.bubble ? 'BUBBLE' : '—')}</strong><small>{instruction(cycle?.stages[stage] ?? null)?.text ?? (stage === 'EX' && cycle?.bubble ? 'Interlock stall' : state.step ? 'Empty stage' : 'Ready')}</small></div>)}</div>
        <div className="study-trace-stats"><span><strong>{state.step}</strong> cycles stepped</span><span><strong>{stalls}</strong> stalls so far</span><span><strong>{cycle?.completed ?? 0}</strong> completed</span></div>
        <div className="study-cycle-note" aria-live="polite">{cycle?.hazards.length ? <span className="study-hazard">{cycle.hazards.map(item => `${item.consumerId.toUpperCase()} waits for ${item.register} from ${item.producerId.toUpperCase()}`).join(' · ')}. A bubble enters EX next cycle.</span> : cycle?.forwarding.length ? <span>{cycle.forwarding.map(item => `${item.register}: ${item.from} → EX`).join(' · ')}. The result bypasses the register file.</span> : state.step === 0 ? 'The table host can step the first instruction into IF.' : state.step === maxStep ? 'Every instruction has completed writeback.' : cycle?.bubble ? 'The bubble is in EX while the producer moves ahead.' : 'No interlock in this cycle.'}</div>
        <ol className="study-instruction-list">{model.simulation.instructions.map(item => <li key={item.id}><span>{item.id.toUpperCase()}</span><code>{item.text}</code><small>{cycle && PIPELINE_STAGES.find(stage => cycle.stages[stage] === item.id) || ''}</small></li>)}</ol>
      </div>;
    })()}
    {model.kind === 'cache' && (() => {
      const last = model.simulation.steps[state.step - 1];
      const sets = last?.sets ?? emptyCacheSets(model.simulation.geometry);
      return <div className="study-cache"><div className="study-cache-address"><span>{last ? hex(last.address) : 'No access yet'}</span><strong className={last ? last.hit ? 'hit' : 'miss' : ''}>{last ? last.hit ? 'HIT' : 'MISS' : 'READY'}</strong>{last && <small>tag {last.tag} <i>|</i> set {last.index} <i>|</i> byte {last.offset}</small>}</div>
        <div className="study-cache-grid">{sets.map((set, index) => <div className={`study-cache-set ${last?.index === index ? 'active' : ''}`} key={index}><span>Set {index}</span><div>{set.map(line => <div key={line.way} className={`study-cache-line ${line.valid ? 'valid' : ''} ${last?.index === index && last.way === line.way ? last.hit ? 'hit' : 'miss' : ''}`}><small>WAY {line.way}{last?.index === index && last.lruOrder[0] === line.way ? ' · MRU' : ''}</small><strong>{line.valid ? hex(line.blockNumber! * model.simulation.geometry.blockBytes) : 'Empty'}</strong><small>{line.valid ? `tag ${line.tag}` : 'valid = 0'}</small></div>)}</div></div>)}</div>
        <div className="study-trace-stats"><span><strong>{last?.hits ?? 0}</strong> hits</span><span><strong>{last?.misses ?? 0}</strong> misses</span><span><strong>{state.step ? Math.round(last!.misses / state.step * 100) : 0}%</strong> miss rate</span></div>
        <div className="study-cycle-note" aria-live="polite">{last ? last.hit ? 'The valid tag matches. LRU moves this way to most recently used.' : `${last.missType} miss.${last.evictedBlock !== null ? ` Block ${hex(last.evictedBlock * model.simulation.geometry.blockBytes)} was evicted.` : ' The block is loaded into an empty way.'}` : 'The table host can follow the first byte address into the cache.'}</div>
        <div className="study-access-list" aria-label="Shared byte address sequence">{model.addresses.map((address, index) => <span key={index} className={index === state.step - 1 ? 'current' : index < state.step ? 'visited' : ''}>{hex(address)}</span>)}</div>
      </div>;
    })()}
    {model.kind === 'virtual-memory' && state.kind === 'virtual-memory' && <div className="study-page-walk"><p>Teaching model: 16-bit virtual addresses, two levels with four entries each, 4 KiB pages.</p><div className="study-page-address"><span>L1 index<strong>{((state.virtualAddress ?? 0xABCD) >>> 14) & 3}</strong><small>bits 15–14</small></span><span>L2 index<strong>{((state.virtualAddress ?? 0xABCD) >>> 12) & 3}</strong><small>bits 13–12</small></span><span>Offset<strong>{hex((state.virtualAddress ?? 0xABCD) & 0xFFF)}</strong><small>bits 11–0</small></span></div><ol>{['Start with the virtual address.', 'Check the TLB for a cached translation.', 'On a TLB miss, use the L1 index to find the next table.', 'Use the L2 index to find the page-table entry.', 'Check permissions, then combine the physical frame with the unchanged offset.'].map((label, index) => <li key={label} className={index === state.step ? 'current' : index < state.step ? 'visited' : ''}><span>{index}</span>{label}</li>)}</ol><small>This view shows the lookup sequence; it does not simulate page-table contents or faults.</small></div>}
    <div className="study-shared-transport"><button type="button" className="secondary-button" aria-label="Reset shared visualizer" disabled={locked || !state.step} onClick={() => onState({ ...state, step: 0 })}><RotateCcw size={15} /></button><button type="button" className="secondary-button" aria-label="Previous shared step" disabled={locked || !state.step} onClick={() => onState({ ...state, step: Math.max(0, state.step - 1) })}><ArrowLeft size={15} /></button><span>{state.kind === 'pipeline' ? 'Cycle' : state.kind === 'cache' ? 'Access' : 'Step'} <strong>{state.step}</strong> / {maxStep}</span><button type="button" className="primary-button" disabled={locked || state.step >= maxStep || model.kind === 'error'} onClick={() => onState({ ...state, step: Math.min(maxStep, state.step + 1) })}>{busy ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}{canControl ? state.step >= maxStep ? 'Complete' : 'Step together' : 'Following host'}</button></div>
  </section>;
}

export default function SocialPanel({ cityId, cityName, demo, cities }: SocialPanelProps) {
  const formId = useId();
  const [selectedCity, setSelectedCity] = useState(cityId);
  const [snapshot, setSnapshot] = useState<SocialSnapshot | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(() => new URLSearchParams(location.search).get('table'));
  const [loading, setLoading] = useState(true), [connected, setConnected] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false), [topic, setTopic] = useState(''), [place, setPlace] = useState(PLACES[0]);
  const [time, setTime] = useState(localTimeInput), [kind, setKind] = useState<SharedVisualizerState['kind']>('pipeline');
  const [retry, setRetry] = useState(0), [tableLink, setTableLink] = useState('');
  const socket = useRef<Socket | null>(null), generation = useRef(0), requests = useRef(new Set<AbortController>()), busyLock = useRef(false);
  const cityRef = useRef(selectedCity);
  cityRef.current = selectedCity;
  const suffix = demo ? '?demo=1' : '';
  const selectedName = cities?.find(city => city.id === selectedCity)?.name ?? (selectedCity === cityId ? cityName : selectedCity);
  const activeTable = snapshot?.tables.find(table => table.id === selectedTableId) ?? null;
  const joined = !!activeTable?.members.some(member => member.userId === snapshot?.identity.id);
  const isHost = !demo && !!activeTable && joined && activeTable.hostId === snapshot?.identity.id;
  const presence = snapshot?.presence.find(item => item.cityId === selectedCity);
  const weather = snapshot?.weather.find(item => item.cityId === selectedCity);
  const mayor = snapshot?.mayors.find(item => item.cityId === selectedCity);
  const hasCityPuzzle = selectedCity === 'pipelining' || selectedCity === 'caches';
  const tables = (snapshot?.tables ?? []).filter(table => table.cityId === selectedCity || table.id === selectedTableId);

  useEffect(() => { setSelectedCity(cityId); }, [cityId]);
  useEffect(() => {
    const visualizer = cities?.find(city => city.id === selectedCity)?.visualizer;
    setKind(visualizer ?? (/cache/i.test(selectedCity) ? 'cache' : /virtual/i.test(selectedCity) ? 'virtual-memory' : 'pipeline'));
  }, [selectedCity, cities]);
  const upsertTable = (table: StudyTable) => setSnapshot(current => {
    if (!current || (current.tables.find(item => item.id === table.id)?.version ?? -1) > table.version) return current;
    return { ...current, tables: [...current.tables.filter(item => item.id !== table.id), table].sort((a, b) => a.time.localeCompare(b.time)) };
  });

  useEffect(() => {
    const epoch = ++generation.current;
    const controller = new AbortController();
    requests.current.add(controller);
    busyLock.current = false;
    setLoading(true); setConnected(false); setSnapshot(null); setError(''); setNotice(''); setBusy(''); setCreating(false); setTableLink('');
    const update = (data: SocialSnapshot) => { if (generation.current === epoch) setSnapshot(current => ({ ...data,
      tables: data.tables.map(table => { const prior = current?.tables.find(item => item.id === table.id); return prior && prior.version > table.version ? prior : table; }),
    })); };
    const refresh = () => socialRequest<SocialSnapshot>(`/api/social${demo ? '?demo=1' : ''}`, controller.signal).then(update);
    refresh().then(() => {
      if (controller.signal.aborted || generation.current !== epoch) return;
      const live = io('/study', { auth: { demo } });
      socket.current = live;
      live.on('connect', () => { if (generation.current === epoch) { setConnected(true); live.emit('city:enter', { cityId: cityRef.current }); } });
      live.on('disconnect', () => { if (generation.current === epoch) setConnected(false); });
      live.on('connect_error', () => { if (generation.current === epoch) setConnected(false); });
      live.on('social:snapshot', update);
      live.on('table:update', (table: StudyTable) => { if (generation.current === epoch) upsertTable(table); });
      live.on('table:ended', ({ tableId }: { tableId: string }) => {
        if (generation.current !== epoch) return;
        setSnapshot(current => current ? { ...current, tables: current.tables.filter(table => table.id !== tableId) } : current);
        setSelectedTableId(current => current === tableId ? null : current);
        setNotice('A study table has ended. You can open another.');
      });
      live.on('study:error', (data: { error: string }) => { if (generation.current === epoch) setError(data.error); });
    }).catch((failure: Error) => { if (!controller.signal.aborted && generation.current === epoch) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted && generation.current === epoch) setLoading(false); });
    const poll = setInterval(() => { if (!controller.signal.aborted) refresh().catch(() => {}); }, 25_000);
    return () => {
      ++generation.current;
      clearInterval(poll);
      for (const request of requests.current) request.abort();
      requests.current.clear();
      socket.current?.disconnect(); socket.current = null;
    };
  }, [demo, retry]);
  useEffect(() => { if (socket.current?.connected) socket.current.emit('city:enter', { cityId: selectedCity }); }, [selectedCity, connected]);

  async function request<T>(path: string, method = 'GET', body?: unknown) {
    const controller = new AbortController(); requests.current.add(controller);
    try { return await socialRequest<T>(path, controller.signal, method, body); }
    finally { requests.current.delete(controller); }
  }
  async function socketAction<T>(event: string, body: unknown): Promise<T> {
    const live = socket.current;
    if (!live?.connected) throw new Error('Live connection unavailable. Please reconnect and try again.');
    return new Promise<T>((resolve, reject) => {
      live.timeout(7_000).emit(event, body, (failure: Error | null, result: StudyAck<T>) => {
        if (failure) reject(new Error('The live connection was interrupted. Reconnect to check the latest table state.'));
        else if (result.ok) resolve(result.data);
        else reject(new Error(result.error));
      });
    });
  }
  async function action(label: string, work: () => Promise<void>) {
    if (busyLock.current) return;
    if (demo || snapshot?.identity.demo) { setError('Turn off demo history to join live study tables or challenge a friend.'); return; }
    const epoch = generation.current; busyLock.current = true;
    setBusy(label); setError(''); setNotice(''); setTableLink('');
    try { await work(); }
    catch (failure) { if (generation.current === epoch && (failure as Error).name !== 'AbortError') setError((failure as Error).message); }
    finally { if (generation.current === epoch) { busyLock.current = false; setBusy(''); } }
  }
  async function joinTable(table: StudyTable) {
    const epoch = generation.current;
    await action(`join:${table.id}`, async () => {
      const joinedTable = socket.current?.connected
        ? await socketAction<StudyTable>('table:join', { tableId: table.id })
        : (await request<{ table: StudyTable }>(`/api/study/tables/${encodeURIComponent(table.id)}/join`, 'POST', {})).table;
      if (generation.current !== epoch) return;
      upsertTable(joinedTable); setSelectedTableId(joinedTable.id); setSelectedCity(joinedTable.cityId);
      setNotice(`You joined ${joinedTable.topic}.`);
    });
  }
  async function leaveTable(table: StudyTable) {
    const epoch = generation.current;
    await action('leave', async () => {
      const next = socket.current?.connected
        ? await socketAction<StudyTable | null>('table:leave', { tableId: table.id })
        : (await request<{ table: StudyTable | null }>(`/api/study/tables/${encodeURIComponent(table.id)}/leave`, 'POST', {})).table;
      if (generation.current !== epoch) return;
      if (next) upsertTable(next);
      else setSnapshot(current => current ? { ...current, tables: current.tables.filter(item => item.id !== table.id) } : current);
      setSelectedTableId(null); setNotice('You left the study table.');
    });
  }
  async function createTable(event: FormEvent) {
    event.preventDefault();
    const when = new Date(time);
    if (!Number.isFinite(when.getTime())) { setError('Choose a valid meeting date and time.'); return; }
    const epoch = generation.current;
    await action('create', async () => {
      const { table } = await request<{ table: StudyTable }>(`/api/study/tables${suffix}`, 'POST', { cityId: selectedCity, topic: topic.trim(), place: place.trim(), time: when.toISOString(), state: initialState(kind) });
      if (generation.current !== epoch) return;
      upsertTable(table); setSelectedTableId(table.id); setCreating(false); setTopic('');
      setNotice('Your table is open. Share the link so your classmates can join.');
      if (socket.current?.connected) {
        const watching = await socketAction<StudyTable>('table:join', { tableId: table.id });
        if (generation.current === epoch) upsertTable(watching);
      }
    });
  }
  async function updateSharedState(state: SharedVisualizerState) {
    if (!activeTable || !isHost) return;
    const epoch = generation.current, table = activeTable;
    await action('state', async () => {
      const next = socket.current?.connected
        ? await socketAction<StudyTable>('table:state', { tableId: table.id, state, version: table.version })
        : (await request<{ table: StudyTable }>(`/api/study/tables/${encodeURIComponent(table.id)}/state`, 'PUT', { state, version: table.version })).table;
      if (generation.current === epoch) upsertTable(next);
    });
  }
  async function shareTable(table: StudyTable) {
    const epoch = generation.current;
    const url = new URL('/', location.origin); url.searchParams.set('table', table.id); url.searchParams.set('city', table.cityId); url.searchParams.set('planet', '1');
    try { await navigator.clipboard.writeText(url.toString()); if (generation.current === epoch) setNotice('Study table link copied.'); }
    catch { if (generation.current === epoch) { setTableLink(url.toString()); setNotice('Copy the study table link below.'); } }
  }
  async function challengeFriend() {
    const epoch = generation.current;
    await action('duel', async () => {
      const room = await request<RoomView>(`/api/mania/cities/${encodeURIComponent(selectedCity)}/duel${suffix}`, 'POST', {});
      if (generation.current === epoch) location.assign(`/room/${encodeURIComponent(room.id)}`);
    });
  }

  if (loading) return <div className="mania-loading"><LoaderCircle className="spin" size={20} />Finding your classmates…</div>;
  if (!snapshot) return <div className="study-panel"><p className="mania-error" role="alert">{error || 'Study tables are unavailable right now.'}</p><button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>;
  return <section className="study-panel" aria-label={`Study together in ${selectedName}`}>
    <header className="study-header"><div><span className="section-kicker">STUDY TOGETHER</span><h2>{selectedName}</h2><p>A real meeting. A shared concept. One step at a time.</p></div><span className={`study-live-status ${connected ? 'online' : ''}`}><Radio size={13} />{connected ? 'Live' : 'Reconnecting'}</span></header>
    {cities && <label className="study-city-select">Find a city<select value={selectedCity} onChange={event => { setSelectedCity(event.target.value); setSelectedTableId(null); setCreating(false); }}>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>}
    {demo && <div className="mania-banner"><Globe2 size={14} /><span>These are real community statistics. Turn off demo history to create or join a table.</span></div>}
    <div className="study-community"><article><span className="study-community-icon"><Users size={20} /></span><div><strong>{presence?.count ?? 0}</strong><span>studying here now</span></div></article><article className={weather?.storm ? 'storm' : ''}><span className="study-community-icon"><CloudLightning size={20} /></span><div><strong>{weather?.totalAnswers ? weather.students < 3 ? 'Gathering answers' : weather.storm ? 'A little stormy' : 'Clear skies' : 'No weather yet'}</strong><span>{weather?.totalAnswers ? `${Math.round(weather.wrongRate * 100)}% missed · ${weather.totalAnswers} answers from ${weather.students} students` : 'Class weather appears after enough recall practice.'}</span></div></article><article><span className="study-community-icon"><Crown size={20} /></span><div><strong>{mayor?.name ?? (hasCityPuzzle ? 'Mayor wanted' : 'No puzzle yet')}</strong><span>{mayor ? mayor.cycles !== null ? `${mayor.cycles} cycles · best pipeline puzzle` : `${mayor.misses} misses · best cache puzzle` : hasCityPuzzle ? 'Solve a Cursed Puzzle to claim the city.' : 'Mayors appear in cities with Cursed Puzzles.'}</span></div></article></div>
    {error && <p className="mania-error" role="alert">{error}<button className="study-dismiss" aria-label="Dismiss error" type="button" onClick={() => setError('')}><X size={13} /></button></p>}
    {notice && <p className="study-notice" role="status"><Check size={14} />{notice}</p>}
    {tableLink && <label className="study-share-link">Study table link<input readOnly value={tableLink} onFocus={event => event.target.select()} /></label>}
    <div className="study-toolbar"><div><h3>Study tables</h3><p>{tables.length ? `${tables.length} ${tables.length === 1 ? 'table' : 'tables'} in this city` : 'Be the first to open a table here.'}</p></div><div><button type="button" className="secondary-button" disabled={demo || !!busy} onClick={challengeFriend}>{busy === 'duel' ? <LoaderCircle size={14} className="spin" /> : <Swords size={14} />}Challenge a friend</button><button type="button" className="primary-button" disabled={demo || !!busy} onClick={() => { setCreating(value => !value); setError(''); }}><Plus size={15} />Open a table</button></div></div>
    {creating && <form className="study-create" onSubmit={createTable}><div className="study-create-title"><h3>Make room for a concept.</h3><button className="study-dismiss" type="button" aria-label="Close study table form" onClick={() => setCreating(false)}><X size={17} /></button></div><label htmlFor={`${formId}-topic`}>What are you working on?<input id={`${formId}-topic`} required minLength={2} maxLength={120} placeholder="Load-use hazards, together" value={topic} onChange={event => setTopic(event.target.value)} /></label><div className="study-form-row"><label htmlFor={`${formId}-place`}>Meet at<input id={`${formId}-place`} list={`${formId}-places`} required minLength={2} maxLength={120} value={place} onChange={event => setPlace(event.target.value)} /><datalist id={`${formId}-places`}>{PLACES.map(item => <option key={item} value={item} />)}</datalist></label><label htmlFor={`${formId}-time`}>Date and time<input id={`${formId}-time`} type="datetime-local" required value={time} onChange={event => setTime(event.target.value)} /></label><label htmlFor={`${formId}-kind`}>Shared visualizer<select id={`${formId}-kind`} value={kind} onChange={event => setKind(event.target.value as SharedVisualizerState['kind'])}><option value="pipeline">Pipeline Factory</option><option value="cache">Cache Harbour</option><option value="virtual-memory">Page Walk</option></select></label></div><div className="study-create-footer"><p>Your classmates can join by link. You control the shared steps.</p><button type="submit" className="primary-button" disabled={!!busy}>{busy === 'create' ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}Create study table</button></div></form>}
    {selectedTableId && !activeTable && <div className="study-empty"><CalendarDays size={24} /><h3>This study table has ended.</h3><p>Open a new table, or choose one below.</p><button className="text-action" type="button" onClick={() => setSelectedTableId(null)}>Dismiss <X size={13} /></button></div>}
    {tables.length === 0 && !creating && !selectedTableId ? <div className="study-empty"><Users size={26} /><h3>Understanding is easier together.</h3><p>Meet at HG, CAB, or online. Everyone at the table sees the same visualizer.</p><button type="button" className="text-action" disabled={demo} onClick={() => setCreating(true)}>Open the first table <ArrowRight size={13} /></button></div> : <div className="study-table-list">{tables.map(table => { const member = table.members.some(item => item.userId === snapshot.identity.id); return <article key={table.id} className={`study-table-card ${table.id === selectedTableId ? 'selected' : ''}`}><div><span className="study-table-concept">{table.state.kind === 'pipeline' ? 'PIPELINE FACTORY' : table.state.kind === 'cache' ? 'CACHE HARBOUR' : 'PAGE WALK'}</span><h3>{table.topic}</h3><p className="study-table-meta"><span><MapPin size={12} />{table.place}</span><span><CalendarDays size={12} />{meetingTime(table.time)}</span></p><p className="study-table-host">Hosted by {table.hostName} <i>·</i> {table.members.length} {table.members.length === 1 ? 'person' : 'people'} <i>·</i> {table.members.filter(item => item.online).length} online</p></div><div className="study-table-actions"><button type="button" className="secondary-button" aria-label={`Share ${table.topic}`} onClick={() => shareTable(table)}><Copy size={14} /></button><button type="button" className={table.id === selectedTableId ? 'secondary-button' : 'primary-button'} disabled={demo || !!busy} onClick={() => member ? setSelectedTableId(table.id) : joinTable(table)}>{busy === `join:${table.id}` ? <LoaderCircle className="spin" size={14} /> : <ArrowRight size={14} />}{member ? table.id === selectedTableId ? 'Open' : 'Return' : 'Join table'}</button></div></article>; })}</div>}
    {activeTable && joined && !demo && <div className="study-table-workspace"><div className="study-table-room-heading"><div><span className="section-kicker">YOUR STUDY TABLE</span><h3>{activeTable.topic}</h3><p>{activeTable.place} <i>·</i> {meetingTime(activeTable.time)}</p></div><div><button className="secondary-button" type="button" onClick={() => shareTable(activeTable)}><Copy size={14} />Share link</button><button className="secondary-button" type="button" disabled={!!busy} onClick={() => leaveTable(activeTable)}>{busy === 'leave' ? <LoaderCircle size={14} className="spin" /> : <X size={14} />}Leave table</button></div></div><div className="study-members" aria-label="Study table members">{activeTable.members.map(member => <span key={member.userId} className={member.online ? 'online' : ''}><i />{member.name}{member.userId === activeTable.hostId && <Crown size={11} />}{member.userId === snapshot.identity.id && <small>you</small>}</span>)}</div><SharedVisualizer table={activeTable} canControl={isHost} busy={!!busy} onState={updateSharedState} /></div>}
    {activeTable && !joined && <div className="study-invite"><Users size={20} /><div><h3>You’re invited to {activeTable.topic}.</h3><p>Join to see {activeTable.hostName}’s shared visualizer and study with the table.</p></div><button className="primary-button" type="button" disabled={demo || !!busy} onClick={() => joinTable(activeTable)}>Join table <ArrowRight size={14} /></button></div>}
    <p className="study-data-note">Presence counts connected students once per city. Class weather comes from aggregate recall answers. Mayors earn their titles through verified puzzle results.</p>
  </section>;
}
