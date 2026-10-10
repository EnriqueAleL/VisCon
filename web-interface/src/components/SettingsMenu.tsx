import { useEffect, useId, useRef, useState } from 'react';
import { useI18n, type MessageKey, type UiLanguage } from '../i18n';

export type AnswerLanguage = 'auto' | 'en' | 'de';

const ANSWER_OPTIONS: { value: AnswerLanguage; label: string | MessageKey; hint: MessageKey }[] = [
  { value: 'auto', label: 'settings.auto', hint: 'settings.autoHint' },
  { value: 'de', label: 'Deutsch', hint: 'settings.deHint' },
  { value: 'en', label: 'English', hint: 'settings.enHint' },
];

const INTERFACE_OPTIONS: { value: UiLanguage; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

interface SettingsMenuProps {
  language: AnswerLanguage;
  onLanguage: (language: AnswerLanguage) => void;
}

/** The round "DU" button in the header: opens a small panel with the language settings. */
export function SettingsMenu({ language, onLanguage }: SettingsMenuProps) {
  const { t, language: uiLanguage, setLanguage: setUiLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const labelOf = (label: string) => (label === 'settings.auto' ? t('settings.auto') : label);

  return (
    <div className="settings-menu" ref={root}>
      <button
        type="button"
        className="avatar"
        title={t('settings.title')}
        aria-label={t('settings.title')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        DU
      </button>
      {open && (
        <div className="settings-panel" id={panelId} role="group" aria-label={t('settings.title')}>
          <p className="settings-title">{t('settings.interface')}</p>
          <div className="settings-options" role="radiogroup" aria-label={t('settings.interface')}>
            {INTERFACE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={uiLanguage === option.value}
                className={`settings-option ${uiLanguage === option.value ? 'selected' : ''}`}
                onClick={() => setUiLanguage(option.value)}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <p className="settings-title settings-title-spaced">{t('settings.answer')}</p>
          <div className="settings-options" role="radiogroup" aria-label={t('settings.answer')}>
            {ANSWER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={language === option.value}
                className={`settings-option ${language === option.value ? 'selected' : ''}`}
                onClick={() => onLanguage(option.value)}
              >
                <span>{labelOf(option.label)}</span>
                <small>{t(option.hint)}</small>
              </button>
            ))}
          </div>
          <p className="settings-note">{t('settings.note')}</p>
        </div>
      )}
    </div>
  );
}
