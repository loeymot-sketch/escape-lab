import { ArrowRight, Check, Minus } from 'lucide-react';
import { t, useLang } from '../i18n';
import { ABOUT_FOOT, BEFORE_PRESENTING, BEFORE_PRESENTING_FACULTY, GUIDE_STEPS, GUIDE_TOTAL_LABEL, QUALITY_LOCAL, QUALITY_PENDING, QUALITY_POINTS, ROADMAP, ROADMAP_LOOP, ROADMAP_LOOP_LABEL, ROADMAP_LOOP_NOTE, ROADMAP_PILOT_NOTE, SCOPE_IS, SCOPE_IS_NOT, SWITCH_NOTE, beforePresenting, stepActions, stepNeeds, stepPurpose, type GuideAction, type GuideRole } from '../lib/demo-guide';
import { useDocumentTitle, useNav } from '../ui/common';

/** Brings a section of this page into view and puts keyboard focus on its heading (no animation: motion-safe by construction). */
function jumpTo(id: string) {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
}

/**
 * The guide data in lib/demo-guide.ts stays English. It is translated here, at render time (never at module load).
 * Every button or screen name the guide quotes goes through t() with the SAME English label the app uses, so the French guide
 * quotes the French label the French interface really shows.
 */
const GUEST_NAME: Record<GuideRole, () => string> = { student: () => t('student guest'), teacher: () => t('Faculty guest') };

const L = {
  faculty: () => t('Faculty guest'),
  back: () => t('Return to student demo'),
  options: () => t('Guest options'),
  reset: () => t('Reset guest session'),
  confirm: () => t('Confirm reset'),
  mark: () => t('Mark reviewed'),
  review: () => t('Content review'),
  approve: () => t('Approve'),
  draft: () => t('Return to draft'),
  noReview: () => t('No review recorded yet.').replace(/\.$/, ''),
  // The review row reads "Now <status>" (a template of the faculty screen): the text is passed as a value, so the French row is quoted as it is shown.
  nowDraft: () => t(NOW_DRAFT),
  blood: () => t('Blood Smear Code'),
  fix: () => t('Fix the Sample'),
  micro: () => t('Microbe Detective'),
  anemia: () => t('Anemia Detective'),
};
const NOW_DRAFT = 'Now draft';

/** Sentences of the guide that quote labels of the app: the English constant is the key, the sentence is rebuilt with placeholders. */
const labelled = new Map<string, () => string>();
const sentence = (english: string | undefined, build: () => string) => { if (english !== undefined) labelled.set(english, build); };
const stepOf = (id: string) => GUIDE_STEPS.find((step) => step.id === id);
const FACULTY_DATA = () => t('The students, classes and results there are generated demonstration data, not real learners.');

sentence(BEFORE_PRESENTING.items[1], () => t('To start from the prepared state, click {reset}, then {confirm} (on a phone, in {options}), then reopen this page.', { reset: L.reset(), confirm: L.confirm(), options: L.options() }));
sentence(BEFORE_PRESENTING.items[2], () => t('Do not click {mark} or change a {review} status during a demonstration: that state persists and would contradict the validation statements on this page.', { mark: L.mark(), review: L.review() }));
sentence(BEFORE_PRESENTING.items[3], () => t('The Faculty-side reset is not available in the interface. To put the {review} back to its prepared state, ask the developer to reset the demo data.', { review: L.review() }));
sentence(BEFORE_PRESENTING_FACULTY.items[0], () => t('There is no {reset} button in the {faculty}. To start from the prepared state, choose {back} (on a phone, in {options}), click {reset} and {confirm} there, then come back with {faculty} and reopen this page.', { reset: L.reset(), faculty: L.faculty(), back: L.back(), options: L.options(), confirm: L.confirm() }));
sentence(BEFORE_PRESENTING_FACULTY.items[3], () => t('If a status was changed by accident, the interface can put it back to draft: {approve}, then {draft}. The row then reads “{nowDraft}” with a date instead of “{noReview}”: a trace of the change remains.', { approve: L.approve(), draft: L.draft(), nowDraft: L.nowDraft(), noReview: L.noReview() }));
sentence(BEFORE_PRESENTING_FACULTY.items[4], () => t('The full {review} reset is not available in the interface: ask the developer to reset the demo data.', { review: L.review() }));
sentence(SWITCH_NOTE, () => t('Use the {faculty} button (in the sidebar, or in {options} on a phone).', { faculty: L.faculty(), options: L.options() }));
sentence(stepOf('mission')?.purpose, () => t('In the Hematology lab, replay the mission {mission} (the demo student has already completed it). Observe the illustrative blood smear and point to the finding.', { mission: L.blood() }));
sentence(stepOf('decision')?.purpose, () => t('In the same lab, replay the mission {mission}, a pre-analytical decision (also already completed by the demo student). Decide, and make a mistake on purpose.', { mission: L.fix() }));
sentence(stepOf('decision')?.hint, () => t('The rule of the game is that {fix} opens once {blood} is completed. Here nothing is locked because the demo data is prepared; in a new account {fix} stays locked until {blood} is completed.', { fix: L.fix(), blood: L.blood() }));
sentence(stepOf('feedback')?.purpose, () => t('In {fix}, ask for a hint and note that it costs XP. Give a wrong answer: the feedback does not state the answer (some ordering and matching steps show how many items are in place). Retry. The server records the score and the time.', { fix: L.fix() }));
sentence(stepOf('feedback')?.hint, () => t('Do this in the decision step of {fix}, the suggested place for a hint plus a wrong answer plus a retry. If that mission is unavailable, use {micro} or {anemia}. {blood} also accepts a wrong answer and a retry; it simply ends on its first correct answer.', { fix: L.fix(), micro: L.micro(), anemia: L.anemia(), blood: L.blood() }));
sentence(stepOf('faculty')?.purpose, () => `${t('Switch to the {faculty}, then show the class analytics, the roster, a student detail and the {review}.', { faculty: L.faculty(), review: L.review() })} ${FACULTY_DATA()}`);
sentence(stepOf('faculty')?.purposeHere, () => `${t('Show the class analytics, the roster, a student detail and the {review}.', { review: L.review() })} ${FACULTY_DATA()} ${t('Look, but do not change any review status.')}`);
sentence(QUALITY_POINTS.find((point) => point.title === 'Accessibility testing')?.text, () => t('Not yet tested with a real screen reader; the {mission} mission has no non-visual alternative.', { mission: L.blood() }));

/** The French or English text of a sentence of the guide data. */
const say = (english: string): string => (labelled.get(english) ?? (() => t(english)))();

/** "about 30 s" / "about 1 min" / "about 1 min 15 s". */
function timeLabel(seconds: number): string {
  if (seconds < 60) return t('about {n} s', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? t('about {n} min', { n: minutes }) : t('about {n} min {s} s', { n: minutes, s: rest });
}

/**
 * About & demo guide: a static page for both roles. It issues no request and stores nothing; its buttons only use the app's own
 * navigation (the lab map, a laboratory's mission picker, the Progress vault, the faculty screens) and never start an attempt.
 */
export function About({ role }: { role: GuideRole }) {
  useDocumentTitle('About & demo guide');
  useLang();
  const nav = useNav();
  const prepare = beforePresenting(role);
  const run = (action: GuideAction) => {
    if (action.kind === 'go') nav.go(action.view);
    else if (action.kind === 'lab') nav.openLab(action.slug);
    else jumpTo(action.id);
  };
  return (
    <div className="about">
      <div className="about-head">
        <div className="eyebrow">{t('Serious game for biomedical laboratory training')}</div>
        <h1>{t('About Escape Lab')}</h1>
        <p className="about-principle">{t('Biomedical education first. Technology supports learning.')}</p>
        <p className="about-lede">
          {t('Escape Lab is a safe virtual environment where biomedical laboratory students reason, decide, make mistakes, get feedback, retry and progress before real laboratory practice.')}
        </p>
      </div>

      <section className="about-section" aria-labelledby="about-scope">
        <h2 id="about-scope">{t('What it is, and what it is not')}</h2>
        <div className="about-scope">
          <div className="about-card is">
            <h3>{t('Escape Lab is')}</h3>
            <ul>{SCOPE_IS.map((text) => <li key={text}><Check size={16} aria-hidden="true" /><span>{say(text)}</span></li>)}</ul>
          </div>
          <div className="about-card isnt">
            <h3>{t('Escape Lab is not')}</h3>
            <ul>{SCOPE_IS_NOT.map((text) => <li key={text}><Minus size={16} aria-hidden="true" /><span>{say(text)}</span></li>)}</ul>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-demo">
        <div className="about-title-row">
          <h2 id="about-demo">{t('A guided demonstration')}</h2>
          <span className="about-chip">{say(GUIDE_TOTAL_LABEL)}</span>
        </div>
        <p className="about-intro">
          {role === 'teacher'
            ? t('You are in the {guest}. Steps 1, 7 and 8 work here; for the student steps, choose {back} (on a phone, in {options}).', { guest: GUEST_NAME.teacher(), back: L.back(), options: L.options() })
            : t('You are in the {guest}. Steps 1 to 6 and 8 work here; for step 7, choose {faculty} (on a phone, in {options}). Nothing on this page starts a mission. After a mission or a guest switch, reopen this page from the navigation.', { guest: GUEST_NAME.student(), faculty: L.faculty(), options: L.options() })}
        </p>
        <div className="about-prepare" role="group" aria-labelledby="about-prepare-title">
          <h3 id="about-prepare-title">{t(prepare.title)}</h3>
          <ul>{prepare.items.map((text) => <li key={text}>{say(text)}</li>)}</ul>
        </div>
        <ol className="about-steps" role="list">
          {GUIDE_STEPS.map((step, index) => {
            const needs = stepNeeds(step, role);
            const actions = stepActions(step, role);
            return (
              <li className={`about-step${needs ? ' elsewhere' : ''}${step.id === 'concept' ? ' here' : ''}`} key={step.id}>
                <span className="about-step-n" aria-hidden="true">{index + 1}</span>
                <div className="about-step-body">
                  <h3>{t(step.title)}</h3>
                  <p>{say(stepPurpose(step, role))}</p>
                  {step.hint && <p className="about-step-hint">{say(step.hint)}</p>}
                  <div className="about-step-foot">
                    <span className="about-chip quiet">{timeLabel(step.seconds)}</span>
                    {step.id === 'concept' && <span className="about-chip here">{t('You are here')}</span>}
                    {needs && <span className="about-chip needs">{t('In the {guest}', { guest: GUEST_NAME[needs]() })}</span>}
                    {step.guest === 'teacher' && role === 'teacher' && <span className="about-chip here">{t('You are in the {guest}', { guest: GUEST_NAME.teacher() })}</span>}
                    {step.guest === 'teacher' && role === 'student' && <span className="about-step-note">{say(SWITCH_NOTE)}</span>}
                    {actions.map((action) => (
                      <button type="button" className="ghost about-open" key={action.label} disabled={nav.busy} onClick={() => run(action)}>
                        {t(action.label)} <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="about-section" aria-labelledby="about-quality">
        <h2 id="about-quality" tabIndex={-1}>{t('How quality is assured')}</h2>
        <p className="about-intro">{t('What has been checked so far, said plainly, and what has not.')}</p>
        <dl className="about-points">
          {QUALITY_POINTS.map((point) => (
            <div key={point.title}><dt>{t(point.title)}</dt><dd>{say(point.text)}</dd></div>
          ))}
        </dl>
        <div className="about-states">
          <div className="about-card verified">
            <span className="about-state">{t('Local only')}</span>
            <h3>{t('Technically verified locally')}</h3>
            <ul>{QUALITY_LOCAL.map((text) => <li key={text}><Check size={16} aria-hidden="true" /><span>{say(text)}</span></li>)}</ul>
          </div>
          <div className="about-card pending">
            <span className="about-state">{t('Required before teaching use')}</span>
            <h3>{t('Not yet biomedically validated')}</h3>
            <p>{t('These have not been reviewed by qualified biomedical experts or educators. They must be, before any teaching use.')}</p>
            <ul>{QUALITY_PENDING.map((text) => <li key={text}><Minus size={16} aria-hidden="true" /><span>{say(text)}</span></li>)}</ul>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-roadmap">
        <div className="about-title-row">
          <h2 id="about-roadmap" tabIndex={-1}>{t('Scientific validation roadmap')}</h2>
          <span className="about-chip planned">{t('Planned, not done')}</span>
        </div>
        <p className="about-intro">{`${t('Five phases are planned, not agreed or approved. None of them has been carried out yet.')} ${say(ROADMAP_PILOT_NOTE)}`}</p>
        <h3 className="about-loop-title">{t(ROADMAP_LOOP_LABEL)}</h3>
        <p className="about-loop-note">{t(ROADMAP_LOOP_NOTE)}</p>
        <ol className="about-loop" role="list" aria-label={t(ROADMAP_LOOP_LABEL)}>
          {ROADMAP_LOOP.map((stage) => (
            <li key={stage.verb}><b>{t(stage.verb)}</b>{' '}<span>{stage.where}</span></li>
          ))}
        </ol>
        <ol className="about-roadmap" role="list">
          {ROADMAP.map((phase) => (
            <li key={phase.id}>
              <span className="about-phase-n" aria-hidden="true">{phase.letter}</span>
              <div>
                <h3>{t(phase.title)}</h3>
                <p>{t(phase.text)}</p>
              </div>
              <span className="about-chip planned">{t('PLANNED')}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="about-foot">{t(ABOUT_FOOT)}</p>
    </div>
  );
}
