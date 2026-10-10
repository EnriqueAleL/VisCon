/** Framework-independent integration; use baseUrl='' with a Vite /api + /media proxy. */
export async function askLecture({ question, courseId = null, lectureId = null, limit = 3, language = 'auto' }, { baseUrl = '', signal } = {}) {
  const response = await fetch(`${baseUrl}/api/ask`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, courseId, lectureId, limit, language }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Die Frage konnte nicht beantwortet werden.');
  return result;
}

/** Seeks after metadata loads. A later selection cancels pending handlers for that player. */
const pending = new WeakMap();
export async function pullUpVideo(video, source, { baseUrl = '', autoplay = false } = {}) {
  if (!source.mediaUrl) throw new Error('Für diese Vorlesung ist noch kein abspielbares Video hinterlegt.');
  if (!Number.isFinite(source.start) || source.start < 0) throw new Error('Ungültige Zeitmarke.');
  const old = pending.get(video);
  old?.cancel();
  const url = new URL(source.mediaUrl, baseUrl || globalThis.location?.href || 'http://localhost');
  url.hash = '';
  video.pause();
  if (video.src !== url.href) { video.src = url.href; video.load(); }
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', seek);
      video.removeEventListener('error', fail);
      if (pending.get(video)?.cancel === cancel) pending.delete(video);
    };
    const cancel = () => { if (finished) return; finished = true; cleanup(); resolve({ cancelled: true, playing: false }); };
    const fail = () => { if (finished) return; finished = true; cleanup(); reject(new Error('Das Vorlesungsvideo konnte nicht geladen werden.')); };
    const seek = async () => {
      if (finished) return;
      if (Number.isFinite(video.duration) && source.start >= video.duration) {
        finished = true; cleanup(); reject(new Error('Die Zeitmarke liegt ausserhalb des Videos.')); return;
      }
      try {
        video.currentTime = source.start;
        let playing = false;
        if (autoplay) {
          try { await video.play(); playing = true; }
          catch { /* Browser autoplay policies: keep exact position and show native play controls. */ }
        }
        if (finished) return;
        finished = true; cleanup(); resolve({ cancelled: false, playing });
      } catch { fail(); }
    };
    pending.set(video, { cancel });
    video.addEventListener('error', fail, { once: true });
    timer = setTimeout(fail, 15000);
    if (video.readyState >= 1) void seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  });
}
