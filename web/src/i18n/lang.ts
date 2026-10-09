import { uiPreference } from '../lib/api';
import { getLang, initLang, setLangRaw, type Lang } from './core';
import { loadFrench } from './load';

/** ?lang=fr|en wins, then this tab's choice, then the browser language (French browsers open in French, everything else in English). */
export function detectLang(): Lang {
  try {
    const asked = new URLSearchParams(window.location.search).get('lang');
    if (asked === 'fr' || asked === 'en') return asked;
  } catch { /* no location */ }
  const stored = uiPreference.getLang();
  if (stored === 'fr' || stored === 'en') return stored;
  const browser = typeof navigator !== 'undefined' ? (navigator.language ?? '') : '';
  return /^fr(?:[-_]|$)/i.test(browser) ? 'fr' : 'en';
}

let wanted: Lang = 'en';
/**
 * The language switch: remembers the choice for this tab and re-renders every screen. French is downloaded on first use; if that fails
 * (offline) the screen simply stays in the current language. The last button pressed wins when buttons are pressed quickly.
 */
export function setLanguage(lang: Lang): void {
  wanted = lang;
  if (getLang() === lang) return;
  if (lang === 'en') { uiPreference.setLang('en'); setLangRaw('en'); return; }
  loadFrench().then(
    () => { if (wanted === 'fr') { uiPreference.setLang('fr'); setLangRaw('fr'); } },
    () => { wanted = getLang(); },
  );
}

wanted = detectLang();
initLang(wanted);
