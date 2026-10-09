import { useEffect, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import {
  availableYears,
  coursesForStudyYear,
  degreeNames,
  degreeShortNames,
  semesterNames,
  studyYears,
} from '../data/courseSelection';
import type { CourseSelection, Degree, Semester, StudyYear } from '../types';

const stepTitles = {
  year: 'Jahr auswählen',
  semester: 'Semester auswählen',
  study: 'Studienjahr auswählen',
  course: 'Fach auswählen',
};

interface CoursePickerProps {
  selectedCourse: CourseSelection | null;
  onSelect: (selection: CourseSelection) => void;
  onClear: () => void;
  onClose: () => void;
}

export function CoursePicker({ selectedCourse, onSelect, onClear, onClose }: CoursePickerProps) {
  const [step, setStep] = useState<keyof typeof stepTitles>('year');
  const [year, setYear] = useState(selectedCourse?.year ?? '');
  const [semester, setSemester] = useState<Semester | null>(selectedCourse?.semester ?? null);
  const [degree, setDegree] = useState<Degree | null>(selectedCourse?.degree ?? null);
  const [studyYear, setStudyYear] = useState<StudyYear | null>(selectedCourse?.studyYear ?? null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const focusNextStep = useRef(false);
  const availableCourses =
    semester && degree && studyYear ? coursesForStudyYear(year, semester, degree, studyYear) : [];

  useEffect(() => {
    if (!focusNextStep.current) return;
    optionsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    focusNextStep.current = false;
  }, [step]);

  return (
    <div className="lecture-picker-content" role="dialog" aria-label="Kursauswahl">
      <div className="lecture-picker-header">
        <h2 className="lecture-picker-title">{stepTitles[step]}</h2>
        <button
          className="lecture-picker-close"
          type="button"
          aria-label="Kursauswahl schliessen"
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>

      {step !== 'year' && (
        <div className="picker-breadcrumbs">
          <button
            type="button"
            aria-label="Jahr ändern"
            onClick={(event) => {
              focusNextStep.current = event.detail === 0;
              setStep('year');
            }}
          >
            {year}
          </button>
          {(step === 'study' || step === 'course') && semester && (
            <>
              <ChevronRight size={12} aria-hidden="true" />
              <button
                type="button"
                aria-label="Semester ändern"
                onClick={(event) => {
                  focusNextStep.current = event.detail === 0;
                  setStep('semester');
                }}
              >
                {semesterNames[semester]}
              </button>
            </>
          )}
          {step === 'course' && degree && studyYear && (
            <>
              <ChevronRight size={12} aria-hidden="true" />
              <button
                type="button"
                aria-label="Studienjahr ändern"
                onClick={(event) => {
                  focusNextStep.current = event.detail === 0;
                  setStep('study');
                }}
              >
                {degreeShortNames[degree]} · {studyYear}. Jahr
              </button>
            </>
          )}
        </div>
      )}

      <div
        ref={optionsRef}
        className="picker-options"
        role="group"
        aria-label={
          step === 'year'
            ? 'Jahr'
            : step === 'semester'
              ? 'Semester'
              : step === 'study'
                ? 'Studienjahr'
                : 'Fach'
        }
      >
        {step === 'year' &&
          availableYears.map((item) => (
            <button
              className="picker-option picker-year"
              type="button"
              key={item}
              onClick={(event) => {
                focusNextStep.current = event.detail === 0;
                setYear(item);
                setSemester(null);
                setDegree(null);
                setStudyYear(null);
                setStep('semester');
                onClear();
              }}
            >
              <span>{item}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}

        {step === 'semester' &&
          (['spring', 'autumn'] as const).map((item) => (
            <button
              className="picker-option"
              type="button"
              key={item}
              onClick={(event) => {
                focusNextStep.current = event.detail === 0;
                setSemester(item);
                setDegree(null);
                setStudyYear(null);
                setStep('study');
                onClear();
              }}
            >
              <span>{semesterNames[item]}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}

        {step === 'study' &&
          (['bsc', 'msc'] as const).map((item) => (
            <div
              className="picker-study-group"
              role="group"
              aria-label={degreeNames[item]}
              key={item}
            >
              <h3 className="picker-study-label">{degreeNames[item]}</h3>
              <div className="picker-study-years">
                {studyYears[item].map((itemYear) => (
                  <button
                    className="picker-option picker-study-option"
                    type="button"
                    key={itemYear}
                    aria-label={`${degreeNames[item]}, ${itemYear}. Studienjahr`}
                    onClick={(event) => {
                      focusNextStep.current = event.detail === 0;
                      setDegree(item);
                      setStudyYear(itemYear);
                      setStep('course');
                      onClear();
                    }}
                  >
                    {itemYear}
                  </button>
                ))}
              </div>
            </div>
          ))}

        {step === 'course' &&
          semester &&
          degree &&
          studyYear &&
          availableCourses.map((course) => (
            <button
              className="picker-option"
              type="button"
              key={course.id}
              onClick={() => onSelect({ year, semester, degree, studyYear, courseId: course.id })}
            >
              <span>{course.name}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}
      </div>

      {step === 'course' && availableCourses.length === 0 && (
        <p className="lecture-picker-empty" role="status">
          Für das {semester && semesterNames[semester]} {year} im {studyYear}. Studienjahr (
          {degree && degreeShortNames[degree]}) sind noch keine Fächer verfügbar.
        </p>
      )}
    </div>
  );
}
