import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Layers3, LoaderCircle, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import type { LearningSnapshot, LectureMoment, MockExamQuest, ReviewResponse, WorldData } from '../../shared/world';
import { maniaApi, timestamp } from './api';
import './mock-exam.css';

const remainingTime = (deadline: number, serverOffset: number) => Math.max(0, Math.ceil((deadline - Date.now() - serverOffset) / 1000));
const clockLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const fallbackCityName = (cityId: string) => cityId.replaceAll('-', ' ').replace(/\b\w/g, value => value.toUpperCase());

export default function MockExam({ demo, onReviewed, onSource }: { demo: boolean; onReviewed: () => void; onSource: (source: LectureMoment) => void }) {
  const [quest, setQuest] = useState<MockExamQuest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [cities, setCities] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0), [serverOffset, setServerOffset] = useState(0);
  const [busy, setBusy] = useState(false), [ended, setEnded] = useState(false), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0), submitting = useRef(false), autoSubmitted = useRef(false);
  const query = demo ? '?demo=1' : '';
  const unanswered = quest?.questions.filter(question => !answers[question.id]) ?? [];
  const cityName = (cityId: string) => cities[cityId] ?? fallbackCityName(cityId);

  useEffect(() => {
    generation.current++; controller.current?.abort(); submitting.current = false; autoSubmitted.current = false;
    setQuest(null); setResult(null); setAnswers({}); setEnded(false); setBusy(false); setError('');
    const metadata = new AbortController();
    maniaApi<WorldData>('/api/mania/world', undefined, metadata.signal).then(world => setCities(Object.fromEntries(world.cities.map(city => [city.id, city.name])))).catch(() => { /* City IDs remain readable if metadata is unavailable. */ });
    return () => { generation.current++; metadata.abort(); controller.current?.abort(); };
  }, [demo]);

  const load = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const version = ++generation.current;
    submitting.current = false; autoSubmitted.current = false; setBusy(true); setError(''); setQuest(null); setResult(null); setAnswers({}); setEnded(false);
    try {
      // The progress response supplies server time, preventing a wrong device clock
      // from extending or instantly expiring the server-issued exam deadline.
      const [exam, clock] = await Promise.allSettled([
        maniaApi<MockExamQuest>(`/api/mania/mock-exam${query}`, undefined, request.signal),
        maniaApi<LearningSnapshot>(`/api/mania/progress${query}`, undefined, request.signal),
      ]);
      if (version !== generation.current || request.signal.aborted) return;
      if (exam.status === 'rejected') throw exam.reason;
      const deadline = Date.parse(exam.value.expiresAt);
      if (!Number.isFinite(deadline) || !Number.isFinite(exam.value.durationSeconds) || exam.value.durationSeconds <= 0 || !exam.value.questions.length) throw new Error('This exam could not be prepared. Please try again.');
      const serverNow = clock.status === 'fulfilled' ? Date.parse(clock.value.serverTime) : NaN;
      // Without server clock metadata, the freshly issued duration still bounds
      // the timer. The server independently enforces expiresAt on submission.
      const offset = Number.isFinite(serverNow) ? serverNow - Date.now() : deadline - Date.now() - exam.value.durationSeconds * 1000;
      const seconds = Math.min(exam.value.durationSeconds, remainingTime(deadline, offset));
      setServerOffset(offset); setRemaining(seconds); setQuest(exam.value); setEnded(seconds <= 0);
      if (seconds <= 0) setError('This attempt has already expired. Start a fresh mock exam.');
    } catch (cause) { if (version === generation.current && !request.signal.aborted) setError((cause as Error).message); }
    finally { if (version === generation.current && !request.signal.aborted) setBusy(false); }
  };

  const submit = async (automatic = false) => {
    if (!quest || submitting.current || result) return;
    if (unanswered.length) { setError(`Answer the remaining ${unanswered.length} ${unanswered.length === 1 ? 'question' : 'questions'} before submitting. No partial attempt has been saved.`); return; }
    if (remainingTime(Date.parse(quest.expiresAt), serverOffset) <= 0) { setEnded(true); setError('Time has ended. This attempt was not submitted; start a fresh exam to receive a score.'); return; }
    const version = generation.current, request = new AbortController(); controller.current = request;
    submitting.current = true; setBusy(true); setError(''); if (automatic) { autoSubmitted.current = true; setEnded(true); }
    try {
      const review = await maniaApi<ReviewResponse>(`/api/mania/mock-exam/review${query}`, { questId: quest.questId, answers }, request.signal);
      if (version !== generation.current || request.signal.aborted) return;
      setResult(review); setEnded(true); onReviewed();
    } catch (cause) {
      if (version !== generation.current || request.signal.aborted) return;
      const expired = remainingTime(Date.parse(quest.expiresAt), serverOffset) <= 0;
      setEnded(expired); setError(expired ? 'Time has ended before your completed attempt reached the server. No score was saved. Start another mock exam.' : (cause as Error).message);
    } finally { if (version === generation.current && !request.signal.aborted) { submitting.current = false; setBusy(false); } }
  };

  useEffect(() => {
    if (!quest || result || ended) return;
    const update = () => setRemaining(Math.min(quest.durationSeconds, remainingTime(Date.parse(quest.expiresAt), serverOffset)));
    update(); const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [quest, result, ended, serverOffset]);

  useEffect(() => {
    if (!quest || result || ended || submitting.current) return;
    // Send a complete attempt during the final second, while the server-issued
    // deadline still accepts it. Incomplete attempts end without an invalid POST.
    if (remaining <= 1 && unanswered.length === 0 && !autoSubmitted.current) { void submit(true); }
    else if (remaining <= 0) {
      setEnded(true);
      setError(unanswered.length ? `Time has ended with ${unanswered.length} unanswered ${unanswered.length === 1 ? 'question' : 'questions'}. This incomplete attempt was not submitted and your progress was not changed.` : 'Time has ended before a score was returned. Start a fresh attempt to receive practice feedback.');
    }
  }, [remaining, quest, result, ended, answers]);

  const questionById = new Map(quest?.questions.map(question => [question.id, question]) ?? []);
  return <section className="mock-exam" aria-label="Timed DDCA mock exam">
    <header className="mock-exam__header"><div><span className="mock-exam__kicker">EXAM ORBIT · MIXED RECALL</span><h2>Bring the cities together<span>.</span></h2><p>Different topics. One focused attempt. A clearer next step.</p></div><div className={`mock-exam__timer ${quest && !result && remaining <= 60 ? 'urgent' : ''}`} role="timer" aria-label={quest && !result ? `${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining` : '15 minute mock exam'}><Clock size={18} /><strong>{quest && !result ? clockLabel(remaining) : '15:00'}</strong><span>{result ? 'ATTEMPT COMPLETE' : quest ? ended ? 'TIME ENDED' : 'REMAINING' : 'MINUTES OF FOCUS'}</span></div></header>
    {demo && <p className="mock-exam__demo">Demo attempt · results update your simulated history.</p>}
    {error && <p className="mock-exam__error" role="alert">{error}</p>}
    {!quest && <div className="mock-exam__intro"><div><Layers3 size={20} /><span><strong>Mixed questions from across DDCA</strong><small>A new route through several cities, with timestamped explanations after you submit.</small></span></div><div><ShieldCheck size={20} /><span><strong>Find your weaknesses</strong><small>Mixed answers inform your next expedition. Full city recall quests establish mastery.</small></span></div><p>The timer begins when your questions are ready. Answer every question to submit; a complete attempt submits automatically in the final second. An incomplete attempt ends without saving.</p><button type="button" disabled={busy} onClick={() => void load()}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{busy ? 'Preparing the exam…' : 'Start a 15-minute mock exam'}</button></div>}
    {quest && result && <><div className={`mock-exam__result ${result.passed ? 'passed' : ''}`}><CheckCircle2 size={32} /><div><h3>{result.correctCount} of {result.total} recalled.</h3><p>{result.passed ? 'Your knowledge is connecting.' : 'Your next review has a direction.'} Your score is practice feedback, not a predicted exam grade.</p></div><strong>{Math.round(result.score * (result.score <= 1 ? 100 : 1))}%</strong></div><div className="mock-exam__reviews">{result.results.map(item => { const question = questionById.get(item.questionId); const correctAnswer = question?.options.find(option => option.id === item.answer); const chosen = question?.options.find(option => option.id === answers[item.questionId]); return <article className={`mock-exam__review ${item.correct ? 'correct' : ''}`} key={item.questionId}>{item.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}<div><span className="mock-exam__city">{question ? cityName(question.cityId) : 'DDCA'}</span><h3>{question?.prompt ?? 'Recall question'}</h3>{!item.correct && <p className="mock-exam__answer">Your answer: {chosen?.text ?? 'Unanswered'}<br />Correct answer: {correctAnswer?.text ?? item.answer}</p>}<p>{item.explanation}</p>{!item.correct && <button type="button" onClick={() => onSource(item.source)}><BookOpen size={13} />{item.source.lectureId.toUpperCase()} · {timestamp(item.source.start)} · Watch the explanation<ArrowRight size={13} /></button>}</div></article>; })}</div><button className="mock-exam__restart" type="button" disabled={busy} onClick={() => void load()}><RotateCcw size={15} />Start another mixed attempt</button></>}
    {quest && !result && <><div className="mock-exam__progress"><span>{quest.questions.length - unanswered.length} of {quest.questions.length} answered</span><div><i style={{ width: `${(quest.questions.length - unanswered.length) / quest.questions.length * 100}%` }} /></div><span>{new Set(quest.questions.map(question => question.cityId)).size} cities</span></div><div className="mock-exam__questions">{quest.questions.map((question, index) => <fieldset key={question.id} className="mock-exam__question" disabled={ended || busy}><legend><span className="mock-exam__number">{String(index + 1).padStart(2, '0')}</span><span><small className="mock-exam__city">{cityName(question.cityId)}</small>{question.prompt}</span></legend>{question.options.map(option => <label key={option.id} className={answers[question.id] === option.id ? 'chosen' : ''}><input type="radio" name={`mock-${quest.questId}-${question.id}`} checked={answers[question.id] === option.id} onChange={() => { setAnswers(previous => ({ ...previous, [question.id]: option.id })); setError(''); }} /><span>{option.text}</span></label>)}</fieldset>)}</div><div className="mock-exam__submit">{ended ? <><p>Your answers are shown above. Start a new attempt for a fresh timer.</p><button type="button" disabled={busy} onClick={() => void load()}>{busy ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />}{busy ? 'Saving completed answers…' : 'Start a fresh exam'}</button></> : <><p>{unanswered.length ? `${unanswered.length} ${unanswered.length === 1 ? 'question' : 'questions'} remaining. All answers are required.` : 'All questions answered. Submit when you are ready.'}</p><button type="button" disabled={busy || unanswered.length > 0} onClick={() => void submit()}>{busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}{busy ? 'Checking your recall…' : 'Submit my attempt'}</button></>}</div></>}
  </section>;
}
