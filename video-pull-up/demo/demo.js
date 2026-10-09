import { askLecture, pullUpVideo } from '/client.mjs';

const element = id => document.getElementById(id);
const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
let lectures = [];
let controller;
let selection = 0;

function clearResult() {
  controller?.abort();
  selection++;
  element('player').pause();
  element('player').removeAttribute('src');
  element('player').load();
  element('result').hidden = true;
  element('status').textContent = '';
  element('submit').disabled = false;
  element('question-form').setAttribute('aria-busy', 'false');
}

async function openSource(source) {
  const current = ++selection;
  element('player-card').hidden = false;
  element('video-title').textContent = source.lectureTitle;
  element('position').textContent = `${time(source.start)} – ${time(source.end)}`;
  element('transcript').textContent = source.transcript;
  element('video-status').textContent = 'Videostelle wird geladen …';
  document.querySelectorAll('.source').forEach(button => {
    button.classList.toggle('active', button.dataset.source === source.id);
    button.setAttribute('aria-pressed', String(button.dataset.source === source.id));
  });
  if (!source.mediaUrl) {
    element('player').pause();
    element('player').removeAttribute('src');
    element('player').load();
    element('video-status').textContent = 'Das Transkript ist vorhanden. Für diese Vorlesung fehlt noch eine Videodatei.';
    return;
  }
  try {
    const result = await pullUpVideo(element('player'), source);
    if (current !== selection || result.cancelled) return;
    element('video-status').textContent = `Bereit ab ${time(source.start)}. Mit Play starten.${source.demo ? ' Stummes Demo-Video.' : ''}`;
  } catch (error) { if (current === selection) element('video-status').textContent = error.message; }
}

function render(result) {
  element('paragraphs').replaceChildren();
  element('sources').replaceChildren();
  element('answer-notice').textContent = result.answer.notice;
  element('player-card').hidden = true;
  for (const paragraph of result.answer.paragraphs) {
    const p = document.createElement('p');
    p.append(document.createTextNode(paragraph.text));
    for (const id of paragraph.sourceIds) {
      const source = result.sources.find(item => item.id === id);
      if (!source) continue;
      const citation = document.createElement('button');
      citation.type = 'button'; citation.className = 'citation';
      citation.textContent = `[${id} · ${time(source.start)}]`;
      citation.setAttribute('aria-label', `${source.title} bei ${time(source.start)} öffnen`);
      citation.addEventListener('click', () => void openSource(source));
      p.append(citation);
    }
    element('paragraphs').append(p);
  }
  for (const source of result.sources) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'source'; button.dataset.source = source.id;
    button.setAttribute('aria-pressed', 'false');
    button.append(document.createTextNode(`${source.courseName} · ${time(source.start)} – ${time(source.end)}`));
    const title = document.createElement('strong'); title.textContent = source.title; button.append(title);
    button.addEventListener('click', () => void openSource(source));
    element('sources').append(button);
  }
  element('result').hidden = false;
  element('status').textContent = result.status === 'no_match' ? 'Keine passende Videostelle gefunden.'
    : result.status === 'insufficient_context' ? 'Ähnliche Videostellen gefunden; die Frage ist damit noch nicht beantwortet.'
      : `${result.sources.length} passende ${result.sources.length === 1 ? 'Stelle' : 'Stellen'} gefunden.`;
  if (result.sources.length) void openSource(result.sources[0]);
}

function populateLectures() {
  element('lecture').replaceChildren(new Option('Alle Vorlesungen', ''));
  lectures.filter(lecture => !element('course').value || lecture.courseId === element('course').value)
    .forEach(lecture => element('lecture').add(new Option(lecture.title, lecture.id)));
}

element('course').addEventListener('change', () => { clearResult(); populateLectures(); });
element('lecture').addEventListener('change', clearResult);
element('question-form').addEventListener('submit', async event => {
  event.preventDefault();
  const question = element('question').value.trim();
  if (!question) return;
  clearResult();
  controller = new AbortController();
  const active = controller;
  element('submit').disabled = true;
  element('question-form').setAttribute('aria-busy', 'true');
  element('status').textContent = 'Passende Stellen werden gesucht …';
  try {
    const result = await askLecture({ question, courseId: element('course').value || null, lectureId: element('lecture').value || null }, { signal: active.signal });
    if (!active.signal.aborted) render(result);
  } catch (error) { if (!active.signal.aborted) element('status').textContent = error.message; }
  finally {
    if (controller === active) { element('submit').disabled = false; element('question-form').setAttribute('aria-busy', 'false'); }
  }
});
document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => {
  element('course').value = ''; populateLectures(); element('question').value = button.dataset.question;
  element('question-form').requestSubmit();
}));

try {
  const responses = await Promise.all(['/api/courses', '/api/lectures', '/api/health'].map(url => fetch(url)));
  if (responses.some(response => !response.ok)) throw new Error('Vorlesungen konnten nicht geladen werden.');
  const [courseData, lectureData, health] = await Promise.all(responses.map(response => response.json()));
  courseData.courses.forEach(course => element('course').add(new Option(course.name, course.id)));
  lectures = lectureData.lectures; populateLectures();
  element('mode').textContent = health.answerMode === 'ollama' ? 'Lokale KI mit Transkriptquellen' : 'Erklärung aus Transkriptquellen';
} catch (error) { element('status').textContent = error.message; element('submit').disabled = true; }
