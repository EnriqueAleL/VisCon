import type { Course, CourseSelection, Degree, Department, Lecture, StudyYear } from '../types';

/** Courses nobody has placed in the study programme yet are grouped here. */
export const OTHER_DEPARTMENT = 'other';

export const degreeNames: Record<Degree, string> = { bsc: 'Bachelor (BSc)', msc: 'Master (MSc)', unspecified: 'Ohne Studiengangsangabe' };
export const degreeShortNames: Record<Degree, string> = { bsc: 'BSc', msc: 'MSc', unspecified: '' };
export const studyYears: Record<Degree, readonly StudyYear[]> = { bsc: [1, 2, 3], msc: [1, 2], unspecified: [0] };

export function selectionForCourse(course: Course): CourseSelection {
  return { courseId: course.id, department: course.department ?? OTHER_DEPARTMENT, degree: course.degree, studyYear: course.studyYear };
}

export const departmentName = (id: string, departments: Department[]) =>
  id === OTHER_DEPARTMENT ? 'Weitere Fächer' : departments.find(item => item.id === id)?.name ?? id;

export function selectionLabel(selection: CourseSelection) {
  if (selection.department === OTHER_DEPARTMENT) return 'Weitere Fächer';
  return `${selection.department} · ${degreeShortNames[selection.degree]} · ${selection.studyYear}. Jahr`;
}

export function sameCourseSelection(a: CourseSelection, b: CourseSelection): boolean {
  return a.courseId === b.courseId && a.department === b.department && a.degree === b.degree && a.studyYear === b.studyYear;
}

export function lectureMatchesSelection(lecture: Lecture, selection: CourseSelection): boolean {
  return lecture.courseId === selection.courseId;
}

const visible = (courses: Course[]) => courses.filter(course => course.videoCount > 0);

/** Department codes that have a course with recordings, in the server's order; unplaced courses come last as "other". */
export function availableDepartments(courses: Course[], departments: Department[]): string[] {
  const used = new Set(visible(courses).map(course => course.department ?? OTHER_DEPARTMENT));
  const known = departments.map(item => item.id).filter(id => used.has(id));
  const unknown = [...used].filter(id => id !== OTHER_DEPARTMENT && !known.includes(id)).sort();
  return [...known, ...unknown, ...(used.has(OTHER_DEPARTMENT) ? [OTHER_DEPARTMENT] : [])];
}

/** The degree/study-year combinations a department has courses for, bachelor before master, early years first. */
export function availableProgrammes(department: string, courses: Course[]): { degree: Degree; studyYear: StudyYear }[] {
  const found = visible(courses).filter(course => (course.department ?? OTHER_DEPARTMENT) === department);
  const programmes = new Map(found.map(course => [`${course.degree}|${course.studyYear}`, { degree: course.degree, studyYear: course.studyYear }]));
  const order = (degree: Degree) => ['bsc', 'msc', 'unspecified'].indexOf(degree);
  return [...programmes.values()].sort((a, b) => order(a.degree) - order(b.degree) || a.studyYear - b.studyYear);
}

export function coursesIn(department: string, degree: Degree, studyYear: StudyYear, courses: Course[]): Course[] {
  return visible(courses).filter(course => (course.department ?? OTHER_DEPARTMENT) === department && course.degree === degree && course.studyYear === studyYear);
}

/** Validate storage structure independently of the catalogue's loading lifecycle. */
export function isCourseSelection(value: unknown): value is CourseSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Record<string, unknown>;
  if (typeof selection.courseId !== 'string' || !selection.courseId || selection.courseId === 'all') return false;
  if (typeof selection.department !== 'string' || !selection.department) return false;
  if (selection.department === OTHER_DEPARTMENT) return selection.degree === 'unspecified' && selection.studyYear === 0;
  return (selection.degree === 'bsc' || selection.degree === 'msc') && studyYears[selection.degree].some(year => year === selection.studyYear);
}
