import { useSyncExternalStore } from 'react';
import { getLang, subscribe, type Lang } from './core';
import { setLanguage } from './lang';

/** Subscribes the component to the display language: it re-renders when the language is switched. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** French / English switch for the header of every screen. Short visible labels, full names for assistive technology. */
export function LanguageSwitch() {
  const lang = useLang();
  const option = (value: Lang, label: string, name: string) => (
    <button type="button" lang={value} aria-pressed={lang === value} aria-label={name} onClick={() => setLanguage(value)}>{label}</button>
  );
  return (
    <div className="lang-switch" role="group" aria-label="Langue / Language">
      {option('fr', 'FR', 'Français')}
      {option('en', 'EN', 'English')}
    </div>
  );
}
