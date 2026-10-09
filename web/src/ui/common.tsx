import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { plural, t, useLang } from '../i18n';
import type { Competencies } from '../lib/competency';

export type View = 'home' | 'labs' | 'lab' | 'progress' | 'results' | 'profile' | 'teacher' | 'student' | 'content' | 'about';

/** The screens only a Faculty guest sees. 'about' (the About & demo guide) belongs to both roles. */
export const FACULTY_VIEWS: View[] = ['teacher', 'student', 'content'];

/** A role only ever sees its own screens, whatever view was requested before a reload or a guest switch; the About page is shared. */
export function resolveView(requested: View, teacher: boolean): View {
  if (requested === 'about') return 'about';
  return FACULTY_VIEWS.includes(requested) === teacher ? requested : teacher ? 'teacher' : 'home';
}

export type Nav = {
  go: (view: View) => void;
  openLab: (slug: string) => void;
  startMission: (missionId: string) => void;
  openStudent: (classId: number, studentId: number) => void;
  /** Where a student detail request was pointed (set by the faculty roster). */
  student: { classId: number; studentId: number } | null;
  labSlug: string | null;
  /** Id of the mission whose start request is in flight (null when none). */
  starting: string | null;
  /** True while a mission start, guest switch or guest reset is waiting on the server: those buttons are disabled. */
  busy: boolean;
};

export const NavContext = createContext<Nav | null>(null);
export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('Navigation context is missing.');
  return nav;
}

/** Keeps the browser tab title in step with the screen. */
export function useDocumentTitle(title: string) {
  const lang = useLang();
  useEffect(() => {
    document.title = `${t(title)} · Escape Lab`;
  }, [title, lang]);
}

/** Text props are translated here too (t of an already translated text is harmless), so a caller may pass the English text. */
export function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="stat">
      <div className="stat-icon" aria-hidden="true">{icon}</div>
      <div>
        <span>{t(label)}</span>
        <strong>{value}</strong>
        <small>{t(detail)}</small>
      </div>
    </div>
  );
}

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="page-intro">
      <div className="eyebrow">{t(eyebrow)}</div>
      <h1>{t(title)}</h1>
      <p>{children}</p>
    </div>
  );
}

/** Shown on every faculty view: the Faculty guest reads generated demonstration data, never real learners. Static text, always visible, not an alert. */
export const FACULTY_DEMO_NOTE = 'Demonstration data: the students, classes and results shown here are generated for this prototype. They are not real learners.';
export function FacultyDemoNote() {
  return <p className="faculty-demo-note" role="note">{t(FACULTY_DEMO_NOTE)}</p>;
}

export const tone = (discipline: string) =>
  discipline === 'hematology' ? 'red' : discipline === 'microbiology' ? 'teal' : discipline === 'biochemistry' ? 'gold' : discipline === 'master' ? 'violet' : 'muted';

/**
 * First visible letter-like character of a name, whole (an emoji sequence or an accented letter is never cut in half). Invisible
 * characters (bidi marks, zero-width and soft-hyphen characters, blank fillers), lone combining marks, spaces and punctuation are skipped;
 * when nothing visible is left a neutral bullet stands in, never an empty circle and never an invented letter.
 */
export function initialOf(name: string): string {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  const graphemes = Segmenter ? [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(name)].map((g) => g.segment) : Array.from(name);
  const invisible = /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}\p{M}\p{Z}\u2800\u3164\uffa0]/gu;
  const first = graphemes.find((g) => /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(g.replace(invisible, '')));
  return first ?? '\u2022';
}

export const FLAG_WORDS: Record<string, string> = { L: 'Low', H: 'High', LL: 'Critically low', HH: 'Critically high' };

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Seconds to show on the countdown: the server's snapshot minus the time elapsed since it was taken. Elapsed time
 * is never negative (a `now` that predates the snapshot must not add time) and the result never goes below zero.
 */
export function secondsLeft(remaining: number | null, snapshotAt: number, now: number): number | null {
  if (remaining === null) return null;
  const elapsed = Math.max(0, Math.floor((now - snapshotAt) / 1000));
  return Math.max(0, remaining - elapsed);
}

export function IllustrativeTag() {
  return <span className="illustrative-tag">{t('Illustrative image')}</span>;
}

/** A horizontal bar for a server percentage. Decorative: the number is always printed next to it. */
export function Bar({ pct, alert = false }: { pct: number; alert?: boolean }) {
  return <span className={`bar${alert ? ' alert' : ''}`} aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>;
}

/** Competency percentages as simple bars, plus the server's strongest area and improvement advice. */
export function CompetencyBars({ data, title }: { data: Competencies; title: string }) {
  if (data.items.length === 0) return <p className="bar-note">{t('No competency data yet.')}</p>;
  return (
    <>
      <ul className="bar-list" aria-label={t(title)}>
        {data.items.map((c) => (
          <li className="bar-row" key={c.name}>
            <span>{t(c.name)}<small>{plural(c.steps, 'step')}</small></span>
            <Bar pct={c.pct} />
            <b>{c.pct}%</b>
          </li>
        ))}
      </ul>
      {data.strongest && <p className="insight"><b>{t('Strongest area:')}</b> {t(data.strongest)}.</p>}
      {data.improvement && <p className="insight"><b>{t('To improve:')}</b> {t(data.improvement.advice)}</p>}
    </>
  );
}

/** Tracks a CSS media query (layout only: which arrangement of the same content to render). */
export function useMediaQuery(query: string): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() => (supported ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!supported) return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query, supported]);
  return matches;
}
