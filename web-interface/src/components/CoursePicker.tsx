import { useEffect, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import {
  OTHER_DEPARTMENT,
  availableDepartments,
  availableProgrammes,
  coursesIn,
  degreeName,
  degreeShortNames,
  departmentName,
  selectionForCourse,
} from '../data/courseSelection';
import type { Course, CourseSelection, Degree, Department, StudyYear } from '../types';
import { useI18n } from '../i18n';

const steps = ['department', 'programme', 'course'] as const;
type Step = (typeof steps)[number];

interface CoursePickerProps {
  courses: Course[];
  departments: Department[];
  selectedCourse: CourseSelection | null;
  onSelect: (selection: CourseSelection) => void;
  onClear: () => void;
  onClose: () => void;
}

export function CoursePicker({ courses, departments, selectedCourse, onSelect, onClear, onClose }: CoursePickerProps) {
  const { t, language } = useI18n();
  const [step, setStep] = useState<Step>('department');
  const [department, setDepartment] = useState(selectedCourse?.department ?? '');
  const [degree, setDegree] = useState<Degree | null>(selectedCourse?.degree ?? null);
  const [studyYear, setStudyYear] = useState<StudyYear | null>(selectedCourse?.studyYear ?? null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const focusNextStep = useRef(false);
  const availableCourses = degree && studyYear !== null ? coursesIn(department, degree, studyYear, courses) : [];

  useEffect(() => {
    if (!focusNextStep.current) return;
    optionsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    focusNextStep.current = false;
  }, [step]);

  const go = (event: { detail: number }, next: Step) => {
    focusNextStep.current = event.detail === 0;
    setStep(next);
  };

  return (
    <div className="lecture-picker-content" role="dialog" aria-label={t('picker.label')}>
      <div className="lecture-picker-header">
        <h2 className="lecture-picker-title">{t(`picker.title.${step}`)}</h2>
        <button
          className="lecture-picker-close"
          type="button"
          aria-label={t('picker.close')}
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>

      {step !== 'department' && (
        <div className="picker-breadcrumbs">
          <button type="button" aria-label={t('picker.changeDepartment')} onClick={(event) => go(event, 'department')}>
            {department === OTHER_DEPARTMENT ? t('picker.other') : department}
          </button>
          {step === 'course' && degree && studyYear !== null && studyYear > 0 && (
            <>
              <ChevronRight size={12} aria-hidden="true" />
              <button type="button" aria-label={t('picker.changeYear')} onClick={(event) => go(event, 'programme')}>
                {degreeShortNames[degree]} · {t('picker.year', { year: studyYear })}
              </button>
            </>
          )}
        </div>
      )}

      <div
        ref={optionsRef}
        className="picker-options"
        role="group"
        aria-label={t(`picker.group.${step}`)}
      >
        {step === 'department' &&
          availableDepartments(courses, departments).map((item) => (
            <button
              className="picker-option picker-year"
              type="button"
              key={item}
              onClick={(event) => {
                setDepartment(item);
                setDegree(null);
                setStudyYear(null);
                onClear();
                if (item === OTHER_DEPARTMENT) {
                  setDegree('unspecified');
                  setStudyYear(0);
                  go(event, 'course');
                } else go(event, 'programme');
              }}
            >
              <span>
                {item === OTHER_DEPARTMENT ? t('picker.other') : `${item} · ${departmentName(item, departments, language)}`}
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}

        {step === 'programme' &&
          (['bsc', 'msc'] as const).map((item) => {
            const years = availableProgrammes(department, courses).filter((programme) => programme.degree === item);
            if (!years.length) return null;
            return (
              <div className="picker-study-group" role="group" aria-label={degreeName(item, language)} key={item}>
                <h3 className="picker-study-label">{degreeName(item, language)}</h3>
                <div className="picker-study-years">
                  {years.map(({ studyYear: itemYear }) => (
                    <button
                      className="picker-option picker-study-option"
                      type="button"
                      key={itemYear}
                      aria-label={t('picker.yearLabel', { degree: degreeName(item, language), year: itemYear })}
                      onClick={(event) => {
                        setDegree(item);
                        setStudyYear(itemYear);
                        onClear();
                        go(event, 'course');
                      }}
                    >
                      {itemYear}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

        {step === 'course' &&
          availableCourses.map((course) => (
            <button
              className="picker-option"
              type="button"
              key={course.id}
              onClick={() => onSelect(selectionForCourse(course))}
            >
              <span>{course.name}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}
      </div>

      {step === 'course' && availableCourses.length === 0 && (
        <p className="lecture-picker-empty" role="status">
          {t('picker.empty')}
        </p>
      )}
    </div>
  );
}
