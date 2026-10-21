import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock3, DoorOpen, KeyRound, Lightbulb, Lock, RotateCcw, Sparkles, Trophy, XCircle } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { RoomQuestion, type Mark } from '../components/room-play';
import { ReviewBody } from '../components/room-review';
import { DISCIPLINE_LABELS, TYPE_LABELS, disciplineTone, expectRecord, imageSrc, type AnswerResult, type AttemptView, type Review, type StudentRoom } from '../lib/rooms';
import { formatInt, plural, t } from '../i18n';
import { PageIntro, formatSeconds, timerTone, useDocumentTitle } from '../ui/common';
import { EmptyPanel, ErrorPanel, Loaded, describeError, useLoad } from '../ui/state';
import './rooms.css';

const loadRooms = async () => expectRecord<{ rooms: StudentRoom[] }>(await api('/rooms'), 'rooms').rooms;

/** Student page: the rooms teachers published for the learner's classes, and the player. */
export default function RoomsPage() {
  useDocumentTitle(t('Teacher rooms'));
  const rooms = useLoad(loadRooms, []);
  const [playing, setPlaying] = useState<AttemptView | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const start = async (id: string) => {
    if (starting) return;
    setStarting(id); setFailure(null);
    try {
      const out = expectRecord<{ attempt: AttemptView }>(await api(`/rooms/${id}/start`, { method: 'POST', body: '{}' }), 'attempt');
      setPlaying(out.attempt);
    } catch (e) { setFailure(e); } finally { setStarting(null); }
  };
  const close = () => { setPlaying(null); setReview(null); rooms.reload(); };

  if (playing) return <RoomPlayer initial={playing} onClose={close} onReview={(id) => { setPlaying(null); setReview(id); }} />;
  if (review) return <ReviewPage attemptId={review} onBack={close} onReplay={(roomId) => { setReview(null); void start(roomId); }} />;

  return (
    <>
      <PageIntro eyebrow={t('TEACHER ROOMS')} title={t('Rooms from your teachers')}>
        {t('Escape rooms and quick exams written by your teachers. Every answer is checked by the server; watch out for the traps.')}
      </PageIntro>
      {failure !== null && <div role="alert" className="room-alert"><AlertTriangle size={16} aria-hidden="true" /> {describeError(failure)}</div>}
      <Loaded load={rooms.state} label={t('Loading your rooms…')} onRetry={rooms.reload} level={2}>
        {(list) => list.length === 0
          ? <EmptyPanel title={t('No room yet')}>{t('When a teacher publishes a room for one of your classes, it appears here.')}</EmptyPanel>
          : (
            <ul className="room-grid">
              {list.map((r) => {
                const cover = imageSrc(r.cover);
                return (
                  <li key={r.id} className={`room-card tone-${disciplineTone(r.discipline)}`}>
                    <div className="room-card-cover">{cover ? <img src={cover} alt="" loading="lazy" /> : <DoorOpen size={34} aria-hidden="true" />}</div>
                    <div className="room-card-body">
                      <p className="room-card-meta">{t(DISCIPLINE_LABELS[r.discipline])} · {r.mode === 'exam' ? t('Exam') : t('Escape room')}</p>
                      <h2>{r.title}</h2>
                      {r.summary && <p className="room-card-summary">{r.summary}</p>}
                      <p className="room-card-facts">
                        <span>{plural(r.questions, 'question')}</span>
                        {r.timeLimitSec > 0 && <span><Clock3 size={13} aria-hidden="true" /> {t('{min} min', { min: Math.round(r.timeLimitSec / 60) })}</span>}
                        {r.hasVault && <span><KeyRound size={13} aria-hidden="true" /> {t('Vault code')}</span>}
                        <span>{t('By {teacher}', { teacher: r.teacher })}</span>
                      </p>
                      {r.best && (
                        <p className={`room-best ${r.best.passed ? 'passed' : ''}`}>
                          <Trophy size={14} aria-hidden="true" /> {t('Best: {score} / {max} ({pct}%)', { score: r.best.score, max: r.best.maxScore, pct: r.best.pct ?? 0 })}
                        </p>
                      )}
                      <div className="room-card-actions">
                        {r.attemptsLeft === 0 && !r.activeAttemptId
                          ? <span className="room-help">{t('No attempt left')}</span>
                          : (
                            <button type="button" className="primary" disabled={starting !== null} onClick={() => void start(r.id)}>
                              {starting === r.id ? t('Opening…') : r.activeAttemptId ? t('Resume') : r.best ? t('Play again') : t('Enter the room')} <ArrowRight size={15} aria-hidden="true" />
                            </button>
                          )}
                        {r.best && <button type="button" className="ghost" onClick={() => setReview(r.best!.attemptId)}>{t('See my review')}</button>}
                        {r.attemptsLeft !== null && r.attemptsLeft > 0 && <span className="room-help">{t('{n} attempts left', { n: r.attemptsLeft })}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </Loaded>
    </>
  );
}

type Feedback = Omit<AnswerResult, 'attempt'> & { marks?: Mark[] };

/** Full-screen player of one attempt. The server decides everything: correctness, score, fragments, time. */
function RoomPlayer({ initial, onClose, onReview }: { initial: AttemptView; onClose: () => void; onReview: (attemptId: string) => void }) {
  useDocumentTitle(initial.title);
  const [a, setA] = useState(initial);
  const [pending, setPending] = useState<AttemptView | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hint, setHint] = useState<string[]>(initial.question?.hintsGiven ?? []);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [now, setNow] = useState(Date.now());
  const loadedAt = useRef({ at: Date.now(), remaining: initial.remainingSec });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { loadedAt.current = { at: Date.now(), remaining: a.remainingSec }; }, [a]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [a.question?.id, a.status]);
  const left = loadedAt.current.remaining === null ? null : Math.max(0, loadedAt.current.remaining - Math.floor((now - loadedAt.current.at) / 1000));
  const finished = a.status === 'completed' || a.status === 'timeout';

  // Time is up on screen: ask the server, which closes the attempt.
  useEffect(() => {
    if (left !== 0 || finished) return;
    api(`/room-attempts/${a.attemptId}`).then((raw) => setA(expectRecord<AttemptView>(raw, 'attemptId')), () => undefined);
  }, [left, finished, a.attemptId]);

  const answer = async (response: Record<string, unknown>) => {
    if (!a.question || busy) return;
    setBusy(true); setError(null);
    try {
      const out = expectRecord<AnswerResult>(await api(`/room-attempts/${a.attemptId}/answer`, { method: 'POST', body: JSON.stringify({ questionId: a.question.id, response }) }), 'attempt');
      const { attempt, ...rest } = out;
      const marks: Mark[] | undefined = a.question.type === 'hotspot' && 'x' in response
        ? [{ x: response.x as number, y: response.y as number, tone: out.correct === null ? 'pending' : out.correct ? 'right' : out.trap ? 'trap' : 'miss' }]
        : a.question.type === 'hotspot' && Array.isArray(response.points)
          ? (response.points as { x: number; y: number }[]).map((p) => ({ ...p, tone: out.correct === null ? 'pending' as const : out.correct ? 'right' as const : 'miss' as const }))
          : undefined;
      const moved = attempt.question?.id !== a.question.id || attempt.status !== 'in_progress';
      if (out.correct === null) {
        // Exam without feedback: straight to the next question.
        setA(attempt); setHint(attempt.question?.hintsGiven ?? []); setFeedback(null);
      } else if (moved) {
        setFeedback({ ...rest, marks }); setPending(attempt);
      } else {
        setFeedback({ ...rest, marks }); setA(attempt);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'time_up') { const raw = await api(`/room-attempts/${a.attemptId}`).catch(() => null); if (raw) setA(expectRecord<AttemptView>(raw, 'attemptId')); }
      setError(e);
    } finally { setBusy(false); }
  };

  const next = () => {
    if (pending) { setA(pending); setHint(pending.question?.hintsGiven ?? []); setPending(null); }
    setFeedback(null);
  };

  const askHint = async () => {
    if (!a.question || busy) return;
    setBusy(true); setError(null);
    try {
      const out = expectRecord<{ text: string; attempt: AttemptView }>(await api(`/room-attempts/${a.attemptId}/hint`, { method: 'POST', body: JSON.stringify({ questionId: a.question.id }) }), 'text');
      setHint((h) => [...h, out.text]); setA(out.attempt);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const escape = async () => {
    if (!code.trim() || busy) return;
    setBusy(true); setCodeError('');
    try {
      const out = expectRecord<{ attempt: AttemptView }>(await api(`/room-attempts/${a.attemptId}/escape`, { method: 'POST', body: JSON.stringify({ code: code.trim() }) }), 'attempt');
      setA(out.attempt);
    } catch (e) {
      const left = e instanceof ApiError && e.details && typeof e.details === 'object' ? (e.details as { triesLeft?: number }).triesLeft : undefined;
      setCodeError(e instanceof ApiError && e.code === 'wrong_code' ? t('That is not the code. {n} tries left.', { n: left ?? 0 }) : describeError(e));
    } finally { setBusy(false); }
  };

  const q = feedback && pending ? null : a.question;
  const locked = !!(feedback && (pending || feedback.correct));
  const shownQuestion = a.question;
  const tone = timerTone(left);
  return (
    <div className={`room-player tone-${disciplineTone(a.discipline)}`}>
      <header className="room-player-top">
        <button type="button" className="back-button" onClick={onClose}><ArrowLeft size={15} aria-hidden="true" /> {t('Leave the room')}</button>
        <div className="room-player-title"><b>{a.title}</b><span>{a.mode === 'exam' ? t('Exam') : t('Escape room')}</span></div>
        <div className="room-player-status">
          {left !== null && !finished && <span className={`timer ${tone}`} role="timer" aria-live="off"><Clock3 size={14} aria-hidden="true" /> {formatSeconds(left)}</span>}
          {a.score !== null && <span className="room-score"><Sparkles size={14} aria-hidden="true" /> {t('{score} / {max} pts', { score: a.score, max: a.maxScore })}</span>}
        </div>
      </header>
      <ol className="room-steps" aria-label={t('Progress')}>
        {a.progress.map((p) => (
          <li key={p.ordinal} className={`${p.done ? 'done' : ''} ${p.done && p.solved === false ? 'missed' : ''} ${p.ordinal === a.index + 1 && a.status === 'in_progress' ? 'current' : ''}`}>
            <span className="sr-only">{t('Question {n}', { n: p.ordinal })}: {p.done ? (p.solved === false ? t('wrong') : t('answered')) : t('not answered')}</span>
          </li>
        ))}
      </ol>

      <div className="room-stage">
        <div className="room-main">
          {a.status === 'in_progress' && shownQuestion && (
            <section className="room-panel" aria-labelledby="room-q-title">
              <p className="room-q-meta">{t('Question {n} of {total}', { n: shownQuestion.ordinal, total: a.total })} · {t(TYPE_LABELS[shownQuestion.type])} · {plural(shownQuestion.points, 'point')}</p>
              {shownQuestion.ordinal === 1 && a.intro && !feedback && <p className="room-intro">{a.intro}</p>}
              {shownQuestion.context && <p className="room-context">{shownQuestion.context}</p>}
              <h1 id="room-q-title" ref={headingRef} tabIndex={-1}>{shownQuestion.prompt}</h1>
              <RoomQuestion question={shownQuestion} busy={busy} locked={locked} onSubmit={(r) => void answer(r)} verdictMarks={locked ? feedback?.marks : undefined} />
              {hint.length > 0 && <ul className="room-hints">{hint.map((h, i) => <li key={i}><Lightbulb size={14} aria-hidden="true" /> {h}</li>)}</ul>}
            </section>
          )}

          {a.status === 'vault' && (
            <section className="room-panel room-vault" aria-labelledby="vault-title">
              <Lock size={30} aria-hidden="true" />
              <h1 id="vault-title" ref={headingRef} tabIndex={-1}>{t('The vault is in front of you')}</h1>
              <p>{t('Every question is solved. Put the fragments together and enter the code to escape.')}</p>
              <div className="vault-code" aria-label={t('Fragments found')}>
                {(a.vault?.fragments ?? []).map((f) => f.size > 0 && <span key={f.ordinal}>{f.chars ?? '•'.repeat(f.size)}</span>)}
              </div>
              <div className="vault-entry">
                <label htmlFor="vault-input">{t('Vault code')}</label>
                <input id="vault-input" value={code} maxLength={24} autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') void escape(); }} />
                <button type="button" className="primary" disabled={busy || !code.trim()} onClick={() => void escape()}><KeyRound size={15} aria-hidden="true" /> {t('Open the vault')}</button>
              </div>
              {codeError && <p className="room-alert" role="alert">{codeError}</p>}
            </section>
          )}

          {finished && (
            <section className={`room-panel room-finish ${a.status}`} aria-labelledby="finish-title">
              {a.status === 'timeout' ? <Clock3 size={34} aria-hidden="true" /> : <DoorOpen size={34} aria-hidden="true" />}
              <h1 id="finish-title" ref={headingRef} tabIndex={-1}>{a.status === 'timeout' ? t('Time is up') : a.vault ? t('You escaped!') : t('Room completed')}</h1>
              {a.score !== null && <p className="room-finish-score">{t('{score} / {max} pts', { score: a.score, max: a.maxScore })}</p>}
              {a.outro && a.status === 'completed' && <p>{a.outro}</p>}
              <div className="room-card-actions center">
                <button type="button" className="primary" onClick={() => onReview(a.attemptId)}>{t('See my review')} <ArrowRight size={15} aria-hidden="true" /></button>
                <button type="button" className="ghost" onClick={onClose}>{t('Back to the rooms')}</button>
              </div>
            </section>
          )}

          {error !== null && <div role="alert" className="room-alert"><AlertTriangle size={16} aria-hidden="true" /> {describeError(error)}</div>}
        </div>

        <div className="room-side" role="complementary" aria-label={t('Answer and vault')}>
          {feedback && (
            <div className={`room-verdict ${feedback.correct ? 'right' : feedback.trap ? 'trap' : 'wrong'}`} role="status" aria-live="polite">
              <p className="room-verdict-title">
                {feedback.correct ? <><CheckCircle2 size={18} aria-hidden="true" /> {t('Correct')}</> : feedback.trap ? <><AlertTriangle size={18} aria-hidden="true" /> {t('Trap!')}</> : <><XCircle size={18} aria-hidden="true" /> {a.mode === 'exam' ? t('Not quite') : t('Not yet')}</>}
                {feedback.earned !== null && <span className="room-earned">+{feedback.earned}</span>}
              </p>
              {feedback.feedback && <p>{feedback.feedback}</p>}
              {feedback.explanation && <p className="room-explanation">{feedback.explanation}</p>}
              {feedback.fragment && <p className="room-fragment"><KeyRound size={15} aria-hidden="true" /> {t('Fragment found:')} <b>{feedback.fragment}</b></p>}
              {pending ? <button type="button" className="primary" onClick={next}>{pending.status === 'in_progress' ? t('Next question') : t('Continue')} <ArrowRight size={15} aria-hidden="true" /></button>
                : !feedback.correct && a.mode === 'escape' && <p className="room-help">{t('Try again: each wrong try costs a quarter of the points.')}</p>}
            </div>
          )}
          {a.status === 'in_progress' && q && q.hintsAvailable > hint.length && (
            <button type="button" className="ghost room-hint-button" disabled={busy} onClick={() => void askHint()}>
              <Lightbulb size={15} aria-hidden="true" /> {t('Ask for a hint (−10% on this question)')}
            </button>
          )}
          {a.vault && (
            <div className="room-vault-side">
              <p className="room-side-title"><KeyRound size={15} aria-hidden="true" /> {t('Vault fragments')}</p>
              <div className="vault-slots">
                {a.vault.fragments.map((f) => f.size > 0 && <span key={f.ordinal} className={f.chars ? 'found' : ''}>{f.chars ?? '?'.repeat(f.size)}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewPage({ attemptId, onBack, onReplay }: { attemptId: string; onBack: () => void; onReplay: (roomId: string) => void }) {
  const review = useLoad(async () => expectRecord<Review>(await api(`/room-attempts/${attemptId}/review`), 'questions'), [attemptId]);
  useDocumentTitle(t('My review'));
  return (
    <div className="room-review">
      <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> {t('Back to the rooms')}</button>
      {review.state.phase === 'error'
        ? <ErrorPanel error={review.state.error} title={t('The review could not be loaded')} onRetry={review.reload} />
        : (
          <Loaded load={review.state} label={t('Loading your review…')} onRetry={review.reload}>
            {(r) => (
              <>
                <PageIntro eyebrow={t('REVIEW')} title={r.title}>{r.outro || t('Every answer, the expected one and the explanation.')}</PageIntro>
                <ReviewBody review={r} />
                <div className="room-card-actions">
                  <button type="button" className="primary" onClick={() => onReplay(r.roomId)}><RotateCcw size={15} aria-hidden="true" /> {t('Play again')}</button>
                  <span className="room-help">{t('Score kept: {n}', { n: formatInt(r.score) })}</span>
                </div>
              </>
            )}
          </Loaded>
        )}
    </div>
  );
}
