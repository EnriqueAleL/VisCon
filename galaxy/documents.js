// Documents belong to courses. The reader preserves the galaxy's route and camera.
(function () {
  'use strict';
  const workspace = document.getElementById('document-workspace');
  const frame = document.getElementById('document-frame');
  const section = document.getElementById('course-documents');
  const list = document.getElementById('document-list');
  const empty = document.getElementById('document-empty');
  let trigger, courseId, documents = [], loaded = false, failed = false;
  let activeDocument;
  function open(document, button) {
    trigger = button;
    if (activeDocument !== document.id) {
      frame.src = `${frame.dataset.src}&document=${encodeURIComponent(document.id)}`;
      activeDocument = document.id;
    }
    workspace.showModal();
    frame.focus();
  }
  function close() {
    workspace.close();
    trigger?.focus();
  }
  function render() {
    section.hidden = !courseId;
    list.replaceChildren();
    if (!courseId) return;
    const available = documents.filter(document => document.courseId === courseId);
    document.getElementById('document-count').textContent = loaded ? available.length : '…';
    empty.hidden = available.length > 0;
    empty.textContent = failed ? 'Dokumentliste konnte nicht geladen werden. Bitte lade die Seite neu.'
      : loaded ? 'Noch keine Dokumente für diesen Kurs.' : 'Dokumente werden geladen…';
    for (const entry of available) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'course-document';
      const icon = document.createElement('span'); icon.className = 'document-symbol'; icon.textContent = '▤'; icon.setAttribute('aria-hidden', 'true');
      const identity = document.createElement('span');
      const kind = document.createElement('small'); kind.textContent = `${entry.kind} / PDF`;
      const title = document.createElement('strong'); title.textContent = entry.title;
      identity.append(kind, title);
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      button.append(icon, identity, arrow);
      button.addEventListener('click', () => open(entry, button));
      list.append(button);
    }
  }
  window.addEventListener('viscon:course-documents', event => { courseId = event.detail.courseId; render(); });
  fetch('/translation/documents.json').then(response => {
    if (!response.ok) throw new Error('Document catalogue unavailable');
    return response.json();
  }).then(catalogue => {
    if (!Array.isArray(catalogue.documents)) throw new Error('Invalid document catalogue');
    documents = catalogue.documents; loaded = true; render();
  })
    .catch(() => { failed = true; loaded = true; render(); });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'viscon:close-document') close();
    if (event.data?.type === 'viscon:document-opened') activeDocument = event.data.documentId;
  });
  workspace.addEventListener('cancel', event => { event.preventDefault(); close(); });
})();
