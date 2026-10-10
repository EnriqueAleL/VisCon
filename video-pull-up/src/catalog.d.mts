export class InputError extends Error { status: number; constructor(message: string, status?: number); }
export function validateCatalog<T>(catalog: T): T;
export function validateQuestion(input: unknown, catalog: unknown): { question: string; courseId: string | null; lectureId: string | null; limit: number };
