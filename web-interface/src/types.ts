export type CourseId = 'all' | 'linear-algebra' | 'analysis' | 'informatics';

export type Semester = 'autumn' | 'spring';
export type Degree = 'bsc' | 'msc';
export type StudyYear = 1 | 2 | 3;

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
}
