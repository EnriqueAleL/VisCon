import { storedLanguage, translate } from './i18n';
export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || translate(storedLanguage(), 'error.connection'));
  }
  return response.json();
}

export function formatTime(seconds: number): string {
  const value = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` : `${minutes}:${String(value % 60).padStart(2, '0')}`;
}
