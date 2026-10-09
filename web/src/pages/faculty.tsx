import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Clock3, Sparkles, Trophy } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { cohortSummary, displayName, isolatedName, nameTags, normalizeClasses, normalizeFacultyDashboard, normalizeRoster, normalizeStudentDetail, rankMissions, type FacultyClass, type FacultyDashboard, type FacultyRoster, type FacultyStudent } from '../lib/faculty';
import { normalizeContentMission, normalizeContentMissions, splitReviewer, type ContentMission } from '../lib/content';
import { labName, sentenceCase } from '../lib/labels';
import { formatDateTime, formatInt, plural, t } from '../i18n';
import { Bar, CompetencyBars, FacultyDemoNote, PageIntro, Stat, initialOf, useDocumentTitle, useNav } from '../ui/common';
import { EmptyPanel, ErrorPanel, Loaded, describeError, useLoad, withoutRetryAdvice } from '../ui/state';

/** Faculty copy depends on what the server said, not on one generic failure message. */
function FacultyError({ error, retry }: { error: unknown; retry: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const title = status === 403 ? t('Faculty access required') : status === 404 ? t('Not found') : status === 0 ? t('The server is unreachable') : t('Faculty view unavailable');
  return <ErrorPanel error={error} title={title} onRetry={retry} level={2} />;
}

const loadClasses = async () => normalizeClasses(await api('/classes'));

function ClassPicker({ classes, value, onChange }: { classes: FacultyClass[]; value: number; onChange: (id: number) => void }) {
  const id = useId();
  if (classes.length < 2) return null;
  return (
    <div className="picker-label">
      <label htmlFor={id}>{t('Class')}</label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {classes.map((c) => <option value={c.id} key={c.id}>{isolatedName(c.name)} ({c.students})</option>)}
      </select>
    </div>
  );
}

function Limited<T>({ items, limit, noun, children }: { items: T[]; limit: number; noun: string; children: (shown: T[]) => ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      {children(shown)}
      {items.length > limit && (
        <p className="list-count">
          {t('Showing {shown} of {total}.', { shown: shown.length, total: plural(items.length, noun) })}{' '}
          <button type="button" className="text-button inline" onClick={() => setAll(!all)}>{all ? t('Show fewer') : t('Show all {n}', { n: items.length })}</button>
        </p>
      )}
    </>
  );
}

export function Teacher() {
  useDocumentTitle(t('Faculty analytics'));
  const classes = useLoad(loadClasses, []);
  return (
    <>
      <PageIntro eyebrow={t('FACULTY VIEW')} title={t('Class intelligence')}>
        {t('Monitor cohort progress, identify difficult missions and focus support where it changes outcomes.')}
      </PageIntro>
      <FacultyDemoNote />
      {classes.state.phase === 'error'
        ? <FacultyError error={classes.state.error} retry={classes.reload} />
        : (
          <Loaded load={classes.state} label={t('Loading cohort signal…')} onRetry={classes.reload} level={2}>
            {(list) => list.length === 0
              ? <EmptyPanel title={t('No class yet')}>{t('This faculty account has no class yet. Creating classes is not available in this demonstration, so there is no cohort analytics to show.')}</EmptyPanel>
              : <ClassAnalytics classes={list} />}
          </Loaded>
        )}
    </>
  );
}

function ClassAnalytics({ classes }: { classes: FacultyClass[] }) {
  const [classId, setClassId] = useState(classes[0]!.id);
  const { state, reload } = useLoad(async () => {
    const [analytics, roster] = await Promise.all([api(`/classes/${classId}/analytics`), api(`/classes/${classId}/students`)]);
    return { analytics: normalizeFacultyDashboard(analytics), roster: normalizeRoster(roster) };
  }, [classId]);

  return (
    <>
      <ClassPicker classes={classes} value={classId} onChange={setClassId} />
      {state.phase === 'error'
        ? <FacultyError error={state.error} retry={reload} />
        : (
          <Loaded load={state} label={t('Loading cohort signal…')} onRetry={reload} level={2}>
            {({ analytics, roster }) => <AnalyticsView classId={classId} analytics={analytics} roster={roster} />}
          </Loaded>
        )}
    </>
  );
}

function AnalyticsView({ classId, analytics, roster }: { classId: number; analytics: FacultyDashboard; roster: FacultyRoster }) {
  const nav = useNav();
  const ranked = rankMissions(analytics.missions);
  const summary = cohortSummary(analytics.cohort);
  const tags = nameTags(roster.students);
  return (
    <>
      <div className="stats teacher-stats">
        <Stat icon={<Trophy />} label={t('Students')} value={String(analytics.cohort.students)} detail={t('In your cohort')} />
        <Stat icon={<Sparkles />} label={t('Completion')} value={summary.completion.value} detail={summary.completion.detail} />
        <Stat icon={<Clock3 />} label={t('Needs attention')} value={summary.attention.value} detail={summary.attention.detail} />
      </div>
      <div className="teacher-panel">
        <div className="section-head">
          <div><div className="eyebrow">{t('MISSION SIGNAL')}</div><h2>{t('Where learners get stuck')}</h2></div>
          <span className="tag"><bdi>{analytics.className}</bdi></span>
        </div>
        {analytics.missions.length === 0 || analytics.cohort.students === 0
          ? <EmptyPanel title={t('No mission data yet')}>{t('Mission signals appear once students complete missions.')}</EmptyPanel>
          : (
            <>
              <Limited items={ranked} limit={8} noun="mission">
                {(shown) => (
                  <ul className="mission-table">
                    {shown.map((m) => (
                      <li className="mission-signal" key={m.missionId}>
                        <span>
                          {t(m.title)}
                          {/* A percentage means little without the number of students behind it. */}
                          {m.successPct !== null && <small className="sample-size">{t('{done} of {total} completed', { done: m.studentsCompleted, total: plural(analytics.cohort.students, 'student') })}</small>}
                        </span>
                        {/* No data: ONE element holds the label and the dash, so they stay side by side whatever the grid does. */}
                        {m.successPct === null
                          ? <span className="signal-empty"><small>{t('No completions yet')}</small><b>—</b></span>
                          : <><Bar pct={m.successPct} alert={m.needsAttention} /><b>{t('accuracy {pct}%', { pct: m.successPct })}</b></>}
                        {m.needsAttention && <span className="flag-pill">{t('Needs attention')}</span>}
                        {m.labSlug === 'master' && <span className="flag-pill neutral">{t('Not counted in class figures')}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Limited>
              <p className="bar-note">{t('Class figures cover the standard laboratories: the Master Lab mission is listed but never counted in class analytics.')}</p>
              <p className="bar-note">{t('Success is the class mean accuracy on each student’s best attempt. The server marks the weakest mission when it falls below its threshold; the lowest missions are listed first.')}</p>
            </>
          )}
      </div>
      <div className="teacher-panel">
        <div className="eyebrow">{t('ROSTER')}</div>
        <h2>{t('Students')}</h2>
        {roster.students.length === 0
          ? <EmptyPanel title={t('No students in this class yet')}>{t('Students appear here once they are part of this class.')}</EmptyPanel>
          : (
            <Limited items={roster.students} limit={8} noun="student">
              {(shown) => (
                <ul className="mission-table">
                  {shown.map((s) => {
                    // The reason is wording from the server: shown in the display language when a translation exists.
                    const status = s.needsAttention ? (s.attentionReason === null ? null : t(s.attentionReason)) : t('On track');
                    const tag = tags.get(s.id);
                    const who = `${displayName(s.name)}${tag ? ` (${tag})` : ''}`;
                    return (
                      <li key={s.id}>
                        {/* The accessible name carries everything the row shows (the percentage and the reason), not just the name. */}
                        <button type="button" className="mission-row selectable" onClick={() => nav.openStudent(classId, s.id)} aria-label={s.accuracyPct === null ? t('Open {name}: accuracy not available, {status}', { name: who, status: String(status) }) : t('Open {name}: accuracy {pct}%, {status}', { name: who, pct: s.accuracyPct, status: String(status) })}>
                          <span><bdi>{displayName(s.name)}</bdi>{tag && <>{' '}<small className="id-tag">{tag}</small></>}</span>
                          <b>{s.accuracyPct === null ? '—' : `${s.accuracyPct}%`}<em className="metric-label">{t('accuracy')}</em></b>
                          <small>{status} <ChevronRight size={13} aria-hidden="true" /></small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Limited>
          )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ student detail
export function StudentDetail() {
  useDocumentTitle(t('Student detail'));
  const classes = useLoad(loadClasses, []);
  return (
    <>
      <PageIntro eyebrow={t('INDIVIDUAL SUPPORT')} title={t('Student detail')}>
        {t('Inspect one learner’s progress, strengths and recent missions.')}
      </PageIntro>
      <FacultyDemoNote />
      {classes.state.phase === 'error'
        ? <FacultyError error={classes.state.error} retry={classes.reload} />
        : (
          <Loaded load={classes.state} label={t('Loading classes…')} onRetry={classes.reload} level={2}>
            {(list) => list.length === 0
              ? <EmptyPanel title={t('No class available')}>{t('This faculty account has no class, so there is no student to inspect.')}</EmptyPanel>
              : <StudentPicker classes={list} />}
          </Loaded>
        )}
    </>
  );
}

function StudentPicker({ classes }: { classes: FacultyClass[] }) {
  const nav = useNav();
  const initialClass = classes.some((c) => c.id === nav.student?.classId) ? nav.student!.classId : classes[0]!.id;
  const [classId, setClassId] = useState(initialClass);
  const roster = useLoad(async () => normalizeRoster(await api(`/classes/${classId}/students`)), [classId]);
  return (
    <>
      <ClassPicker classes={classes} value={classId} onChange={setClassId} />
      {roster.state.phase === 'error'
        ? <FacultyError error={roster.state.error} retry={roster.reload} />
        : (
          <Loaded load={roster.state} label={t('Loading students…')} onRetry={roster.reload} level={2}>
            {(r) => r.students.length === 0
              ? <EmptyPanel title={t('No students in this class yet')}>{t('Students appear here once they are part of this class.')}</EmptyPanel>
              : <StudentView key={classId} classId={classId} students={r.students} preferred={nav.student?.classId === classId ? nav.student.studentId : null} />}
          </Loaded>
        )}
    </>
  );
}

function StudentView({ classId, students, preferred }: { classId: number; students: FacultyStudent[]; preferred: number | null }) {
  const pickerId = useId();
  const tags = nameTags(students);
  const [studentId, setStudentId] = useState(students.some((s) => s.id === preferred) ? preferred! : students[0]!.id);
  const detail = useLoad(async () => normalizeStudentDetail(await api(`/classes/${classId}/students/${studentId}`)), [classId, studentId]);
  return (
    <>
      <div className="picker-label">
        <label htmlFor={pickerId}>{t('Student')}</label>
        <select id={pickerId} value={studentId} onChange={(e) => setStudentId(Number(e.target.value))}>
          {students.map((s) => <option value={s.id} key={s.id}>{isolatedName(s.name)}{tags.has(s.id) ? ` (${tags.get(s.id)})` : ''}</option>)}
        </select>
      </div>
      {detail.state.phase === 'error'
        ? <FacultyError error={detail.state.error} retry={detail.reload} />
        : (
          <Loaded load={detail.state} label={t('Loading the student record…')} onRetry={detail.reload} level={2}>
            {({ student, history, historyTotal, labs, competencies }) => (
              <>
                <div className="profile-card">
                  <div className="avatar big" aria-hidden="true">{initialOf(student.name)}</div>
                  <div>
                    <h2><bdi>{displayName(student.name)}</bdi>{tags.has(student.id) && <>{' '}<small className="id-tag">{tags.get(student.id)}</small></>}</h2>
                    <p>{t('Level {level} · {xp} XP · {missions} · {hints} (best attempts)', { level: student.level, xp: formatInt(student.xp), missions: plural(student.missionsCompleted, 'mission completed', 'missions completed'), hints: plural(student.hintsUsed, 'hint used', 'hints used') })}</p>
                    <p className="bar-note">{t('Counts cover the standard laboratories; the Master Lab is not part of class analytics.')}</p>
                    {student.needsAttention && <p className="attention">{t('Needs attention: {reason}', { reason: student.attentionReason === null ? '' : t(student.attentionReason) })}</p>}
                  </div>
                </div>
                <div className="teacher-panel">
                  <div className="eyebrow">{t('PROGRESS BY LABORATORY')}</div>
                  <h2>{t('Laboratories')}</h2>
                  <ul className="bar-list" aria-label={t('Progress by laboratory')}>
                    {labs.map((lab) => (
                      <li className="bar-row" key={lab.slug}>
                        <span>{t(lab.name)}<small>{t('{done} of {total}', { done: lab.completed, total: plural(lab.total, 'mission') })}{lab.accuracyPct === null ? '' : ` · ${t('{pct}% accuracy', { pct: lab.accuracyPct })}`}{lab.escaped ? ` · ${t('Escaped')}` : ''}</small></span>
                        <Bar pct={lab.total === 0 ? 0 : (100 * lab.completed) / lab.total} />
                        <b>{lab.completed}/{lab.total}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="teacher-panel">
                  <div className="eyebrow">{t('COMPETENCIES')}</div>
                  <h2>{t('Strengths and gaps')}</h2>
                  <CompetencyBars data={competencies} title={t('Competencies')} />
                </div>
                <div className="teacher-panel">
                  <div className="eyebrow">{t('ATTEMPT HISTORY')}</div>
                  <h2>{t('Recent mission record')}</h2>
                  {history.length === 0
                    ? <EmptyPanel title={t('No completed attempts yet')}>{t('This student has not completed a mission.')}</EmptyPanel>
                    : (
                      <ul className="mission-table">
                        {history.map((h, index) => (
                          <li className="mission-row" key={`${h.missionId}-${h.completedAt}-${index}`}>
                            <span>{t(h.title)}<small className="sample-size"><CompletedOn at={h.completedAt} /></small></span>
                            <b>{h.score} XP</b>
                            <small>{plural(h.answersSubmitted, 'answer')} · {plural(h.wrongAnswers, 'wrong', 'wrong')} · {plural(h.hintsUsed, 'hint')} · {h.elapsed}</small>
                          </li>
                        ))}
                      </ul>
                    )}
                  {/* Only when the server reports how many attempts there are in all: a cap is never guessed. */}
                  {historyTotal !== null && historyTotal > history.length && <p className="list-count">{t('Showing the latest {shown} of {total} attempts.', { shown: history.length, total: formatInt(historyTotal) })}</p>}
                </div>
              </>
            )}
          </Loaded>
        )}
    </>
  );
}

// ------------------------------------------------------------------ content review
/** The status word as the status pill shows it. */
const statusWord = (status: ContentMission['status']): string => (status === 'draft' ? t('Draft') : status === 'reviewed' ? t('Reviewed') : status === 'approved' ? t('Approved') : t(sentenceCase(status)));

/** "Reviewed by Name (teacher #7)": the typed name is isolated, so whatever it holds cannot reorder the id suffix or the date that follow. */
function ReviewedBy({ status, label }: { status: ContentMission['status']; label: string }) {
  const { name, suffix } = splitReviewer(label);
  // {name} stays a marker in the translated sentence, so each language puts the isolated name where its grammar wants it.
  const marker = { name: '{name}' };
  const sentence = status === 'draft' ? t('Draft by {name}', marker) : status === 'reviewed' ? t('Reviewed by {name}', marker) : status === 'approved' ? t('Approved by {name}', marker) : `${sentenceCase(status)} by {name}`;
  const [before = '', after = ''] = sentence.split('{name}');
  // The teacher number added by the server is shown in the display language too.
  const teacher = /^(\s)\(teacher #(\d+)\)$/.exec(suffix);
  return <>{before}<bdi>{displayName(name)}</bdi>{after}{teacher ? `${teacher[1]}${t('(teacher #{id})', { id: teacher[2]! })}` : suffix}</>;
}

/** When an attempt was completed, as the server recorded it. */
function CompletedOn({ at }: { at: number }) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  return <time dateTime={when.toISOString()}>{formatDateTime(when)}</time>;
}

/** Who last moved a mission and when, exactly as the server reported it. */
function ReviewTrail({ mission }: { mission: ContentMission }) {
  if (mission.reviewedBy === null && mission.updatedAt === null) return <small className="review-trail">{t('No review recorded yet.')}</small>;
  const when = mission.updatedAt === null ? null : new Date(mission.updatedAt);
  const now = mission.status === 'draft' ? t('Now draft') : mission.status === 'reviewed' ? t('Now reviewed') : mission.status === 'approved' ? t('Now approved') : `Now ${mission.status}`;
  return (
    <small className="review-trail">
      {mission.reviewedBy !== null ? <ReviewedBy status={mission.status} label={mission.reviewedBy} /> : now}
      {when && !Number.isNaN(when.getTime()) && <> · <time dateTime={when.toISOString()}>{formatDateTime(when)}</time></>}
    </small>
  );
}

export function ContentReview() {
  useDocumentTitle(t('Content review'));
  const { state, reload, setData } = useLoad(async () => normalizeContentMissions(await api('/content/missions')), []);
  // `unconfirmed`: the request got no clear answer (network, timeout, 5xx, unreadable reply), so the change may or may not have been stored.
  const [problem, setProblem] = useState<{ error: unknown; unconfirmed: boolean; shown: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Set when the list could not be re-read after the server refused a change: the rows may then show an outdated status.
  const [stale, setStale] = useState<unknown>(null);
  // What the screen reader and the sighted user are told about the save in progress or just done.
  const [saveNote, setSaveNote] = useState<{ kind: 'saving'; title: string } | { kind: 'saved'; title: string; status: ContentMission['status'] } | null>(null);
  // The action button is replaced by the next one (and is disabled while saving): once the row is re-rendered and enabled, focus goes back to it.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (busyId !== null || refocus.current === null) return;
    const target = document.querySelector<HTMLButtonElement>(`[data-content-action="${refocus.current}"]`);
    if (target && !target.disabled) { target.focus(); refocus.current = null; }
  });

  // Re-reads the list after a refusal could not (or to settle a stale-status warning); the rows stay on screen meanwhile.
  const [refreshing, setRefreshing] = useState(false);
  const refreshList = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setData(normalizeContentMissions(await api('/content/missions')));
      // The alert (and the Retry button that has focus) goes away: keep focus on the page instead of dropping it to the document.
      const heading = document.querySelector<HTMLElement>('main h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      setStale(null);
      // The rows now show what the server holds: an earlier "could not confirm" message says so instead of staying silent about it.
      setProblem((p) => (p && p.unconfirmed ? { ...p, shown: true } : p));
    } catch (refreshError) {
      setStale(refreshError);
    } finally {
      setRefreshing(false);
    }
  };

  const setStatus = async (list: ContentMission[], id: string, status: ContentMission['status']) => {
    if (busyId) return;
    setBusyId(id);
    setProblem(null);
    setStale(null);
    setSaveNote({ kind: 'saving', title: list.find((x) => x.missionId === id)?.title ?? id });
    try {
      const updated = normalizeContentMission(await api(`/content/missions/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }));
      setData(list.map((x) => (x.missionId === id ? updated : x)));
      setSaveNote({ kind: 'saved', title: updated.title, status: updated.status });
    } catch (e) {
      setSaveNote(null);
      // Only a clean 4xx refusal proves nothing was stored. After anything else (status 0, 5xx, an unreadable reply) the change may well
      // have been applied, so the alert must not claim a failure and the row must show what the server holds. A 409/404 also means this
      // row is out of date (another tab moved it): the same re-read applies.
      const refused = e instanceof ApiError && e.status >= 400 && e.status < 500;
      const outOfDate = e instanceof ApiError && (e.status === 409 || e.status === 404);
      const unconfirmed = !refused;
      setProblem({ error: e, unconfirmed, shown: false });
      if (unconfirmed || outOfDate) {
        try {
          setData(normalizeContentMissions(await api('/content/missions')));
          setStale(null);
          setProblem({ error: e, unconfirmed, shown: true });
        } catch (refreshError) {
          setStale(refreshError);
        }
      }
    } finally {
      setBusyId(null);
      refocus.current = id;
    }
  };

  // An unconfirmed change may well have been applied, so its message never tells the reader to repeat it.
  const detail = problem === null ? '' : withoutRetryAdvice(describeError(problem.error));
  const problemText = problem === null ? '' : problem.unconfirmed
    ? [detail ? t('Could not confirm the status change: {detail}', { detail }) : t('Could not confirm the status change.'), problem.shown ? t('The list below shows what the server recorded.') : ''].filter(Boolean).join(' ')
    : t('Could not update the status: {detail}', { detail: describeError(problem.error) });
  // The note is built here (not stored as text) so it follows the display language.
  const saveNoteText = saveNote === null ? ''
    : saveNote.kind === 'saving' ? t('Saving {title}…', { title: t(saveNote.title) })
      : saveNote.status === 'draft' ? t('{title} is now draft.', { title: t(saveNote.title) })
        : saveNote.status === 'reviewed' ? t('{title} is now reviewed.', { title: t(saveNote.title) })
          : saveNote.status === 'approved' ? t('{title} is now approved.', { title: t(saveNote.title) })
            : `${saveNote.title} is now ${saveNote.status}.`;

  return (
    <>
      <PageIntro eyebrow={t('SCIENTIFIC GOVERNANCE')} title={t('Content review')}>
        {t('Sample clinical content remains draft until a faculty reviewer moves it through the server-side approval workflow.')}
      </PageIntro>
      <FacultyDemoNote />
      <p className="bar-note approval-note" role="note" data-testid="approval-note">{t('“Approved” is a faculty workflow flag in this demonstration. It is not a biomedical or scientific validation of the content.')}</p>
      <div role="status" aria-live="polite">{saveNoteText && <div className="saved-note">{saveNoteText}</div>}</div>
      {(problemText || stale !== null) && (
        // One alert at a time: what happened to the change, then (if the list could not be re-read) what to do about the list.
        <div role="alert" className="error">
          {problemText}
          {problemText && stale !== null ? ' ' : ''}
          {stale !== null && (
            <>
              {t('The list could not be refreshed, so a status below may be out of date: {detail}', { detail: describeError(stale) })}
              <button type="button" aria-disabled={refreshing || undefined} aria-busy={refreshing} onClick={() => void refreshList()}>{refreshing ? t('Retrying…') : t('Retry')}</button>
            </>
          )}
        </div>
      )}
      {state.phase === 'error'
        ? <FacultyError error={state.error} retry={reload} />
        : (
          <Loaded load={state} label={t('Loading mission content…')} onRetry={reload} level={2}>
            {(missions) => missions.length === 0
              ? <EmptyPanel title={t('No missions to review')}>{t('The server did not list any mission content.')}</EmptyPanel>
              : (
                <div className="content-panel">
                  <div className="content-head" aria-hidden="true">{/* MISSION and ACTION are the same word in French. */}<span>MISSION</span><span>{t('LAB')}</span><span>{t('STATUS')}</span><span>ACTION</span></div>
                  {missions.map((m) => (
                    <div className="content-row" key={m.missionId}>
                      <div className="content-title">
                        <b id={`content-title-${m.missionId}`}>{t(m.title)}</b>
                        <ReviewTrail mission={m} />
                      </div>
                      <span>{t(labName(m.labSlug))}</span>
                      <span className={`status-pill ${m.status}`}>{statusWord(m.status)}</span>
                      <div className="content-actions">
                        {m.status === 'draft' && <button type="button" data-content-action={m.missionId} aria-describedby={`content-title-${m.missionId}`} disabled={busyId !== null} onClick={() => void setStatus(missions, m.missionId, 'reviewed')}>{t('Mark reviewed')}</button>}
                        {m.status === 'reviewed' && <button type="button" data-content-action={m.missionId} aria-describedby={`content-title-${m.missionId}`} disabled={busyId !== null} onClick={() => void setStatus(missions, m.missionId, 'approved')}>{t('Approve')}</button>}
                        {m.status === 'approved' && <button type="button" data-content-action={m.missionId} aria-describedby={`content-title-${m.missionId}`} disabled={busyId !== null} onClick={() => void setStatus(missions, m.missionId, 'draft')}>{t('Return to draft')}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </Loaded>
        )}
    </>
  );
}
