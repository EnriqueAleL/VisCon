/** The semester map contains only grounded chapters from the bundled DDCA course. */
export type VisualizerKind = 'pipeline' | 'cache' | 'virtual-memory';
export type CityStatus = 'dark' | 'exploring' | 'claimed' | 'dimming' | 'thriving';
export interface LectureMoment {
  id: string; lectureId: string; chapterId: string; lecture: number;
  title: string; summary: string; start: number; end: number; keyTerms: string[];
}
export interface WorldCity {
  id: string; name: string; description: string; order: number; color: string;
  latitude: number; longitude: number; position: [number, number, number];
  chapterIds: string[]; chapters: LectureMoment[]; keyTerms: string[];
  duration: number; visualizer?: VisualizerKind; landmark: string;
}
export interface WorldRoad { id: string; from: string; to: string; reason: string; kind: 'prerequisite' }
export interface WorldPlanet { id: string; name: string; shortName: string; available: boolean; color: string; description: string }
export interface WorldData {
  id: string; name: string; courseId: string; courseName: string; version: number;
  cities: WorldCity[]; roads: WorldRoad[]; planets: WorldPlanet[];
  stats: { lectures: number; totalChapters: number; contentChapters: number; excludedChapters: number; seconds: number };
  exam: ExamInfo;
}
export interface ExamInfo {
  date: string | null; configured: boolean; daysRemaining: number | null;
  label: string; mockExamMode: boolean;
}
export interface LearningIdentity { id: string; name: string; source: 'proxy' | 'guest'; demo: boolean }
export interface CityProgress {
  cityId: string; strength: number; halfLifeDays: number; status: CityStatus;
  exploredChapterIds: string[]; exploredCount: number; chapterCount: number;
  reviewCount: number; spacedReviews: number; mistakes: number; correctAnswers: number; totalAnswers: number;
  lastReviewedAt: string | null; nextReviewAt: string | null; puzzleSolved: boolean;
}
export interface ExpeditionStop { cityId: string; reason: 'review' | 'new' | 'weak'; minutes: number; label: string }
export interface DailyExpedition {
  id: string; date: string; mode: 'daily' | 'mock-exam'; minutes: number;
  stops: ExpeditionStop[]; questionCount: number; completedCityIds: string[];
}
export interface LearningSnapshot {
  profile: LearningIdentity; cities: CityProgress[]; readiness: number;
  litCityCount: number; totalCityCount: number; thrivingCityCount: number;
  expedition: DailyExpedition; exam: ExamInfo; serverTime: string;
  modelNotice: string; demoNotice: string | null;
}
export interface RecallOption { id: string; text: string }
export interface RecallQuestion { id: string; cityId: string; prompt: string; options: RecallOption[]; source: LectureMoment }
export interface RecallQuest { questId: string; cityId: string; questions: RecallQuestion[]; expiresAt: string; demo: boolean }
export interface MockExamQuest { questId: string; questions: RecallQuestion[]; expiresAt: string; durationSeconds: number; demo: boolean }
export interface RecallResult {
  questionId: string; correct: boolean; answer: string; explanation: string; source: LectureMoment;
}
export interface ReviewResponse {
  passed: boolean; score: number; correctCount: number; total: number;
  results: RecallResult[]; snapshot: LearningSnapshot;
}
