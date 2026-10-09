import { useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Clock3, Sparkles, Trophy } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { describeBoard, normalizeBadges, normalizeLabResult, normalizeLeaderboard, normalizeVault, type BadgeItem, type LabResult, type Leaderboard, type LeaderboardRow, type VaultItem } from '../lib/progression';
import { normalizeLabs, normalizeUnlock, type Lab } from '../lib/student';
import { displayName } from '../lib/faculty';
import { normalizeProfileSettings, type ProfileSettings } from '../lib/profile';
import { formatInt, plural, t } from '../i18n';
import { CompetencyBars, PageIntro, Stat, useDocumentTitle, useNav } from '../ui/common';
import { EmptyPanel, ErrorPanel, Loaded, LoadingPanel, describeError, useLoad, type Load } from '../ui/state';

/** `text` builds the message while the screen renders, so a language change re-translates a message that is already shown. */
type Outcome = { kind: 'success' | 'error'; slug: string; text: () => string };

async function loadProgress() {
  const [vault, badges, board, labs] = await Promise.all([api('/vault'), api('/badges'), api('/leaderboard?scope=all&cohort=class'), api('/labs')]);
  return { vaults: normalizeVault(vault), badges: normalizeBadges(badges), board: normalizeLeaderboard(board), labs: normalizeLabs(labs) };
}
type ProgressData = Awaited<ReturnType<typeof loadProgress>>;

export function ProgressHub() {
  useDocumentTitle('Progress vault');
  const { state, reload, setData } = useLoad(loadProgress, []);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [refreshError, setRefreshError] = useState<unknown>(null);

  const refresh = async (): Promise<ProgressData | null> => {
    try {
      const fresh = await loadProgress();
      setData(fresh);
      setRefreshError(null);
      return fresh;
    } catch (e) {
      setRefreshError(e);
      return null;
    }
  };

  return (
    <>
      <PageIntro eyebrow={t('PROGRESSION SYSTEM')} title={t('Progress vault')}>
        {t('Every fragment and badge below comes from the server record. Nothing is awarded by the interface.')}
      </PageIntro>
      {refreshError !== null && <ErrorPanel error={refreshError} title={t('The vault could not be refreshed')} onRetry={() => void refresh()} level={2} />}
      <Loaded load={state} label={t('Opening the vault…')} onRetry={reload} level={2}>
        {(data) => <ProgressView data={data} outcome={outcome} setOutcome={setOutcome} refresh={refresh} />}
      </Loaded>
    </>
  );
}

function ProgressView({ data, outcome, setOutcome, refresh }: { data: ProgressData; outcome: Outcome | null; setOutcome: (o: Outcome | null) => void; refresh: () => Promise<ProgressData | null> }) {
  const names = new Map(data.labs.map((l) => [l.slug, l.name]));
  return (
    <>
      <div className="progress-grid">
        <section className="vault-panel" aria-labelledby="vault-title">
          <div className="eyebrow">{t('CODE VAULT')}</div>
          <h2 id="vault-title">{t('Fragments discovered')}</h2>
          {data.vaults.length === 0
            ? <EmptyPanel title={t('No vault yet')}>{t('No laboratory has a code vault on the server.')}</EmptyPanel>
            : <div className="vault-cards">{data.vaults.map((v) => <VaultCard key={v.labSlug} vault={v} name={names.get(v.labSlug) ?? v.labSlug} outcome={outcome?.slug === v.labSlug ? outcome : null} setOutcome={setOutcome} refresh={refresh} />)}</div>}
        </section>
        <section className="vault-panel" aria-labelledby="badge-title">
          <div className="eyebrow">BADGES</div>
          <h2 id="badge-title">{t('Milestones')}</h2>
          {data.badges.length > 0 && <p className="bar-note" data-testid="badge-count">{t('{earned} of {total} earned', { earned: data.badges.filter((b) => b.earned).length, total: data.badges.length })}</p>}
          {data.badges.length === 0
            ? <EmptyPanel title={t('No badges defined')}>{t('The server did not list any badge.')}</EmptyPanel>
            : <ul className="badge-list">{data.badges.map((b) => <BadgeRow badge={b} key={b.id} />)}</ul>}
        </section>
      </div>
      <BoardPanel board={data.board} />
    </>
  );
}

function BadgeRow({ badge }: { badge: BadgeItem }) {
  return (
    <li className={`badge-row ${badge.earned ? 'earned' : ''}`}>
      <span className="badge-icon" aria-hidden="true"><Trophy size={15} /></span>
      <div><b>{t(badge.name)}</b><small>{t(badge.description)}</small></div>
      <span className="badge-state">{badge.earned ? t('EARNED') : t('LOCKED')}</span>
    </li>
  );
}

function VaultCard({ vault, name, outcome, setOutcome, refresh }: { vault: VaultItem; name: string; outcome: Outcome | null; setOutcome: (o: Outcome | null) => void; refresh: () => Promise<ProgressData | null> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  // The Unlock button disables itself while the server checks, and the form disappears on success: focus is placed back by hand.
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const found = vault.slots.filter((s) => s !== null).length;
  const labName = t(name);
  const ready = new RegExp(`^[0-9]{${vault.codeLength}}$`).test(code);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setOutcome(null);
    try {
      const reply = normalizeUnlock(await api(`/labs/${vault.labSlug}/unlock`, { method: 'POST', body: JSON.stringify({ code }) }));
      const badgeNames = reply.newBadges.map((b) => b.name);
      setOutcome({
        kind: 'success',
        slug: vault.labSlug,
        text: () => {
          const lab = t(reply.labName);
          if (reply.alreadyUnlocked) return t('{lab} was already unlocked.', { lab });
          const badges = badgeNames.length ? ` ${t('New badge: {names}.', { names: badgeNames.map((b) => t(b)).join(', ') })}` : '';
          return `${t('{lab} unlocked.', { lab })}${badges} ${t('Its results are now available.')}`;
        },
      });
      setCode('');
      await refresh();
      cardRef.current?.focus();
    } catch (e) {
      // Only an explicit 4xx refusal means nothing was recorded. After a network failure, a timeout, a 5xx or an unreadable
      // reply the server may have opened the exit: re-read the vault instead of asking for the code again.
      if (!(e instanceof ApiError && e.status >= 400 && e.status < 500)) {
        const fresh = await refresh();
        if (fresh?.vaults.find((v) => v.labSlug === vault.labSlug)?.exited) {
          setOutcome({ kind: 'success', slug: vault.labSlug, text: () => t('{lab} is unlocked. The server recorded it but its reply could not be read, so this page was refreshed from the server.', { lab: t(name) }) });
          setCode('');
          cardRef.current?.focus();
          return;
        }
      }
      setOutcome({ kind: 'error', slug: vault.labSlug, text: () => unlockMessage(e) });
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vault-card" ref={cardRef} tabIndex={-1}>
      <div className="vault-card-head"><b>{labName}</b><span>{vault.exited ? t('ESCAPED') : vault.complete ? t('READY') : found === 0 ? t('NOT STARTED') : t('IN PROGRESS')}</span></div>
      <div className="code-slots" role="list" aria-label={t('{lab} code fragments', { lab: labName })}>
        {vault.slots.map((digit, i) => (
          <span role="listitem" className={digit === null ? 'empty' : ''} key={i}>
            <span className="sr-only">{digit === null ? t('Fragment {n}: not found yet', { n: i + 1 }) : `${t('Fragment {n}:', { n: i + 1 })} `}</span>
            <span aria-hidden={digit === null ? true : undefined}>{digit === null ? '·' : digit}</span>
          </span>
        ))}
      </div>
      <small>{vault.exited ? t('Exit unlocked') : vault.complete ? t('Code ready for the exit lock') : t('{found} of {total} found', { found, total: plural(vault.codeLength, 'fragment') })}</small>
      {vault.complete && !vault.exited && (
        <form className="unlock-row" onSubmit={(e) => void unlock(e)}>
          <label htmlFor={inputId} className="sr-only">{t('Exit code for {lab} ({n} digits)', { lab: labName, n: vault.codeLength })}</label>
          <input
            id={inputId}
            ref={inputRef}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={vault.codeLength}
            placeholder={t('{n} digits', { n: vault.codeLength })}
            value={code}
            aria-invalid={outcome?.kind === 'error'}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <button type="submit" className="primary" disabled={busy || !ready}>{busy ? t('Checking…') : t('Unlock')}</button>
        </form>
      )}
      {outcome && (outcome.kind === 'error'
        ? <div role="alert" className="notice error-note">{outcome.text()}</div>
        : <div role="status" className="notice success-note">{outcome.text()}</div>)}
    </div>
  );
}

export function unlockMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = (error.details ?? {}) as { attemptsLeft?: unknown };
    if (error.status === 422 && typeof details.attemptsLeft === 'number') {
      const n = details.attemptsLeft;
      return `${t(describeError(error))} ${t('{attempts} left before further tries are paused.', { attempts: plural(n, 'attempt') })}`;
    }
  }
  return t(describeError(error));
}

function BoardRow({ row, unranked = false }: { row: LeaderboardRow; unranked?: boolean }) {
  // A viewer without XP is not ranked: the server gives them total + 1 only so that no count can overshoot, so that figure is never shown as a rank.
  if (unranked) return <li className="leaderboard-row you unranked"><b>{t('You: not ranked yet ({xp} XP)', { xp: formatInt(row.xp) })}</b></li>;
  return (
    <li className={`leaderboard-row ${row.you ? 'you' : ''}`}>
      <span>#{row.rank}</span>
      <b>{row.you ? t('You') : <bdi>{displayName(row.name)}</bdi>}</b>
      <span>{formatInt(row.xp)} XP</span>
      <span>{plural(row.labs, 'lab')}</span>
    </li>
  );
}

function BoardPanel({ board }: { board: Leaderboard }) {
  const view = describeBoard(board);
  return (
    <section className="leaderboard-panel" aria-labelledby="board-title">
      <div className="section-head">
        <div><div className="eyebrow">{t('COHORT SIGNAL')}</div><h2 id="board-title">{t('Leaderboard')}</h2></div>
        <span className="tag">{t('All-time · Class')}</span>
      </div>
      {view.kind === 'unavailable'
        ? <EmptyPanel title={t('The leaderboard is not available yet')}>{t('The class leaderboard appears when your learning group is set up.')}</EmptyPanel>
        : view.kind === 'nobody'
        ? <EmptyPanel title={t('Nobody is ranked yet')}>{t('Nobody in your group has earned XP yet. Complete a mission to appear here.')}</EmptyPanel>
        : (
          <>
            <div className="leaderboard-head" aria-hidden="true"><span>{t('RANK')}</span><span>{t('STUDENT')}</span><span>XP</span><span>{t('LABS')}</span></div>
            <ol className="leaderboard-list">
              {/* Abbreviated names and tied ranks can repeat: the row's position in the server's ordered list is its identity. */}
              {board.rows.map((r, i) => <BoardRow row={r} key={`${i}-${r.rank}`} />)}
              {view.showMe && view.gap && <li className="leaderboard-gap" aria-hidden="true">…</li>}
              {view.showMe && board.me && <BoardRow row={board.me} unranked={view.unranked} />}
            </ol>
            {view.count !== null && <p className="list-count">{t('Showing {shown} of {total}.', { shown: board.rows.length + (view.showMe && !view.unranked ? 1 : 0), total: plural(board.total, 'ranked student') })}</p>}
          </>
        )}
    </section>
  );
}

// ------------------------------------------------------------------ results
type LabOutcome = { lab: Lab; result: LabResult } | { lab: Lab; error: unknown };

async function loadResults(): Promise<LabOutcome[]> {
  const labs = normalizeLabs(await api('/labs')).filter((l) => l.state === 'completed');
  return Promise.all(labs.map(async (lab): Promise<LabOutcome> => {
    try {
      return { lab, result: normalizeLabResult(await api(`/labs/${lab.slug}/results`)) };
    } catch (error) {
      return { lab, error };
    }
  }));
}

export function LabResults() {
  useDocumentTitle('Lab results');
  const nav = useNav();
  const { state, reload } = useLoad(loadResults, []);
  return (
    <>
      <PageIntro eyebrow={t('MASTERY PROGRESS')} title={t('Lab results')}>{t('Review the server-calculated outcome of every lab you have escaped.')}</PageIntro>
      <Loaded load={state} label={t('Collecting your lab results…')} onRetry={reload} level={2}>
        {(rows) => rows.length === 0
          ? (
            <EmptyPanel title={t('No escaped lab yet')} action={<button type="button" className="primary" onClick={() => nav.go('labs')}>{t('Go to the laboratory map')} <ArrowRight size={16} aria-hidden="true" /></button>}>
              {t('Complete every mission in a discipline, then use the Code Vault to open its exit.')}
            </EmptyPanel>
          )
          : <>{rows.map((row) => ('result' in row ? <ResultCard result={row.result} key={row.lab.slug} /> : <ResultFailure row={row} retry={reload} key={row.lab.slug} />))}</>}
      </Loaded>
    </>
  );
}

/**
 * Results are only requested for labs the server reports as completed, so a 404/409 for one of them is a
 * contradiction between two server answers, never "nothing to show": it is an alert with Retry like any failure.
 */
function ResultFailure({ row, retry }: { row: { lab: Lab; error: unknown }; retry: () => void }) {
  return <ErrorPanel error={row.error} title={t('{lab}: results could not be loaded', { lab: t(row.lab.name) })} onRetry={retry} level={2} />;
}

function ResultCard({ result: r }: { result: LabResult }) {
  const labName = t(r.lab.name);
  return (
    <section className="result-lab" aria-label={t('{lab} results', { lab: labName })}>
      <div className="result-lab-head">
        <div><div className="eyebrow">{labName}</div><h2><span className="sr-only">{t('{lab}:', { lab: labName })} </span>{t('Escape confirmed')}</h2></div>
        <span className="tag">{r.xp} XP</span>
      </div>
      <div className="stats">
        <Stat icon={<Trophy />} label={t('Accuracy')} value={r.stats.accuracyPct === null ? t('Not available') : t('{pct}%', { pct: r.stats.accuracyPct })} detail={t('Mean mission accuracy')} />
        <Stat icon={<Clock3 />} label={t('Time')} value={r.stats.elapsed} detail={t('Official elapsed time')} />
        <Stat icon={<Sparkles />} label={t('Hints')} value={formatInt(r.stats.hintsUsed)} detail={t('On the best attempts shown here')} />
      </div>
      <div className="mission-table">
        {r.missions.map((m) => (
          <div className="mission-row" key={m.id}>
            <span>{t(m.title)}</span>
            <b>{m.score === null ? '—' : t('{score} of {max} XP', { score: m.score, max: m.maxScore })}</b>
            <small>{m.accuracyPct === null ? t('Not completed') : t('{pct}% accuracy', { pct: m.accuracyPct })}</small>
          </div>
        ))}
      </div>
      {r.badge && <p className="badge-chips-label">{t('Badge earned')}</p>}
      {r.badge && <ul className="badge-chips left" aria-label={t('{lab} badge', { lab: labName })}><li><Trophy size={15} aria-hidden="true" />{t(r.badge.name)}</li></ul>}
      {r.ledger.length > 0 && (
        <ul className="ledger" aria-label={t('{lab} score ledger', { lab: labName })}>
          {r.ledger.map((row) => (
            <li key={row.id} className={row.kind}><span>{t(row.label)}<small>{t(row.reason)}</small></span><b>{row.points > 0 ? `+${row.points}` : row.points}</b></li>
          ))}
        </ul>
      )}
      <div className="eyebrow competency-eyebrow">{t('COMPETENCIES')}</div>
      <CompetencyBars data={r.competencies} title={t('{lab} competencies', { lab: labName })} />
    </section>
  );
}

// ------------------------------------------------------------------ profile
export type SettingsStore = {
  load: Load<ProfileSettings>;
  reload: () => void;
  setData: (s: ProfileSettings) => void;
};

export async function loadSettings(): Promise<ProfileSettings> {
  return normalizeProfileSettings(await api('/profile'));
}

// Only settings the interface really honours are offered: the app has no sound and sends no notifications (the server still stores those
// two fields, but a switch that changes nothing would look like a working feature).
const OPTIONS: [keyof ProfileSettings, string][] = [['reduceMotion', 'Reduce motion']];

export function Profile({ store }: { store: SettingsStore }) {
  useDocumentTitle('Learning settings');
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const update = async (current: ProfileSettings, key: keyof ProfileSettings, value: boolean) => {
    if (saving) return;
    setProblem(null);
    setSaved(false);
    setSaving(true);
    store.setData({ ...current, [key]: value });
    try {
      store.setData(normalizeProfileSettings(await api('/profile', { method: 'PUT', body: JSON.stringify({ [key]: value }) })));
      setSaved(true);
    } catch (e) {
      // After a network failure, a timeout, a 5xx or an unreadable reply the change may have been stored: ask the server what it holds.
      if (!(e instanceof ApiError && e.status >= 400 && e.status < 500)) {
        try {
          const stored = await loadSettings();
          store.setData(stored);
          if (stored[key] === value) { setSaved(true); return; }
          setProblem(e);
          return;
        } catch { /* the server cannot be read either: fall back to the previous values below */ }
      }
      store.setData(current);
      setProblem(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageIntro eyebrow={t('GUEST LABORATORY')} title={t('Learning settings')}>
        {t('These settings affect this guest demonstration only. No personal account or learner profile is created.')}
      </PageIntro>
      {problem !== null && <div role="alert" className="error">{t(describeError(problem))}</div>}
      {store.load.phase === 'loading' && <LoadingPanel label={t('Loading your settings…')} />}
      {store.load.phase === 'error' && <ErrorPanel error={store.load.error} title={t('Your settings could not be loaded')} onRetry={store.reload} level={2} />}
      {store.load.phase === 'ready' && (
        <div className="settings-card">
          <div className="eyebrow">{t('PREFERENCES')}</div>
          <h2>{t('Learning environment')}</h2>
          {saved && <div className="saved-note" role="status"><Check size={16} aria-hidden="true" />{t('Preferences saved')}</div>}
          {OPTIONS.map(([key, label]) => {
            const current = (store.load as { phase: 'ready'; data: ProfileSettings }).data;
            return (
              <label className="setting-row" key={key}>
                <span>{t(label)}</span>
                <input type="checkbox" checked={current[key]} aria-busy={saving} onChange={(e) => void update(current, key, e.target.checked)} />
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
