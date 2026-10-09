import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, Sparkles, Trophy, X } from 'lucide-react';
import { ApiError, api, demoSession } from '../lib/api';
import { PayloadError } from '../lib/guard';
import {
  normalizeAttempt, normalizeAttemptResult, normalizeHint, normalizeMissionAnswer, normalizeStart,
  type Attempt, type Fragment, type MissionResult,
} from '../lib/attempt';
import { normalizeRules, type Rules } from '../lib/student';
import { GameEngine, initialAnswer, isAnswerReady, type EngineAnswer } from '../components/engines';
import { STEP_LABELS, labName } from '../lib/labels';
import { FLAG_WORDS, Stat, formatSeconds, secondsLeft, useDocumentTitle, useMediaQuery } from '../ui/common';
import { describeError, useLoad } from '../ui/state';
import { LanguageSwitch, formatInt, plural, t, useLang } from '../i18n';

type Feedback = { correct: boolean; ordinal: number; message: string; progress: { correct: number; total: number } | null; penaltyXp: number | null };

const isExpiry = (e: unknown) => e instanceof ApiError && e.status === 409 && e.code === 'time_expired';

/** Refusals that prove this screen shows an out-of-date attempt (finished or moved on elsewhere, hints bought in another tab): the attempt is re-read. */
const STALE_CODES = ['attempt_finished', 'wrong_step', 'no_more_hints', 'hint_in_progress'];

export function Mission({ initial, onExit, onDone }: { initial: Attempt; onExit: () => void; onDone: () => void }) {
  // Re-renders the whole screen when the display language is switched; the attempt, the answer and the timer live in state and are kept.
  const lang = useLang();
  const [attempt, setAttempt] = useState(initial);
  // The countdown is measured on the monotonic clock: stepping the clock of the computer back (or forward) must not freeze or jump it.
  const [clock, setClock] = useState(() => ({ remaining: initial.remainingSec, at: performance.now() }));
  const [now, setNow] = useState(() => performance.now());
  const [answer, setAnswer] = useState<EngineAnswer>(() => (initial.step ? initialAnswer(initial.step) : {}));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
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
  const pendingFocus = useRef<'submit' | 'hint' | 'question' | null>('question');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
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
  const step = attempt.step;
  useDocumentTitle(result ? t('Mission complete') : t(attempt.missionTitle));

  const applyAttempt = useCallback((next: Attempt) => {
    const previous = attemptRef.current;
    const at = performance.now();
    setAttempt(next);
    setClock({ remaining: next.remainingSec, at });
    // Re-anchor the displayed time to the snapshot instant, so the countdown never starts from a stale `now`.
    setNow(at);
    if (next.expired || next.status === 'expired') setServerExpired(true);
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
        if (e instanceof ApiError && e.status === 404) { setSyncNote(null); setGone(true); return; }
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
    const button = wanted === 'submit' ? submitRef.current : wanted === 'hint' ? hintRef.current : null;
    (button && !button.disabled ? button : headingRef.current)?.focus();
    // After a wrong answer on a short screen, the alert must be on screen too (it sits just above Submit).
    if (wanted === 'submit') feedbackRef.current?.scrollIntoView({ block: 'nearest' });
  }, [busy, hintBusy, restartBusy, attempt.step?.id, gone, serverExpired]);

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
      setFeedback(null);
      setProblem(null);
      return null;
    }
    if (isExpiry(e)) {
      setServerExpired(true);
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
    if (!step || submitting.current || expired || gone || !isAnswerReady(step, answer)) return;
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
    if (!step || hinting.current || submitting.current || expired || gone) return;
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

  const restart = async () => {
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
      const at = performance.now();
      setClock({ remaining: started.attempt.remainingSec, at });
      setNow(at);
      setAnswer(started.attempt.step ? initialAnswer(started.attempt.step) : {});
      setFeedback(null);
      setFragments([]);
      setFragmentNote(null);
      setNoMoreHints(null);
    } catch (e) {
      setProblem(e);
    } finally {
      restarting.current = false;
      setRestartBusy(false);
    }
  };

  if (result) return <ResultScreen result={result} newFragments={fragments} onExit={onDone} />;
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
          <p className="assistant-note">{t('Observe before you decide.')} {hintCost !== null ? t('Each hint costs {cost} XP.', { cost: formatInt(hintCost) }) : t('Each hint carries an XP penalty set by the server.')}</p>
        </div>
        {rulesNote}
        <p className="hint-budget">{t('Hints used on this step: {used} of {total}.', { used: formatInt(step.hintsOnStep), total: formatInt(step.hintsAvailable) })}</p>
        {issuedHints}
      </div>
    )
    : (
      <div className="aside-card">
        <div className="eyebrow">{t('LAB ASSISTANT · BETA')}</div>
        <h2>{t('Observe before you decide.')}</h2>
        <p>
          {t('Request a contextual hint when you need a new angle.')}{' '}
          {hintCost !== null ? t('Each hint costs {cost} XP.', { cost: formatInt(hintCost) }) : t('Each hint carries an XP penalty set by the server.')}
        </p>
        <button type="button" className="hint" ref={hintRef} disabled={inFlight || closed || hintsGone} onClick={() => void askHint()} aria-busy={hintBusy}>
          {hintBusy ? t('Requesting hint…') : hintsGone ? t('No more hints on this step') : <><Sparkles size={15} aria-hidden="true" /> {t('Ask Lab Assistant')}</>}
        </button>
        {rulesNote}
        <p className="hint-budget">{t('Hints used on this step: {used} of {total}.', { used: formatInt(step.hintsOnStep), total: formatInt(step.hintsAvailable) })}</p>
        {issuedHints}
      </div>
    );

  return (
    <div className="player">
      <header>
        {/* Leaving while an answer is being checked would drop its outcome (a recorded answer whose result the learner never sees). */}
        <button type="button" className="back-button" disabled={busy} onClick={onExit}>← {t('Exit mission')}</button>
        <div className="player-title">
          <span className="eyebrow">{t('CASE FILE · {lab}', { lab: t(labName(attempt.labSlug)) })}</span>
          <b>{t(attempt.missionTitle)}</b>
        </div>
        <div className="timer" role="timer" aria-label={expired ? t('Time is up') : gone ? t('Attempt closed') : left === null ? t('No time limit') : t('Time left {time}', { time: formatSeconds(left) })}>
          <Clock3 size={16} aria-hidden="true" /> <span aria-hidden="true">{expired ? t('Time is up') : gone ? t('Closed') : left === null ? '—' : formatSeconds(left)}</span>
        </div>
        <LanguageSwitch />
      </header>
      <div className="player-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <main className="case-layout">
        <section className="case-panel" aria-labelledby="case-prompt">
          <div className="case-meta"><span>{t('STEP {ordinal} / {total}', { ordinal: step.ordinal, total: step.of })}</span><span>{t(STEP_LABELS[step.kind])}</span></div>
          <p className="scenario-note">{t('Educational scenario — not clinical guidance')}</p>
          {lang === 'fr' && <p className="scenario-note" role="note">{t('French translation of the mission text, not reviewed by experts. The English text is the reference.')}</p>}
          <h1 id="case-prompt" ref={headingRef} tabIndex={-1}>{t(step.prompt)}</h1>
          {step.context && <p className="context">{t(step.context)}</p>}
          {step.sample && <p className="sample-chip">{t('Sample {id}: {label}', { id: step.sample.id, label: t(step.sample.label) })}</p>}
          {attempt.revealed.length > 0 && (
            <div className="values-block">
              <div className="eyebrow">{attempt.engine === 'stepper' ? t('EVIDENCE REVEALED SO FAR') : t('LABORATORY VALUES')}</div>
              <div className="values" role="list">
                {attempt.revealed.map((v, i) => (
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

          <GameEngine key={step.id} step={step} answer={answer} setAnswer={setAnswer} disabled={inFlight || closed} />

          {feedback && (feedback.correct
            ? (
              <div className="feedback correct" role="status" aria-live="polite">
                <Check size={16} aria-hidden="true" />
                <div><b>{feedback.ordinal === step.ordinal ? t('Correct.') : t('Step {ordinal} correct.', { ordinal: feedback.ordinal })}</b><p>{t(feedback.message)}</p></div>
              </div>
            )
            : (
              <div className="feedback wrong" role="alert" ref={feedbackRef}>
                <X size={16} aria-hidden="true" />
                <div>
                  <b>{t('Not quite.')}</b>
                  <p>{t(feedback.message)}</p>
                  {feedback.progress && <p>{t('{correct} of {total} in the right place.', { correct: formatInt(feedback.progress.correct), total: formatInt(feedback.progress.total) })}</p>}
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

          {narrow && assistant}

          <button type="button" className="primary submit" ref={submitRef} disabled={inFlight || closed || !ready} onClick={() => void submit()}>
            {busy ? t('Checking…') : t('Submit answer')} <ArrowRight size={17} aria-hidden="true" />
          </button>
        </section>

        <aside className="case-aside" aria-label={t('Lab assistant and case status')}>
          {!narrow && assistant}
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
  return <main className="result-screen"><div role="status" className="state-panel loading"><p className="state-title">{t('Loading your result…')}</p></div></main>;
}

/** What the result says about the total XP of the learner: a personal best is not announced with a zero gain; any other server figure is shown as sent. */
export function resultXpNote(result: Pick<MissionResult, 'newBest' | 'xpAwarded'>): string {
  if (!result.newBest) return t('This replay did not beat your best score, so your total XP is unchanged.');
  if (result.xpAwarded === 0) return t('No XP was added to your total.');
  return t('New personal best: {sign}{xp} XP added to your total.', { sign: result.xpAwarded > 0 ? '+' : '', xp: formatInt(result.xpAwarded) });
}

export function ResultScreen({ result, newFragments, onExit }: { result: MissionResult; newFragments: Fragment[]; onExit: () => void }) {
  const lang = useLang();
  // The result replaces a long case page: start at its top, not wherever the Submit button was.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo?.({ top: 0 }); headingRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <main className="result-screen">
      <div className="result-lang"><LanguageSwitch /></div>
      <div className="eyebrow">{t('CASE COMPLETE')}</div>
      <div className="result-seal" aria-hidden="true"><Trophy size={30} /></div>
      <h1 ref={headingRef} tabIndex={-1}>{t('Investigation complete.')}</h1>
      {lang === 'fr' && <p className="scenario-note" role="note">{t('French translation of the mission text, not reviewed by experts. The English text is the reference.')}</p>}
      <p className="result-lede">{t('The backend has recorded your result for “{title}”.', { title: t(result.mission.title) })}</p>
      <div className="result-stats">
        <Stat icon={<Sparkles />} label={t('Score')} value={t('{score} of {max} XP', { score: formatInt(result.score), max: formatInt(result.maxScore) })} detail={t('Server-calculated')} />
        <Stat icon={<Trophy />} label={t('Accuracy')} value={t('{pct}%', { pct: formatInt(result.stats.accuracyPct) })} detail={`${plural(result.stats.wrongAnswers, 'wrong', 'wrong')} · ${plural(result.stats.hintsUsed, 'hint')}`} />
        <Stat icon={<Clock3 />} label={t('Time')} value={result.stats.elapsed} detail={t('Official timer')} />
      </div>
      <p className="result-lede">{resultXpNote(result)}</p>
      {result.ledger.length > 0 && (
        <ul className="ledger" aria-label={t('Score ledger')}>
          {result.ledger.map((row) => (
            <li key={row.id} className={row.kind}><span>{t(row.label)}<small>{t(row.reason)}</small></span><b>{row.points > 0 ? `+${formatInt(row.points)}` : formatInt(row.points)}</b></li>
          ))}
        </ul>
      )}
      {newFragments.map((f) => (
        <div className="fragment-reveal" role="status" key={`${f.labSlug}-${f.position}`}>
          <div className="eyebrow">{t('CODE FRAGMENT DISCOVERED')}</div>
          <strong>{f.digit}</strong>
          <p>{t('Position {position} added to the Code Vault.', { position: f.position })}</p>
        </div>
      ))}
      {result.fragments && (
        <p className="result-lede">{t('Vault progress for this laboratory: {slots}', { slots: result.fragments.map((d) => (d === null ? '·' : String(d))).join(' ') })}</p>
      )}
      {result.masterCode && <p className="result-lede">{t('Master Lab exit code:')} <b>{result.masterCode}</b></p>}
      {result.newBadges.length > 0 && (
        <div role="status">
          <p className="badge-chips-label">{result.newBadges.length === 1 ? t('New badge earned') : t('New badges earned')}</p>
          <ul className="badge-chips" aria-label={t('New badges')}>
            {result.newBadges.map((b) => <li key={b.id}><Trophy size={15} aria-hidden="true" />{t(b.name)}</li>)}
          </ul>
        </div>
      )}
      <button type="button" className="primary" onClick={onExit}>{t('Return to mission control')} <ArrowRight size={16} aria-hidden="true" /></button>
    </main>
  );
}
