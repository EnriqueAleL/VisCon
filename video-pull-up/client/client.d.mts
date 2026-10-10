export interface Source {
  id: string;
  lectureId: string;
  courseId: string;
  courseName: string;
  lectureTitle: string;
  segmentId: string;
  title: string;
  start: number;
  end: number;
  contextStart: number;
  transcript: string;
  mediaUrl: string | null;
  playbackUrl: string | null;
  score: number;
  demo: boolean;
}
export interface AnswerResult {
  question: string;
  courseId: string | null;
  lectureId: string | null;
  status: 'answered' | 'no_match' | 'insufficient_context';
  answer: { mode: 'extractive' | 'generated' | 'extractive_fallback'; text: string; paragraphs: { text: string; sourceIds: string[] }[]; notice: string };
  sources: Source[];
  playback: { sourceId: string; lectureId: string; mediaUrl: string; url: string; start: number; end: number } | null;
  videos: { id: string; courseId: string; title: string; duration: number; mediaUrl?: string | null; segments: { id: string; start: number; end: number; title: string; transcript: string; sourceId: string }[] }[];
}
export function askLecture(request: { question: string; courseId?: string | null; lectureId?: string | null; limit?: number; language?: 'auto' | 'en' | 'de' }, options?: { baseUrl?: string; signal?: AbortSignal }): Promise<AnswerResult>;
export function pullUpVideo(video: HTMLVideoElement, source: Pick<Source, 'mediaUrl' | 'start'>, options?: { baseUrl?: string; autoplay?: boolean }): Promise<{ cancelled: boolean; playing: boolean }>;
