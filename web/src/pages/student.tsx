import { ArrowRight, Beaker, Check, ChevronRight, Clock3, Droplet, FlaskConical, Hourglass, LockKeyhole, Microscope, Sparkles, Trophy } from 'lucide-react';
import { createElement } from 'react';
import hematologyArt from '../assets/lab-hematology-door.webp';
import microbiologyArt from '../assets/lab-microbiology-door.webp';
import biochemistryArt from '../assets/lab-biochemistry-door.webp';
import masterArt from '../assets/lab-master.webp';
import masterOpenArt from '../assets/lab-master-open.webp';
import { api } from '../lib/api';
import { formatInt, plural, t } from '../i18n';
import { engineLabel, outOf } from '../lib/labels';
import { allInvestigationsDone, dashboardFigures, normalizeDashboard, normalizeLabLobby, normalizeLabs, type Dashboard as DashboardData, type Lab, type LabLobby, type LobbyMission } from '../lib/student';
import { PageIntro, Stat, tone, useDocumentTitle, useNav } from '../ui/common';
import { EmptyPanel, Loaded, useLoad } from '../ui/state';

const loadLabs = async () => normalizeLabs(await api('/labs'));

export function Dashboard() {
  useDocumentTitle('Mission control');
  const { state, reload } = useLoad(async () => {
    const [dashboard, labs] = await Promise.all([api('/dashboard'), api('/labs')]);
    return { dashboard: normalizeDashboard(dashboard), labs: normalizeLabs(labs) };
  }, []);
  return (
    <Loaded load={state} label={t('Loading investigation map…')} onRetry={reload}>
      {({ dashboard, labs }) => <DashboardView dashboard={dashboard} labs={labs} />}
    </Loaded>
  );
}

function DashboardView({ dashboard, labs }: { dashboard: DashboardData; labs: Lab[] }) {
  const nav = useNav();
  const open = labs.filter((l) => l.state !== 'coming_soon');
  const target = dashboard.continue;
  // Every mission is done (counts reported by the server), nothing is left to continue and no Master Lab is left open.
  const allDone = allInvestigationsDone(dashboard, labs);
  const figures = dashboardFigures(dashboard, labs);
  const cta = !target
    ? allDone
      ? { label: t('Review the laboratory map'), run: () => nav.go('labs'), headline: t('Every laboratory is cleared') }
      : { label: t('Explore laboratory map'), run: () => nav.go('labs'), headline: t('Select a discipline to begin') }
    : target.kind === 'unlock'
      ? { label: t('Open the Code Vault'), run: () => nav.go('progress'), headline: t(target.title) }
      : target.resume
        ? { label: t('Resume active investigation'), run: () => nav.startMission(target.missionId!), headline: t(target.title) }
        : { label: t('Start the next investigation'), run: () => nav.startMission(target.missionId!), headline: t(target.title) };

  // The server owns progress and the next action; the first view stays focused on the named laboratories.
  return (
    <>
      <section className="section-head dashboard-labs-head" aria-label={t('Laboratories')}>
        <div>
          <div className="eyebrow">{t('THE ESCAPE ROUTE')}</div>
          <h1 id="hero-title">{t('Choose a laboratory')}</h1>
        </div>
        <button type="button" className="text-button" onClick={() => nav.go('labs')}>{t('View full map')} <ChevronRight size={16} aria-hidden="true" /></button>
      </section>
      {open.length === 0
        ? <EmptyPanel title={t('No laboratory is open yet')}>{t('The server did not list any playable laboratory. Please retry later.')}</EmptyPanel>
        : <div className="lab-strip">{open.slice(0, 4).map((lab) => <LabCard lab={lab} level={2} key={lab.slug} />)}</div>}
      <section className="dashboard-next-step" aria-label={t('Next investigation')}>
        <div><div className="eyebrow">{t('YOUR NEXT STEP')}</div><h2>{t(cta.headline)}</h2></div>
        <button type="button" className="primary" disabled={nav.busy} aria-busy={nav.starting !== null} onClick={cta.run}>{nav.starting !== null && target?.kind !== 'unlock' ? t('Starting…') : <>{t(cta.label)} <ArrowRight size={17} aria-hidden="true" /></>}</button>
      </section>
      <LevelStrip level={dashboard.user.level} xp={dashboard.user.xp} progress={dashboard.user.levelProgress} />
      <div className="stats dashboard-stats">
        <Stat icon={<Beaker />} label={t('Missions completed')} value={figures.missions.value} detail={figures.missions.detail} />
        <Stat icon={<Sparkles />} label={t('Labs cleared')} value={figures.labs.value} detail={figures.labs.detail} />
        <Stat icon={<Clock3 />} label={t('Streak')} value={plural(dashboard.streakDays, 'day')} detail={t('Level {level} · {xp} XP (server record)', { level: dashboard.user.level, xp: formatInt(dashboard.user.xp) })} />
      </div>
      <section className="how-it-works" aria-labelledby="how-title">
        <div className="eyebrow">{t('HOW LABESCAPE WORKS')}</div>
        <h2 id="how-title">{t('Investigate, earn fragments, open the exit')}</h2>
        <ol>
          <li><b>{t('Observe.')}</b> {t('Each mission is a case: read the evidence, inspect the illustrative image or the laboratory values.')}</li>
          <li><b>{t('Reason.')}</b> {t('Answer the interactive challenge. A wrong answer costs a few XP; a hint costs more, so think first.')}</li>
          <li><b>{t('Collect.')}</b> {t("Finishing a mission earns XP and reveals one digit of the laboratory's exit code.")}</li>
          <li><b>{t('Escape.')}</b> {t('With every digit found, enter the exit code in the vault to clear the laboratory and unlock the next one.')}</li>
        </ol>
        <p>{t('Scores, timers, penalties and unlocks are all decided by the server. Cases are educational scenarios, not clinical guidance.')}</p>
      </section>
      <p className="demo-note">{t('Guest demo: the progress, XP, streak and names you see here are prepared demonstration data, not real people. Nothing you do creates an account.')}</p>
    </>
  );
}

/** The learner's level and the XP still needed for the next one, exactly as the server computed them (presentation only). */
export function LevelStrip({ level, xp, progress }: { level: number; xp: number; progress: { into: number; size: number } }) {
  const left = progress.size - progress.into;
  const pct = progress.size > 0 ? (100 * progress.into) / progress.size : 0;
  return (
    <section className="level-strip" aria-label={t('Level progress')}>
      <div className="level-badge"><span>{t('LEVEL')}</span><b>{formatInt(level)}</b></div>
      <div className="level-body">
        <div className="level-head"><b>{formatInt(xp)} XP</b><span>{t('{left} XP to level {next}', { left: formatInt(left), next: formatInt(level + 1) })}</span></div>
        <div className="level-bar" role="progressbar" aria-label={t('Level progress')} aria-valuemin={0} aria-valuemax={progress.size} aria-valuenow={progress.into} aria-valuetext={t('{into} of {size} XP into level {level}', { into: formatInt(progress.into), size: formatInt(progress.size), level: formatInt(level) })}><i style={{ width: `${pct}%` }} /></div>
      </div>
    </section>
  );
}

export function LabCard({ lab, level }: { lab: Lab; level: 2 | 3 }) {
  const nav = useNav();
  const soon = lab.state === 'coming_soon';
  const locked = lab.state === 'locked' || soon;
  const stateLabel = lab.state === 'completed' ? t('CLEARED') : lab.state === 'locked' ? t('LOCKED') : t('ACTIVE');
  const art = lab.discipline === 'hematology' ? hematologyArt : lab.discipline === 'microbiology' ? microbiologyArt : lab.discipline === 'biochemistry' ? biochemistryArt : lab.discipline === 'master' ? locked ? masterArt : masterOpenArt : null;
  const slotCount = Math.min(4, lab.fragments.total);
  const Emblem = lab.discipline === 'hematology' ? Droplet : lab.discipline === 'microbiology' ? Microscope : lab.discipline === 'biochemistry' ? FlaskConical : Beaker;
  return (
    <article className={`lab-card ${tone(lab.discipline)} ${locked ? 'locked' : ''}`}>
      <div className="lab-card-scene" aria-hidden="true">
        {art && <img src={art} alt="" loading="lazy" decoding="async" />}
        <div className="lab-card-top">
          <span className="lab-index">{String(lab.ordinal).padStart(2, '0')}</span>
          {soon ? null : locked ? <LockKeyhole size={16} /> : <span className="lab-state">{stateLabel}</span>}
        </div>
        <div className="lab-emblem">{soon ? <Hourglass size={22} /> : <Emblem size={24} />}</div>
        {art && lab.discipline !== 'master' && <span className="lab-door-nameplate">{t(lab.name.replace(' Lab', ''))}</span>}
      </div>
      <div className="lab-card-content">
        {createElement(`h${level}`, null, t(lab.name.replace(' Lab', '')))}
        {!soon && <p>{t(lab.blurb)}</p>}
        {!soon && (
          <div className="lab-card-progress" role="group" aria-label={`${outOf(lab.missions.completed, plural(lab.missions.total, 'mission'))} · ${outOf(lab.fragments.found, plural(lab.fragments.total, 'code fragment'))}`}>
            <span className="lab-card-counts">{outOf(lab.missions.completed, plural(lab.missions.total, 'mission'))} · {outOf(lab.fragments.found, plural(lab.fragments.total, 'code fragment'))}</span>
            {slotCount > 0 && <span className="lab-code-pips" aria-hidden="true">{Array.from({ length: slotCount }, (_, index) => <i className={index < lab.fragments.found ? 'found' : ''} key={index}>{index < lab.fragments.found ? <Check size={12} /> : '·'}</i>)}</span>}
          </div>
        )}
        {lab.lockedReason && <p className="lab-meta">{t(lab.lockedReason)}</p>}
        <div className="lab-card-foot">
          {lab.state === 'coming_soon'
            ? <span className="soon">{t('Coming soon')}</span>
            : lab.state === 'locked'
              ? <span><LockKeyhole size={15} aria-hidden="true" /> {t('Locked')}</span>
              : <button type="button" disabled={nav.busy} onClick={() => nav.openLab(lab.slug)} aria-label={lab.state === 'completed' ? t('Review {name}', { name: t(lab.name) }) : t('Enter {name}', { name: t(lab.name) })}>{lab.state === 'completed' ? t('Review lab') : t('Enter lab')} <ArrowRight size={16} aria-hidden="true" /></button>}
        </div>
      </div>
    </article>
  );
}

export function LabMap() {
  useDocumentTitle('Lab map');
  const { state, reload } = useLoad(loadLabs, []);
  return (
    <>
      <PageIntro eyebrow={t('THE ESCAPE ROUTE')} title={t('Laboratory map')}>
        {t('Three open disciplines and a Master Lab, one investigative challenge; more laboratories are in development. Follow the evidence through illustrative laboratory scenarios built for learning.')}
      </PageIntro>
      <Loaded load={state} label={t('Loading the laboratory map…')} onRetry={reload} level={2}>
        {(labs) => labs.length === 0
          ? <EmptyPanel title={t('No laboratories yet')}>{t('The server returned an empty laboratory map.')}</EmptyPanel>
          : (
            <>
              <div className="map-grid">{labs.map((lab) => <LabCard lab={lab} level={2} key={lab.slug} />)}</div>
              <div className="map-note"><LockKeyhole size={16} aria-hidden="true" /><span><b>{t('More disciplines are in development.')}</b> {t('New labs join after scientific review.')}</span></div>
            </>
          )}
      </Loaded>
    </>
  );
}

function actionFor(m: LobbyMission): { verb: string; locked: boolean } {
  if (m.state === 'locked') return { verb: 'Locked', locked: true };
  if (m.inProgress) return { verb: 'Resume', locked: false };
  if (m.state === 'completed') return { verb: 'Replay', locked: false };
  return { verb: 'Start', locked: false };
}

export function LabLobbyPage() {
  const nav = useNav();
  const slug = nav.labSlug;
  const { state, reload } = useLoad(async () => normalizeLabLobby(await api(`/labs/${slug}`)), [slug]);
  useDocumentTitle(state.phase === 'ready' ? state.data.lab.name : 'Laboratory');
  return (
    <>
      <button type="button" className="text-button back-link" onClick={() => nav.go('labs')}>{t('← All laboratories')}</button>
      <Loaded load={state} label={t('Opening the laboratory…')} onRetry={reload}>
        {(lobby) => <LobbyView lobby={lobby} />}
      </Loaded>
    </>
  );
}

function LobbyView({ lobby }: { lobby: LabLobby }) {
  const nav = useNav();
  const done = lobby.missions.filter((m) => m.state === 'completed').length;
  return (
    <>
      <PageIntro eyebrow={t(lobby.lab.discipline).toUpperCase()} title={t(lobby.lab.name)}>{t(lobby.lab.blurb)}</PageIntro>
      {lobby.state === 'coming_soon' && <EmptyPanel title={t('This laboratory is in development')}>{t('Missions will appear here after scientific review.')}</EmptyPanel>}
      {lobby.state === 'locked' && <EmptyPanel title={t('This laboratory is locked')}>{lobby.lockedReason === undefined ? undefined : t(lobby.lockedReason)}</EmptyPanel>}
      {lobby.missions.length > 0 && (
        <>
          <div className="stats lobby-stats">
            <Stat icon={<Beaker />} label={t('Missions')} value={outOf(done, lobby.missions.length)} detail={t('Completed in this laboratory')} />
            {lobby.vault && <Stat icon={<Trophy />} label={t('Code fragments')} value={outOf(lobby.vault.slots.filter((s) => s !== null).length, lobby.vault.codeLength)} detail={lobby.vault.exited ? t('Exit unlocked') : lobby.vault.complete ? t('Ready: open the Code Vault') : t('Found by completing missions')} />}
          </div>
          <section className="teacher-panel" aria-labelledby="mission-picker">
            <div className="eyebrow">{t('MISSION PICKER')}</div>
            <h2 id="mission-picker">{t('Choose a mission')}</h2>
            <ol className="mission-picker">
              {lobby.missions.map((m) => {
                const action = actionFor(m);
                return (
                  <li className={`picker-row ${m.state}`} key={m.id}>
                    <span className="picker-ordinal" aria-hidden="true">{String(m.ordinal).padStart(2, '0')}</span>
                    <div className="picker-main">
                      <h3>{t(m.title)}</h3>
                      <p>{t('{engine} · Difficulty: {difficulty} · about {minutes} min', { engine: engineLabel(m.engine), difficulty: t(m.difficulty), minutes: m.estMinutes })}</p>
                      <p>
                        {m.state === 'completed' ? t('Completed') : m.state === 'locked' ? (m.unlocksWith === undefined ? undefined : t(m.unlocksWith)) : m.inProgress ? t('In progress') : t('Ready')}
                        {m.bestScore !== null && <> · {t('best score {score} of {max} XP', { score: m.bestScore, max: m.maxScore })}</>}
                      </p>
                    </div>
                    <button type="button" className={action.locked ? 'ghost' : 'primary'} disabled={action.locked || nav.busy} aria-busy={nav.starting === m.id} onClick={() => nav.startMission(m.id)} aria-label={`${nav.starting === m.id ? t('Starting') : t(action.verb)} ${t(m.title)}`}>
                      {action.locked ? <LockKeyhole size={14} aria-hidden="true" /> : null}{nav.starting === m.id ? t('Starting…') : t(action.verb)}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
