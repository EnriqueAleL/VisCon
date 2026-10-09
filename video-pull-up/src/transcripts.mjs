import { InputError } from './catalog.mjs';

function timestamp(value) {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/.exec(value);
  if (!match) throw new InputError(`Ungültiger Untertitel-Zeitstempel: ${value}`);
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function plainText(value) {
  return value.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,
    entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity])
    .replace(/\s+/g, ' ').trim();
}

/** Import time-aligned WebVTT or SRT. Overlapping cues are valid; decreasing starts are not. */
export function parseSubtitles(content) {
  if (typeof content !== 'string') throw new InputError('Transkript muss Text sein.');
  const blocks = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/);
  const cues = [];
  for (const block of blocks) {
    if (/^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block)) continue;
    const lines = block.split('\n');
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0 || timingIndex > 1) throw new InputError('Untertitelblock ohne gültige Zeitzeile.');
    const timing = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[timingIndex]);
    if (!timing) throw new InputError('Ungültige Untertitelzeitzeile.');
    const start = timestamp(timing[1]);
    const end = timestamp(timing[2]);
    const text = plainText(lines.slice(timingIndex + 1).join(' '));
    if (end <= start) throw new InputError('Untertitelende muss nach dem Start liegen.');
    if (cues.length && start < cues.at(-1).start) throw new InputError('Untertitel müssen nach Startzeit geordnet sein.');
    if (text) cues.push({ start, end, text });
  }
  if (!cues.length) throw new InputError('Keine gesprochenen Transkriptabschnitte gefunden.');
  return cues;
}

/** Keep original cue timings for a more precise jump within a retrieval window. */
export function chunkCues(cues, lectureId, { maxSeconds = 60, gapSeconds = 8 } = {}) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || !Number.isFinite(gapSeconds) || gapSeconds < 0) {
    throw new InputError('Ungültige Abschnittslänge.');
  }
  const groups = [];
  let group = [];
  for (const cue of cues) {
    const currentEnd = group.length ? Math.max(...group.map(item => item.end)) : 0;
    if (group.length && (cue.end - group[0].start > maxSeconds || cue.start - currentEnd > gapSeconds)) {
      groups.push(group); group = [];
    }
    group.push(cue);
  }
  if (group.length) groups.push(group);
  return groups.map((items, index) => ({
    id: `${lectureId}-${index + 1}`,
    title: items[0].text.length > 90 ? `${items[0].text.slice(0, 87)}…` : items[0].text,
    start: items[0].start,
    end: Math.max(...items.map(item => item.end)),
    transcript: items.map(item => item.text).join(' '),
    cues: items,
  }));
}
