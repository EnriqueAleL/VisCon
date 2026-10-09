import type { AnswerResult, Source } from '../client/client.mjs';
export type Explainer = (question: string, sources: Source[]) => Promise<{ supported: boolean; paragraphs: { text: string; sourceIds: string[] }[] }>;
export function createAnswerService(catalog: unknown, options?: { explain?: Explainer | null }): (input: unknown) => Promise<AnswerResult>;
export function createOllamaExplainer(options: { model: string; baseUrl?: string; timeoutMs?: number }): Explainer;
