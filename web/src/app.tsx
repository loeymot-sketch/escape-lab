import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, api, apiConfigError, demoSession, onUnauthorized } from './lib/api';
import { normalizeAttempt, normalizeStart, type Attempt } from './lib/attempt';
import { normalizeDemoLogin, normalizeDemoReset, normalizeMe, type Me } from './lib/student';
import { About } from './pages/about';
import { Mission } from './pages/mission';
import { ContentReview, StudentDetail, Teacher } from './pages/faculty';
import { LabResults, Profile, ProgressHub, loadSettings } from './pages/progress';
import { GuestGate, Shell, requestShellFocus, type GuestBusy } from './pages/shell';
import { Dashboard, LabLobbyPage, LabMap } from './pages/student';
import { getLang, loadFrench, t, useLang } from './i18n';
import { NavContext, resolveView, type Nav, type View } from './ui/common';
import { ErrorBoundary, ErrorPanel, LoadingPanel, describeError, useLoad } from './ui/state';
import './styles.css';
import './accessibility.css';
import './engine-styles.css';
import './teacher-styles.css';
import './progress-styles.css';
import './completion-styles.css';
import './admin-results.css';
import './visual-refresh.css';
import './polish.css';
import './about.css';
import './refine.css';

type Role = 'student' | 'teacher';

function App() {
  // Subscribing here re-renders every screen below when the display language is switched (state is kept: nothing is remounted).
  useLang();
  const [token, setToken] = useState(demoSession.getToken());
  const [gate, setGate] = useState<{ loading: boolean; error: unknown }>({ loading: !demoSession.getToken(), error: null });
  const [view, setView] = useState<View>('home');
  const [labSlug, setLabSlug] = useState<string | null>(null);
  const [student, setStudent] = useState<{ classId: number; studentId: number } | null>(null);
  const [notice, setNotice] = useState('');
  const entering = useRef(false);
  // The role of the current guest session, so recovery after an expired session reopens the SAME kind of guest (faculty stays faculty).
  const lastRole = useRef<Role>(demoSession.getRole());
  // Loop guard: a server that keeps rejecting fresh guest sessions (for example a 401 on every faculty call) must not make the app
  // recreate sessions forever. After 3 automatic recoveries within 15 seconds it stops and shows a gate error with Retry.
  const recoveries = useRef<number[]>([]);
  const halted = useRef(false);
  // Set while a recovery is under way: the other requests that fail with the same expired session are part of it, not new ones.
  const recovering = useRef(false);
  // The kind of guest the visible expiry notice talks about: a notice never outlives a session of the other kind.
  const noticeRole = useRef<Role | null>(null);

  // Set when a 401 for the session being replaced arrives while a deliberate guest switch is under way. If that switch then fails, the
  // old session is dead and nothing else would notice (the token is already gone), so the automatic recovery runs after all.
  const missed401 = useRef(false);

  /** The guest session is gone: leave the broken screens, say so, and let the effect below open a fresh guest of the same kind. */
  const recover = useCallback(() => {
    recovering.current = true;
    // The rebuilt shell puts keyboard focus on its page heading, as after a deliberate switch (the tree is replaced, nothing else would).
    requestShellFocus();
    const now = Date.now();
    recoveries.current = [...recoveries.current.filter((at) => now - at < 15_000), now];
    if (recoveries.current.length > 3) {
      halted.current = true;
      setGate({ loading: false, error: new Error('The server keeps rejecting guest sessions. Wait a moment, then retry.') });
      setToken(null);
      setView('home');
      return;
    }
    setGate({ loading: true, error: null });
    setToken(null);
    setView('home');
    noticeRole.current = lastRole.current;
    setNotice(lastRole.current === 'teacher'
      ? 'Your faculty guest session expired, so a new faculty guest session was opened.'
      : 'Your guest session expired, so a new guest session was opened. Unsaved progress on the previous one is not shown here.');
  }, []);

  /** Opens a guest session. Resolves with the failure (or null on success) so a caller that is already showing a screen can report it. */
  const enterGuest = useCallback(async (role: Role): Promise<unknown> => {
    if (entering.current) return null;
    entering.current = true;
    const wasRecovery = recovering.current;
    setGate({ loading: true, error: null });
    let failure: unknown = null;
    try {
      const login = normalizeDemoLogin(await api('/auth/demo', { method: 'POST', body: JSON.stringify({ role }) }));
      // Only a session that really opened becomes "the current role" (a failed Faculty switch must not turn a later recovery into faculty).
      lastRole.current = role;
      demoSession.setRole(role);
      demoSession.clearAttempt();
      demoSession.setToken(login.token);
      setView(role === 'teacher' ? 'teacher' : 'home');
      setLabSlug(null);
      setStudent(null);
      if (noticeRole.current !== role) setNotice('');
      missed401.current = false;
      setToken(login.token);
      setGate({ loading: false, error: null });
    } catch (e) {
      failure = e;
      setGate({ loading: false, error: e });
    } finally {
      entering.current = false;
      recovering.current = false;
    }
    // A failed deliberate switch after the old session was already rejected: the session on screen is dead, so recover (not for a
    // failed recovery itself, which ends in the gate with its Retry).
    if (failure !== null && missed401.current && !wasRecovery) {
      missed401.current = false;
      recover();
    }
    return failure;
  }, [recover]);

  // A 401 means the guest session is gone: re-enter as a fresh guest instead of showing broken pages.
  useEffect(() => onUnauthorized(() => {
    // A rejection that arrives while a recovery is already under way is part of it. One that arrives while a deliberate switch opens
    // the new session belongs to the session being replaced: it must not post an expiry notice nor start a second recovery, but it is
    // remembered in case the switch fails.
    if (recovering.current) return;
    if (entering.current) { missed401.current = true; return; }
    recover();
  }), [recover]);

  useEffect(() => {
    if (!token && !halted.current) void enterGuest(lastRole.current);
  }, [token, enterGuest]);

  if (!token) return <GuestGate loading={gate.loading} error={gate.error} retry={() => { halted.current = false; recoveries.current = []; requestShellFocus(); void enterGuest(lastRole.current); }} />;
  return (
    <Authenticated
      key={token}
      token={token}
      view={view}
      setView={setView}
      labSlug={labSlug}
      setLabSlug={setLabSlug}
      student={student}
      setStudent={setStudent}
      notice={notice}
      setNotice={setNotice}
      enterGuest={enterGuest}
    />
  );
}

type AuthProps = {
  token: string;
  view: View;
  setView: (v: View) => void;
  labSlug: string | null;
  setLabSlug: (s: string | null) => void;
  student: { classId: number; studentId: number } | null;
  setStudent: (s: { classId: number; studentId: number } | null) => void;
  notice: string;
  setNotice: (n: string) => void;
  enterGuest: (role: Role) => Promise<unknown>;
};

function Authenticated(props: AuthProps) {
  // A new session starts without the previous guest Reduce motion: it is only applied from this session profile once that is loaded.
  useEffect(() => { delete document.documentElement.dataset.reduceMotion; }, []);
  const me = useLoad<Me>(async () => normalizeMe(await api('/me')), [props.token]);
  if (me.state.phase === 'loading') return <main className="boot"><LoadingPanel label={t('Opening your laboratory…')} detail={t('Checking your guest session with the server.')} /></main>;
  if (me.state.phase === 'error') return <main className="boot"><ErrorPanel error={me.state.error} title={t('Your laboratory could not be opened')} onRetry={me.reload} /></main>;
  return <Ready me={me.state.data} {...props} />;
}

function Ready({ me, view: requestedView, setView, labSlug, setLabSlug, student, setStudent, notice, setNotice, enterGuest }: AuthProps & { me: Me }) {
  const teacher = me.role === 'teacher';
  // A role only ever sees its own screens, whatever view was requested before a reload or a guest switch.
  const view: View = resolveView(requestedView, teacher);
  const [play, setPlay] = useState<Attempt | null>(null);
  const [restore, setRestore] = useState<{ phase: 'checking' } | { phase: 'done' } | { phase: 'error'; error: unknown }>(() => (demoSession.getAttemptId() && !teacher ? { phase: 'checking' } : { phase: 'done' }));
  // The failure itself is kept (not its text) and described while rendering, so a language switch still applies to a message on screen.
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const starting = useRef(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState<GuestBusy>(null);
  const guesting = useRef(false);
  const settings = useLoad(loadSettings, [me.id]);

  // The Reduce motion preference is server-owned; here it only switches the stylesheet.
  useEffect(() => {
    if (settings.state.phase === 'ready') document.documentElement.dataset.reduceMotion = String(settings.state.data.reduceMotion);
  }, [settings.state]);

  // A preference that could not be loaded is never dropped silently: every page shows an alert with Retry (the settings page has its own panel).
  const [settingsRetrying, setSettingsRetrying] = useState(false);
  const settingsFailure = useRef<{ cause: unknown } | null>(null);
  if (settings.state.phase === 'error') settingsFailure.current = { cause: settings.state.error };
  useEffect(() => { if (settings.state.phase !== 'loading') setSettingsRetrying(false); }, [settings.state.phase]);

  // Resume an unfinished attempt after a refresh. Only an attempt the server no longer knows (404) is dropped.
  const [restoreNonce, setRestoreNonce] = useState(0);
  useEffect(() => {
    const id = demoSession.getAttemptId();
    if (!id || teacher) { setRestore({ phase: 'done' }); return undefined; }
    let live = true;
    setRestore({ phase: 'checking' });
    api(`/attempts/${id}`).then(
      (raw) => {
        if (!live) return;
        try {
          setPlay(normalizeAttempt(raw));
          setRestore({ phase: 'done' });
        } catch (e) {
          setRestore({ phase: 'error', error: e });
        }
      },
      (e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) {
          demoSession.clearAttempt();
          setRestore({ phase: 'done' });
        } else {
          setRestore({ phase: 'error', error: e });
        }
      },
    );
    return () => { live = false; };
  }, [teacher, restoreNonce]);

  // Bumped whenever the learner navigates: a mission start that was already in flight must not take over the new screen when it finally answers.
  const navEpoch = useRef(0);
  const startMission = useCallback(async (missionId: string) => {
    if (starting.current) return;
    starting.current = true;
    setStartingId(missionId);
    setFailure(null);
    const epoch = navEpoch.current;
    try {
      const started = normalizeStart(await api(`/missions/${missionId}/start`, { method: 'POST' }));
      // The attempt exists on the server (the dashboard offers it as "Resume"); only the surprise screen change is dropped.
      if (navEpoch.current !== epoch) return;
      demoSession.setAttemptId(started.attempt.attemptId);
      setPlay(started.attempt);
    } catch (e) {
      if (navEpoch.current === epoch) setFailure({ cause: e });
    } finally {
      starting.current = false;
      setStartingId(null);
    }
  }, []);

  const exitMission = (toHome = false) => {
    requestShellFocus();
    demoSession.clearAttempt();
    setPlay(null);
    // The result screen offers "Return to mission control": that is the dashboard, whichever screen the mission was started from.
    if (toHome) setView('home');
    setEpoch((n) => n + 1);
  };

  const switchGuest = async () => {
    if (guesting.current) return;
    requestShellFocus();
    guesting.current = true;
    setGuestBusy('switch');
    setFailure(null);
    // A deliberate switch ends the session the recovery notice described; the notice is only for the automatic recovery path.
    setNotice('');
    try {
      const failed = await enterGuest(teacher ? 'student' : 'teacher');
      if (failed !== null) setFailure({ cause: failed });
    } finally {
      guesting.current = false;
      setGuestBusy(null);
    }
  };

  const resetGuest = async () => {
    if (guesting.current) return;
    guesting.current = true;
    setGuestBusy('reset');
    setFailure(null);
    setNotice('');
    try {
      if (teacher) {
        requestShellFocus();
        const failed = await enterGuest('student');
        if (failed !== null) setFailure({ cause: failed });
        return;
      }
      // An empty, null or incomplete reply is not a completed reset: it raises the invalid-payload alert and the session stays as it was.
      normalizeDemoReset(await api('/demo/reset', { method: 'POST' }));
      demoSession.clearAttempt();
      setPlay(null);
      setView('home');
      setEpoch((n) => n + 1);
      settings.reload();
    } catch (e) {
      setFailure({ cause: e });
    } finally {
      guesting.current = false;
      setGuestBusy(null);
    }
  };

  const nav = useMemo<Nav>(() => ({
    go: (next) => { navEpoch.current += 1; setFailure(null); setView(next); },
    openLab: (slug) => { navEpoch.current += 1; setLabSlug(slug); setView('lab'); },
    startMission: (id) => void startMission(id),
    openStudent: (classId, studentId) => { navEpoch.current += 1; setStudent({ classId, studentId }); setView('student'); },
    student,
    labSlug,
    starting: startingId,
    busy: startingId !== null || guestBusy !== null,
  }), [setView, setLabSlug, setStudent, startMission, student, labSlug, startingId, guestBusy]);

  if (restore.phase === 'checking') return <main className="boot"><LoadingPanel label={t('Restoring your investigation…')} detail={t('Asking the server for your unfinished attempt.')} /></main>;
  if (restore.phase === 'error') {
    return (
      <main className="boot">
        <ErrorPanel error={restore.error} title={t('Your unfinished investigation could not be restored')} onRetry={() => setRestoreNonce((n) => n + 1)}>
          <button type="button" className="ghost" onClick={() => { requestShellFocus(); demoSession.clearAttempt(); setRestore({ phase: 'done' }); }}>{t('Continue without it')}</button>
        </ErrorPanel>
      </main>
    );
  }
  if (play) return <ErrorBoundary><Mission key={play.attemptId} initial={play} onExit={() => exitMission()} onDone={() => exitMission(true)} /></ErrorBoundary>;

  const page = (() => {
    switch (view) {
      case 'labs': return <LabMap />;
      case 'lab': return <LabLobbyPage />;
      case 'progress': return <ProgressHub />;
      case 'results': return <LabResults />;
      case 'profile': return <Profile store={{ load: settings.state, reload: settings.reload, setData: settings.setData }} />;
      case 'teacher': return <Teacher />;
      case 'student': return <StudentDetail />;
      case 'content': return <ContentReview />;
      case 'about': return <About role={teacher ? 'teacher' : 'student'} />;
      default: return <Dashboard />;
    }
  })();

  const settingsBanner = view !== 'profile' && (settings.state.phase === 'error' || (settingsRetrying && settings.state.phase === 'loading'))
    ? {
      message: t('Your learning settings could not be loaded, so your saved Reduce motion preference is not applied. {reason}', { reason: settingsFailure.current ? describeError(settingsFailure.current.cause) : '' }),
      retrying: settingsRetrying,
      retry: () => { if (settingsRetrying) return; setSettingsRetrying(true); settings.reload(); },
    }
    : null;

  return (
    <NavContext.Provider value={nav}>
      <Shell
        teacher={teacher}
        view={view}
        setView={nav.go}
        resetGuest={() => void resetGuest()}
        switchGuest={() => void switchGuest()}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        error={failure === null ? '' : describeError(failure.cause)}
        clearError={() => setFailure(null)}
        notice={notice}
        clearNotice={() => setNotice('')}
        banner={settingsBanner}
        guestBusy={guestBusy}
        starting={startingId}
      >
        <ErrorBoundary key={`${view}-${labSlug}-${epoch}`}>{page}</ErrorBoundary>
      </Shell>
    </NavContext.Provider>
  );
}

/** A production bundle without an API address refuses to start, loudly, instead of calling localhost. */
function ConfigError({ message }: { message: string }) {
  return (
    <main className="boot">
      <div role="alert" className="state-panel failed">
        <h1>{t('Escape Lab is not configured')}</h1>
        <p>{t(message)}</p>
      </div>
    </main>
  );
}

// The error boundary translates its label itself when it renders (t() is never called while this module loads).
const boot = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {apiConfigError !== null
      ? <ConfigError message={apiConfigError} />
      : (
        <ErrorBoundary label="Escape Lab could not start">
          <App />
        </ErrorBoundary>
      )}
  </StrictMode>,
);
// A tab that starts in French waits for the French dictionary (a small separate file) so the first screen is never shown in English first.
if (getLang() === 'fr') loadFrench().then(boot, boot); else boot();
