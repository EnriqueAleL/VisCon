import { useState } from 'react';

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  isValid: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return initialValue;
      const parsed: unknown = JSON.parse(item);
      return isValid(parsed) ? parsed : initialValue;
    } catch {
      return initialValue;
    }
  });

  const updateValue = (next: T | ((current: T) => T)) => {
    setValue((current) => {
      const updated = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // The interface remains usable if browser storage is unavailable.
      }
      return updated;
    });
  };

  return [value, updateValue] as const;
}
