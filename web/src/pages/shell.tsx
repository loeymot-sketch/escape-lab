import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, Beaker, BookOpen, ChevronRight, FlaskConical, Loader2, Menu, Sparkles, Trophy, X } from 'lucide-react';
import labescapeInvestigationHero from '../assets/labescape-investigation-hero.webp';
import { ApiError } from '../lib/api';
import { LanguageSwitch, t } from '../i18n';
import { IllustrativeTag, type View } from '../ui/common';
import { describeError } from '../ui/state';

export function GuestGate({ loading, error, retry }: { loading: boolean; error: unknown; retry: () => void }) {
  useEffect(() => { document.title = 'Escape Lab'; }, []);
  // Pressing Reopen replaces the button with a status; when the attempt fails again the button returns: keyboard focus goes back to it
  // (only when the learner pressed it: a gate that fails on first load does not take focus).
  const retryRef = useRef<HTMLButtonElement>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (loading || !pressed.current) return;
    pressed.current = false;
    if (!document.activeElement || document.activeElement === document.body) retryRef.current?.focus();
  }, [loading]);
  const notSeeded = error instanceof ApiError && error.status === 404;
  return (
    <div className="landing">
      <div className="landing-lang" role="region" aria-label="Langue / Language"><LanguageSwitch /></div>
      <main className="landing-inner">
        <div className="brand large"><span className="brand-mark"><FlaskConical size={24} aria-hidden="true" /></span><span>ESCAPE<span>LAB</span></span></div>
        <div className="landing-kicker">{t('LabEscape · virtual laboratory')}</div>
        {loading
          ? <div role="status" aria-live="polite"><h1>{t('Preparing your investigation…')}</h1><p>{t('Opening a guided biomedical investigation with a guest demo session.')}</p></div>
          : <div><h1>{t('Demo laboratory unavailable')}</h1><p>{t('The demonstration laboratory could not start. Check the connection, then retry.')}</p></div>}
        {error !== null && !loading && (
          <div role="alert" className="landing-error">
            {describeError(error)}
            {notSeeded && ` ${t('The API must run with DEMO_MODE=1 and the demo data must be seeded (npm run seed:demo).')}`}
          </div>
        )}
        {!loading && <div className="landing-actions"><button type="button" className="primary" ref={retryRef} onClick={() => { pressed.current = true; retry(); }}>{t('Reopen the laboratory')} <ArrowRight size={17} aria-hidden="true" /></button></div>}
        <div className="landing-note"><span aria-hidden="true" />{t('No account required · Illustrative educational environment')}</div>
      </main>
      <aside className="landing-visual" aria-label={t('Illustration')}>
        <img src={labescapeInvestigationHero} alt={t('Illustrative biomedical investigation workstation')} fetchPriority="high" decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
        <IllustrativeTag />
        <div className="visual-caption"><span>{t('LIVE INVESTIGATION BENCH')}</span><strong>{t('Observe. Connect. Escape.')}</strong><small>{t('Virtual biomedical training environment')}</small></div>
      </aside>
    </div>
  );
}

/** English page names; shown with t(CRUMBS[view]). */
const CRUMBS: Record<View, string> = {
  home: 'Mission control', labs: 'Lab map', lab: 'Laboratory', progress: 'Progress vault', results: 'Lab results',
  profile: 'Learning settings', teacher: 'Faculty analytics', student: 'Student detail', content: 'Content review', about: 'About & demo guide',
};

/** What the guest is waiting for, if anything. */
export type GuestBusy = 'switch' | 'reset' | null;

type ShellProps = {
  teacher: boolean;
  view: View;
  setView: (view: View) => void;
  resetGuest: () => void;
  switchGuest: () => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  error: string;
  clearError: () => void;
  notice: string;
  clearNotice: () => void;
  /** A problem with something the whole app depends on (not tied to one page), with the way to retry it. */
  banner: { message: string; retrying: boolean; retry: () => void } | null;
  guestBusy: GuestBusy;
  /** Mission id being started, if any. */
  starting: string | null;
  children: ReactNode;
};

/** Set when the shell is about to be rebuilt after a full-screen flow (a mission): the new shell then puts focus on its page heading. */
let focusOnMount = false;
export const requestShellFocus = () => { focusOnMount = true; };

/** Moves focus to the first <h1> under `root`, now or as soon as it appears; gives up when the user has moved on or after 10s. */
function focusHeadingWhenReady(root: HTMLElement, done: () => void): () => void {
  const focusFree = () => {
    const active = document.activeElement;
    return !active || active === document.body || active.closest('aside') !== null;
  };
  const claim = () => {
    const heading = root.querySelector('h1');
    if (!heading) return false;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    return true;
  };
  if (claim()) { done(); return () => undefined; }
  const observer = new MutationObserver(() => { if (!focusFree() || claim()) { observer.disconnect(); done(); } });
  observer.observe(root, { childList: true, subtree: true });
  const giveUp = window.setTimeout(() => { observer.disconnect(); done(); }, 10_000);
  return () => { observer.disconnect(); window.clearTimeout(giveUp); };
}

export function Shell({ teacher, view, setView, resetGuest, switchGuest, menuOpen, setMenuOpen, error, clearError, notice, clearNotice, banner, guestBusy, starting, children }: ShellProps) {
  const navItem = (target: View, label: string, icon: ReactNode, activeFor: View[] = [target]) => (
    <button type="button" className={activeFor.includes(view) ? 'active' : ''} aria-current={activeFor.includes(view) ? 'page' : undefined} onClick={() => { setView(target); setMenuOpen(false); }}>
      {icon}{label}
    </button>
  );
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const shownView = useRef(view);
  const busy = guestBusy !== null || starting !== null;
  const busyNote = guestBusy === 'switch' ? t('Switching guest session…') : guestBusy === 'reset' ? t('Resetting guest session…') : starting !== null ? t('Starting mission…') : '';

  // A screen change moves focus to the new page heading (so keyboard and screen-reader users land on the new
  // content, not on the button they used). Pages that load their heading later get focus when it appears, unless
  // the user has already moved on to something inside the page.
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
    if (shownView.current === view) return undefined;
    shownView.current = view;
    const root = mainRef.current;
    if (!root) return undefined;
    return focusHeadingWhenReady(root, () => undefined);
  }, [view]);

  // Coming back from a mission rebuilds the shell on the same view: focus would otherwise fall to <body>.
  useEffect(() => {
    const root = mainRef.current;
    if (!focusOnMount || !root) return undefined;
    // The flag is cleared once focus is placed (not at the start), so React's development double-mount does not lose it.
    return focusHeadingWhenReady(root, () => { focusOnMount = false; });
  }, []);

  // Dismissing a banner removes the focused button: focus goes to the page heading (or the page itself) instead of falling to <body>.
  const focusPage = () => {
    const root = mainRef.current;
    const heading = root?.querySelector('h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); } else root?.focus({ preventScroll: true });
  };
  // Same when the Retry of the banner succeeds and the banner disappears under the focused button.
  const retryPressed = useRef(false);
  useEffect(() => {
    if (banner !== null || !retryPressed.current) return;
    retryPressed.current = false;
    if (!document.activeElement || document.activeElement === document.body) focusPage();
  }, [banner]);

  // The guest switch/reset buttons disable themselves while they work, which drops focus: put it on the page heading afterwards.
  const wasGuestBusy = useRef(false);
  useEffect(() => {
    const was = wasGuestBusy.current;
    wasGuestBusy.current = guestBusy !== null;
    const root = mainRef.current;
    if (!was || guestBusy !== null || !root) return undefined;
    return focusHeadingWhenReady(root, () => undefined);
  }, [guestBusy]);

  // Escape closes the phone menu and gives focus back to the button that opened it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    // A press anywhere outside the popover and its button closes it too (focus stays where the user put it).
    const onPress = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (popoverRef.current?.contains(target) || menuButtonRef.current?.contains(target))) return;
      setMenuOpen(false);
    };
    // Tabbing out of the popover closes it too (it must not stay open over the page while focus is elsewhere).
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (target && (popoverRef.current?.contains(target) || menuButtonRef.current?.contains(target))) return;
      setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    document.addEventListener('focusin', onFocusIn);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPress); document.removeEventListener('focusin', onFocusIn); };
  }, [menuOpen, setMenuOpen]);

  // Resetting wipes the shared demo guest in one request, so it asks first (inline, no browser dialog). Focus starts on the safe choice.
  const [confirmReset, setConfirmReset] = useState(false);
  const focusAfterConfirm = useRef<'cancel' | 'trigger' | null>(null);
  const visible = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.getClientRects().length > 0);
  useEffect(() => {
    const wanted = focusAfterConfirm.current;
    if (!wanted) return;
    focusAfterConfirm.current = null;
    visible(wanted === 'cancel' ? '[data-reset-cancel]' : '[data-reset-trigger]')?.focus();
  }, [confirmReset]);
  // Closing the phone menu discards a pending question; the sidebar (always on screen on a desktop) keeps it.
  useEffect(() => { if (!menuOpen) setConfirmReset(false); }, [menuOpen]);
  // Crossing the 600/601 px line swaps the sidebar for the phone popover (or back): a menu left open would stay open while hidden and swallow
  // the next click (its outside-press handler closes it on pointerdown), and a pending question would reappear in the other place. Both start clean.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const phone = window.matchMedia('(max-width: 600px)');
    const onChange = () => { setMenuOpen(false); setConfirmReset(false); };
    phone.addEventListener('change', onChange);
    return () => phone.removeEventListener('change', onChange);
  }, [setMenuOpen]);
  const askReset = () => { focusAfterConfirm.current = 'cancel'; setConfirmReset(true); };
  const cancelReset = () => { focusAfterConfirm.current = 'trigger'; setConfirmReset(false); };
  const confirmKey = (event: ReactKeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); cancelReset(); } };

  const guestActions = (
    <>
      <div className="side-status"><span className="pulse" aria-hidden="true" />{t('Guest demo · server-side scoring')}</div>
      {teacher
        ? <button type="button" className="logout" disabled={busy} aria-busy={guestBusy === 'reset'} onClick={() => { setMenuOpen(false); resetGuest(); }}>{guestBusy === 'reset' ? t('Resetting…') : t('Return to student demo')}</button>
        : (
          <>
            <button type="button" className="logout" disabled={busy} aria-busy={guestBusy === 'switch'} onClick={() => { setMenuOpen(false); switchGuest(); }}>{guestBusy === 'switch' ? t('Switching…') : t('Faculty guest')}</button>
            {confirmReset && guestBusy === null
              ? (
                <div className="reset-confirm" role="group" aria-label={t('Confirm guest reset')} onKeyDown={confirmKey}>
                  <p>{t('Reset the guest session? Progress, XP and any mission in progress return to the prepared demonstration data. The demo guest is shared, so this cannot be undone.')}</p>
                  <div className="reset-confirm-actions">
                    <button type="button" className="logout danger" disabled={busy} onClick={() => { setConfirmReset(false); setMenuOpen(false); resetGuest(); }}>{t('Confirm reset')}</button>
                    <button type="button" className="logout" data-reset-cancel onClick={cancelReset}>{t('Cancel')}</button>
                  </div>
                </div>
              )
              : <button type="button" className="logout" data-reset-trigger disabled={busy} aria-busy={guestBusy === 'reset'} onClick={askReset}>{guestBusy === 'reset' ? t('Resetting…') : t('Reset guest session')}</button>}
          </>
        )}
    </>
  );

  return (
    <div className="app">
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>{t('Skip to main content')}</a>
      <aside aria-label={t('Primary')}>
        <div className="brand"><span className="brand-mark"><FlaskConical size={19} aria-hidden="true" /></span><span>ESCAPE<span>LAB</span></span></div>
        <div className="eyebrow">{t('BIOMEDICAL TRAINING')}</div>
        <nav aria-label={t('Sections')}>
          {teacher
            ? (
              <>
                {navItem('teacher', t('Faculty'), <Sparkles size={17} aria-hidden="true" />)}
                {navItem('student', t('Student detail'), <ChevronRight size={17} aria-hidden="true" />)}
                {navItem('content', t('Content review'), <ChevronRight size={17} aria-hidden="true" />)}
                {navItem('about', t('About & demo guide'), <BookOpen size={17} aria-hidden="true" />)}
              </>
            )
            : (
              <>
                {navItem('home', t('Investigations'), <Sparkles size={17} aria-hidden="true" />)}
                {navItem('labs', t('Lab map'), <Beaker size={17} aria-hidden="true" />, ['labs', 'lab'])}
                {navItem('progress', t('Progress'), <Trophy size={17} aria-hidden="true" />)}
                {navItem('results', t('Lab results'), <ChevronRight size={17} aria-hidden="true" />)}
                {navItem('profile', t('Learning settings'), <ChevronRight size={17} aria-hidden="true" />)}
                {navItem('about', t('About & demo guide'), <BookOpen size={17} aria-hidden="true" />)}
              </>
            )}
        </nav>
        <div className="side-bottom">{guestActions}</div>
      </aside>
      <div className="app-main">
        <header>
          <div className="menu-anchor">
            <button type="button" className="mobile-brand" ref={menuButtonRef} aria-expanded={menuOpen} aria-controls={menuOpen ? 'guest-menu' : undefined} onClick={() => setMenuOpen(!menuOpen)}>
              <Menu size={18} aria-hidden="true" /><b>{t('Guest options')}</b>
            </button>
            {menuOpen && (
              <div className="guest-popover" id="guest-menu" role="group" aria-label={t('Guest options')} ref={popoverRef}>
                {guestActions}
                <button type="button" className="popover-close" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}>{t('Close')}</button>
              </div>
            )}
          </div>
          <div className="crumb">{t(CRUMBS[view])}</div>
          <LanguageSwitch />
          <div className="user-chip"><span className="avatar" aria-hidden="true"><FlaskConical size={14} /></span><span>{teacher ? t('Faculty demo') : t('Guest laboratory')}</span></div>
        </header>
        <main ref={mainRef} id="main-content" tabIndex={-1}>
          {busyNote && <div role="status" className="notice info-note busy-note"><Loader2 size={16} className="spin" aria-hidden="true" />{busyNote}</div>}
          {notice && <div role="status" className="notice info-note">{t(notice)}<button type="button" onClick={() => { focusPage(); clearNotice(); }}>{t('Dismiss')}</button></div>}
          {banner && (
            <div role="alert" className="error">
              <X size={16} aria-hidden="true" />{banner.message}
              <button type="button" aria-disabled={banner.retrying || undefined} aria-busy={banner.retrying} onClick={() => { retryPressed.current = true; banner.retry(); }}>{banner.retrying ? t('Retrying…') : t('Retry')}</button>
            </div>
          )}
          {error && <div role="alert" className="error"><X size={16} aria-hidden="true" />{error}<button type="button" onClick={() => { focusPage(); clearError(); }}>{t('Dismiss')}</button></div>}
          {children}
        </main>
      </div>
    </div>
  );
}
