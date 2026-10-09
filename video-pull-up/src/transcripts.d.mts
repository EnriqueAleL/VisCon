export interface Cue { start: number; end: number; text: string }
export function parseSubtitles(content: string): Cue[];
export function chunkCues(cues: Cue[], lectureId: string, options?: { maxSeconds?: number; gapSeconds?: number }): { id: string; title: string; start: number; end: number; transcript: string; cues: Cue[] }[];
