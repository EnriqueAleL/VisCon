export type CourseId = 'all' | 'linear-algebra' | 'analysis' | 'informatics';

export interface Course {
  id: Exclude<CourseId, 'all'>;
  name: string;
  shortName: string;
  color: string;
  videoCount: number;
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
