/**
 * Display-language core (English / French). Presentation only: the server stays the single authority for scores, timers, hints, fragments and
 * unlocks, and keeps sending English. This module only decides how a text is SHOWN.
 *
 * `t(text, vars?)` takes the English text as its key:
 *  - the English text is the source of truth and is returned unchanged in English (so the English screens are byte-identical);
 *  - in French the exact text is looked up; a text that contains {placeholders} is filled from `vars`;
 *  - a text received from the server with variable parts ("No activity for 10 days") is matched against the registered templates
 *    ("No activity for {n} days") and re-filled in French; values captured by a template are translated too when they are known;
 *  - a text nobody translated is shown in English: never an empty string, never a key.
 */
export type Lang = 'en' | 'fr';
export type Vars = Record<string, string | number>;

let current: Lang = 'en';
const listeners = new Set<() => void>();
const exact = new Map<string, string>();
type Template = { re: RegExp; names: string[]; fr: string; weight: number };
let templates: Template[] = [];
let templatesDirty = false;
/** Keys registered twice with different French texts: the unit test fails on any entry here. */
export const conflicts: string[] = [];

export const getLang = (): Lang => current;
export function setLangRaw(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((listener) => listener());
}
/** First assignment at start-up: sets <html lang> even when the language did not change. */
export function initLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Fewest fixed characters a key needs to act as a template for a server text. */
const MIN_FIXED_TEXT = 5;
const PLACEHOLDER = /\{(\w+)\}/g;
const fill = (text: string, vars: Vars): string => text.replace(PLACEHOLDER, (whole, name: string) => (name in vars ? String(vars[name]) : whole));

/** Registers French texts. A key may contain {placeholders}: it is then also usable as a template for server texts. */
export function registerFr(entries: Record<string, string>): void {
  for (const [en, fr] of Object.entries(entries)) {
    const existing = exact.get(en);
    if (existing !== undefined && existing !== fr) conflicts.push(en);
    exact.set(en, fr);
    if (en.includes('{')) templatesDirty = true;
  }
}
export const frEntries = (): ReadonlyMap<string, string> => exact;

function compileTemplates(): void {
  templates = [];
  for (const [en, fr] of exact) {
    if (!/\{\w+\}/.test(en)) continue;
    const names: string[] = [];
    let literal = 0;
    const source = en.split(PLACEHOLDER).map((part, index) => {
      // split with a capture group alternates literal, name, literal, name...
      if (index % 2 === 1) { names.push(part); return '(.+?)'; }
      literal += part.length;
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    // A pattern with almost no fixed text ('{n}%', '{lab}:') would swallow any unknown server text: it stays usable with explicit variables only.
    if (literal < MIN_FIXED_TEXT) continue;
    templates.push({ re: new RegExp(`^${source}$`, 's'), names, fr, weight: literal });
  }
  // The template with the most fixed text wins, so a general pattern never hides a more specific one.
  templates.sort((a, b) => b.weight - a.weight);
  templatesDirty = false;
}

export function t(text: string, vars?: Vars): string {
  if (current === 'fr') {
    const direct = exact.get(text);
    if (direct !== undefined) return vars ? fill(direct, vars) : direct;
    if (!vars) {
      if (templatesDirty) compileTemplates();
      for (const template of templates) {
        const match = template.re.exec(text);
        if (!match) continue;
        const captured: Vars = {};
        template.names.forEach((name, index) => {
          const value = match[index + 1] ?? '';
          captured[name] = exact.get(value) ?? value;
        });
        return fill(template.fr, captured);
      }
    }
  }
  return vars ? fill(text, vars) : text;
}

/** Locale for numbers and dates. English keeps the 'en' locale the screens always used. */
export const locale = (): string => (current === 'fr' ? 'fr-FR' : 'en');
export const formatInt = (value: number): string => value.toLocaleString(locale());
export function formatDateTime(when: Date): string {
  return when.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
}

const NOUNS = new Map<string, readonly [string, string]>();
/** French nouns for plural(): key = the English singular, value = [singular, plural]. */
export function registerNouns(entries: Record<string, readonly [string, string]>): void {
  for (const [en, forms] of Object.entries(entries)) {
    const existing = NOUNS.get(en);
    if (existing && (existing[0] !== forms[0] || existing[1] !== forms[1])) conflicts.push(`noun:${en}`);
    NOUNS.set(en, forms);
  }
}
/** "3 missions" / "3 missions" (French: 0 and 1 are singular). `one` is the English singular and the key of the French noun. */
export function plural(n: number, one: string, many = `${one}s`): string {
  if (current === 'fr') {
    const forms = NOUNS.get(one);
    if (forms) return `${n} ${n < 2 ? forms[0] : forms[1]}`;
  }
  return `${n} ${n === 1 ? one : many}`;
}

export function resetForTests(): void {
  exact.clear(); templates = []; templatesDirty = false; conflicts.length = 0; NOUNS.clear(); current = 'en';
}
