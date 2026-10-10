import type { Course, CourseSelection, Degree, Lecture, Semester, StudyYear } from '../types';

export const degreeNames: Record<Degree, string> = { bsc: 'Bachelor (BSc)', msc: 'Master (MSc)', unspecified: 'Ohne Studiengangsangabe' };
export const degreeShortNames: Record<Degree, string> = { bsc: 'BSc', msc: 'MSc', unspecified: '' };
export const studyYears: Record<Degree, readonly StudyYear[]> = { bsc: [1, 2, 3], msc: [1, 2], unspecified: [0] };
export const semesterNames: Record<Semester, string> = { spring: 'Frühlingssemester', autumn: 'Herbstsemester', unknown: 'Ohne Semesterangabe' };

export function selectionForLecture(lecture: Lecture, courses: Course[]): CourseSelection {
  const course = courses.find(item => item.id === lecture.courseId);
  // The imported recordings have no verified date or study-year metadata.
  if (!lecture.date) return { courseId: lecture.courseId, year: 'archive', semester: 'unknown', degree: 'unspecified', studyYear: 0 };
  const month = Number(lecture.date.slice(5, 7));
  return {
    courseId: lecture.courseId,
    semester: month >= 3 && month <= 8 ? 'spring' : 'autumn',
    year: month <= 2 ? String(Number(lecture.date.slice(0, 4)) - 1) : lecture.date.slice(0, 4),
    degree: course?.degree ?? 'unspecified', studyYear: course?.studyYear ?? 0,
  };
}

export function selectionLabel(selection: CourseSelection) {
  return selection.year === 'archive' ? 'Aufzeichnungen · ohne Semesterangabe'
    : `${semesterNames[selection.semester]} ${selection.year} · ${degreeShortNames[selection.degree]} · ${selection.studyYear}. Jahr`;
}

export function sameCourseSelection(a: CourseSelection, b: CourseSelection): boolean {
  return a.courseId === b.courseId && a.year === b.year && a.semester === b.semester && a.degree === b.degree && a.studyYear === b.studyYear;
}

export function lectureMatchesSelection(lecture: Lecture, selection: CourseSelection, courses: Course[]): boolean {
  return sameCourseSelection(selectionForLecture(lecture, courses), selection);
}

export function availableYears(lectures: Lecture[], courses: Course[]): string[] {
  const recorded = [...new Set(lectures.map(lecture => selectionForLecture(lecture, courses).year))];
  const numeric = recorded.filter(year => year !== 'archive');
  const previous = numeric.length ? [String(Math.max(...numeric.map(Number)) - 1)] : [];
  return [...(recorded.includes('archive') ? ['archive'] : []), ...new Set([...numeric, ...previous].sort((a, b) => Number(b) - Number(a)))];
}

export function coursesForStudyYear(year: string, semester: Semester, degree: Degree, studyYear: StudyYear, lectures: Lecture[], courses: Course[]) {
  return courses.filter(course => lectures.some(lecture => lectureMatchesSelection(lecture, { year, semester, degree, studyYear, courseId: course.id }, courses)));
}

/** Validate storage structure independently of the catalogue's loading lifecycle. */
export function isCourseSelection(value: unknown): value is CourseSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Record<string, unknown>;
  if (typeof selection.courseId !== 'string' || !selection.courseId || selection.courseId === 'all') return false;
  if (selection.year === 'archive') return selection.semester === 'unknown' && selection.degree === 'unspecified' && selection.studyYear === 0;
  return typeof selection.year === 'string' && /^\d{4}$/.test(selection.year)
    && (selection.semester === 'spring' || selection.semester === 'autumn')
    && (selection.degree === 'bsc' || selection.degree === 'msc')
    && studyYears[selection.degree].some(year => year === selection.studyYear);
}
