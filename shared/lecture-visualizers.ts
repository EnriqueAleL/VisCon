import type { LectureMoment, VisualizerKind } from './world';

export interface LectureVisualizerLink {
  kind: VisualizerKind;
  presetId: string;
  title: string;
  lectureId: string;
  chapterId: string;
  start: number;
  end: number;
}

/** Hand-checked against qa/data/index.json. Examples adapt the taught concept;
 * they do not pretend to reproduce the lecturer's exact instruction sequence. */
export const LECTURE_VISUALIZER_LINKS: readonly LectureVisualizerLink[] = [
  ['pipeline', 'independent', 'Basic pipeline execution', 10, '10.20', 5076.77, 5351.41],
  ['pipeline', 'independent', 'Pipeline throughput', 11, '11.2', 122.855, 374.775],
  ['pipeline', 'independent', 'The ideal pipeline', 11, '11.4', 638.575, 754.735],
  ['pipeline', 'independent', 'Five-stage pipeline', 11, '11.6', 1049.495, 1374.175],
  ['pipeline', 'load-use', 'Stalls and bubbles', 11, '11.14', 3622.924, 3895.644],
  ['pipeline', 'forwarding', 'Data forwarding', 11, '11.16', 4188.964, 4720.044],
  ['pipeline', 'load-use', 'Load-use hazards', 11, '11.17', 4720.044, 4929.981],
  ['cache', 'locality', 'Temporal and spatial locality', 20, '20.9', 2479.66, 2712.86],
  ['cache', 'locality', 'How caches exploit locality', 20, '20.11', 2734.278, 3026.411],
  ['cache', 'locality', 'Tags and cache blocks', 20, '20.15', 4319.854, 4785.094],
  ['cache', 'locality', 'Address decomposition', 20, '20.16', 4787.334, 5144.424],
  ['cache', 'conflicts', 'Set associativity', 20, '20.17', 5147.734, 5400.294],
  ['cache', 'conflicts', 'Three cache organizations', 21, '21.3', 486.236, 805.888],
  ['cache', 'lru', 'LRU replacement', 21, '21.5', 1077.408, 1334.008],
  ['cache', 'conflicts', 'LRU thrashing', 21, '21.7', 1647.288, 1877.174],
  ['virtual-memory', 'translation', 'Pages, frames and faults', 23, '23.16', 3568.606, 3959.585],
  ['virtual-memory', 'translation', 'Address translation', 23, '23.17', 3959.585, 4482.771],
  ['virtual-memory', 'translation', 'Multilevel page tables', 23, '23.18', 4484.691, 4956.039],
  ['virtual-memory', 'translation', 'Page-table walker', 24, '24.13', 3144.018, 3324.846],
].map(([kind, presetId, title, lecture, chapter, start, end]) => ({
  kind: kind as VisualizerKind, presetId: presetId as string, title: title as string,
  lectureId: `lec${lecture}`, chapterId: `lec${lecture}-chapter-${String(chapter).replaceAll('.', '-')}`,
  start: start as number, end: end as number,
}));

export function lectureVisualizerAt(lectureId: string, seconds: number): LectureVisualizerLink | null {
  return LECTURE_VISUALIZER_LINKS.find(link => link.lectureId === lectureId
    && seconds >= link.start && seconds < link.end) ?? null;
}

export function lectureVisualizerForMoment(moment: Pick<LectureMoment, 'lectureId' | 'chapterId' | 'start'>): LectureVisualizerLink | null {
  return lectureVisualizerAt(moment.lectureId, moment.start)
    ?? LECTURE_VISUALIZER_LINKS.find(link => link.chapterId === moment.chapterId) ?? null;
}

export function lectureVisualizerHref(link: LectureVisualizerLink): string {
  const city = link.kind === 'pipeline' ? 'pipelining' : link.kind === 'cache' ? 'caches' : 'virtual-memory';
  return `/?${new URLSearchParams({ city, chapter: link.chapterId, at: String(link.start), tab: 'landmark', preset: link.presetId, planet: '1' })}`;
}
