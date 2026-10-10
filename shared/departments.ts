/** ETH departments a course can belong to. The server is the one source: /api/courses sends this list to every front end. */
export const DEPARTMENTS = [
  { id: 'D-ARCH', name: 'Architektur' },
  { id: 'D-BAUG', name: 'Bau, Umwelt und Geomatik' },
  { id: 'D-BIOL', name: 'Biologie' },
  { id: 'D-BSSE', name: 'Biosysteme' },
  { id: 'D-CHAB', name: 'Chemie und angewandte Biowissenschaften' },
  { id: 'D-ERDW', name: 'Erdwissenschaften' },
  { id: 'D-GESS', name: 'Geistes-, Sozial- und Staatswissenschaften' },
  { id: 'D-HEST', name: 'Gesundheitswissenschaften und Technologie' },
  { id: 'D-INFK', name: 'Informatik' },
  { id: 'D-ITET', name: 'Informationstechnologie und Elektrotechnik' },
  { id: 'D-MATH', name: 'Mathematik' },
  { id: 'D-MATL', name: 'Materialwissenschaft' },
  { id: 'D-MAVT', name: 'Maschinenbau und Verfahrenstechnik' },
  { id: 'D-MTEC', name: 'Management, Technologie und Ökonomie' },
  { id: 'D-PHYS', name: 'Physik' },
  { id: 'D-USYS', name: 'Umweltsystemwissenschaften' },
] as const;
export type DepartmentId = typeof DEPARTMENTS[number]['id'];
export const DEGREES = ['bsc', 'msc'] as const;
export const SEMESTERS = ['autumn', 'spring'] as const;
/** Study years that exist per degree. */
export const STUDY_YEARS = { bsc: [1, 2, 3], msc: [1, 2] } as const;
