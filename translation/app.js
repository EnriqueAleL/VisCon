import * as pdfjs from './vendor/pdfjs/build/pdf.mjs';
import { TextLayerBuilder } from './vendor/pdfjs/web/pdf_viewer.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.mjs', import.meta.url).href;
const $ = (id) => document.getElementById(id);
// The app server owns /api when this viewer is embedded, so calls go out under
// /translate-api there. The Python service accepts either prefix.
const TR_API = location.pathname.startsWith('/translation/') ? '/translate-api' : '/api';
let activePdfName = 'ti_book.pdf';
let documentCatalogue = [];
let indexedDocument = true;
const status = $('status');
let pdf, loadingTask, objectUrl, pageNumber = 1, scale = 1;
let loadVersion = 0;
let pages = [];
let pageObserver;
let scrollFrame;
let fitPage = true;
let lastRenderSize = '';
let translatePopover;
let translatePopoverPage;
const prefetchedPages = new Set();
let prefetchQueue = [];
let prefetchBusy = false;

function updateControls() {
  $('viewer').dataset.currentPage = pageNumber;
  $('page-indicator').textContent = `${pageNumber} / ${pdf?.numPages || '—'}`;
}

// Each page keeps raster, selectable text, translation, and context layers.
// Only nearby pages retain canvases; page-sized placeholders keep scrolling stable.
function clearPage(record) {
  record.token++;
  record.renderTask?.cancel();
  record.textTask?.cancel();
  if (translatePopover && translatePopoverPage === record.number) clearTranslationPopover();
  record.surface.replaceChildren();
  record.rendered = false;
  record.surface.removeAttribute('aria-busy');
}

// Select text in a page's text layer to see it translated in a small box near the selection.
function clearTranslationPopover() {
  translatePopover?.remove();
  translatePopover = null;
  translatePopoverPage = null;
}
async function requestTranslation(text, pageNumber) {
  const response = await fetch(`${TR_API}/translate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(indexedDocument ? { page: pageNumber } : {}), pdf: activePdfName }),
  });
  const data = await response.json().catch(() => ({ error: 'The reading companion is temporarily unavailable. Please try again.' }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data.translation;
}
// Warm the server's cache for a page's paragraphs so a later selection that matches a whole
// paragraph resolves instantly. Queued one at a time: firing a burst of these per scroll is
// what was causing requests (including your own live selection) to queue up and crawl.
function prefetchPageTranslation(record) {
  if (!indexedDocument || prefetchedPages.has(record.number)) return;
  prefetchedPages.add(record.number);
  prefetchQueue.push(record.number);
  runPrefetchQueue();
}
async function runPrefetchQueue() {
  if (prefetchBusy) return;
  const page = prefetchQueue.shift();
  if (page === undefined) return;
  prefetchBusy = true;
  try {
    const response = await fetch(`${TR_API}/translate-page`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, pdf: activePdfName }),
    });
    if (!response.ok) throw new Error('Prefetch unavailable');
  } catch {
    prefetchedPages.delete(page);
  } finally {
    prefetchBusy = false;
    runPrefetchQueue();
  }
}
async function showTranslationForSelection() {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
  const anchor = selection.anchorNode;
  const element = anchor instanceof Element ? anchor : anchor?.parentElement;
  const record = pages.find(item => item.surface === element?.closest('.pdf-page'));
  if (!record) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const viewer = $('viewer');
  const viewerRect = viewer.getBoundingClientRect();
  const text = selection.toString();

  clearTranslationPopover();
  // Anchored to #viewer (which scrolls, not clips) rather than the page surface (which
  // clips at its own bottom edge via overflow:hidden) so a tall translation never gets cut off.
  const width = Math.min(340, viewer.clientWidth - 32);
  const left = viewer.scrollLeft + Math.max(16, Math.min(rect.left - viewerRect.left, viewer.clientWidth - width - 16));
  const top = rect.bottom - viewerRect.top + viewer.scrollTop + 6;
  const popover = document.createElement('div');
  popover.className = 'translation-popover loading';
  popover.style.width = `${width}px`;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.innerHTML = '<button class="close" aria-label="Close translation">×</button><p class="translation-label">TRANSLATION</p><p class="original"></p><p class="result" role="status"></p>';
  popover.setAttribute('role', 'region');
  popover.setAttribute('aria-label', 'Selected passage translation');
  popover.querySelector('.original').textContent = text.length > 160 ? `${text.slice(0, 157)}…` : text;
  popover.querySelector('.close').addEventListener('click', () => {
    document.getSelection()?.removeAllRanges();
    clearTranslationPopover();
  });
  viewer.append(popover);
  translatePopover = popover;
  translatePopoverPage = record.number;

  try {
    const translation = await requestTranslation(text, record.number);
    if (translatePopover !== popover) return;
    popover.classList.remove('loading');
    popover.querySelector('.result').textContent = translation;
    const visibleBottom = viewer.scrollTop + viewer.clientHeight - 16;
    if (top + popover.offsetHeight > visibleBottom) {
      popover.style.top = `${Math.max(viewer.scrollTop + 16, rect.top - viewerRect.top + viewer.scrollTop - popover.offsetHeight - 8)}px`;
    }
  } catch (error) {
    if (translatePopover !== popover) return;
    popover.classList.remove('loading');
    popover.querySelector('.result').textContent = `Could not translate: ${error.message}`;
  }
}
$('viewer').addEventListener('pointerup', (event) => {
  if (translatePopover && translatePopover.contains(event.target)) return;
  setTimeout(showTranslationForSelection, 0);
});
document.addEventListener('pointerdown', (event) => {
  if (translatePopover && !translatePopover.contains(event.target)) clearTranslationPopover();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (translatePopover) { clearTranslationPopover(); document.getSelection()?.removeAllRanges(); }
  else if (!$('chat-panel').hidden) setChatOpen(false);
  else if (new URLSearchParams(location.search).get('embedded') === 'galaxy') returnToGalaxy();
});
function resetPages() {
  pageObserver?.disconnect();
  pages.forEach(clearPage);
  pages = [];
  prefetchedPages.clear();
  prefetchQueue = [];
  $('page-stage').replaceChildren();
}
async function paintPage(record) {
  if (record.rendered) return;
  record.rendered = true;
  const token = ++record.token;
  const viewport = record.page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const textBuilder = new TextLayerBuilder({ pdfPage: record.page });
  const text = textBuilder.div;
  record.textTask = textBuilder;
  const translation = document.createElement('div');
  translation.className = 'translation-layer';
  record.surface.replaceChildren(canvas, text, translation);
  record.surface.setAttribute('aria-busy', 'true');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  try {
    record.renderTask = record.page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
    await record.renderTask.promise;
    if (token !== record.token) return;
    await textBuilder.render({ viewport });
    if (token !== record.token) return;
    record.surface.setAttribute('aria-busy', 'false');
  } catch (error) {
    if (token === record.token && error.name !== 'RenderingCancelledException' && error.name !== 'AbortException') {
      record.rendered = false;
      record.surface.setAttribute('aria-busy', 'false');
      status.textContent = `Could not render page ${record.number}: ${error.message}`;
    }
  }
}
function updateVisiblePage() {
  if (!pages.length || $('viewer').clientHeight <= 32) return;
  const top = $('viewer').getBoundingClientRect().top + 60;
  let closest = pages[0], distance = Infinity;
  for (const record of pages) {
    const rect = record.surface.getBoundingClientRect();
    const d = rect.top <= top && rect.bottom > top ? 0 : Math.min(Math.abs(rect.top - top), Math.abs(rect.bottom - top));
    if (d < distance) { closest = record; distance = d; }
  }
  pageNumber = closest.number;
  updateControls();
}
function renderPage(resetScroll = false) {
  if (!pages.length || $('viewer').clientWidth <= 32 || $('viewer').clientHeight <= 32) return;
  lastRenderSize = `${$('viewer').clientWidth}:${$('viewer').clientHeight}`;
  const anchor = pages[pageNumber - 1];
  const offset = ($('viewer').scrollTop - anchor.row.offsetTop) / anchor.surface.clientHeight;
  if (fitPage) {
    const availableWidth = Math.max(1, Math.min(900, $('viewer').clientWidth - 32));
    const availableHeight = Math.max(1, $('viewer').clientHeight - 32);
    const dimensions = pages.map(record => record.page.getViewport({ scale: 1 }));
    scale = Math.min(
      availableWidth / Math.max(...dimensions.map(viewport => viewport.width)),
      availableHeight / Math.max(...dimensions.map(viewport => viewport.height)),
    );
  }
  pageObserver?.disconnect();
  pages.forEach(record => {
    clearPage(record);
    const viewport = record.page.getViewport({ scale });
    record.surface.style.width = `${viewport.width}px`;
    record.surface.style.height = `${viewport.height}px`;
    record.surface.style.setProperty('--scale-factor', scale);
    record.surface.style.setProperty('--total-scale-factor', scale * record.page.userUnit);
  });
  $('viewer').scrollTop = resetScroll ? 0 : anchor.row.offsetTop + offset * anchor.surface.clientHeight;
  pageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = pages[Number(entry.target.dataset.pageNumber) - 1];
      if (!record || record.surface !== entry.target) continue;
      if (entry.isIntersecting) { paintPage(record); prefetchPageTranslation(record); }
      else {
        // Preserve a selection when scrolling its starting page out of view.
        const selection = document.getSelection();
        const selected = selection && !selection.isCollapsed &&
          Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i))
            .some(range => range.intersectsNode(record.surface));
        if (!selected) clearPage(record);
      }
    }
  }, { root: $('viewer'), rootMargin: '700px 0px' });
  pages.forEach(record => pageObserver.observe(record.surface));
  updateControls();
}
async function buildPages(document, version) {
  const pageObjects = await Promise.all(Array.from({ length: document.numPages }, (_, index) => document.getPage(index + 1)));
  if (version !== loadVersion) return;
  const fragment = window.document.createDocumentFragment();
  pages = pageObjects.map((page, index) => {
    const row = window.document.createElement('div');
    row.className = 'page-row';
    const surface = window.document.createElement('article');
    surface.className = 'pdf-page';
    surface.dataset.pageNumber = index + 1;
    surface.setAttribute('aria-label', `Page ${index + 1}`);
    const context = window.document.createElement('aside');
    context.className = 'page-context';
    context.hidden = true;
    context.setAttribute('aria-label', `Context for page ${index + 1}`);
    row.append(surface, context);
    fragment.append(row);
    return { page, number: index + 1, row, surface, token: 0, rendered: false };
  });
  $('page-stage').append(fragment);
  renderPage(true);
  status.textContent = '';
}
$('viewer').addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => { scrollFrame = null; updateVisiblePage(); });
}, { passive: true });

async function loadPdf(source, name) {
  const version = ++loadVersion;
  resetPages();
  const oldTask = loadingTask;
  pdf = null;
  updateControls();

  status.textContent = 'Opening your document…';
  try {
    if (oldTask) await oldTask.destroy();
    if (version !== loadVersion) return;
    loadingTask = pdfjs.getDocument({ ...source, cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true, standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href, wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href });
    const document = await loadingTask.promise;
    if (version !== loadVersion) return;
    pdf = document;
    pageNumber = 1;
    fitPage = true;
    window.document.title = `${name} · VisCon`;
    $('document-name').textContent = name === 'ti_book.pdf' ? 'Theoretische Informatik' : name;
    const local = source.url.startsWith('blob:');
    const entry = documentCatalogue.find(document => document.filename === name);
    indexedDocument = !local && Boolean(entry?.indexed);
    activePdfName = local ? `local:${name}` : name;
    if (window.parent !== window) window.parent.postMessage({ type: 'viscon:document-opened', documentId: local ? null : entry?.id }, location.origin);
    $('document-name').textContent = local ? name : entry?.title || name;
    $('chat-input').disabled = !indexedDocument;
    $('chat-form').querySelector('button').disabled = !indexedDocument;
    $('chat-scope').textContent = indexedDocument ? 'Answers are grounded in the indexed book.' : local ? 'Local PDF: selection translation is available. Document questions require an indexed book.' : 'Select text to translate a passage. Questions require this document to be indexed.';
    $('chat-messages').querySelectorAll('.chat-message').forEach(message => message.remove());
    $('chat-welcome').hidden = false;
    $('viewer').setAttribute('aria-label', `PDF document: ${name}`);
    await buildPages(document, version);
  } catch (error) {
    if (version === loadVersion) status.textContent = `Could not open this PDF: ${error.message}`;
  }
}

async function openPdf(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    status.textContent = 'Please choose a PDF file.';
    return;
  }
  const url = URL.createObjectURL(file);
  const oldUrl = objectUrl;
  objectUrl = url;
  await loadPdf({ url }, file.name);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
}
function goToPage(number) {
  if (!pdf || !Number.isFinite(number)) return;
  pageNumber = Math.min(pdf.numPages, Math.max(1, Math.trunc(number)));
  const record = pages[pageNumber - 1];
  if (record) {
    $('viewer').scrollTop = record.row.offsetTop;
    paintPage(record);
  }
  updateControls();
}
$('viewer').addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    goToPage(pageNumber + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (pdf && fitPage && `${$('viewer').clientWidth}:${$('viewer').clientHeight}` !== lastRenderSize) renderPage();
  }, 100);
}).observe($('viewer'));
let dragDepth = 0;
window.addEventListener('dragenter', (event) => {
  event.preventDefault();
  if (event.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); }
});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); }
});
window.addEventListener('drop', (event) => {
  event.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  openPdf(event.dataTransfer.files[0]);
});


// Ask questions about the whole document; the server points back at a page via
// /api/ask, built from an offline per-page summary index (`index-book`), never from
// anything the chat model itself invents.
const chatMessages = $('chat-messages');
const chatForm = $('chat-form');
const chatInput = $('chat-input');

function addMessage(role, text, className = '') {
  const message = document.createElement('div');
  message.className = `chat-message ${role} ${className}`.trim();
  message.textContent = text;
  $('chat-welcome').hidden = true;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

async function askDocument(question) {
  const response = await fetch(`${TR_API}/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, pdf: activePdfName }),
  });
  const data = await response.json().catch(() => ({ error: 'The reading companion is temporarily unavailable. Please try again.' }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question || !indexedDocument || chatInput.disabled) return;
  chatInput.value = '';
  chatInput.disabled = true;
  chatForm.querySelector('button').disabled = true;
  const version = loadVersion;
  addMessage('user', question);
  const pending = addMessage('assistant', 'Thinking…', 'pending');

  try {
    const result = await askDocument(question);
    if (version !== loadVersion) return;
    pending.remove();
    const answer = addMessage('assistant', result.answer, result.found ? '' : 'not-found');
    if (result.found && result.page) {
      const jump = document.createElement('button');
      jump.className = 'chat-jump';
      jump.textContent = `Go to page ${result.page}`;
      jump.addEventListener('click', () => goToPage(result.page));
      answer.append(document.createElement('br'), jump);
    }
  } catch (error) {
    if (version !== loadVersion) return;
    pending.remove();
    addMessage('assistant', `Could not answer: ${error.message}`, 'not-found');
  } finally {
    if (version === loadVersion) {
      chatInput.disabled = !indexedDocument;
      chatForm.querySelector('button').disabled = !indexedDocument;
      chatInput.focus();
    }
  }
});

function returnToGalaxy() {
  if (window.parent !== window && new URLSearchParams(location.search).get('embedded') === 'galaxy') {
    window.parent.postMessage({ type: 'viscon:close-document' }, location.origin);
  } else location.assign('/');
}
$('return-galaxy').addEventListener('click', event => { event.preventDefault(); returnToGalaxy(); });
function setChatOpen(open) {
  $('chat-panel').hidden = !open;
  $('chat-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('chat-input').focus();
  else $('chat-toggle').focus();
}
$('chat-toggle').addEventListener('click', () => setChatOpen($('chat-panel').hidden));
$('chat-close').addEventListener('click', () => setChatOpen(false));
$('open-pdf').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => { openPdf($('file-input').files[0]); $('file-input').value = ''; });
async function openInitialDocument() {
  try {
    const response = await fetch(new URL('./documents.json', import.meta.url));
    if (!response.ok) throw new Error('The document list could not be loaded.');
    documentCatalogue = (await response.json()).documents;
    const requestedId = new URLSearchParams(location.search).get('document');
    const entry = requestedId ? documentCatalogue.find(document => document.id === requestedId) : documentCatalogue[0];
    if (!entry || !/^[^/\\]+\.pdf$/i.test(entry.filename)) throw new Error('This document is not available. Return to the course to choose another.');
    await loadPdf({ url: new URL(entry.filename, import.meta.url).href }, entry.filename);
  } catch (error) { status.textContent = error.message; }
}
openInitialDocument();
