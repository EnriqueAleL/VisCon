import * as pdfjs from './vendor/pdfjs/build/pdf.mjs';
import { TextLayerBuilder } from './vendor/pdfjs/web/pdf_viewer.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/build/pdf.worker.mjs';
const $ = (id) => document.getElementById(id);
const status = $('status');
let pdf, loadingTask, objectUrl, pageNumber = 1, scale = 1;
let loadVersion = 0;
let pages = [];
let pageObserver;
let scrollFrame;
let fitPage = true;
let translatePopover;
let translatePopoverPage;
const prefetchedPages = new Set();
let prefetchQueue = [];
let prefetchBusy = false;

function updateControls() {
  $('viewer').dataset.currentPage = pageNumber;
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
  const response = await fetch('/api/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, page: pageNumber }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data.translation;
}
// Warm the server's cache for a page's paragraphs so a later selection that matches a whole
// paragraph resolves instantly. Queued one at a time: firing a burst of these per scroll is
// what was causing requests (including your own live selection) to queue up and crawl.
function prefetchPageTranslation(record) {
  if (prefetchedPages.has(record.number)) return;
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
    await fetch('/api/translate-page', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page }),
    });
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
  const left = Math.max(0, Math.min(rect.left - viewerRect.left + viewer.scrollLeft, viewer.scrollWidth - 280));
  const top = rect.bottom - viewerRect.top + viewer.scrollTop + 6;
  const popover = document.createElement('div');
  popover.className = 'translation-popover loading';
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.innerHTML = '<button class="close" aria-label="Close">×</button><p class="original"></p><p class="result"></p>';
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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') clearTranslationPopover(); });
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
  if (!pages.length) return;
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
  if (!pages.length) return;
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
    loadingTask = pdfjs.getDocument({ ...source, cMapUrl: './vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: './vendor/pdfjs/standard_fonts/', wasmUrl: './vendor/pdfjs/wasm/' });
    const document = await loadingTask.promise;
    if (version !== loadVersion) return;
    pdf = document;
    pageNumber = 1;
    fitPage = true;
    window.document.title = `${name} · Folio`;
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
  resizeTimer = setTimeout(() => { if (pdf && fitPage) renderPage(); }, 150);
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
loadPdf({ url: './ti_book.pdf' }, 'ti_book.pdf');

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
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

async function askDocument(question) {
  const response = await fetch('/api/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  chatInput.value = '';
  chatInput.disabled = true;
  addMessage('user', question);
  const pending = addMessage('assistant', 'Thinking…', 'pending');

  try {
    const result = await askDocument(question);
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
    pending.remove();
    addMessage('assistant', `Could not answer: ${error.message}`, 'not-found');
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});
