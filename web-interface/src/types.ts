export type CourseId = string;

export type Semester = 'autumn' | 'spring' | 'unknown';
export type Degree = 'bsc' | 'msc' | 'unspecified';
export type StudyYear = 0 | 1 | 2 | 3;

export interface CourseSelection {
  year: string;
  semester: Semester;
  degree: Degree;
  studyYear: StudyYear;
  courseId: Exclude<CourseId, 'all'>;
}

export interface QuestionHistoryEntry extends CourseSelection {
  question: string;
}

export interface Course {
  id: Exclude<CourseId, 'all'>;
  name: string;
  shortName: string;
  color: string;
  videoCount: number;
  degree: Degree;
  studyYear: StudyYear;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  title: string;
  transcript: string;
  summary?: string;
  sourceId?: string;
}

export interface Lecture {
  id: string;
  courseId: Exclude<CourseId, 'all'>;
  title: string;
  lecturer: string;
  date: string;
  duration: number;
  episode: number;
  thumbnail: string;
  segments: Segment[];
  keywords: string[];
  mediaUrl?: string | null;
  captionsUrl?: string;
  chaptersUrl?: string;
  chapters?: Segment[];
  demo?: boolean;
  hasSummary?: boolean;
}

export interface LectureSummary {
  overview: string;
  sections: { heading: string; chapter_ids: string[]; start: number | null; points: string[] }[];
  takeaways: string[];
}
