import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle, RotateCcw, XCircle } from 'lucide-react';
import type { LectureMoment, RecallQuest as Quest, ReviewResponse } from '../../shared/world';
import { maniaApi } from './api';

export default function RecallQuest({ cityId, demo, onReviewed, onSource }: { cityId: string; demo: boolean; onReviewed: (result: ReviewResponse) => void; onSource: (source: LectureMoment) => void }) {
  const [quest, setQuest] = useState<Quest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const query = demo ? '?demo=1' : '';
  const load = async () => { request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setResult(null); setQuest(null); setAnswers({}); try { const next = await maniaApi<Quest>(`/api/mania/cities/${cityId}/quest${query}`, undefined, controller.signal); if (!controller.signal.aborted) setQuest(next); } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); } finally { if (!controller.signal.aborted) setBusy(false); } };
  useEffect(() => { void load(); return () => request.current?.abort(); }, [cityId, demo]);
  const submit = async () => { if (!quest) return; request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); try { const review = await maniaApi<ReviewResponse>(`/api/mania/cities/${cityId}/review${query}`, { questId: quest.questId, answers }, controller.signal); if (!controller.signal.aborted) { setResult(review); onReviewed(review); } } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); } finally { if (!controller.signal.aborted) setBusy(false); } };
  return <div className="recall-quest">
    <div className="section-kicker">RETRIEVE · REMEMBER · REPEAT</div><h3>Light up this city.</h3><p className="muted">Watching is the beginning. Recall is what makes it yours.</p>
    {error && <p role="alert" className="mania-error">{error}</p>}
    {!quest && busy ? <div className="mania-loading"><LoaderCircle className="spin" /> Preparing your recall quest…</div> : result ? <>
      <div className={`quest-result ${result.passed ? 'passed' : ''}`}>{result.passed ? <CheckCircle2 size={30} /> : <RotateCcw size={30} />}<div><h3>{result.passed ? 'A little brighter already.' : 'You found what to revisit.'}</h3><p>{result.correctCount} of {result.total} recalled · {Math.round(result.score * (result.score <= 1 ? 100 : 1))}%</p></div></div>
      {result.results.map((item, i) => <div className="quest-review" key={item.questionId}>{item.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}<div><strong>{quest?.questions[i]?.prompt}</strong><p>{item.explanation}</p>{!item.correct && <button className="text-action" onClick={() => onSource(item.source)}>Watch the explanation <ArrowRight size={14} /></button>}</div></div>)}
      <button className="secondary-button" onClick={() => void load()}><RotateCcw size={15} /> Try another recall quest</button>
    </> : quest && <>
      {quest.questions.map((question, i) => <fieldset className="recall-question" key={question.id}><legend><span>{String(i + 1).padStart(2, '0')}</span>{question.prompt}</legend>{question.options.map(option => <label key={option.id} className={answers[question.id] === option.id ? 'chosen' : ''}><input type="radio" name={question.id} value={option.id} checked={answers[question.id] === option.id} onChange={() => setAnswers(a => ({ ...a, [question.id]: option.id }))} /><span>{option.text}</span></label>)}</fieldset>)}
      <button className="primary-button" disabled={busy || Object.keys(answers).length < quest.questions.length} onClick={() => void submit()}>{busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />} Check my recall</button>
    </>}
  </div>;
}
