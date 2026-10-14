import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, BookOpen, Check, Clock3, FlaskConical, RotateCcw, Sparkles, Trophy, X } from 'lucide-react';
import hematologyArt from '../assets/mission-hematology-investigation.webp';
import microbiologyArt from '../assets/mission-microbiology-petri.webp';
import biochemistryArt from '../assets/mission-biochemistry-acid-base.webp';
import { ApiError, api, demoSession } from '../lib/api';
import { PayloadError } from '../lib/guard';
import {
  normalizeAttempt, normalizeAttemptResult, normalizeHint, normalizeMissionAnswer, normalizeStart,
  type Attempt, type Fragment, type MissionResult, type PublicStep,
} from '../lib/attempt';
import { normalizeRules, type Rules } from '../lib/student';
import { GameEngine, initialAnswer, isAnswerReady, type EngineAnswer } from '../components/engines';
import { STEP_LABELS, labName, optionLetter, outOf } from '../lib/labels';
import { SCIENTIFIC_ASSETS } from '../lib/assets';
import { missionScene } from '../lib/mission-scenes';
import { FLAG_WORDS, Stat, formatSeconds, secondsLeft, useDocumentTitle, useMediaQuery } from '../ui/common';
import { describeError, useLoad } from '../ui/state';
import { useCountUp } from '../ui/motion';
import { LanguageSwitch, formatInt, plural, t, useLang } from '../i18n';

type Feedback = { correct: boolean; ordinal: number; message: string; progress: { correct: number; total: number } | null; penaltyXp: number | null };
type StepReview = { attemptId: string; nextStepId: string; step: PublicStep; answer: EngineAnswer; revealed: Attempt['revealed'] };

const labArtwork = (missionId: string, ordinal: number) => {
  const n = +missionId.at(-1)!;
  if (missionId[2] === 'm') return n === 1 ? hematologyArt : `/${n}.webp`;
  if (missionId[2] === 'c') return n === 3 ? microbiologyArt : `/${n + 3}.webp`;
  if (missionId[2] === 'o') return n === 3 ? biochemistryArt : `/${n + 5}.webp`;
  return `/${missionId[2] === 's' ? ordinal + 7 : 13}.webp`;
};

const isExpiry = (e: unknown) => e instanceof ApiError && e.status === 409 && e.code === 'time_expired';

/** Generic investigation language makes the loop legible without inventing case-specific scientific claims. */
export const investigationPhase = (kind: PublicStep['kind']): string => ({
  point: 'Observe',
  choice: 'Reason',
  decision: 'Decide',
  order: 'Reconstruct',
  match: 'Connect',
}[kind]);

/** Refusals that prove this screen shows an out-of-date attempt (finished or moved on elsewhere, hints bought in another tab): the attempt is re-read. */
const STALE_CODES = ['attempt_finished', 'wrong_step', 'no_more_hints', 'hint_in_progress'];

function MissionScene({ stepId }: { stepId: string }) {
  const [failed, setFailed] = useState(false);
  const scene = missionScene(stepId);
  if (!scene) return null;
  if (failed) return <div className="mission-scene inline-error" data-testid="mission-scene" role="img" aria-label={t(scene.alt)}>{t('The illustrative scene could not be loaded. The investigation can continue.')}</div>;
  return <figure className="mission-scene hero-science" data-testid="mission-scene">
    <img src={scene.src} alt={t(scene.alt)} width="1400" height="934" loading="lazy" onError={() => setFailed(true)} style={{ display: 'block', width: '100%' }} />
    <figcaption className="visual-caption"><span>{t('Illustrative training image')}</span><strong>{t(scene.label)}</strong></figcaption>
  </figure>;
}

export function Mission({ initial, onExit, onDone, onReturnToLab }: { initial: Attempt; onExit: () => void; onDone: () => void; onReturnToLab?: () => void }) {
  // Re-renders the whole screen when the display language is switched; the attempt, the answer and the timer live in state and are kept.
  useLang();
  const [attempt, setAttempt] = useState(initial);
  // The countdown is measured on the monotonic clock: stepping the clock of the computer back (or forward) must not freeze or jump it.
  const [clock, setClock] = useState(() => ({ remaining: initial.remainingSec, at: performance.now() }));
  const [now, setNow] = useState(() => performance.now());
  const [answer, setAnswer] = useState<EngineAnswer>(() => (initial.step ? initialAnswer(initial.step) : {}));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // The answer is already saved and the server is on the next step. This snapshot only lets the learner read the correction first.
  const [review, setReview] = useState<StepReview | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [fragmentNote, setFragmentNote] = useState<Fragment | null>(null);
  const [busy, setBusy] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  // The error itself is kept (not its text): the sentence is built while rendering, so it follows the display language.
  const [syncNote, setSyncNote] = useState<{ error: unknown } | null>(null);
  const [serverExpired, setServerExpired] = useState(initial.expired);
  const [noMoreHints, setNoMoreHints] = useState<string | null>(null);
  const [result, setResult] = useState<MissionResult | null>(null);
  // The server no longer knows this attempt (for example the guest session was reset from another tab).
  const [gone, setGone] = useState(false);
  // Shown after an unreadable server reply: the screen was refreshed from what the server recorded.
  const [resyncNote, setResyncNote] = useState(false);
  const submitting = useRef(false);
  const hinting = useRef(false);
  const restarting = useRef(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;
  // Bumped whenever a local action changes the attempt (answer, hint, restart): a refresh that was already in
  // flight describes an older server state and must not overwrite the newer one.
  const mutations = useRef(0);
  const syncing = useRef<Promise<void> | null>(null);
  // The attempt the last successful refresh returned (state updates are asynchronous, so the ref above lags behind).
  const lastSynced = useRef<Attempt | null>(null);
  const lastEventSync = useRef(-Infinity);
  // A disabled button drops keyboard focus to <body>: after every action focus goes back to the control (or to the question when the step changed).
  const pendingFocus = useRef<'submit' | 'hint' | 'question' | 'review' | null>('question');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const rules = useLoad<Rules>(async () => normalizeRules(await api('/rules')), []);
  // The hint price is server-owned: when it cannot be loaded the screen says so (with Retry) instead of quietly quoting a generic text.
  const [rulesRetrying, setRulesRetrying] = useState(false);
  const rulesFailure = useRef<{ error: unknown } | null>(null);
  if (rules.state.phase === 'error') rulesFailure.current = { error: rules.state.error };
  const rulesPressed = useRef(false);
  useEffect(() => {
    if (rules.state.phase !== 'loading') setRulesRetrying(false);
    if (rules.state.phase === 'ready' && rulesPressed.current) {
      rulesPressed.current = false;
      if (!document.activeElement || document.activeElement === document.body) (hintRef.current && !hintRef.current.disabled ? hintRef.current : headingRef.current)?.focus();
    }
  }, [rules.state.phase]);
  // Shown while the re-read of the attempt after a failed request runs: the controls are usable meanwhile.
  const [checking, setChecking] = useState(false);
  // On narrow screens the hint belongs right under the question, not below Submit and the status card.
  const narrow = useMediaQuery('(max-width: 900px)');
  // The assistant block sits in a different place of the page on narrow and wide screens, so crossing the breakpoint builds it anew. If the hint
  // button had focus, focus is put back on its replacement. Focus the learner moved elsewhere (a focusin on any other element) is not claimed.
  const hintHadFocus = useRef(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => { hintHadFocus.current = event.target === hintRef.current; };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  const layoutPass = useRef(narrow);
  useEffect(() => {
    if (layoutPass.current === narrow) return;
    layoutPass.current = narrow;
    if (hintHadFocus.current && (!document.activeElement || document.activeElement === document.body) && hintRef.current && !hintRef.current.disabled) {
      hintRef.current.focus();
      hintHadFocus.current = true;
    }
  }, [narrow]);

  const expired = serverExpired || attempt.expired || attempt.status === 'expired';
  const step = review?.step ?? attempt.step;
  const revealed = review?.revealed ?? attempt.revealed;
  useDocumentTitle(result ? t('Mission complete') : t(attempt.missionTitle));

  const applyAttempt = useCallback((next: Attempt) => {
    const previous = attemptRef.current;
    const at = performance.now();
    setAttempt(next);
    setClock({ remaining: next.remainingSec, at });
    // Re-anchor the displayed time to the snapshot instant, so the countdown never starts from a stale `now`.
    setNow(at);
    if (next.expired || next.status === 'expired') setServerExpired(true);
    const snapshot = reviewRef.current;
    if (snapshot && (next.attemptId !== snapshot.attemptId || next.step?.id !== snapshot.nextStepId || next.status !== 'in_progress' || next.expired)) {
      reviewRef.current = null;
      setReview(null);
      setFeedback(null);
      setFragmentNote(null);
      pendingFocus.current = 'question';
    }
    if (next.step && next.step.id !== previous.step?.id) {
      setAnswer(initialAnswer(next.step));
      setNoMoreHints(null);
    }
  }, []);

  const showResult = useCallback(async (attemptId: string) => {
    setResult(normalizeAttemptResult(await api(`/attempts/${attemptId}/result`)));
  }, []);

  // Pulls the authoritative attempt state from the server (expiry, completion elsewhere, timer drift).
  // One refresh at a time; a response that a newer local change (or another attempt) has overtaken is dropped.
  // `force` is for reconciling after the server rejected our own request: it ignores the in-flight guards.
  const sync = useCallback((force = false): Promise<void> => {
    if (!force) {
      if (syncing.current) return syncing.current;
      if (submitting.current || hinting.current) return Promise.resolve();
    }
    const run = async () => {
      const issuedFor = attemptRef.current.attemptId;
      const version = mutations.current;
      try {
        const fresh = normalizeAttempt(await api(`/attempts/${issuedFor}`));
        if (mutations.current !== version || attemptRef.current.attemptId !== issuedFor || fresh.attemptId !== issuedFor) return;
        setSyncNote(null);
        // A routine refresh (not the reconciliation after a failed request, which decides about the alert itself) that gets an answer:
        // an earlier "cannot reach the server" alert is out of date.
        if (!force) setProblem((p: unknown) => (p instanceof ApiError && p.status === 0 ? null : p));
        lastSynced.current = fresh;
        applyAttempt(fresh);
        if (fresh.status === 'completed') await showResult(fresh.attemptId);
      } catch (e) {
        if (mutations.current !== version || attemptRef.current.attemptId !== issuedFor) return;
        // 404: the attempt no longer exists (reset elsewhere). That is not a timer hiccup: close the case, offer Restart.
        if (e instanceof ApiError && e.status === 404) {
          setSyncNote(null);
          setGone(true);
          reviewRef.current = null;
          setReview(null);
          setFeedback(null);
          setFragmentNote(null);
          return;
        }
        setSyncNote({ error: e });
      }
    };
    const pending = run().finally(() => { if (syncing.current === pending) syncing.current = null; });
    syncing.current = pending;
    return pending;
  }, [applyAttempt, showResult]);

  // Local countdown: presentation of the server snapshot. The server decides when time is up.
  const live = !result && !expired && !gone && attempt.status === 'in_progress' && clock.remaining !== null;
  useEffect(() => {
    if (!live) return undefined;
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const left = secondsLeft(clock.remaining, clock.at, now);

  useEffect(() => {
    if (!live || left !== 0) return undefined;
    const id = window.setTimeout(() => void sync(), 500);
    return () => window.clearTimeout(id);
    // Re-arms when a request that held the refresh back (answer, hint, restart) has finished.
  }, [live, left, clock.at, sync, busy, hintBusy, restartBusy]);

  useEffect(() => {
    if (result || expired || gone) return undefined;
    // Returning to the tab fires `focus` and `visibilitychange` together: that is one refresh, not two.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const at = performance.now();
      if (at - lastEventSync.current < 1000) return;
      lastEventSync.current = at;
      void sync();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [result, expired, gone, sync]);

  useEffect(() => {
    if (busy || hintBusy || restartBusy) return;
    const wanted = pendingFocus.current;
    if (!wanted) return;
    pendingFocus.current = null;
    // A closed attempt (time up, or gone) has one useful action left: Restart.
    if (serverExpired || gone) { (restartRef.current ?? headingRef.current)?.focus(); return; }
    if (wanted === 'review') {
      reviewHeadingRef.current?.focus({ preventScroll: true });
      reviewHeadingRef.current?.scrollIntoView({ block: 'center' });
      return;
    }
    const button = wanted === 'submit' ? submitRef.current : wanted === 'hint' ? hintRef.current : null;
    (button && !button.disabled ? button : headingRef.current)?.focus();
    // After a wrong answer on a short screen, the alert must be on screen too (it sits just above Submit).
    if (wanted === 'submit') feedbackRef.current?.scrollIntoView({ block: 'nearest' });
  }, [busy, hintBusy, restartBusy, attempt.step?.id, review, gone, serverExpired]);

  // The attempt can also be closed by the clock or by a refresh, not only by the learner own action: the engine, Submit and the hint button
  // are then disabled under the cursor and focus would fall to the document. It goes to Restart, as after an action that finds the attempt closed.
  // A learner who is on Exit mission, Return or anything else still enabled keeps the place.
  const wasClosed = useRef(expired || gone);
  useEffect(() => {
    const closedNow = expired || gone;
    const wasBefore = wasClosed.current;
    wasClosed.current = closedNow;
    if (!closedNow || wasBefore) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || (active instanceof HTMLElement && (active.matches(':disabled') || active.closest('fieldset:disabled') !== null));
    if (lost) (restartRef.current ?? headingRef.current)?.focus();
  }, [expired, gone]);

  /**
   * Records what the learner must see right away and returns the follow-up (re-reading the attempt from the server), or null when there is none.
   * The caller runs the follow-up AFTER releasing its controls: a re-read that itself waits 20 s must not keep Submit and Exit locked.
   */
  const handleFailure = (e: unknown): (() => Promise<void>) | null => {
    const before = attemptRef.current;
    if (e instanceof ApiError && e.status === 404) {
      // Not a retryable error: the attempt is gone, so the only honest actions are to start again or leave.
      setGone(true);
      reviewRef.current = null;
      setReview(null);
      setFeedback(null);
      setProblem(null);
      return null;
    }
    if (isExpiry(e)) {
      setServerExpired(true);
      reviewRef.current = null;
      setReview(null);
      setFeedback(null);
      setProblem(null);
      return null;
    }
    if (e instanceof ApiError && e.status === 409 && e.code && STALE_CODES.includes(e.code)) {
      setProblem(e);
      return async () => { setChecking(true); try { await sync(true); } finally { setChecking(false); } };
    }
    setFeedback(null);
    setProblem(e);
    // The server may have recorded the action even though its reply was unreadable or never arrived: show its state, not a stale one.
    // Only an explicit 4xx refusal means nothing was recorded.
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) return null;
    return async () => {
      setChecking(true);
      try {
        lastSynced.current = null;
        await sync(true);
        const now = lastSynced.current as Attempt | null;
        // The alert stays unless the refreshed server state shows the action WAS recorded (then "could not be completed" would be wrong).
        if (now && now.attemptId === before.attemptId && (now.stepIndex !== before.stepIndex || now.penalties !== before.penalties || now.hintsUsed !== before.hintsUsed)) {
          setProblem(null);
          setResyncNote(true);
        }
      } finally {
        setChecking(false);
      }
    };
  };

  const submit = async () => {
    if (!step || reviewRef.current || submitting.current || expired || gone || !isAnswerReady(step, answer)) return;
    if (hinting.current) return;
    pendingFocus.current = 'submit';
    setResyncNote(false);
    submitting.current = true;
    mutations.current += 1;
    setBusy(true);
    setProblem(null);
    let followUp: (() => Promise<void>) | null = null;
    try {
      const reply = normalizeMissionAnswer(await api(`/attempts/${attempt.attemptId}/answer`, { method: 'POST', body: JSON.stringify({ stepId: step.id, response: answer }) }));
      setFeedback({ correct: reply.correct, ordinal: step.ordinal, message: reply.message, progress: reply.progress, penaltyXp: reply.penaltyXp });
      if (reply.correct && !reply.completed && reply.attempt.step && reply.attempt.step.id !== step.id) {
        const snapshot = { attemptId: reply.attempt.attemptId, nextStepId: reply.attempt.step.id, step, answer, revealed: attempt.revealed };
        reviewRef.current = snapshot;
        setReview(snapshot);
        pendingFocus.current = 'review';
      }
      if (reply.fragment) {
        setFragments((list) => [...list, reply.fragment!]);
        setFragmentNote(reply.fragment);
      } else {
        setFragmentNote(null);
      }
      mutations.current += 1;
      setSyncNote(null);
      applyAttempt(reply.attempt);
      if (reply.completed && reply.result) {
        setResult(reply.result);
      }
    } catch (e) {
      followUp = handleFailure(e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
    if (followUp) await followUp();
  };

  const askHint = async () => {
    // The server refuses a hint while an answer is being checked (409 hint_in_progress), and vice versa.
    if (!step || reviewRef.current || hinting.current || submitting.current || expired || gone) return;
    pendingFocus.current = 'hint';
    setResyncNote(false);
    hinting.current = true;
    mutations.current += 1;
    setHintBusy(true);
    setProblem(null);
    let followUp: (() => Promise<void>) | null = null;
    try {
      const reply = normalizeHint(await api(`/attempts/${attempt.attemptId}/hint`, { method: 'POST', body: JSON.stringify({ stepId: step.id }) }));
      setSyncNote(null);
      mutations.current += 1;
      applyAttempt(reply.attempt);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'no_more_hints') setNoMoreHints(step.id);
      followUp = handleFailure(e);
    } finally {
      hinting.current = false;
      setHintBusy(false);
    }
    if (followUp) await followUp();
  };

  const restart = async (fromResult = false) => {
    if (restarting.current || submitting.current || hinting.current) return;
    restarting.current = true;
    pendingFocus.current = 'question';
    mutations.current += 1;
    setRestartBusy(true);
    setProblem(null);
    try {
      const started = normalizeStart(await api(`/missions/${attempt.missionId}/start`, { method: 'POST' }));
      demoSession.setAttemptId(started.attempt.attemptId);
      setServerExpired(started.attempt.expired);
      setGone(false);
      setAttempt(started.attempt);
      attemptRef.current = started.attempt;
      lastSynced.current = started.attempt;
      const at = performance.now();
      setClock({ remaining: started.attempt.remainingSec, at });
      setNow(at);
      setAnswer(started.attempt.step ? initialAnswer(started.attempt.step) : {});
      reviewRef.current = null;
      setReview(null);
      setFeedback(null);
      setFragments([]);
      setFragmentNote(null);
      setNoMoreHints(null);
      setFeedback(null);
      if (fromResult) setResult(null);
    } catch (e) {
      setProblem(e);
    } finally {
      restarting.current = false;
      setRestartBusy(false);
    }
  };

  const continueReview = () => {
    if (!reviewRef.current || expired || gone) return;
    reviewRef.current = null;
    pendingFocus.current = 'question';
    setReview(null);
    setFeedback(null);
    setFragmentNote(null);
  };

  if (result) return <ResultScreen result={result} newFragments={fragments} onExit={onDone} onReturnToLab={onReturnToLab} onReplay={() => void restart(true)} replayBusy={restartBusy} replayError={problem} />;
  if (!step) {
    // A completed attempt whose result has not been fetched yet (for example completed in another tab).
    return <CompletedFetch attemptId={attempt.attemptId} onResult={setResult} onExit={onDone} />;
  }

  // One request at a time: the server answers 409 hint_in_progress to an answer and a hint that overlap.
  const inFlight = busy || hintBusy || restartBusy;
  const closed = expired || gone;
  const hintsLeft = step.hintsAvailable - step.hintsOnStep;
  const hintsGone = hintsLeft <= 0 || noMoreHints === step.id;
  const ready = isAnswerReady(step, answer);
  const hintCost = rules.state.phase === 'ready' ? Math.abs(rules.state.data.hintPenalty) : null;
  const noHintBonus = rules.state.phase === 'ready'
    ? (attempt.missionId.startsWith('master-') ? rules.state.data.noHintBonus.master : rules.state.data.noHintBonus.standard)
    : null;
  // Share of steps the server reports as solved: it starts empty and fills as steps are completed.
  const pct = attempt.stepCount === 0 ? 0 : (attempt.stepIndex / attempt.stepCount) * 100;

  // The server stores the text of every hint it delivered on this step, so the list is the same after a reload, a re-entry or another device.
  const issuedHints = step.hintsGiven.map((given) => (
    <div className="hint-result" role="status" key={given.level}><span className="hint-level">{t('Hint {level}.', { level: given.level })}</span> {t(given.text)}</div>
  ));

  const rulesNote = (rules.state.phase === 'error' || (rulesRetrying && rules.state.phase === 'loading')) && (
    <div className="inline-error rules-note" role="alert">
      {t('The scoring rules could not be loaded, so the hint price is not shown.')} {rulesFailure.current ? describeError(rulesFailure.current.error) : ''}{' '}
      <button type="button" className="text-button inline" aria-disabled={rulesRetrying || undefined} aria-busy={rulesRetrying} onClick={() => { if (rulesRetrying) return; rulesPressed.current = true; setRulesRetrying(true); rules.reload(); }}>{rulesRetrying ? t('Retrying…') : t('Retry')}</button>
    </div>
  );

  const assistant = narrow
    ? (
      <div className="assistant-inline">
        <div className="eyebrow">{t('LAB ASSISTANT · BETA')}</div>
        <div className="assistant-row">
          <button type="button" className="hint" ref={hintRef} disabled={inFlight || closed || hintsGone} onClick={() => void askHint()} aria-busy={hintBusy}>
            {hintBusy ? t('Requesting hint…') : hintsGone ? t('No more hints on this step') : <><Sparkles size={15} aria-hidden="true" /> {t('Ask Lab Assistant')}</>}
          </button>
          <p className="assistant-note">{t('Observe before you decide.')} {hintCost !== null ? <>{t('Each hint costs {cost} XP.', { cost: formatInt(hintCost) })} {t('Using a hint also forfeits the {bonus} XP no-hint bonus.', { bonus: formatInt(noHintBonus!) })}</> : t('Each hint carries an XP penalty set by the server.')}</p>
        </div>
        {rulesNote}
        <p className="hint-budget">{t('Hints used on this step: {used} of {total}.', { used: formatInt(step.hintsOnStep), total: formatInt(step.hintsAvailable) })}</p>
        {issuedHints}
      </div>
    )
    : (
      <div className="aside-card assistant-card">
        <div className="eyebrow">{t('LAB ASSISTANT · BETA')}</div>
        <h2>{t('Observe before you decide.')}</h2>
        <p>
          {t('Request a contextual hint when you need a new angle.')}{' '}
          {hintCost !== null ? <>{t('Each hint costs {cost} XP.', { cost: formatInt(hintCost) })} {t('Using a hint also forfeits the {bonus} XP no-hint bonus.', { bonus: formatInt(noHintBonus!) })}</> : t('Each hint carries an XP penalty set by the server.')}
        </p>
        <button type="button" className="hint" ref={hintRef} disabled={inFlight || closed || hintsGone} onClick={() => void askHint()} aria-busy={hintBusy}>
          {hintBusy ? t('Requesting hint…') : hintsGone ? t('No more hints on this step') : <><Sparkles size={15} aria-hidden="true" /> {t('Ask Lab Assistant')}</>}
        </button>
        {rulesNote}
        <p className="hint-budget">{t('Hints used on this step: {used} of {total}.', { used: formatInt(step.hintsOnStep), total: formatInt(step.hintsAvailable) })}</p>
        {issuedHints}
      </div>
    );

  const reviewAssistant = (
    <div className={narrow ? 'assistant-inline review-assistant' : 'aside-card review-assistant assistant-card'}>
      <div className="eyebrow">{t('ANSWER SAVED')}</div>
      <h2>{t('Take a moment to understand.')}</h2>
      <p>{t('Read the explanation, then continue when you are ready. The mission timer keeps running.')}</p>
    </div>
  );

  return (
    <div className={`player mission-${attempt.labSlug}`}>
      <header>
        {/* Leaving while an answer is being checked would drop its outcome (a recorded answer whose result the learner never sees). */}
        <button type="button" className="back-button" aria-label={t('Exit mission')} disabled={busy} onClick={onExit}><ArrowLeft size={18} aria-hidden="true" /><span className="back-label">{t('Exit mission')}</span></button>
        <div className="player-title">
          <span className="eyebrow">{t('CASE FILE · {lab}', { lab: t(labName(attempt.labSlug)) })}</span>
          <b>{t(attempt.missionTitle)}</b>
        </div>
        <div className="timer" role="timer" aria-label={expired ? t('Time is up') : gone ? t('Attempt closed') : left === null ? t('No time limit') : t('Time left {time}', { time: formatSeconds(left) })}>
          <Clock3 size={16} aria-hidden="true" /> <span aria-hidden="true">{expired ? t('Time is up') : gone ? t('Closed') : left === null ? '—' : formatSeconds(left)}</span>
        </div>
        <LanguageSwitch />
      </header>
      <section className="mission-overview" aria-label={t('Mission overview')}>
      <div className="player-progress" role="progressbar" aria-label={t('Mission progress')} aria-valuemin={0} aria-valuemax={attempt.stepCount} aria-valuenow={attempt.stepIndex} aria-valuetext={t('{solved} of {total} steps validated', { solved: attempt.stepIndex, total: attempt.stepCount })}><span style={{ width: `${pct}%` }} /></div>
      <section className="mission-hero" aria-labelledby="mission-title">
        <img src={labArtwork(attempt.missionId, step.ordinal)} alt="" />
        <div className="mission-hero-shade" aria-hidden="true" />
        <div className="mission-hero-copy">
          <div className="mission-hero-kicker"><span className="mission-kicker-case"><span className="mission-live-dot" />{t('CASE FILE · {lab}', { lab: t(labName(attempt.labSlug)) })}{' '}</span><span className="mission-kicker-divider" aria-hidden="true" /><span className="mission-kicker-simulation">{t('Educational simulation')}</span></div>
          <h1 id="mission-title">{t(attempt.missionTitle)}</h1>
          <p>{t(labName(attempt.labSlug))}<span aria-hidden="true"> / </span>{t(STEP_LABELS[step.kind])}</p>
        </div>
        <div className="mission-hero-stage"><span>{t('STEP {ordinal} / {total}', { ordinal: step.ordinal, total: step.of })}</span><b>{String(step.ordinal).padStart(2, '0')}</b></div>
      </section>
      <ol className="mission-step-track" aria-label={t('Mission steps')}>
        {Array.from({ length: step.of }, (_, index) => {
          const ordinal = index + 1;
          const state = ordinal < step.ordinal || (review && ordinal === step.ordinal) ? 'done' : ordinal === step.ordinal ? 'current' : 'upcoming';
          return <li className={`mission-step ${state}`} aria-current={state === 'current' ? 'step' : undefined} aria-label={t(state === 'done' ? 'Step {ordinal} complete' : state === 'current' ? 'Current step {ordinal}' : 'Upcoming step {ordinal}', { ordinal })} key={ordinal}>{state === 'done' ? <Check size={14} aria-hidden="true" /> : <span>{String(ordinal).padStart(2, '0')}</span>}</li>;
        })}
      </ol>
      </section>
      <main className="case-layout">
        <section className="case-panel" aria-labelledby="case-prompt">
          <div className="question-section-label"><span><Activity size={15} aria-hidden="true" />{t('YOUR INVESTIGATION')}</span><span>{t('QUESTION {ordinal}', { ordinal: step.ordinal })}</span></div>
          <h1 id="case-prompt" ref={headingRef} tabIndex={-1}>{t(step.prompt)}</h1>
          <div className="status-row" aria-label={t('Investigation phase')}><span>{t('Investigation phase')}</span><b>{t(investigationPhase(step.kind))}</b></div>
          {step.context && <p className="context">{t(step.context)}</p>}
          {step.sample && <div className="sample-card"><span className="sample-icon"><FlaskConical size={20} aria-hidden="true" /></span><span><small>{t('SPECIMEN')}</small><b>{t('Sample {id}: {label}', { id: step.sample.id, label: t(step.sample.label) })}</b></span><span className="sample-status"><Check size={14} aria-hidden="true" />{t('IN ANALYSIS')}</span></div>}
          {revealed.length > 0 && (
            <div className="values-block">
              <div className="evidence-heading"><span className="eyebrow">{attempt.engine === 'stepper' ? t('EVIDENCE REVEALED SO FAR') : t('LABORATORY VALUES')}</span><span>{t('{count} indicators', { count: formatInt(revealed.length) })}</span></div>
              <div className="values" role="list">
                {revealed.map((v, i) => (
                  <div className={`value ${v.flag ? 'flagged' : ''}`} role="listitem" key={`${v.name}-${i}`}>
                    <span>{t(v.name)}</span>
                    <b>{v.value} <small>{v.unit}</small></b>
                    {v.ref && <em>{t('Reference {ref}', { ref: v.ref })}</em>}
                    {v.flag ? <strong className="flag">{t(FLAG_WORDS[v.flag] ?? v.flag)}</strong> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          <MissionScene key={`scene-${step.id}`} stepId={step.id} />

          <div className="response-heading"><span className="eyebrow">{t('YOUR RESPONSE')}</span><span>{t(STEP_LABELS[step.kind])}</span></div>
          {review ? <SavedResponse step={review.step} answer={review.answer} /> : <GameEngine key={`engine-${step.id}`} step={step} answer={answer} setAnswer={setAnswer} disabled={inFlight || closed} />}

          {feedback && (feedback.correct
            ? (
              <div className={`feedback correct${review ? ' step-review' : ''}`} role="status" aria-live="polite">
                <span className="review-check" aria-hidden="true"><Check size={review ? 28 : 16} /></span>
                <div>
                  {review ? <h2 ref={reviewHeadingRef} tabIndex={-1}>{t('Step {ordinal} correct.', { ordinal: feedback.ordinal })}</h2> : <b>{t('Step {ordinal} correct.', { ordinal: feedback.ordinal })}</b>}
                  <p>{t('Your response is saved.')}</p>
                  <details className="review-explanation" open><summary><BookOpen size={19} aria-hidden="true" />{t('View explanation')}</summary><p>{t(feedback.message)}</p></details>
                </div>
              </div>
            )
            : (
              <div className="feedback wrong" role="alert" ref={feedbackRef}>
                <X size={16} aria-hidden="true" />
                <div>
                  <b>{t('Not quite.')}</b>
                  <p>{t(feedback.message)}</p>
                  {feedback.progress && (
                    <div className="feedback-progress">
                      <p>{t('{correct} of {total} in the right place.', { correct: formatInt(feedback.progress.correct), total: formatInt(feedback.progress.total) })}</p>
                      <div
                        className="bar"
                        role="progressbar"
                        aria-label={t('Observation progress')}
                        aria-valuemin={0}
                        aria-valuemax={feedback.progress.total}
                        aria-valuenow={feedback.progress.correct}
                        aria-valuetext={t('{correct} of {total} observations correctly placed.', { correct: formatInt(feedback.progress.correct), total: formatInt(feedback.progress.total) })}
                      >
                        <i style={{ width: `${feedback.progress.total > 0 ? (feedback.progress.correct / feedback.progress.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {feedback.penaltyXp !== null && <p>{t('XP penalty: {penalty}.', { penalty: formatInt(feedback.penaltyXp) })}</p>}
                </div>
              </div>
            ))}
          {fragmentNote && (
            <div className="fragment-reveal inline" role="status">
              <div className="eyebrow">{t('CODE FRAGMENT DISCOVERED')}</div>
              <strong>{fragmentNote.digit}</strong>
              <p>{t('Position {position} added to the Code Vault.', { position: fragmentNote.position })}</p>
            </div>
          )}
          {expired && (
            <div className="feedback wrong expired-panel" role="alert">
              <Clock3 size={16} aria-hidden="true" />
              <div>
                <b>{t('Time is up.')}</b>
                <p>{t('The server closed this attempt because its time limit passed. Your answers can no longer be submitted. Start the mission again for a fresh attempt.')}</p>
                <div className="state-actions">
                  <button type="button" className="primary" ref={restartRef} disabled={inFlight} aria-busy={restartBusy} onClick={() => void restart()}>{restartBusy ? t('Restarting…') : t('Restart mission')}</button>
                  <button type="button" className="ghost" onClick={onDone}>{t('Return to mission control')}</button>
                </div>
              </div>
            </div>
          )}
          {gone && !expired && (
            <div className="feedback wrong expired-panel" role="alert">
              <X size={16} aria-hidden="true" />
              <div>
                <b>{t('This case is no longer available.')}</b>
                <p>{t('The server no longer has this attempt, most likely because the guest session was reset (possibly in another tab). Nothing more can be submitted here. Start the mission again for a fresh attempt.')}</p>
                <div className="state-actions">
                  <button type="button" className="primary" ref={restartRef} disabled={inFlight} aria-busy={restartBusy} onClick={() => void restart()}>{restartBusy ? t('Restarting…') : t('Restart mission')}</button>
                  <button type="button" className="ghost" onClick={onDone}>{t('Return to mission control')}</button>
                </div>
              </div>
            </div>
          )}
          {!closed && problem !== null && <div className="feedback wrong" role="alert"><X size={16} aria-hidden="true" /><div><b>{t('This could not be completed.')}</b><p>{describeError(problem)}</p></div></div>}
          {closed && problem !== null && <p className="inline-error" role="alert">{t('Restart failed: {detail}', { detail: describeError(problem) })}</p>}
          {syncNote && <p className="sync-note" role="status">{t('Could not refresh the timer from the server: {detail}', { detail: describeError(syncNote.error) })}</p>}
          {resyncNote && <p className="sync-note" role="status">{t('The server recorded your action, but its reply could not be read, so this screen was refreshed from the server. Check your answer count and hints before continuing.')}</p>}
          {checking && <p className="sync-note" role="status">{t('Checking what the server recorded…')}</p>}

          {narrow && !review && assistant}

          {review
            ? <button type="button" className="primary review-continue" disabled={inFlight || closed} onClick={continueReview}>{t('Continue')} <ArrowRight size={19} aria-hidden="true" /></button>
            : <button type="button" className="primary submit" ref={submitRef} disabled={inFlight || closed || !ready} onClick={() => void submit()}>
                {busy ? t('Checking…') : t('Submit answer')} <ArrowRight size={17} aria-hidden="true" />
              </button>}
          <p className="mission-disclaimer">{t('Educational scenario — not clinical guidance')}</p>
        </section>

        <aside className="case-aside" aria-label={t('Lab assistant and case status')}>
          {!narrow && (review ? reviewAssistant : assistant)}
          <div className="aside-card case-status-card">
            <div className="eyebrow">{t('CASE STATUS')}</div>
            <dl className="status-list">
              <div className="status-row"><dt>{t('Wrong answers')}</dt><dd>{formatInt(attempt.penalties)}</dd></div>
              <div className="status-row"><dt>{t('Hints used')}</dt><dd>{formatInt(attempt.hintsUsed)}</dd></div>
              <div className="status-row"><dt>{t('XP penalty so far')}</dt><dd>{formatInt(attempt.penaltyXp)}</dd></div>
            </dl>
          </div>
        </aside>
      </main>
    </div>
  );
}

/** Presents the actual submitted input; correctness and explanation came from the server response. */
export function SavedResponse({ step, answer }: { step: PublicStep; answer: EngineAnswer }) {
  if (step.kind === 'order') {
    const labels = new Map(step.items?.map((item) => [item.id, item.label]));
    return <div className="review-answer review-answer-block" aria-label={t('Your saved response')}><ol className="review-sequence">{answer.order?.map((id) => <li key={id}>{t(labels.get(id) ?? id)}</li>)}</ol></div>;
  }
  if (step.kind === 'match') {
    const labels = new Map(step.right?.map((item) => [item.id, item.label]));
    return <div className="review-answer review-answer-block" aria-label={t('Your saved response')}><dl className="review-pairs">{step.left?.map((item) => <div key={item.id}><dt>{t(item.label)}</dt><dd>{t(labels.get(answer.pairs?.[item.id] ?? '') ?? '')}</dd></div>)}</dl></div>;
  }
  if (step.kind === 'point') {
    const asset = step.image && SCIENTIFIC_ASSETS[step.image.asset];
    const targets = step.pointTargets ?? [];
    return <figure className="review-answer review-answer-block" aria-label={t('Your saved response')}>
      {asset && <div className="review-point-image" style={{ aspectRatio: `${asset.width} / ${asset.height}` }}><img src={asset.src} alt={t(asset.label)} width={asset.width} height={asset.height} />{targets.length ? targets.map((target) => { const point = answer.points?.[target.id]; return point && <span key={target.id} className="marker" aria-hidden="true" style={{ left: `${point.x}%`, top: `${point.y}%` }} />; }) : <span className="marker" aria-hidden="true" style={{ left: `${answer.x}%`, top: `${answer.y}%` }} />}</div>}
      {targets.length ? <ul className="review-point-list">{targets.map((target) => { const point = answer.points?.[target.id]; const selection = answer.selections?.[target.id]; return <li key={target.id}>{t(target.label)}: {selection ? t('Selected: {selection}', { selection: t(selection) }) : point ? t('Marker at {x}% across, {y}% down.', { x: Math.round(point.x), y: Math.round(point.y) }) : t('Not selected')}</li>; })}</ul> : <figcaption>{t('Marker at {x}% across, {y}% down.', { x: Math.round(answer.x ?? 0), y: Math.round(answer.y ?? 0) })}</figcaption>}
    </figure>;
  }
  const selected = step.kind === 'choice' ? answer.choice : answer.decision;
  const index = step.options?.findIndex((option) => option.id === selected) ?? -1;
  const option = index >= 0 ? step.options?.[index] : undefined;
  return (
    <div className="review-answer" aria-label={t('Your saved response')}>
      {option ? <><span className="chip" aria-hidden="true">{optionLetter(index)}</span><span>{t(option.label)}</span><Check size={20} aria-hidden="true" /></>
        : <p>{t('Your response is saved.')}</p>}
    </div>
  );
}

function CompletedFetch({ attemptId, onResult, onExit }: { attemptId: string; onResult: (r: MissionResult) => void; onExit: () => void }) {
  useLang();
  const { state, reload } = useLoad(async () => normalizeAttemptResult(await api(`/attempts/${attemptId}/result`)), [attemptId]);
  useEffect(() => { if (state.phase === 'ready') onResult(state.data); }, [state, onResult]);
  if (state.phase === 'error') {
    return (
      <main className="result-screen">
        <div className="result-lang"><LanguageSwitch /></div>
        <div role="alert" className="state-panel failed">
          <h1>{t('The result could not be loaded')}</h1>
          <p>{describeError(state.error)}</p>
          <div className="state-actions">
            <button type="button" className="primary" onClick={reload}>{t('Retry')}</button>
            <button type="button" className="ghost" onClick={onExit}>{t('Return to mission control')}</button>
          </div>
        </div>
      </main>
    );
  }
  return <main className="result-screen"><div role="status" className="state-panel loading"><h1 className="state-title">{t('Loading your result…')}</h1></div></main>;
}

/** What the result says about the total XP of the learner: a personal best is not announced with a zero gain; any other server figure is shown as sent. */
export function resultXpNote(result: Pick<MissionResult, 'newBest' | 'xpAwarded'>): string {
  if (!result.newBest) return t('This replay did not beat your best score, so your total XP is unchanged.');
  if (result.xpAwarded === 0) return t('No XP was added to your total.');
  return t('New personal best: {sign}{xp} XP added to your total.', { sign: result.xpAwarded > 0 ? '+' : '', xp: formatInt(result.xpAwarded) });
}

export function ResultScreen({ result, newFragments, onExit, onReturnToLab, onReplay, replayBusy = false, replayError = null }: { result: MissionResult; newFragments: Fragment[]; onExit: () => void; onReturnToLab?: () => void; onReplay?: () => void; replayBusy?: boolean; replayError?: unknown }) {
  useLang();
  // The result replaces a long case page: start at its top, not wherever the Submit button was.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo?.({ top: 0 }); headingRef.current?.focus({ preventScroll: true }); }, []);
  // Celebration layer: the figure counted to and the bar filled to are the server's; under reduce-motion both show at once (CSS drops the transition).
  const shownScore = useCountUp(result.score);
  const [filled, setFilled] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setFilled(true), 30); return () => window.clearTimeout(id); }, []);
  const scorePct = result.maxScore > 0 ? Math.max(0, Math.min(100, (result.score / result.maxScore) * 100)) : 0;
  const gained = result.newBest && result.xpAwarded > 0;
  return (
    <main className={`result-screen result-${result.mission.labSlug}`}>
      <section className="result-hero" aria-labelledby="result-title">
        <div className="result-lang"><LanguageSwitch /></div>
        <div className="result-hero-copy">
          <div className="eyebrow"><span>{t('CASE COMPLETE')}{' '}</span><span className="mission-kicker-divider" aria-hidden="true" /><span>{t(labName(result.mission.labSlug))}</span></div>
          <h1 id="result-title" ref={headingRef} tabIndex={-1}>{t('Investigation complete.')}</h1>
          <p>{t(result.mission.title)}</p>
        </div>
        <img src="/12.webp" alt="" aria-hidden="true" />
      </section>
      <p className="result-lede result-record">{t('Case archived. Here is your mission debrief.')}</p>
      <section className="result-score-card" aria-label={t('Mission score')}>
        <div className="result-score-top"><span><Sparkles size={18} aria-hidden="true" />{t('SCORE')}</span><b>{formatInt(shownScore)} <small>/ {formatInt(result.maxScore)} XP</small></b></div>
        <div className="result-score-bar" role="progressbar" aria-label={t('Score')} aria-valuemin={0} aria-valuemax={result.maxScore} aria-valuenow={Math.min(result.maxScore, result.score)}><i style={{ width: `${filled ? scorePct : 0}%` }} /></div>
      </section>
      <div className="result-stats">
        <Stat icon={<Trophy />} label={t('Accuracy')} value={t('{pct}%', { pct: formatInt(result.stats.accuracyPct) })} detail={`${plural(result.stats.wrongAnswers, 'wrong', 'wrong')} · ${plural(result.stats.hintsUsed, 'hint')}`} />
        <Stat icon={<Clock3 />} label={t('Time')} value={result.stats.elapsed} detail={t('Official timer')} />
        <Stat icon={<Check />} label={t('First-try steps')} value={outOf(result.stats.firstTrySteps, result.stats.steps)} detail={t('Solved without a wrong answer')} />
      </div>
      <p className={`result-lede result-xp-note${gained ? ' gained' : ''}`}>{resultXpNote(result)}</p>
      <section className="result-explanation" aria-labelledby="result-explanation-title">
        <h2 id="result-explanation-title">{t('Final step explained')}</h2>
        <p>{t(result.finalExplanation)}</p>
      </section>
      {result.ledger.length > 0 && (
        <ul className="ledger" aria-label={t('Score ledger')}>
          {result.ledger.map((row, index) => (
            <li key={`${row.id}-${index}`} className={row.kind}><span>{t(row.label)}<small>{t(row.reason)}</small></span><b>{row.points > 0 ? `+${formatInt(row.points)}` : formatInt(row.points)}</b></li>
          ))}
        </ul>
      )}
      {newFragments.map((f, index) => (
        <div className="fragment-reveal celebrate" role="status" key={`${f.labSlug}-${f.position}-${index}`}>
          <div className="eyebrow">{t('CODE FRAGMENT DISCOVERED')}</div>
          <strong>{f.digit}</strong>
          <p>{t('Position {position} added to the Code Vault.', { position: f.position })}</p>
        </div>
      ))}
      {result.fragments && (
        <p className="result-lede">{t('Vault progress for this laboratory: {slots}', { slots: result.fragments.map((d) => (d === null ? '·' : String(d))).join('\u00a0') })}</p>
      )}
      {result.masterCode && <p className="result-lede">{t('Master Lab exit code:')} <b>{result.masterCode}</b></p>}
      {result.newBadges.length > 0 && (
        <div role="status">
          <p className="badge-chips-label">{result.newBadges.length === 1 ? t('New badge earned') : t('New badges earned')}</p>
          <ul className="badge-chips celebrate" aria-label={t('New badges')}>
            {result.newBadges.map((b) => <li key={b.id}><Trophy size={15} aria-hidden="true" />{t(b.name)}</li>)}
          </ul>
        </div>
      )}
      {replayError !== null && replayError !== undefined && <div className="feedback wrong" role="alert"><X size={16} aria-hidden="true" /><div><b>{t('The mission could not be restarted.')}</b><p>{describeError(replayError)}</p></div></div>}
      <div className="result-actions">
        {onReplay && <button type="button" className="result-replay" disabled={replayBusy} aria-busy={replayBusy} onClick={onReplay}><RotateCcw size={18} aria-hidden="true" />{replayBusy ? t('Restarting…') : t('Replay mission')}</button>}
        {onReturnToLab && <button type="button" className="result-return" onClick={onReturnToLab}>{t('Back to the laboratory')} <ArrowRight size={16} aria-hidden="true" /></button>}
        <button type="button" className={onReturnToLab ? 'ghost' : 'primary'} onClick={onExit}>{t('Return to mission control')} <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </main>
  );
}
