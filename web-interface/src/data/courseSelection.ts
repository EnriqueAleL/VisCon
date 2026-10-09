import { courses, lectures } from './lectures';
import type { CourseSelection, Degree, Lecture, Semester, StudyYear } from '../types';

export const degreeNames: Record<Degree, string> = {
  bsc: 'Bachelor (BSc)',
  msc: 'Master (MSc)',
};

export const degreeShortNames: Record<Degree, string> = {
  bsc: 'BSc',
  msc: 'MSc',
};

export const studyYears: Record<Degree, readonly StudyYear[]> = {
  bsc: [1, 2, 3],
  msc: [1, 2],
};

export const semesterNames: Record<Semester, string> = {
  spring: 'Frühlingssemester',
  autumn: 'Herbstsemester',
};

export function selectionForLecture(lecture: Lecture): CourseSelection {
  const month = Number(lecture.date.slice(5, 7));
  const course = courses.find((item) => item.id === lecture.courseId)!;
  return {
    courseId: lecture.courseId,
    semester: month >= 3 && month <= 8 ? 'spring' : 'autumn',
    year: month <= 2 ? String(Number(lecture.date.slice(0, 4)) - 1) : lecture.date.slice(0, 4),
    degree: course.degree,
    studyYear: course.studyYear,
  };
}

export function sameCourseSelection(a: CourseSelection, b: CourseSelection): boolean {
  return (
    a.courseId === b.courseId &&
    a.year === b.year &&
    a.semester === b.semester &&
    a.degree === b.degree &&
    a.studyYear === b.studyYear
  );
}

export function lectureMatchesSelection(lecture: Lecture, selection: CourseSelection): boolean {
  return sameCourseSelection(selectionForLecture(lecture), selection);
}

const recordedYears = lectures.map((lecture) => selectionForLecture(lecture).year);
const latestYear = Math.max(...recordedYears.map(Number));
// Include the previous year in the catalogue, even before its recordings are imported.
export const availableYears = [...new Set([...recordedYears, String(latestYear - 1)])].sort(
  (a, b) => Number(b) - Number(a),
);

export function coursesForPeriod(year: string, semester: Semester) {
  return courses.filter((course) =>
    lectures.some((lecture) =>
      lectureMatchesSelection(lecture, {
        year,
        semester,
        courseId: course.id,
        degree: course.degree,
        studyYear: course.studyYear,
      }),
    ),
  );
}

export function coursesForStudyYear(
  year: string,
  semester: Semester,
  degree: Degree,
  studyYear: StudyYear,
) {
  return coursesForPeriod(year, semester).filter(
    (course) => course.degree === degree && course.studyYear === studyYear,
  );
}

export function isCourseSelection(value: unknown): value is CourseSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Record<string, unknown>;
  return (
    typeof selection.year === 'string' &&
    availableYears.includes(selection.year) &&
    (selection.semester === 'spring' || selection.semester === 'autumn') &&
    (selection.degree === 'bsc' || selection.degree === 'msc') &&
    studyYears[selection.degree].some((year) => year === selection.studyYear) &&
    coursesForStudyYear(
      selection.year,
      selection.semester,
      selection.degree,
      selection.studyYear as StudyYear,
    ).some((course) => course.id === selection.courseId)
  );
}
