import { useId, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, Cpu, GitBranch, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { createDefaultPageTables, parseVirtualAddress, VM_TLB_CAPACITY, vmHex, walkVirtualAddress, type VmAccess, type VmPageEntry, type VmPageTables, type VmTlbEntry, type VmWalk } from '../../shared/virtual-memory';
import { LECTURE_VISUALIZER_LINKS, lectureVisualizerHref } from '../../shared/lecture-visualizers';
import './vm.css';

const PRESETS = [
  { id: 'translation', title: 'A mapped page', address: 0x5ABC, access: 'read' as const, description: 'Walk two tables. Replace page 5 with frame 9; keep offset ABC.' },
  { id: 'tlb-hit', title: 'A warm TLB', address: 0x5ABC, access: 'read' as const, description: 'The translation is already cached. Skip both tables, but still check permissions.' },
  { id: 'page-fault', title: 'A missing page', address: 0x8123, access: 'read' as const, description: 'The directory is present, but virtual page 8 has no resident mapping.' },
  { id: 'protection', title: 'A forbidden write', address: 0x6FF0, access: 'write' as const, description: 'Virtual page 6 is present and read-only. A write is a protection fault.' },
  { id: 'directory-fault', title: 'A missing table', address: 0xD004, access: 'read' as const, description: 'Directory entry 3 is absent. Stop before reading a second-level entry.' },
];
const OUTCOMES: { id: VmWalk['outcome']; label: string }[] = [{ id: 'translated', label: 'Translation succeeds' }, { id: 'page-fault', label: 'Page fault' }, { id: 'protection-fault', label: 'Protection fault' }];

export default function VirtualMemoryVisualizer({ onReviewLecture }: { onReviewLecture?: () => void }) {
  const id = useId();
  const [tables, setTables] = useState<VmPageTables>(createDefaultPageTables);
  const [address, setAddress] = useState(0x5ABC), [input, setInput] = useState('0x5ABC');
  const [access, setAccess] = useState<VmAccess>('read');
  const [tlb, setTlb] = useState<VmTlbEntry[]>([]), [walkTlb, setWalkTlb] = useState<VmTlbEntry[]>([]);
  const [cursor, setCursor] = useState(0), [preset, setPreset] = useState('translation');
  const [prediction, setPrediction] = useState<VmWalk['outcome'] | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const walk = useMemo(() => walkVirtualAddress(address, tables, access, walkTlb), [address, tables, access, walkTlb]);
  const current = cursor ? walk.steps[cursor - 1] : null;
  const complete = cursor === walk.steps.length;
  const visibleTlb = complete ? walk.finalTlb : walk.initialTlb;
  const directoryVisited = walk.steps.slice(0, cursor).some(step => step.stage === 'directory');
  const pageVisited = walk.steps.slice(0, cursor).some(step => step.stage === 'page-table');
  const decoded = walk.address;
  const reset = (cached: VmTlbEntry[] = tlb) => { setWalkTlb(cached.map(entry => ({ ...entry }))); setCursor(0); setPrediction(null); setError(''); };
  const next = () => {
    if (complete) { reset(); setNotice('Repeat the same address. A successful earlier walk has warmed the TLB.'); return; }
    const nextCursor = cursor + 1;
    setCursor(nextCursor);
    if (nextCursor === walk.steps.length) setTlb(walk.finalTlb.map(entry => ({ ...entry })));
  };
  const loadAddress = () => {
    try { const value = parseVirtualAddress(input); setAddress(value); setInput(vmHex(value)); setPreset('custom'); reset(); setNotice('New byte address. Existing TLB translations are kept.'); }
    catch (cause) { setError((cause as Error).message); }
  };
  const loadPreset = (presetId: string) => {
    const example = PRESETS.find(item => item.id === presetId)!;
    const nextTables = createDefaultPageTables();
    const cached = example.id === 'tlb-hit' ? walkVirtualAddress(example.address, nextTables, example.access).finalTlb : [];
    setTables(nextTables); setAddress(example.address); setInput(vmHex(example.address)); setAccess(example.access); setTlb(cached); reset(cached); setPreset(example.id); setNotice(example.description);
  };
  const updateMapping = (directory: number, page: number | null, change: Partial<VmPageEntry> | { present: boolean }) => {
    setTables(previous => previous.map((table, rootIndex) => ({ ...table,
      ...(rootIndex === directory && page === null ? change : {}),
      entries: table.entries.map((entry, index) => ({ ...entry, ...(rootIndex === directory && index === page ? change : {}) })),
    })));
    setTlb([]); reset([]); setPreset('custom'); setNotice('Page tables changed. The TLB was flushed so an old translation cannot survive.');
  };
  const flush = () => { setTlb([]); reset([]); setNotice('TLB flushed. The next translation walks the page tables.'); };
  const predictionCorrect = prediction === walk.outcome;

  return <section className="vm-viz" aria-label="Virtual memory page walk visualizer">
    <header className="vm-viz__header"><div><span className="vm-viz__kicker">VIRTUAL MEMORY · THE PAGE WALK</span><h2>A page, translated<span>.</span></h2><p>Follow the address. Keep the offset. Find the frame.</p></div><span className="vm-viz__model"><GitBranch size={15} />16-bit teaching model</span></header>
    <div className="vm-viz__architecture"><span>16-bit virtual address</span><ArrowRight size={13} /><span>2 directory + 2 table + 12 offset bits</span><span>4 KiB pages · 16 physical frames</span></div>
    <div className="vm-viz__presets" aria-label="Teaching examples">{PRESETS.map(example => <button type="button" key={example.id} className={preset === example.id ? 'selected' : ''} onClick={() => loadPreset(example.id)}>{example.title}</button>)}</div>
    <form className="vm-viz__controls" onSubmit={event => { event.preventDefault(); loadAddress(); }}><label htmlFor={`${id}-address`}>VIRTUAL BYTE ADDRESS<input id={`${id}-address`} value={input} onChange={event => setInput(event.target.value)} spellCheck={false} maxLength={8} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} /></label><label htmlFor={`${id}-access`}>ACCESS<select id={`${id}-access`} value={access} onChange={event => { setAccess(event.target.value as VmAccess); reset(); setNotice('The same address, with a different permission check.'); }}><option value="read">Read</option><option value="write">Write</option></select></label><button type="submit">Translate address<ArrowRight size={14} /></button><button type="button" className="vm-viz__quiet" onClick={flush}><RotateCcw size={14} />Flush TLB</button></form>
    {error && <p className="vm-viz__error" role="alert" id={`${id}-error`}>{error}</p>}
    <div className="vm-viz__address" aria-label={`Address ${vmHex(address)}: directory ${decoded.directoryIndex}, table entry ${decoded.tableIndex}, offset ${decoded.offset}`}><div><span>DIRECTORY INDEX · 2 BITS</span><strong>{decoded.directoryBits}</strong><small>entry {decoded.directoryIndex}</small></div><div><span>TABLE INDEX · 2 BITS</span><strong>{decoded.tableBits}</strong><small>entry {decoded.tableIndex}</small></div><div><span>PAGE OFFSET · 12 BITS · UNCHANGED</span><strong>{decoded.offsetBits}</strong><small>{vmHex(decoded.offset, 3)} · {decoded.offset} bytes</small></div></div>
    <div className="vm-viz__layout"><div className="vm-viz__diagram">
      <div className="vm-viz__tlb"><div className="vm-viz__panel-title"><h3><Cpu size={15} />Translation lookaside buffer</h3><span>{complete ? 'AFTER THIS ACCESS' : 'BEFORE THIS ACCESS'}</span></div><div className="vm-viz__tlb-slots">{Array.from({ length: VM_TLB_CAPACITY }, (_, index) => { const entry = visibleTlb[index]; return <div key={index} className={entry?.virtualPage === decoded.virtualPage && cursor >= 2 ? 'active' : ''}><small>{index === 0 ? 'MRU' : `SLOT ${index + 1}`}</small><strong>{entry ? <>page {entry.virtualPage}<ArrowRight size={12} />frame {entry.frame}</> : 'empty'}</strong><span>{entry ? `${entry.readable ? 'read' : ''}${entry.readable && entry.writable ? ' + ' : ''}${entry.writable ? 'write' : ''}` || 'no access' : 'no translation'}</span></div>; })}</div><p>A TLB miss starts a table walk. It does not mean a page fault.</p></div>
      <div className="vm-viz__tables"><div className="vm-viz__directory"><div className="vm-viz__panel-title"><h3>01 · Page directory</h3><span>4 ENTRIES</span></div>{tables.map((entry, index) => <div key={index} className={`vm-viz__directory-row ${directoryVisited && index === decoded.directoryIndex ? 'active' : ''}`}><span className="vm-viz__index">{index.toString(2).padStart(2, '0')}</span><span>{entry.present ? `table ${index}` : 'not present'}<small>pages {index * 4}–{index * 4 + 3}</small></span><label title={`Directory entry ${index} present`}><input type="checkbox" aria-label={`Directory entry ${index} present`} checked={entry.present} onChange={event => updateMapping(index, null, { present: event.target.checked })} /><span>P</span></label></div>)}</div><ArrowRight className="vm-viz__table-arrow" size={20} /><div className={`vm-viz__page-table ${!tables[decoded.directoryIndex].present ? 'absent' : ''}`}><div className="vm-viz__panel-title"><h3>02 · Table {decoded.directoryIndex}</h3><span>EDITABLE MAPPINGS</span></div><div className="vm-viz__table-columns"><span>PAGE</span><span>P</span><span>FRAME</span><span>ACCESS</span></div>{tables[decoded.directoryIndex].entries.map((entry, index) => <div className={`vm-viz__page-row ${pageVisited && index === decoded.tableIndex ? 'active' : ''}`} key={index}><span>{decoded.directoryIndex * 4 + index}<small>index {index}</small></span><input type="checkbox" aria-label={`Virtual page ${decoded.directoryIndex * 4 + index} present`} checked={entry.present} onChange={event => updateMapping(decoded.directoryIndex, index, { present: event.target.checked })} /><select aria-label={`Physical frame for virtual page ${decoded.directoryIndex * 4 + index}`} value={entry.frame} onChange={event => updateMapping(decoded.directoryIndex, index, { frame: Number(event.target.value) })}>{Array.from({ length: 16 }, (_, frame) => <option key={frame} value={frame}>{frame}</option>)}</select><select aria-label={`Permissions for virtual page ${decoded.directoryIndex * 4 + index}`} value={entry.writable ? 'rw' : entry.readable ? 'r' : 'none'} onChange={event => updateMapping(decoded.directoryIndex, index, { readable: event.target.value !== 'none', writable: event.target.value === 'rw' })}><option value="rw">read + write</option><option value="r">read only</option><option value="none">no access</option></select></div>)}<p>{tables[decoded.directoryIndex].present ? 'P = present. Editing a mapping flushes the TLB.' : 'This table cannot be reached while its directory entry is absent.'}</p></div></div>
      <div className={`vm-viz__physical ${complete && walk.outcome !== 'translated' ? 'fault' : ''}`}><div><ShieldCheck size={20} /><span>PHYSICAL BYTE ADDRESS</span></div><strong>{complete ? walk.physicalAddress === null ? 'access blocked' : vmHex(walk.physicalAddress) : '— — — —'}</strong><p>{complete && walk.physicalAddress !== null ? `frame ${walk.frame} × 4096 + offset ${decoded.offset}` : 'A physical address is produced only after all checks pass.'}</p></div>
    </div><aside className="vm-viz__walk"><div className="vm-viz__panel-title"><h3>The walk, one step at a time</h3><span>{cursor} / {walk.steps.length}</span></div><ol>{walk.steps.map((step, index) => <li key={`${step.stage}-${index}`} className={index === cursor - 1 ? 'current' : index < cursor ? 'done' : ''}><span>{index < cursor - 1 ? <Check size={12} /> : index + 1}</span><div><strong>{index < cursor ? step.title : index === 0 ? 'Split the virtual address' : index === 1 ? 'Look up the TLB' : 'Continue the walk'}</strong>{index === cursor - 1 && <p>{step.description}</p>}</div></li>)}</ol><div className="vm-viz__step-buttons"><button type="button" disabled={cursor === 0} onClick={() => setCursor(value => value - 1)} aria-label="Previous translation step"><ChevronLeft size={17} />Back</button><button type="button" onClick={next}>{complete ? 'Translate again' : cursor ? 'Next step' : 'Start walk'}<ArrowRight size={15} /></button></div><div className="vm-viz__stage-status" role="status">{current ? current.title : 'Choose an outcome below, then start the walk.'}</div></aside></div>
    <div className="vm-viz__prediction"><div><span className="vm-viz__kicker">PREDICT, THEN WALK</span><h3>Will this {access} reach physical memory?</h3></div><div className="vm-viz__prediction-options">{OUTCOMES.map(option => <button type="button" key={option.id} disabled={complete} className={prediction === option.id ? 'selected' : ''} onClick={() => setPrediction(option.id)}>{option.label}</button>)}</div>{complete && prediction && <div className={`vm-viz__feedback ${predictionCorrect ? 'correct' : ''}`} role="status">{predictionCorrect ? <Check size={16} /> : <X size={16} />}<span><strong>{predictionCorrect ? 'Exactly.' : 'A useful mistake.'}</strong> {walk.steps[walk.steps.length - 1].description}</span>{!predictionCorrect && onReviewLecture && <button type="button" onClick={onReviewLecture}><BookOpen size={14} />Review the lecture</button>}</div>}{complete && !prediction && <p className="vm-viz__notice">Repeat the walk and predict its outcome before stepping.</p>}</div>
    {notice && <p className="vm-viz__notice" role="status">{notice}</p>}
    <footer className="vm-viz__footer"><p>This small architecture illustrates the DDCA concepts; its 16-bit address width is a teaching adaptation. Directory pointers are shown symbolically. Real architectures use different widths, entry formats and fault codes.</p><div>{LECTURE_VISUALIZER_LINKS.filter(link => link.kind === 'virtual-memory').map(link => <a key={link.chapterId} href={lectureVisualizerHref(link).replace('tab=landmark', 'tab=moments')}><BookOpen size={12} />{link.lectureId.toUpperCase()} · {link.title}<ArrowRight size={11} /></a>)}</div></footer>
  </section>;
}
