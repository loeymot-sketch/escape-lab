import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { ApiError, MAX_RETRY_WAIT_SECONDS } from '../lib/api';
import { PayloadError } from '../lib/guard';
import { plural, t } from '../i18n';

/** The sentence the server itself sent, or undefined when the reply had no readable body (ApiError then carries only its generic default). */
function serverSentence(error: ApiError): string | undefined {
  const text = error.message.trim();
  return text === '' || text === `Request failed (${error.status})` ? undefined : text;
}

/** The sentence the server sent, shown in the display language (an unknown sentence stays in English). */
function heardFromServer(error: ApiError): string | undefined {
  const sentence = serverSentence(error);
  return sentence === undefined ? undefined : t(sentence);
}

const RETRY_WORDS = /\b(?:try(?:ing)? again|retry)\b/i;

/** What an empty-bodied refusal (a proxy or gateway answered, not the API) means for the person, by status. */
const REFUSED: Record<number, string> = {
  400: 'The server did not accept this request. Please check it and try again.',
  408: 'The request took too long to reach the server. Please try again.',
  409: 'This conflicts with what the server holds. Reload the page, then try again.',
  413: 'The request was too large for the server to accept.',
  422: 'The server could not process this request. Please check it and try again.',
};

/** Ends a sentence the way a sentence ends, so an appended instruction never runs on from it. */
function endSentence(text: string): string {
  const trimmed = text.trim();
  return trimmed === '' || /[.!?…]["')\]”’]?$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** The same message without the sentences that tell the reader to retry (for a change that may already have been applied). */
export function withoutRetryAdvice(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter((sentence) => !RETRY_WORDS.test(sentence)).join(' ');
}

/** A wait the way a person says it: seconds up to two minutes, then minutes, then whole hours. The figure is rounded up first and the unit follows from it, so 60 minutes reads as 1 hour and 120 minutes as 2 hours. */
function spokenWait(seconds: number): string {
  const whole = Math.ceil(seconds);
  if (whole < 120) return plural(whole, 'second');
  const minutes = Math.ceil(whole / 60);
  if (minutes < 60 || (minutes > 60 && minutes < 120)) return plural(minutes, 'minute');
  const hours = Math.ceil(minutes / 60);
  return plural(hours, 'hour');
}

/**
 * Turns any thrown value into text a student or teacher can act on, in the display language. Call it while rendering (or in a handler that
 * displays the result at once); a message that must outlive a language switch is kept as the error itself and described at display time.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return t(error.message);
    if (error.status === 401) return t('Your guest session is no longer valid.');
    if (error.status === 403) return heardFromServer(error) ?? t('You do not have access to this area.');
    if (error.status === 404) return heardFromServer(error) ?? t('This item could not be found.');
    if (error.status === 429) {
      const wait = (error.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
      const base = (serverSentence(error) ?? 'Too many requests.').trim();
      // One instruction only: a server sentence that already says "try again" is replaced by the exact delay, or kept when there is none.
      const asksRetry = RETRY_WORDS.test(base);
      if (typeof wait === 'number' && Number.isFinite(wait) && wait > 0) {
        const kept = base.split(/(?<=[.!?])\s+/).filter((sentence) => !RETRY_WORDS.test(sentence)).join(' ');
        const lead = endSentence(kept);
        // A wait of more than a day is not a figure to print (a broken proxy can ask for centuries): it reads as later.
        return `${lead ? t(lead) : t('Too many requests.')} ${wait > MAX_RETRY_WAIT_SECONDS ? t('Try again later.') : t('Try again in {wait}.', { wait: spokenWait(wait) })}`;
      }
      return asksRetry ? t(base) : `${t(endSentence(base))} ${t('Please wait a moment, then try again.')}`;
    }
    // An empty or non-JSON body (a proxy outage) leaves only the generic "Request failed (503)": say something useful instead.
    // A sentence the server really sent always passes through; the fallbacks only stand in for a reply that had none.
    if (error.status >= 500) return heardFromServer(error) ?? t('The server had a problem. Please retry.');
    const refused = REFUSED[error.status];
    return heardFromServer(error) ?? (refused !== undefined ? t(refused) : t('The request was refused. Please check it and try again.'));
  }
  // Some strict normalizers throw a plain Error carrying the same technical text: they read like every other payload failure.
  if (error instanceof PayloadError || (error instanceof Error && /^Invalid server .+ payload/.test(error.message))) return `${t('The server sent an unexpected response.')} ${t(error.message)}`;
  if (error instanceof Error) return t(error.message);
  return t('Something went wrong.');
}

export type Load<T> = { phase: 'loading' } | { phase: 'error'; error: unknown } | { phase: 'ready'; data: T };

/** Loads once per dependency change; a stale response can never overwrite a newer one. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): { state: Load<T>; reload: () => void; setData: (data: T) => void } {
  // The state remembers which dependencies it was loaded for: after a dependency change the old data is never shown (or acted on) for the new one.
  const [held, setHeld] = useState<{ state: Load<T>; deps: readonly unknown[] }>({ state: { phase: 'loading' }, deps });
  const [nonce, setNonce] = useState(0);
  const ticket = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    const mine = ++ticket.current;
    const forDeps = deps;
    setHeld({ state: { phase: 'loading' }, deps: forDeps });
    loader.current().then(
      (data) => { if (ticket.current === mine) setHeld({ state: { phase: 'ready', data }, deps: forDeps }); },
      (error: unknown) => { if (ticket.current === mine) setHeld({ state: { phase: 'error', error }, deps: forDeps }); },
    );
    return () => { ticket.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  // A Retry pressed inside an error panel is unmounted while the page loads again: when the load settles, focus goes to the page heading
  // instead of falling to the document. Focus the user has put elsewhere in the meantime is left alone.
  const refocus = useRef(false);
  const reload = useCallback(() => {
    const active = document.activeElement;
    refocus.current = active instanceof HTMLElement && active.closest('[role="alert"]') !== null;
    setNonce((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!refocus.current || held.state.phase === 'loading') return;
    refocus.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    const heading = document.querySelector<HTMLElement>('main h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }, [held]);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const setData = useCallback((data: T) => { ticket.current += 1; setHeld({ state: { phase: 'ready', data }, deps: depsRef.current }); }, []);
  const current = held.deps.length === deps.length && held.deps.every((d, i) => Object.is(d, deps[i]));
  const state: Load<T> = current ? held.state : { phase: 'loading' };
  return { state, reload, setData };
}

/** The text props of these panels are translated here too (t of an already translated text is harmless), so a caller may pass the English text. */
export function LoadingPanel({ label, detail }: { label: string; detail?: string }) {
  return (
    <div role="status" aria-live="polite" className="state-panel loading">
      <Loader2 size={22} className="spin" aria-hidden="true" />
      <p className="state-title">{t(label)}</p>
      {detail && <p>{t(detail)}</p>}
    </div>
  );
}

/**
 * `level` 1 (default): the panel replaces the whole page, so its title is the page's h1. `level` 2: the page already shows its
 * own intro heading (an h1) above the panel, and a second h1 would break the heading outline.
 */
export function ErrorPanel({ error, title, onRetry, level = 1, children }: { error: unknown; title?: string; onRetry?: () => void; level?: 1 | 2; children?: ReactNode }) {
  const Heading = level === 2 ? 'h2' : 'h1';
  return (
    <div role="alert" className="state-panel failed">
      <AlertTriangle size={22} aria-hidden="true" />
      {/* A failed page with no other heading: this one is the page's h1 (the page title for screen readers and the focus target). */}
      <Heading>{title !== undefined ? t(title) : t('This page could not be loaded')}</Heading>
      <p>{describeError(error)}</p>
      <div className="state-actions">
        {onRetry && <button type="button" className="primary" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> {t('Retry')}</button>}
        {children}
      </div>
    </div>
  );
}

export function EmptyPanel({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state-panel empty">
      <h2>{t(title)}</h2>
      {children && <p>{children}</p>}
      {action && <div className="state-actions">{action}</div>}
    </div>
  );
}

/** Renders the right panel for a Load; `children` runs only with validated data. */
export function Loaded<T>({ load, label, title, onRetry, level, children }: { load: Load<T>; label: string; title?: string; onRetry: () => void; level?: 1 | 2; children: (data: T) => ReactNode }) {
  if (load.phase === 'loading') return <LoadingPanel label={label} />;
  if (load.phase === 'error') return <ErrorPanel error={load.error} title={title} onRetry={onRetry} level={level} />;
  return <>{children(load.data)}</>;
}

type BoundaryProps = { children: ReactNode; label?: string };
export class ErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Escape Lab render failure', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="state-panel failed boundary">
        <AlertTriangle size={22} aria-hidden="true" />
        <h2>{this.props.label !== undefined ? t(this.props.label) : t('Something went wrong on this screen')}</h2>
        <p>{t('The screen could not be displayed. Your progress is stored on the server and has not been lost.')}</p>
        <div className="state-actions">
          <button type="button" className="primary" onClick={() => this.setState({ error: null })}>{t('Try again')}</button>
          <button type="button" className="ghost" onClick={() => window.location.reload()}>{t('Reload the laboratory')}</button>
        </div>
      </div>
    );
  }
}
