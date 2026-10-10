import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, BookOpen, Calendar, Check, Clock, Compass, Cpu, FlaskConical, GitBranch, Globe2, Info, Layers3, LoaderCircle, Map, Route, Search, Settings2, ShieldCheck, Sparkles, Swords, Trophy, Users, X } from 'lucide-react';
import type { LearningSnapshot, LectureMoment, ReviewResponse, WorldCity, WorldData } from '../../shared/world';
import { lectureVisualizerForMoment, type LectureVisualizerLink } from '../../shared/lecture-visualizers';
import SemesterMap from './SemesterMap';
import RecallQuest from './RecallQuest';
import { maniaApi, timestamp } from './api';
import { ProductHeader } from '../../shared/design/ProductHeader';
import { watchSocketAccess } from '../../shared/auth/socketAccess';
import './mania.css';

const PipelineVisualizer = lazy(() => import('./PipelineVisualizer'));
const CacheVisualizer = lazy(() => import('./CacheVisualizer'));
const LectureMomentPanel = lazy(() => import('./LectureMomentPanel'));
const SocialPanel = lazy(() => import('./SocialPanel'));
const PuzzleHub = lazy(() => import('./PuzzleHub'));
const VirtualMemoryVisualizer = lazy(() => import('./VirtualMemoryVisualizer'));
const MockExam = lazy(() => import('./MockExam'));

type View = 'world' | 'expedition' | 'puzzles' | 'tables';
type CityTab = 'moments' | 'recall' | 'landmark' | 'together';
interface AskSource { id: string; lectureId: string; title: string; start: number; end: number; transcript: string; }
interface AskResult { answer: { text: string; notice?: string; mode: string }; sources: AskSource[]; status: string; }
interface LiveCity { cityId: string; population: number; storm: boolean; mayor?: { name: string; score: number } | null; }

export default function ManiaApp() {
  const initial = new URLSearchParams(location.search);
  const [view, setView] = useState<View>(initial.has('table') ? 'tables' : initial.has('puzzle') ? 'puzzles' : 'world');
  const [world, setWorld] = useState<WorldData | null>(null);
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [demo, setDemo] = useState(initial.get('demo') === '1');
  const [galaxy, setGalaxy] = useState(initial.get('planet') !== '1');
  const [cityId, setCityId] = useState<string | null>(initial.get('city'));
  const [cityTab, setCityTab] = useState<CityTab>(initial.get('tab') === 'landmark' ? 'landmark' : 'moments');
  const [preset, setPreset] = useState(initial.get('preset') ?? 'load-use');
  const [moment, setMoment] = useState<LectureMoment | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(Boolean(initial.get('city')));
  const [query, setQuery] = useState(''), [answer, setAnswer] = useState<AskResult | null>(null);
  const [searchBusy, setSearchBusy] = useState(false), [error, setError] = useState('');
  const [settings, setSettings] = useState(false), [examDate, setExamDate] = useState('');
  const [live, setLive] = useState<LiveCity[]>([]), [connected, setConnected] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const searchController = useRef<AbortController | null>(null);
  const activeDemo = useRef(demo);
  activeDemo.current = demo;
  const acceptSnapshot = (next: LearningSnapshot) => {
    if (next.profile.demo === activeDemo.current) setSnapshot(next);
  };
  const suffix = demo ? '?demo=1' : '';
  const city = world?.cities.find(item => item.id === cityId) ?? null;
  const progress = snapshot?.cities.find(item => item.cityId === cityId);
  const refresh = async () => { const next = await maniaApi<LearningSnapshot>(`/api/mania/progress${suffix}`); acceptSnapshot(next); return next; };

  useEffect(() => {
    const controller = new AbortController(); setError(''); setAnswer(null); searchController.current?.abort(); setSearchBusy(false);
    Promise.all([maniaApi<WorldData>('/api/mania/world', undefined, controller.signal), maniaApi<LearningSnapshot>(`/api/mania/progress${suffix}`, undefined, controller.signal)])
      .then(([data, learning]) => { if (controller.signal.aborted) return; setWorld(data); acceptSnapshot(learning); setExamDate(learning.exam.date?.slice(0, 10) ?? ''); const source = data.cities.flatMap(item => item.chapters).find(item => item.chapterId === initial.get('chapter')); if (source) { const at = Number(initial.get('at')); setMoment({ ...source, start: initial.has('at') && Number.isFinite(at) && at >= source.start && at < source.end ? at : source.start }); } })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => { controller.abort(); searchController.current?.abort(); };
  }, [demo]);

  useEffect(() => {
    if (!snapshot || demo) { setLive([]); setConnected(false); return; }
    let alive = true;
    let dispose: (() => void) | undefined;
    import('socket.io-client').then(({ io }) => {
      if (!alive) return;
      const socket = io('/study', { auth: { demo } });
      socket.on('connect', () => { setConnected(true); socket.emit('city:enter', { cityId: cityId || null }); });
      socket.on('disconnect', () => setConnected(false));
      watchSocketAccess(socket);
      socket.on('connect_error', () => setConnected(false));
      socket.on('world:live', (data: { cities: LiveCity[] }) => setLive(data.cities));
      dispose = () => socket.disconnect();
    });
    return () => { alive = false; dispose?.(); };
  }, [snapshot?.profile.id, demo, cityId]);

  useEffect(() => { if (workspaceOpen && city) workspace.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [workspaceOpen, cityId]);
  const selectCity = (id: string, tab?: CityTab) => {
    const next = world?.cities.find(item => item.id === id); setCityId(id); setMoment(next?.chapters[0] ?? null); setPreset(next?.visualizer === 'cache' ? 'conflicts' : 'load-use'); setGalaxy(false); setView('world'); setCityTab(tab ?? 'moments'); if (tab) setWorkspaceOpen(true);
  };
  const showSource = (source: LectureMoment) => { const matchingCity = world?.cities.find(item => item.chapterIds.includes(source.chapterId)); if (matchingCity) setCityId(matchingCity.id); setMoment(source); const link = lectureVisualizerForMoment(source); if (link) setPreset(link.presetId); setCityTab('moments'); setGalaxy(false); setView('world'); setWorkspaceOpen(true); };
  const visualize = (link?: LectureVisualizerLink) => { if (link) { const target = world?.cities.find(item => item.chapterIds.includes(link.chapterId)); if (target) { setCityId(target.id); setMoment(target.chapters.find(item => item.chapterId === link.chapterId) ?? null); } setPreset(link.presetId); } else if (moment) { const current = lectureVisualizerForMoment(moment); if (current) setPreset(current.presetId); } setCityTab('landmark'); setWorkspaceOpen(true); };
  const onReviewed = (result: ReviewResponse) => acceptSnapshot(result.snapshot);
  const ask = async (question = query) => {
    if (!question.trim()) return; searchController.current?.abort(); const controller = new AbortController(); searchController.current = controller;
    setQuery(question); setError(''); setSearchBusy(true);
    try {
      const result = await maniaApi<AskResult>('/api/mania/ask', { question, courseId: 'computer-architecture', limit: 4 }, controller.signal);
      if (controller.signal.aborted) return;
      setAnswer(result); setView('world');
      const source = result.sources[0];
      if (source && world) { const matching = world.cities.find(item => item.chapters.some(chapter => chapter.lectureId === source.lectureId && source.start >= chapter.start && source.start < chapter.end)); if (matching) { const chapter = matching.chapters.find(item => item.lectureId === source.lectureId && source.start >= item.start && source.start < item.end)!; setCityId(matching.id); setMoment({ ...chapter, start: source.start }); const link = lectureVisualizerForMoment(chapter); if (link) setPreset(link.presetId); setCityTab('moments'); setWorkspaceOpen(true); setGalaxy(false); } }
    } catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message); } finally { if (!controller.signal.aborted) setSearchBusy(false); }
  };
  const openWorkspace = (tab: CityTab) => { if (!moment && city) setMoment(city.chapters[0]); setCityTab(tab); setWorkspaceOpen(true); setTimeout(() => workspace.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };
  const markExplored = async (chapter: LectureMoment) => { try { const next = await maniaApi<LearningSnapshot>(`/api/mania/cities/${cityId}/explore${suffix}`, { chapterId: chapter.chapterId }); acceptSnapshot(next); } catch (e) { setError((e as Error).message); } };
  const reviewLecture = (anchor?: { lectureId: string; chapterId: string; start: number }) => { if (city) { const chapter = anchor ? world?.cities.flatMap(item => item.chapters).find(item => item.chapterId === anchor.chapterId) : undefined; if (chapter) showSource({ ...chapter, start: anchor!.start }); else { setMoment(city.chapters.find(item => /load.use|forwarding|LRU|replacement|address.*tag/i.test(item.title)) ?? city.chapters[0]); setCityTab('moments'); } } };
  const mapCities = world?.cities.map(item => { const status = snapshot?.cities.find(p => p.cityId === item.id); const community = live.find(p => p.cityId === item.id); return { id: item.id, name: item.name, strength: status?.strength ?? 0, state: status?.status ?? 'dark', chapters: item.chapters.length, landmark: item.visualizer, population: community?.population ?? 0, storm: community?.storm ?? false }; }) ?? [];

  return <div className="mania">
    <ProductHeader module="World" actions={<div className="header-actions"><span className={`connection-label ${connected ? 'online' : ''}`}><i />{connected ? 'Together, live' : demo ? 'Demo world' : 'Connecting'}</span><button className={`demo-toggle ${demo ? 'on' : ''}`} onClick={() => { setDemo(d => !d); setCityId(null); setWorkspaceOpen(false); }}>{demo ? 'Demo history on' : 'Try demo history'}</button><div className="profile-badge"><span className="profile-avatar">{snapshot?.profile.name.slice(0, 2).toUpperCase() ?? 'ST'}</span><span>{snapshot?.profile.name ?? 'Your world'}</span></div></div>}>
      <a href="/" className="active">Study world</a><a href="/arena">Play</a><a href="/history">Match history</a><a href="/leaderboard">Leaderboard</a><a href="/learn">Lectures</a><a href="/campus">Campus</a>
    </ProductHeader>
    <nav className="mania-rail" aria-label="Main navigation">
      <div className="mania-brand" aria-label="The Mania"><svg viewBox="0 0 40 40" fill="none"><path d="M6 29L14 10L20 23L26 10L34 29" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" /><circle cx="20" cy="33" r="2" fill="currentColor" /></svg></div>
      {[{ id: 'world', icon: Map, label: 'Your semester' }, { id: 'expedition', icon: Route, label: 'Daily expedition' }, { id: 'puzzles', icon: Trophy, label: 'Cursed puzzles' }, { id: 'tables', icon: Users, label: 'Study tables' }].map(item => <button key={item.id} className={view === item.id ? 'active' : ''} title={item.label} aria-label={item.label} onClick={() => setView(item.id as View)}><item.icon size={21} /></button>)}
      <a href="/learn" aria-label="Lecture library" title="Lecture library"><BookOpen size={21} /></a><a href="/arena" aria-label="1v1 Arena" title="1v1 Arena"><Swords size={21} /></a>
      <div className="rail-bottom"><a href="/campus" aria-label="Campus globe" title="Campus globe"><Globe2 size={20} /></a><button aria-label="Exam settings" title="Exam settings" onClick={() => setSettings(s => !s)}><Settings2 size={20} /></button></div>
    </nav>
    <div className="mania-main">
      <main className="mania-content">
        {demo && <div className="mania-banner"><FlaskConical size={14} /><span>A simulated week of learning. Your real progress and the live leaderboards stay separate.</span></div>}
        {settings && <form className="mania-settings" onSubmit={async event => { event.preventDefault(); setError(''); try { const next = await maniaApi<LearningSnapshot>(`/api/mania/exam${suffix}`, { date: examDate || null }); acceptSnapshot(next); if (next.profile.demo === activeDemo.current) setSettings(false); } catch (e) { setError((e as Error).message); } }}><label htmlFor="exam-date">Your Basisprüfung date</label><input id="exam-date" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} /><button className="primary-button" type="submit">Save exam date</button><button className="secondary-button" type="button" onClick={() => setSettings(false)}>Close</button><p>Set the date from your official timetable. The final two weeks unlock mixed mock exams.</p></form>}
        {error && <p className="mania-error" role="alert">{error}</p>}
        {!world || !snapshot ? <div className="mania-loading"><LoaderCircle className="spin" /> Mapping your semester…{error && <button className="secondary-button" onClick={() => location.reload()}>Retry</button>}</div> : <>
          {(view === 'world' || view === 'expedition') && <>
            <div className="intro-row"><div><div className="section-kicker">YOUR KNOWLEDGE HAS A WORLD</div><h1>{view === 'expedition' ? <>A small route.<br />A stronger memory.</> : <>Your semester,<br />made visible.</>}</h1><p>{view === 'expedition' ? 'Revisit what is fading. Discover what comes next. Strengthen what was difficult.' : 'Find the exact lecture moment. See the concept. Make it stick.'}</p></div><div className="readiness-summary"><div className="readiness-ring" style={{ '--readiness': snapshot.readiness } as CSSProperties}><strong>{snapshot.readiness}%</strong></div><div><h3>DDCA remembered</h3><p>{snapshot.litCityCount} of {snapshot.totalCityCount} cities lit<br />Recall estimate · not an exam grade</p></div></div></div>
            <form className="search-box" onSubmit={event => { event.preventDefault(); void ask(); }}><Search size={18} /><input aria-label="Ask about DDCA" placeholder="Why does a load followed by add stall, even with forwarding?" value={query} onChange={event => setQuery(event.target.value)} maxLength={1000} /><button type="submit" disabled={searchBusy}>{searchBusy ? <LoaderCircle size={15} className="spin" /> : <><span>Find the moment</span><ArrowRight size={15} /></>}</button></form>
            <div className="search-examples"><span>TRY ASKING</span><button onClick={() => void ask('Why does a load followed by add stall even with forwarding?')}>Load-use hazards</button><button onClick={() => void ask('How does LRU cache replacement work?')}>LRU replacement</button><button onClick={() => void ask('How does a virtual memory page table work?')}>Page tables</button></div>
            {answer && <div className="mania-answer"><div className="answer-heading"><span><Sparkles size={13} style={{ verticalAlign: 'middle', marginRight: 7 }} />{answer.answer.mode === 'generated' ? 'Grounded lecture answer' : 'From your lecture transcripts'}</span><button aria-label="Close answer" onClick={() => setAnswer(null)}><X size={15} /></button></div><p>{answer.answer.text || 'The closest lecture moments are below. Try a more specific concept for a closer match.'}</p><span className="answer-notice">{answer.answer.mode === 'extractive' || answer.answer.mode === 'extractive_fallback' ? 'Local transcript search · no model required' : answer.answer.notice}</span><div className="answer-sources">{answer.sources.map(source => <button key={source.id} onClick={() => { const chapter = world.cities.flatMap(c => c.chapters).find(c => c.lectureId === source.lectureId && source.start >= c.start && source.start < c.end); if (chapter) showSource({ ...chapter, start: source.start }); }}>{source.lectureId.toUpperCase()} · {timestamp(source.start)} <ArrowRight size={12} /></button>)}{city?.visualizer && <button onClick={() => openWorkspace('landmark')}>See it in the visualizer <Cpu size={12} /></button>}</div></div>}
            {view === 'expedition' && snapshot.exam.mockExamMode && <Suspense fallback={<Loading />}><MockExam demo={demo} onReviewed={() => void refresh()} onSource={showSource} /></Suspense>}
            <div className="world-grid"><SemesterMap cities={mapCities} roads={world.roads} selected={cityId ?? undefined} onSelect={id => selectCity(id)} galaxy={galaxy} onGalaxy={setGalaxy} daysLeft={snapshot.exam.daysRemaining} readiness={snapshot.readiness} />
              {city && view === 'world' ? <aside className="city-detail-card"><button className="close-city" aria-label="Close city" onClick={() => { setCityId(null); setWorkspaceOpen(false); }}><X size={16} /></button><span className="city-state-tag">{progress?.status ?? 'Unexplored'}</span><h2>{city.name}</h2><p>{city.description}</p><div className="city-metrics"><div><strong>{Math.round((progress?.strength ?? 0) * 100)}%</strong><span>Memory strength</span></div><div><strong>{city.chapters.length}</strong><span>Lecture moments</span></div><div><strong>{progress?.reviewCount ?? 0}</strong><span>Recall reviews</span></div><div><strong>{live.find(c => c.cityId === city.id)?.population ?? 0}</strong><span>Studying now</span></div></div><div className="city-strength-track"><i style={{ width: `${(progress?.strength ?? 0) * 100}%` }} /></div><button className="primary-button" onClick={() => openWorkspace('moments')}><BookOpen size={15} /> Explore the lecture <ArrowRight size={14} /></button><button className="secondary-button" onClick={() => openWorkspace('recall')}><ShieldCheck size={15} /> Claim with recall</button><div className="city-landmark"><Cpu size={24} /><div><strong>{city.landmark}</strong><small>{city.visualizer ? 'An interactive way to understand.' : 'Build understanding through recall.'}</small>{city.visualizer && <button className="text-action" onClick={() => openWorkspace('landmark')}>Enter landmark <ArrowRight size={12} /></button>}</div></div></aside> : <aside className="expedition-card"><div className="expedition-heading"><div className="section-kicker" style={{ margin: 0 }}>YOUR NEXT SMALL STEP</div><span><Clock size={12} /> {snapshot.expedition.minutes} min</span></div><h2>Today’s<br />expedition.</h2><p>Three cities. A little more of the world stays with you.</p><ol className="expedition-stops">{snapshot.expedition.stops.map((stop, index) => <li key={stop.cityId}><button onClick={() => selectCity(stop.cityId, stop.reason === 'new' ? 'moments' : 'recall')}><span className="stop-number">{snapshot.expedition.completedCityIds.includes(stop.cityId) ? <Check size={12} /> : index + 1}</span><span className="stop-copy"><strong>{world.cities.find(c => c.id === stop.cityId)?.name}</strong><small>{stop.label}</small></span><span className="stop-time">{stop.minutes}m</span></button></li>)}</ol><button className="primary-button" onClick={() => { const first = snapshot.expedition.stops.find(s => !snapshot.expedition.completedCityIds.includes(s.cityId)) ?? snapshot.expedition.stops[0]; if (first) selectCity(first.cityId, first.reason === 'new' ? 'moments' : 'recall'); }}>Start the expedition <ArrowRight size={15} /></button><div className="expedition-note"><GitBranch size={19} style={{ flexShrink: 0 }} /><span>Review, discovery, and practice. Your route adapts to what you remember.</span></div><button className="text-action" onClick={() => setSettings(true)}><Calendar size={12} /> {snapshot.exam.daysRemaining === null ? 'Set your exam date' : `${snapshot.exam.daysRemaining} days until your exam`}</button></aside>}
            </div>
            {workspaceOpen && city && <div className="city-workspace" ref={workspace}><div className="workspace-header"><div><div className="section-kicker">{city.chapters.length} MOMENTS · {Math.round(city.duration / 60)} MIN OF LECTURE</div><h2>{city.name}</h2></div><div className="workspace-tabs">{[{ id: 'moments', name: 'Lecture', icon: BookOpen }, { id: 'recall', name: 'Recall', icon: ShieldCheck }, ...(city.visualizer ? [{ id: 'landmark', name: 'Visualize', icon: Cpu }] : []), { id: 'together', name: 'Together', icon: Users }].map(tab => <button key={tab.id} className={cityTab === tab.id ? 'active' : ''} onClick={() => setCityTab(tab.id as CityTab)}><tab.icon size={14} />{tab.name}</button>)}</div></div><div className="workspace-body"><Suspense fallback={<Loading />}>
              {cityTab === 'moments' && <LectureMomentPanel key={`${demo}-${city.id}`} city={city} moment={moment} onMoment={showSource} onExplored={markExplored} exploredChapterIds={progress?.exploredChapterIds ?? []} onVisualize={visualize} onRecall={() => setCityTab('recall')} onDuel={async () => { try { const room = await maniaApi<{ id: string }>(`/api/mania/cities/${city.id}/duel${suffix}`, {}); location.assign(`/room/${room.id}`); } catch (e) { setError((e as Error).message); } }} />}
              {cityTab === 'recall' && <RecallQuest key={`${demo}-${city.id}`} cityId={city.id} demo={demo} onReviewed={onReviewed} onSource={showSource} />}
              {cityTab === 'landmark' && (city.visualizer === 'pipeline' ? <PipelineVisualizer key={preset} initialPreset={preset === 'forwarding' || preset === 'independent' ? preset : 'load-use'} onReviewLecture={reviewLecture} /> : city.visualizer === 'cache' ? <CacheVisualizer key={preset} initialPreset={preset} onReviewLecture={reviewLecture} /> : <VirtualMemoryVisualizer onReviewLecture={reviewLecture} />)}
              {cityTab === 'together' && <SocialPanel cityId={city.id} cityName={city.name} demo={demo} />}
            </Suspense></div></div>}
            <div className="directory-header"><h2>Across your knowledge planet</h2><span>{world.stats.lectures} lectures · {world.stats.contentChapters} real moments</span></div><div className="city-directory">{mapCities.map(item => <button key={item.id} className={item.id === cityId ? 'selected' : ''} onClick={() => selectCity(item.id)}><div className="city-directory-top"><i className={`legend-dot ${item.state === 'claimed' ? 'lit' : item.state}`} /><strong>{item.name}</strong>{item.storm && <span title="Classmates are finding this difficult">☁</span>}</div><small>{item.chapters} moments · {item.state === 'dark' ? 'Ready to discover' : `${Math.round(item.strength * 100)}% remembered`}</small></button>)}</div>
          </>}
          {view === 'puzzles' && <><div className="standalone-title"><div className="section-kicker">CURSED CONCEPTS. CLEARER THINKING.</div><h1>Make the machine<br />work for you.</h1><p>Optimize a pipeline. Break a cache. Earn your place on the city board.</p></div><Suspense fallback={<Loading />}><PuzzleHub demo={demo} onProgress={() => void refresh()} onReviewLecture={kind => selectCity(kind === 'pipeline' ? 'pipelining' : 'caches', 'moments')} /></Suspense></>}
          {view === 'tables' && <><div className="standalone-title"><div className="section-kicker">BETTER UNDERSTOOD, TOGETHER</div><h1>Find your people.<br />Figure it out.</h1><p>A real study table, around the concept you’re working on.</p></div><Suspense fallback={<Loading />}><SocialPanel cityId={cityId ?? 'pipelining'} cityName={city?.name ?? 'Pipelining'} demo={demo} cities={world.cities} /></Suspense></>}
        </>}
        <footer className="mania-footer"><strong>Lectures tell you. The Mania shows you.</strong><span>DDCA · ETH Zürich · VIScon 2026</span><span>{world ? `${world.stats.excludedChapters} administrative moments excluded` : 'Built on your actual lecture recordings'} · <a href="/learn">Lecture library ↗</a></span></footer>
      </main>
    </div>
  </div>;
}

function Loading() { return <div className="mania-loading"><LoaderCircle className="spin" /> Opening the concept…</div>; }
