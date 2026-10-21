import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, CheckCircle2, ChevronRight, Clock3, Copy, Eye, FileDown, FlaskConical, Gauge, Import, KeyRound,
  Lightbulb, PenLine, Plus, Rocket, Save, Settings2, Trash2, Users, XCircle,
} from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { normalizeClasses, type FacultyClass } from '../lib/faculty';
import { normalizeContentMissions, type ContentMission } from '../lib/content';
import {
  DISCIPLINES, DISCIPLINE_LABELS, TYPE_HELP, TYPE_LABELS, blankQuestion, disciplineTone, expectRecord, formatDuration, imageSrc, move, splitProblem, toCsv,
  type AttemptRowView, type PublicQuestion, type Question, type QuestionType, type Results, type ResultQuestion, type Review, type Room, type RoomDoc, type RoomSummary,
} from '../lib/rooms';
import { RoomPicture, RoomQuestion, type Mark } from '../components/room-play';
import { ReviewBody, ZoneShapes, describeExpected } from '../components/room-review';
import { AddQuestion, Field, ImagePicker, QuestionEditor, TextArea, Toggle, cloneQuestion } from '../components/studio-editors';
import { formatDateTime, formatInt, plural, t } from '../i18n';
import { FacultyDemoNote, PageIntro, useDocumentTitle } from '../ui/common';
import { EmptyPanel, ErrorPanel, Loaded, describeError, useLoad } from '../ui/state';
import './studio.css';
import './rooms.css';

type Screen = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'results'; id: string } | { kind: 'attempt'; id: string; roomId: string } | { kind: 'preview'; id: string };

/** Teacher Studio: create, edit, preview and analyse the rooms students play. */
export default function StudioPage() {
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const go = useCallback((s: Screen) => { setScreen(s); window.scrollTo?.({ top: 0 }); }, []);
  switch (screen.kind) {
    case 'edit': return <RoomEditor key={screen.id} id={screen.id} go={go} />;
    case 'results': return <ResultsView id={screen.id} go={go} />;
    case 'attempt': return <AttemptView id={screen.id} roomId={screen.roomId} go={go} />;
    case 'preview': return <PreviewView id={screen.id} go={go} />;
    default: return <StudioList go={go} />;
  }
}

const loadList = async () => {
  const [rooms, missions] = await Promise.all([api('/studio/rooms'), api('/content/missions')]);
  return { rooms: expectRecord<{ rooms: RoomSummary[] }>(rooms, 'rooms').rooms, missions: normalizeContentMissions(missions) };
};

const STATUS_LABELS = { draft: 'Draft', published: 'Published', archived: 'Archived' } as const;

function StudioList({ go }: { go: (s: Screen) => void }) {
  useDocumentTitle(t('Teacher Studio'));
  const list = useLoad(loadList, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [mission, setMission] = useState('');

  const create = async (body: Record<string, unknown>, key: string) => {
    if (busy) return;
    setBusy(key); setError(null);
    try {
      const room = expectRecord<Room>(await api('/studio/rooms', { method: 'POST', body: JSON.stringify(body) }), 'id');
      go({ kind: 'edit', id: room.id });
    } catch (e) { setError(e); } finally { setBusy(null); }
  };
  const act = async (key: string, run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { await run(); list.reload(); } catch (e) { setError(e); } finally { setBusy(null); setConfirm(null); }
  };

  return (
    <>
      <PageIntro eyebrow={t('TEACHER STUDIO')} title={t('Your rooms')}>
        {t('Write escape rooms and exams for your classes: questions, pictures with click zones, trap answers. Preview them as a student, publish, then read every result.')}
      </PageIntro>
      <FacultyDemoNote />
      <div className="studio-actions">
        <button type="button" className="primary" disabled={busy !== null} onClick={() => void create({ doc: { title: t('New room'), questions: [] } }, 'new')}>
          <Plus size={15} aria-hidden="true" /> {busy === 'new' ? t('Creating…') : t('New room')}
        </button>
        {list.state.phase === 'ready' && (
          <div className="studio-import">
            <label htmlFor="studio-import">{t('Start from a built-in mission')}</label>
            <select id="studio-import" value={mission} onChange={(e) => setMission(e.target.value)}>
              <option value="">{t('Choose a mission…')}</option>
              {list.state.data.missions.map((m: ContentMission) => <option key={m.missionId} value={m.missionId}>{t(m.title)}</option>)}
            </select>
            <button type="button" className="ghost" disabled={!mission || busy !== null} onClick={() => void create({ fromMission: mission }, 'import')}>
              <Import size={15} aria-hidden="true" /> {busy === 'import' ? t('Copying…') : t('Copy and edit')}
            </button>
          </div>
        )}
      </div>
      {error !== null && <div role="alert" className="room-alert"><AlertTriangle size={16} aria-hidden="true" /> {describeError(error)}</div>}
      <Loaded load={list.state} label={t('Loading your rooms…')} onRetry={list.reload} level={2}>
        {({ rooms }) => rooms.length === 0
          ? <EmptyPanel title={t('No room yet')}>{t('Create your first room, or copy a built-in mission to adapt it.')}</EmptyPanel>
          : (
            <>
              <div className="studio-summary">
                <div><b>{rooms.length}</b><span>{plural(rooms.length, 'room')}</span></div>
                <div><b>{rooms.filter((r) => r.status === 'published').length}</b><span>{t('published')}</span></div>
                <div><b>{formatInt(rooms.reduce((s, r) => s + r.stats.attempts, 0))}</b><span>{t('student attempts')}</span></div>
                <div><b>{formatInt(rooms.reduce((s, r) => s + r.stats.students, 0))}</b><span>{t('learners reached')}</span></div>
              </div>
              <ul className="studio-grid">
                {rooms.map((r) => {
                  const cover = imageSrc(r.cover);
                  return (
                    <li key={r.id} className={`studio-card tone-${disciplineTone(r.discipline)} ${r.status}`}>
                      <div className="studio-card-cover">
                        {cover ? <img src={cover} alt="" loading="lazy" /> : <FlaskConical size={30} aria-hidden="true" />}
                        <span className={`status-chip ${r.status}`}>{t(STATUS_LABELS[r.status])}</span>
                      </div>
                      <div className="studio-card-body">
                        <p className="room-card-meta">{t(DISCIPLINE_LABELS[r.discipline])} · {r.mode === 'exam' ? t('Exam') : t('Escape room')}</p>
                        <h2>{r.title}</h2>
                        <p className="room-card-facts">
                          <span>{plural(r.questions, 'question')}</span>
                          <span title={t('Quality check score')}><Gauge size={13} aria-hidden="true" /> {t('Quality {n}/100', { n: r.quality })}</span>
                          {r.stats.attempts > 0 && <span><Users size={13} aria-hidden="true" /> {plural(r.stats.students, 'student')}</span>}
                          {r.stats.avgPct !== null && <span><BarChart3 size={13} aria-hidden="true" /> {t('average {pct}%', { pct: r.stats.avgPct })}</span>}
                        </p>
                        <p className="studio-help">{t('Updated {date}', { date: formatDateTime(new Date(r.updatedAt)) })}</p>
                        <div className="studio-card-actions">
                          <button type="button" className="primary" onClick={() => go({ kind: 'edit', id: r.id })}><PenLine size={14} aria-hidden="true" /> {t('Edit')}</button>
                          <button type="button" className="ghost" onClick={() => go({ kind: 'results', id: r.id })}><BarChart3 size={14} aria-hidden="true" /> {t('Results')}</button>
                          <button type="button" className="ghost" onClick={() => go({ kind: 'preview', id: r.id })}><Eye size={14} aria-hidden="true" /> {t('Preview')}</button>
                          <button type="button" className="icon-button" aria-label={t('Duplicate "{title}"', { title: r.title })} disabled={busy !== null} onClick={() => void act(`dup-${r.id}`, () => api(`/studio/rooms/${r.id}/duplicate`, { method: 'POST', body: '{}' }))}><Copy size={15} aria-hidden="true" /></button>
                          {confirm === r.id
                            ? (
                              <span className="studio-confirm" role="group" aria-label={t('Confirm deletion')}>
                                {t('Delete with its {n} attempts?', { n: r.stats.attempts })}
                                <button type="button" className="danger-button" onClick={() => void act(`del-${r.id}`, () => api(`/studio/rooms/${r.id}`, { method: 'DELETE' }))}>{t('Delete')}</button>
                                <button type="button" className="text-button" onClick={() => setConfirm(null)}>{t('Cancel')}</button>
                              </span>
                            )
                            : <button type="button" className="icon-button" aria-label={t('Delete "{title}"', { title: r.title })} onClick={() => setConfirm(r.id)}><Trash2 size={15} aria-hidden="true" /></button>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
      </Loaded>
    </>
  );
}

// ------------------------------------------------------------------ editor
type Tab = 'questions' | 'settings' | 'quality';

function RoomEditor({ id, go }: { id: string; go: (s: Screen) => void }) {
  const loaded = useLoad(async () => {
    const [room, classes] = await Promise.all([api(`/studio/rooms/${id}`), api('/classes')]);
    return { room: expectRecord<Room>(room, 'doc'), classes: normalizeClasses(classes) };
  }, [id]);
  useDocumentTitle(t('Edit room'));
  if (loaded.state.phase === 'error') return <><BackLink go={go} /><ErrorPanel error={loaded.state.error} title={t('This room could not be opened')} onRetry={loaded.reload} /></>;
  return (
    <Loaded load={loaded.state} label={t('Opening the room…')} onRetry={loaded.reload}>
      {({ room, classes }) => <Editor initial={room} classes={classes} go={go} />}
    </Loaded>
  );
}

function BackLink({ go }: { go: (s: Screen) => void }) {
  return <button type="button" className="back-button studio-back" onClick={() => go({ kind: 'list' })}><ArrowLeft size={15} aria-hidden="true" /> {t('All rooms')}</button>;
}

function Editor({ initial, classes, go }: { initial: Room; classes: FacultyClass[]; go: (s: Screen) => void }) {
  const [room, setRoom] = useState(initial);
  const [doc, setDoc] = useState<RoomDoc>(initial.doc);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('questions');
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState<Screen | null>(null);

  // The document being edited, read when a save answers: text typed while the request was in flight must not be replaced by the saved copy.
  const latest = useRef(doc);
  latest.current = doc;
  const edit = (next: RoomDoc) => { setDoc(next); setDirty(true); setNotice(''); };
  const setQuestion = (i: number, q: Question) => edit({ ...doc, questions: doc.questions.map((x, j) => (j === i ? q : x)) });

  const save = useCallback(async (): Promise<Room | null> => {
    setBusy('save'); setError(null); setProblems([]);
    const sent = doc;
    try {
      const out = expectRecord<Room>(await api(`/studio/rooms/${room.id}`, { method: 'PUT', body: JSON.stringify({ doc: sent, version: room.version }) }), 'doc');
      setRoom(out);
      if (latest.current === sent) { setDoc(out.doc); setDirty(false); setNotice(t('Saved')); }
      return out;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && Array.isArray(e.details)) setProblems(e.details.map(String));
      setError(e);
      return null;
    } finally { setBusy(null); }
  }, [doc, room.id, room.version]);

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!busy) void save(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [save, busy]);

  const setStatus = async (status: 'draft' | 'published' | 'archived') => {
    let base = room;
    if (dirty) { const saved = await save(); if (!saved) return; base = saved; }
    setBusy('status'); setError(null); setProblems([]);
    try {
      const out = expectRecord<Room>(await api(`/studio/rooms/${base.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }), 'doc');
      setRoom(out); setNotice(status === 'published' ? t('Published: your classes can play it now.') : status === 'draft' ? t('Back to draft: students no longer see it.') : t('Archived'));
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setProblems(e.details.map(String));
      setError(e);
    } finally { setBusy(null); }
  };

  const toggleClass = async (classId: number) => {
    const next = room.classIds.includes(classId) ? room.classIds.filter((c) => c !== classId) : [...room.classIds, classId];
    setBusy('classes'); setError(null);
    try { setRoom(expectRecord<Room>(await api(`/studio/rooms/${room.id}/classes`, { method: 'PUT', body: JSON.stringify({ classIds: next }) }), 'doc')); } catch (e) { setError(e); } finally { setBusy(null); }
  };

  const navigate = (s: Screen) => { if (dirty) setLeaving(s); else go(s); };
  const addQuestion = (type: QuestionType) => { edit({ ...doc, questions: [...doc.questions, blankQuestion(type)] }); setCurrent(doc.questions.length); setTab('questions'); };

  const byQuestion = useMemo(() => {
    const m = new Map<number, string[]>();
    const general: string[] = [];
    for (const p of problems) { const s = splitProblem(p); if (s.question === null) general.push(s.text); else m.set(s.question, [...(m.get(s.question) ?? []), s.text]); }
    return { m, general };
  }, [problems]);
  const quality = room.quality;
  const notesFor = (qid: string) => quality.notes.filter((n) => n.questionId === qid);
  const q = doc.questions[current];

  return (
    <div className="studio-editor">
      <div className="studio-editor-top">
        <button type="button" className="back-button" onClick={() => navigate({ kind: 'list' })}><ArrowLeft size={15} aria-hidden="true" /> {t('All rooms')}</button>
        <div className="studio-editor-title">
          <h1>{doc.title || t('Untitled room')}</h1>
          <p>
            <span className={`status-chip ${room.status}`}>{t(STATUS_LABELS[room.status])}</span>
            <span>{t('Version {n}', { n: room.version })}</span>
            <span className={dirty ? 'unsaved' : ''} role="status" aria-live="polite">{dirty ? t('Unsaved changes') : notice || t('All changes saved')}</span>
          </p>
        </div>
        <div className="studio-editor-actions">
          <button type="button" className="ghost" onClick={() => navigate({ kind: 'preview', id: room.id })}><Eye size={15} aria-hidden="true" /> {t('Preview')}</button>
          <button type="button" className="ghost" onClick={() => navigate({ kind: 'results', id: room.id })}><BarChart3 size={15} aria-hidden="true" /> {t('Results')}</button>
          <button type="button" className="ghost" disabled={!dirty || busy !== null} onClick={() => void save()}><Save size={15} aria-hidden="true" /> {busy === 'save' ? t('Saving…') : t('Save')}</button>
          {room.status === 'published'
            ? <button type="button" className="ghost" disabled={busy !== null} onClick={() => void setStatus('draft')}>{t('Unpublish')}</button>
            : <button type="button" className="primary" disabled={busy !== null} onClick={() => void setStatus('published')}><Rocket size={15} aria-hidden="true" /> {t('Publish')}</button>}
        </div>
      </div>

      {leaving && (
        <div className="studio-banner" role="alertdialog" aria-label={t('Unsaved changes')}>
          <AlertTriangle size={16} aria-hidden="true" /> {t('You have unsaved changes.')}
          <button type="button" className="primary" onClick={() => void save().then((ok) => { if (ok) go(leaving); })}>{t('Save and leave')}</button>
          <button type="button" className="ghost" onClick={() => go(leaving)}>{t('Leave without saving')}</button>
          <button type="button" className="text-button" onClick={() => setLeaving(null)}>{t('Stay')}</button>
        </div>
      )}
      {room.status === 'published' && room.stats.attempts > 0 && <p className="studio-help studio-note">{t('Students already played this room. Your changes apply to new attempts; past results keep the version they were played with.')}</p>}
      {error !== null && (
        <div role="alert" className="room-alert">
          <AlertTriangle size={16} aria-hidden="true" /> {error instanceof ApiError && error.code === 'version_conflict' ? t('This room was changed in another window. Copy your work, then reload the page.') : describeError(error)}
          {byQuestion.general.length > 0 && <ul>{byQuestion.general.map((p, i) => <li key={i}>{t(p)}</li>)}</ul>}
          {byQuestion.m.size > 0 && <p>{t('Questions to fix: {list}', { list: [...byQuestion.m.keys()].map((i) => i + 1).join(', ') })}</p>}
        </div>
      )}

      <div className="studio-tabs" role="tablist" aria-label={t('Room editor')}>
        <button type="button" role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}><PenLine size={15} aria-hidden="true" /> {t('Questions ({n})', { n: doc.questions.length })}</button>
        <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings2 size={15} aria-hidden="true" /> {t('Settings and classes')}</button>
        <button type="button" role="tab" aria-selected={tab === 'quality'} className={tab === 'quality' ? 'active' : ''} onClick={() => setTab('quality')}>
          <Gauge size={15} aria-hidden="true" /> {t('Quality check')} <span className={`quality-badge ${quality.score >= 85 ? 'good' : quality.score >= 60 ? 'fair' : 'poor'}`}>{quality.score}</span>
        </button>
      </div>

      {tab === 'questions' && (
        <div className="studio-split">
          <nav className="question-rail" aria-label={t('Questions')}>
            <ol>
              {doc.questions.map((x, i) => {
                const warn = notesFor(x.id).filter((n) => n.level !== 'tip').length + (byQuestion.m.get(i)?.length ?? 0);
                return (
                  <li key={x.id} className={i === current ? 'active' : ''}>
                    <button type="button" aria-current={i === current ? 'true' : undefined} onClick={() => setCurrent(i)}>
                      <span className="rail-n">{i + 1}</span>
                      <span className="rail-text"><small>{t(TYPE_LABELS[x.type])}</small>{x.prompt || t('(no question yet)')}</span>
                      {warn > 0 && <span className="rail-warn" aria-label={t('{n} things to check', { n: warn })}>{warn}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            <AddQuestion onAdd={addQuestion} />
          </nav>
          <section className="question-pane" aria-label={t('Question editor')}>
            {q ? (
              <>
                <div className="question-pane-head">
                  <div>
                    <h2>{t('Question {n}', { n: current + 1 })} · {t(TYPE_LABELS[q.type])}</h2>
                    <p className="studio-help">{t(TYPE_HELP[q.type])}</p>
                  </div>
                  <div className="studio-inline">
                    <button type="button" className="icon-button" disabled={current === 0} aria-label={t('Move up')} onClick={() => { edit({ ...doc, questions: move(doc.questions, current, current - 1) }); setCurrent(current - 1); }}><ArrowUp size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" disabled={current === doc.questions.length - 1} aria-label={t('Move down')} onClick={() => { edit({ ...doc, questions: move(doc.questions, current, current + 1) }); setCurrent(current + 1); }}><ArrowDown size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label={t('Duplicate this question')} onClick={() => { const c = [...doc.questions]; c.splice(current + 1, 0, cloneQuestion(q)); edit({ ...doc, questions: c }); setCurrent(current + 1); }}><Copy size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button danger" aria-label={t('Delete this question')} onClick={() => { edit({ ...doc, questions: doc.questions.filter((_, j) => j !== current) }); setCurrent(Math.max(0, current - 1)); }}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </div>
                {notesFor(q.id).length > 0 && (
                  <ul className="quality-notes inline">
                    {notesFor(q.id).map((n, i) => <li key={i} className={n.level}>{n.level === 'tip' ? <Lightbulb size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {t(n.message)}</li>)}
                  </ul>
                )}
                <QuestionEditor q={q} onChange={(next) => setQuestion(current, next)} problems={byQuestion.m.get(current) ?? []} />
              </>
            ) : (
              <EmptyPanel title={t('Add your first question')}>{t('Pick a format: multiple choice with traps, a click zone on a picture, a short answer, a value, an order or pairs.')}</EmptyPanel>
            )}
          </section>
        </div>
      )}

      {tab === 'settings' && <SettingsPane doc={doc} edit={edit} classes={classes} room={room} toggleClass={(c) => void toggleClass(c)} busy={busy === 'classes'} />}

      {tab === 'quality' && (
        <section className="quality-pane" aria-label={t('Quality check')}>
          <div className="quality-head">
            <div className={`quality-score ${quality.score >= 85 ? 'good' : quality.score >= 60 ? 'fair' : 'poor'}`}><b>{quality.score}</b><span>/100</span></div>
            <div>
              <h2>{t('Quality check')}</h2>
              <p className="studio-help">{t('Recomputed by the server at every save. Errors block publishing; warnings and tips make the room clearer and the results easier to read.')}</p>
              {dirty && <p className="studio-help warn">{t('Save to update the check with your latest changes.')}</p>}
            </div>
          </div>
          {quality.notes.length === 0
            ? <p className="quality-clean"><CheckCircle2 size={16} aria-hidden="true" /> {t('Nothing to report.')}</p>
            : (
              <ul className="quality-notes">
                {quality.notes.map((n, i) => {
                  const qi = n.questionId ? doc.questions.findIndex((x) => x.id === n.questionId) : -1;
                  return (
                    <li key={i} className={n.level}>
                      <span className="quality-level">{n.level === 'error' ? t('Error') : n.level === 'warning' ? t('Warning') : t('Tip')}</span>
                      <span>{t(n.message)}</span>
                      {qi >= 0 && <button type="button" className="text-button" onClick={() => { setCurrent(qi); setTab('questions'); }}>{t('Question {n}', { n: qi + 1 })} <ChevronRight size={13} aria-hidden="true" /></button>}
                    </li>
                  );
                })}
              </ul>
            )}
        </section>
      )}
    </div>
  );
}

function SettingsPane({ doc, edit, classes, room, toggleClass, busy }: { doc: RoomDoc; edit: (d: RoomDoc) => void; classes: FacultyClass[]; room: Room; toggleClass: (id: number) => void; busy: boolean }) {
  const set = (patch: Partial<RoomDoc>) => edit({ ...doc, ...patch });
  return (
    <div className="settings-pane">
      <section className="settings-block">
        <h2>{t('Identity')}</h2>
        <Field label={t('Title')} wide>{(id) => <input id={id} value={doc.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <Field label={t('Summary shown on the room card')} wide>{(id) => <TextArea id={id} value={doc.summary} max={400} rows={2} onChange={(v) => set({ summary: v })} />}</Field>
        <Field label={t('Discipline')} help={t('Rooms for laboratories that are not open yet (immunology, parasitology…) are a way to prepare them.')}>
          {(id) => <select id={id} value={doc.discipline} onChange={(e) => set({ discipline: e.target.value as RoomDoc['discipline'] })}>{DISCIPLINES.map((d) => <option key={d} value={d}>{t(DISCIPLINE_LABELS[d])}</option>)}</select>}
        </Field>
        <div className="studio-field wide"><span className="studio-label">{t('Cover picture')}</span><ImagePicker value={doc.cover} onChange={(cover) => set({ cover })} /></div>
      </section>

      <section className="settings-block">
        <h2>{t('How it is played')}</h2>
        <div className="mode-choice" role="radiogroup" aria-label={t('Mode')}>
          <button type="button" role="radio" aria-checked={doc.mode === 'escape'} className={doc.mode === 'escape' ? 'active' : ''} onClick={() => set({ mode: 'escape' })}>
            <KeyRound size={18} aria-hidden="true" /><b>{t('Escape room')}</b><span>{t('Retry until right (each wrong try costs points). Solved questions reveal the vault code.')}</span>
          </button>
          <button type="button" role="radio" aria-checked={doc.mode === 'exam'} className={doc.mode === 'exam' ? 'active' : ''} onClick={() => set({ mode: 'exam', vaultCode: '' })}>
            <Clock3 size={18} aria-hidden="true" /><b>{t('Exam')}</b><span>{t('One answer per question, partial credit, correction at the end.')}</span>
          </button>
        </div>
        {doc.mode === 'escape' && (
          <Field label={t('Vault code (letters and digits, up to 12)')} help={t('Split over the questions: each solved question reveals its part. Leave empty for no vault.')}>
            {(id) => <input id={id} value={doc.vaultCode} maxLength={12} onChange={(e) => set({ vaultCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />}
          </Field>
        )}
        <div className="studio-row">
          <Field label={t('Time limit (minutes, 0 = none)')}>{(id) => <input id={id} type="number" min={0} max={240} value={Math.round(doc.timeLimitSec / 60)} onChange={(e) => { const m = Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))); set({ timeLimitSec: m * 60 }); }} />}</Field>
          <Field label={t('Pass mark (%)')}>{(id) => <input id={id} type="number" min={0} max={100} value={doc.passPct} onChange={(e) => set({ passPct: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} />}</Field>
          <Field label={t('Attempts per student (0 = unlimited)')}>{(id) => <input id={id} type="number" min={0} max={20} value={doc.maxAttempts} onChange={(e) => set({ maxAttempts: Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0))) })} />}</Field>
        </div>
        <Toggle checked={doc.shuffleQuestions} onChange={(v) => set({ shuffleQuestions: v })} label={t('Shuffle the questions for each student')} />
        <Toggle checked={doc.shuffleOptions} onChange={(v) => set({ shuffleOptions: v })} label={t('Shuffle the options')} />
        {doc.mode === 'exam' && <Toggle checked={doc.showFeedback} onChange={(v) => set({ showFeedback: v })} label={t('Say right or wrong after each answer')} />}
        <Toggle checked={doc.revealAnswers} onChange={(v) => set({ revealAnswers: v })} label={t('Show the expected answers in the student review')} />
      </section>

      <section className="settings-block">
        <h2>{t('Story')}</h2>
        <Field label={t('Introduction (shown with the first question)')} wide>{(id) => <TextArea id={id} value={doc.intro} max={1200} rows={3} onChange={(v) => set({ intro: v })} />}</Field>
        <Field label={t('Message when the room is completed')} wide>{(id) => <TextArea id={id} value={doc.outro} max={600} rows={2} onChange={(v) => set({ outro: v })} />}</Field>
      </section>

      <section className="settings-block">
        <h2>{t('Classes')}</h2>
        <p className="studio-help">{t('Only students of the ticked classes see the room once it is published. Saved immediately.')}</p>
        {classes.length === 0 ? <p className="studio-help">{t('You have no class yet.')}</p> : (
          <ul className="class-picks">
            {classes.map((c) => (
              <li key={c.id}>
                <Toggle checked={room.classIds.includes(c.id)} onChange={() => { if (!busy) toggleClass(c.id); }} label={t('{name} ({n} students)', { name: c.name, n: c.students })} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ preview
type Check = { correct: boolean; trap: boolean; feedback: string | null; explanation: string; hits: { x: number; y: number; zone: string | null; trap: boolean }[] | null; expected: Record<string, unknown> };

function PreviewView({ id, go }: { id: string; go: (s: Screen) => void }) {
  useDocumentTitle(t('Preview'));
  const preview = useLoad(async () => expectRecord<{ title: string; mode: string; intro: string; vaultCode: string; questions: PublicQuestion[] }>(await api(`/studio/rooms/${id}/preview`), 'questions'), [id]);
  const [i, setI] = useState(0);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tries, setTries] = useState(0);

  const submit = async (qid: string, response: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      setCheck(expectRecord<Check>(await api(`/studio/rooms/${id}/check`, { method: 'POST', body: JSON.stringify({ questionId: qid, response }) }), 'expected'));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const goTo = (n: number) => { setI(n); setCheck(null); setTries(0); };

  return (
    <div className="studio-preview">
      <div className="studio-editor-top">
        <button type="button" className="back-button" onClick={() => go({ kind: 'edit', id })}><ArrowLeft size={15} aria-hidden="true" /> {t('Back to the editor')}</button>
        <p className="studio-help"><Eye size={14} aria-hidden="true" /> {t('Preview as a student: graded by the server exactly like a real attempt, but nothing is recorded. It shows the last saved version.')}</p>
      </div>
      <Loaded load={preview.state} label={t('Preparing the preview…')} onRetry={preview.reload}>
        {(p) => {
          const q = p.questions[i];
          if (!q) return <EmptyPanel title={t('No question to preview')}>{t('Add a question and save first.')}</EmptyPanel>;
          const marks: Mark[] | undefined = check?.hits?.map((h) => ({ x: h.x, y: h.y, tone: h.zone && !h.trap ? 'right' : h.trap ? 'trap' : 'miss' }));
          return (
            <div className="room-stage">
              <div className="room-main">
                <section className="room-panel">
                  <p className="room-q-meta">{p.title} · {t('Question {n} of {total}', { n: i + 1, total: p.questions.length })} · {t(TYPE_LABELS[q.type])}</p>
                  {i === 0 && p.intro && <p className="room-intro">{p.intro}</p>}
                  {q.context && <p className="room-context">{q.context}</p>}
                  <h1>{q.prompt}</h1>
                  <RoomQuestion key={`${q.id}-${tries}`} question={{ ...q, wrong: tries }} busy={busy} locked={!!check} onSubmit={(r) => void submit(q.id, r)} verdictMarks={marks} />
                  {check && q.type === 'hotspot' && q.image && (
                    <div className="preview-zones">
                      <p className="studio-help">{t('Zones and tolerance (teacher view only):')}</p>
                      <RoomPicture image={q.image} marks={marks}><ZoneShapes zones={(check.expected.zones as never[]) ?? []} tolerance={Number(check.expected.tolerance ?? 0)} /></RoomPicture>
                    </div>
                  )}
                </section>
                {error !== null && <div role="alert" className="room-alert"><AlertTriangle size={16} aria-hidden="true" /> {describeError(error)}</div>}
              </div>
              <div className="room-side">
                {check && (
                  <div className={`room-verdict ${check.correct ? 'right' : check.trap ? 'trap' : 'wrong'}`} role="status">
                    <p className="room-verdict-title">{check.correct ? <><CheckCircle2 size={18} aria-hidden="true" /> {t('Correct')}</> : check.trap ? <><AlertTriangle size={18} aria-hidden="true" /> {t('Trap!')}</> : <><XCircle size={18} aria-hidden="true" /> {t('Not yet')}</>}</p>
                    {check.feedback && <p>{check.feedback}</p>}
                    {check.explanation && <p className="room-explanation">{check.explanation}</p>}
                    <p className="studio-help">{t('Expected: {answer}', { answer: describeExpected(q, check.expected) })}</p>
                    <button type="button" className="ghost" onClick={() => { setCheck(null); setTries((n) => n + 1); }}>{t('Try another answer')}</button>
                  </div>
                )}
                <div className="preview-nav">
                  <button type="button" className="ghost" disabled={i === 0} onClick={() => goTo(i - 1)}><ArrowLeft size={15} aria-hidden="true" /> {t('Previous')}</button>
                  <button type="button" className="primary" disabled={i >= p.questions.length - 1} onClick={() => goTo(i + 1)}>{t('Next question')} <ArrowRight size={15} aria-hidden="true" /></button>
                </div>
                {p.vaultCode && <p className="studio-help"><KeyRound size={14} aria-hidden="true" /> {t('Vault code: {code}', { code: p.vaultCode })}</p>}
              </div>
            </div>
          );
        }}
      </Loaded>
    </div>
  );
}

// ------------------------------------------------------------------ results
function ResultsView({ id, go }: { id: string; go: (s: Screen) => void }) {
  useDocumentTitle(t('Room results'));
  const results = useLoad(async () => expectRecord<Results>(await api(`/studio/rooms/${id}/results`), 'summary'), [id]);
  return (
    <div className="studio-results">
      <div className="studio-editor-top">
        <button type="button" className="back-button" onClick={() => go({ kind: 'list' })}><ArrowLeft size={15} aria-hidden="true" /> {t('All rooms')}</button>
        <button type="button" className="ghost" onClick={() => go({ kind: 'edit', id })}><PenLine size={15} aria-hidden="true" /> {t('Edit the room')}</button>
      </div>
      {results.state.phase === 'error'
        ? <ErrorPanel error={results.state.error} title={t('The results could not be loaded')} onRetry={results.reload} />
        : <Loaded load={results.state} label={t('Computing the results…')} onRetry={results.reload}>{(r) => <ResultsBody r={r} go={go} />}</Loaded>}
    </div>
  );
}

type SortKey = 'date' | 'name' | 'score' | 'time' | 'traps';

function ResultsBody({ r, go }: { r: Results; go: (s: Screen) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
  const [filter, setFilter] = useState('');
  const s = r.summary;
  const rows = useMemo(() => {
    const k = sort.key;
    const val = (a: AttemptRowView) => (k === 'name' ? a.student.name.toLowerCase() : k === 'score' ? a.pct ?? -1 : k === 'time' ? a.durationSec ?? Infinity : k === 'traps' ? a.traps : a.startedAt);
    const f = filter.trim().toLowerCase();
    return [...r.attempts].filter((a) => !f || a.student.name.toLowerCase().includes(f)).sort((a, b) => { const x = val(a); const y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1); });
  }, [r.attempts, sort, filter]);
  const head = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' })}>{label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}</button>
    </th>
  );

  const exportCsv = () => {
    const header = [t('Student'), t('Status'), t('Started'), t('Duration (s)'), t('Score'), t('Max'), t('%'), t('Passed'), t('Solved'), t('Wrong answers'), t('Hints'), t('Traps'), t('Version')];
    const csv = toCsv([header, ...r.attempts.map((a) => [a.student.name, a.status, new Date(a.startedAt).toISOString(), a.durationSec, a.score, a.maxScore, a.pct, a.passed === null ? '' : a.passed ? 'yes' : 'no', a.correct, a.wrong, a.hints, a.traps, a.version])]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${r.room.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'room'}-results.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const maxBin = Math.max(1, ...s.distribution);

  return (
    <>
      <PageIntro eyebrow={t('ROOM RESULTS')} title={r.room.title}>
        {t('{n} attempts by {students}. Pass mark {pass}%.', { n: s.attempts, students: plural(s.students, 'student'), pass: r.room.passPct })}
      </PageIntro>
      <FacultyDemoNote />
      {s.attempts === 0 ? <EmptyPanel title={t('No attempt yet')}>{t('Results appear here as soon as a student starts the room.')}</EmptyPanel> : (
        <>
          <div className="results-kpis">
            <div><span>{t('Average score')}</span><b>{s.avgPct === null ? '—' : `${s.avgPct}%`}</b><small>{t('median {pct}%', { pct: s.medianPct ?? 0 })}</small></div>
            <div><span>{t('Students who passed')}</span><b>{s.passRate === null ? '—' : `${s.passRate}%`}</b><small>{t('best attempt of each student')}</small></div>
            <div><span>{t('Median time')}</span><b>{formatDuration(s.medianDurationSec)}</b><small>{t('{n} finished, {m} in progress', { n: s.finished, m: s.inProgress })}</small></div>
            <div className="trap"><span>{t('Answers caught by a trap')}</span><b>{s.trapRate === null ? '—' : `${s.trapRate}%`}</b><small>{t('of all answers given')}</small></div>
          </div>
          <section className="results-block">
            <h2>{t('Score distribution')}</h2>
            <div className="histogram" role="img" aria-label={t('Score distribution: {list}', { list: s.distribution.map((n, i) => `${i * 10}-${i === 9 ? 100 : i * 10 + 9}%: ${n}`).join(', ') })}>
              {s.distribution.map((n, i) => (
                <div key={i} className={`histo-bar ${i * 10 >= r.room.passPct ? 'pass' : ''}`}>
                  <span style={{ height: `${(100 * n) / maxBin}%` }}><b>{n || ''}</b></span>
                  <small>{i * 10}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="results-block">
            <div className="section-head"><h2>{t('Question by question')}</h2><p className="studio-help">{t('Sorted as in the room. A low first-try rate or a high trap rate shows what to revisit in class.')}</p></div>
            <ol className="results-questions">
              {r.questions.map((q, i) => <QuestionResult key={q.id} q={q} n={i + 1} />)}
            </ol>
          </section>

          <section className="results-block">
            <div className="section-head">
              <h2>{t('Every attempt')}</h2>
              <div className="studio-inline">
                <label className="sr-only" htmlFor="results-filter">{t('Filter by name')}</label>
                <input id="results-filter" type="search" placeholder={t('Filter by name')} value={filter} onChange={(e) => setFilter(e.target.value)} />
                <button type="button" className="ghost" onClick={exportCsv}><FileDown size={15} aria-hidden="true" /> {t('Export CSV')}</button>
              </div>
            </div>
            <div className="table-scroll">
              <table className="results-table">
                <thead><tr>{head('name', t('Student'))}{head('date', t('Date'))}{head('score', t('Score'))}{head('time', t('Time'))}{head('traps', t('Traps'))}<th scope="col">{t('Hints')}</th><th scope="col"><span className="sr-only">{t('Details')}</span></th></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.attemptId} className={a.passed === false ? 'failed' : a.passed ? 'passed' : 'open'}>
                      <th scope="row">{a.student.name}</th>
                      <td>{formatDateTime(new Date(a.startedAt))}</td>
                      <td>
                        {a.status === 'in_progress' || a.status === 'vault' ? <span className="status-chip draft">{t('In progress')}</span> : (
                          <span className="score-cell"><span className="score-bar"><span style={{ width: `${a.pct ?? 0}%` }} /></span>{a.pct ?? 0}%{a.status === 'timeout' && <Clock3 size={13} aria-label={t('time ran out')} />}</span>
                        )}
                      </td>
                      <td>{formatDuration(a.durationSec)}</td>
                      <td>{a.traps > 0 ? <span className="trap-pill">{a.traps}</span> : '0'}</td>
                      <td>{a.hints}</td>
                      <td><button type="button" className="text-button" onClick={() => go({ kind: 'attempt', id: a.attemptId, roomId: r.room.id })}>{t('Answers')} <ChevronRight size={13} aria-hidden="true" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Meter({ label, pct, tone = '' }: { label: string; pct: number | null; tone?: string }) {
  return (
    <div className={`meter ${tone}`}>
      <span>{label}</span>
      <span className="meter-track" aria-hidden="true"><span style={{ width: `${pct ?? 0}%` }} /></span>
      <b>{pct === null ? '—' : `${pct}%`}</b>
    </div>
  );
}

function QuestionResult({ q, n }: { q: ResultQuestion; n: number }) {
  const [showZones, setShowZones] = useState(true);
  const picks = q.options ? Math.max(1, ...q.options.map((o) => o.picks)) : 1;
  return (
    <li className="result-question">
      <div className="result-question-head">
        <p className="room-q-meta">{t('Question {n}', { n })} · {t(TYPE_LABELS[q.type])} · {plural(q.reached, 'answer')}</p>
        <h3>{q.prompt}</h3>
      </div>
      <div className="result-question-body">
        <div className="result-meters">
          <Meter label={t('Right first time')} pct={q.firstTryPct} tone={q.firstTryPct !== null && q.firstTryPct < 50 ? 'low' : ''} />
          <Meter label={t('Solved in the end')} pct={q.solvedPct} />
          <Meter label={t('Fell into a trap')} pct={q.trapPct} tone="trap" />
          <p className="studio-help">{t('{tries} tries on average · {hints} hints read', { tries: q.avgTries ?? 0, hints: q.hintsUsed })}</p>
        </div>
        {q.options && (
          <ul className="pick-bars" aria-label={t('Options chosen')}>
            {q.options.map((o) => (
              <li key={o.id} className={o.correct ? 'right' : o.trap ? 'trap' : ''}>
                <span className="pick-label">{o.correct ? <CheckCircle2 size={13} aria-label={t('correct')} /> : o.trap ? <AlertTriangle size={13} aria-label={t('trap')} /> : null} {o.label}</span>
                <span className="pick-track" aria-hidden="true"><span style={{ width: `${(100 * o.picks) / picks}%` }} /></span>
                <b>{o.picks}</b>
              </li>
            ))}
          </ul>
        )}
        {q.trueCount !== undefined && (
          <ul className="pick-bars">
            {[true, false].map((v) => <li key={String(v)} className={q.answer === v ? 'right' : ''}><span className="pick-label">{v ? t('True') : t('False')}</span><span className="pick-track" aria-hidden="true"><span style={{ width: `${(100 * (v ? q.trueCount! : q.falseCount!)) / Math.max(1, q.trueCount! + q.falseCount!)}%` }} /></span><b>{v ? q.trueCount : q.falseCount}</b></li>)}
          </ul>
        )}
        {q.answers && (
          <ul className="answer-cloud" aria-label={t('Answers given')}>
            {q.answers.map((a, i) => <li key={i} className={a.correct ? 'right' : a.trap ? 'trap' : 'wrong'}><span>{a.answer}</span><b>×{a.count}</b></li>)}
          </ul>
        )}
        {q.type === 'hotspot' && q.image && (
          <div className="heatmap">
            <div className="heatmap-head">
              <p className="studio-help">{t('Every click of every student: green inside a correct zone, red on a trap, amber elsewhere.')}</p>
              <Toggle checked={showZones} onChange={setShowZones} label={t('Show the zones')} />
            </div>
            <RoomPicture image={q.image} marks={[]}>
              {showZones && <ZoneShapes zones={q.zones ?? []} tolerance={q.tolerance ?? 0} />}
              <g className="heat-dots">
                {(q.clicks ?? []).map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={Math.max(q.image!.width, q.image!.height) / 110} className={c.zone && !c.trap ? 'right' : c.trap ? 'trap' : 'miss'} />)}
              </g>
            </RoomPicture>
            <p className="studio-help">{t('{n} clicks recorded.', { n: (q.clicks ?? []).length })}</p>
          </div>
        )}
      </div>
    </li>
  );
}

function AttemptView({ id, roomId, go }: { id: string; roomId: string; go: (s: Screen) => void }) {
  useDocumentTitle(t('Student answers'));
  const review = useLoad(async () => expectRecord<Review>(await api(`/studio/attempts/${id}`), 'questions'), [id]);
  return (
    <div className="room-review">
      <button type="button" className="back-button" onClick={() => go({ kind: 'results', id: roomId })}><ArrowLeft size={15} aria-hidden="true" /> {t('Back to the results')}</button>
      <Loaded load={review.state} label={t('Loading the answers…')} onRetry={review.reload}>
        {(r) => (
          <>
            <PageIntro eyebrow={t('STUDENT ANSWERS')} title={r.student?.name ?? ''}>{t('{room} · started {date}', { room: r.title, date: formatDateTime(new Date(r.startedAt)) })}</PageIntro>
            <ReviewBody review={r} />
          </>
        )}
      </Loaded>
    </div>
  );
}

