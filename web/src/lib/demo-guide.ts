import type { View } from '../ui/common';

/** Static content of the About & demo guide page. Plain data: no request, no storage, nothing that is computed by the server. */
export type GuideRole = 'student' | 'teacher';

export type GuideAction =
  | { kind: 'go'; view: View; label: string }
  | { kind: 'lab'; slug: string; label: string }
  | { kind: 'anchor'; id: string; label: string };

export type GuideStep = {
  id: string;
  title: string;
  purpose: string;
  /** Approximate time on the step, in seconds. */
  seconds: number;
  /** Which guest the step is performed in; null when it works in either. */
  guest: GuideRole | null;
  student: GuideAction[];
  teacher: GuideAction[];
  /** Presenter hint, shown under the purpose. */
  hint?: string;
  /** What the step says when the viewer is already in the guest it needs (the default is purpose). */
  purposeHere?: string;
};

/** Said in step 7 and on every faculty screen: the Faculty guest reads generated data. */
const FACULTY_DATA_SENTENCE = 'The students, classes and results there are generated demonstration data, not real learners.';

const HEMATOLOGY: GuideAction = { kind: 'lab', slug: 'hematology', label: 'Open the Hematology lab' };

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'concept',
    title: 'The concept',
    purpose: 'Read the principle and the boundaries of Escape Lab on this page: what it is for, and what it is not.',
    seconds: 30,
    guest: null,
    student: [],
    teacher: [],
  },
  {
    id: 'choose',
    title: 'Choose an investigation',
    purpose: 'Open the lab map and show how the laboratories are organised by discipline.',
    seconds: 30,
    guest: 'student',
    student: [{ kind: 'go', view: 'labs', label: 'Open the lab map' }],
    teacher: [],
  },
  {
    id: 'mission',
    title: 'Open one biomedical mission',
    purpose: 'In the Hematology lab, replay the mission Blood Smear Code (the demo student has already completed it). Observe the illustrative blood smear and point to the finding.',
    seconds: 60,
    guest: 'student',
    student: [HEMATOLOGY],
    teacher: [],
    hint: 'A mission starts from the mission picker, not from this page.',
  },
  {
    id: 'decision',
    title: 'The decision-making flow',
    purpose: 'In the same lab, replay the mission Fix the Sample, a pre-analytical decision (also already completed by the demo student). Decide, and make a mistake on purpose.',
    seconds: 60,
    guest: 'student',
    student: [HEMATOLOGY],
    teacher: [],
    hint: 'The rule of the game is that Fix the Sample opens once Blood Smear Code is completed. Here nothing is locked because the demo data is prepared; in a new account Fix the Sample stays locked until Blood Smear Code is completed.',
  },
  {
    id: 'feedback',
    title: 'Immediate feedback and retry',
    purpose: 'In Fix the Sample, ask for a hint and note that it costs XP. Give a wrong answer: the feedback does not state the answer (some ordering and matching steps show how many items are in place). Retry. The server records the score and the time.',
    seconds: 60,
    guest: 'student',
    student: [],
    teacher: [],
    hint: 'Do this in the decision step of Fix the Sample, the suggested place for a hint plus a wrong answer plus a retry. If that mission is unavailable, use Microbe Detective or Anemia Detective. Blood Smear Code also accepts a wrong answer and a retry; it simply ends on its first correct answer.',
  },
  {
    id: 'progress',
    title: 'Progress, fragments and unlock',
    purpose: 'Show the code fragments earned and the Code Vault, where the full code opens the laboratory exit.',
    seconds: 45,
    guest: 'student',
    student: [{ kind: 'go', view: 'progress', label: 'Open the Progress vault' }],
    teacher: [],
    hint: 'In the prepared demo data the Hematology vault may already be unlocked: this step shows it rather than opening it.',
  },
  {
    id: 'faculty',
    title: 'The faculty dashboard',
    purpose: `Switch to the Faculty guest, then show the class analytics, the roster, a student detail and the Content review. ${FACULTY_DATA_SENTENCE}`,
    purposeHere: `Show the class analytics, the roster, a student detail and the Content review. ${FACULTY_DATA_SENTENCE} Look, but do not change any review status.`,
    seconds: 75,
    guest: 'teacher',
    student: [],
    teacher: [
      { kind: 'go', view: 'teacher', label: 'Open Faculty analytics' },
      { kind: 'go', view: 'content', label: 'Open Content review' },
    ],
    hint: 'A student detail opens from a row of the roster.',
  },
  {
    id: 'quality',
    title: 'Quality, validation and roadmap',
    purpose: 'Close with what has been verified so far, what has not, and how scientific validation is planned.',
    seconds: 30,
    guest: null,
    student: [
      { kind: 'anchor', id: 'about-quality', label: 'Go to quality' },
      { kind: 'anchor', id: 'about-roadmap', label: 'Go to roadmap' },
    ],
    teacher: [
      { kind: 'anchor', id: 'about-quality', label: 'Go to quality' },
      { kind: 'anchor', id: 'about-roadmap', label: 'Go to roadmap' },
    ],
  },
];

/** The text of a step for the guest that is looking at the page. */
export const stepPurpose = (step: GuideStep, role: GuideRole): string => (step.purposeHere !== undefined && step.guest === role ? step.purposeHere : step.purpose);

/** What the step times leave out, and what to cut for a five minute version. */
export const TIMING_NOTE = 'The time on each step does not include the navigation between steps (this page is reopened after each mission and each guest switch): plan about 7 minutes. For 5 minutes, skip step 2 and stop step 5 after the retry, which means not seeing the result screen of step 5, where the server records the score and the time.';

const PREPARED_NOTE = 'The demo student is prepared: its level, XP and completed missions already exist, so you replay missions instead of unlocking them. A replay adds XP only when it beats the best score of that mission (only a new personal best adds XP), and every rehearsal adds attempts to the student’s history until the next reset.';
const MARK_REVIEWED_NOTE = 'Do not click Mark reviewed or change a Content review status during a demonstration: that state persists and would contradict the validation statements on this page.';

/** For a student guest: the reset button exists in the sidebar, or in Guest options on a phone. */
export const BEFORE_PRESENTING = {
  title: 'Before you present',
  items: [
    PREPARED_NOTE,
    'To start from the prepared state, click Reset guest session, then Confirm reset (on a phone, in Guest options), then reopen this page.',
    MARK_REVIEWED_NOTE,
    'The Faculty-side reset is not available in the interface. To put the Content review back to its prepared state, ask the developer to reset the demo data.',
    TIMING_NOTE,
  ],
};

/** For a Faculty guest: it has no Reset guest session button, so the preparation goes through the student guest. */
export const BEFORE_PRESENTING_FACULTY = {
  title: 'Before you present',
  items: [
    'There is no Reset guest session button in the Faculty guest. To start from the prepared state, choose Return to student demo (on a phone, in Guest options), click Reset guest session and Confirm reset there, then come back with Faculty guest and reopen this page.',
    PREPARED_NOTE,
    MARK_REVIEWED_NOTE,
    'If a status was changed by accident, the interface can put it back to draft: Approve, then Return to draft. The row then reads “Now draft” with a date instead of “No review recorded yet”: a trace of the change remains.',
    'The full Content review reset is not available in the interface: ask the developer to reset the demo data.',
    TIMING_NOTE,
  ],
};

/** The block that suits the guest reading the page. */
export const beforePresenting = (role: GuideRole) => (role === 'teacher' ? BEFORE_PRESENTING_FACULTY : BEFORE_PRESENTING);

/** Under step 7 for a student guest: the button exists in the sidebar, or in Guest options on a phone. */
export const SWITCH_NOTE = 'Use the Faculty guest button (in the sidebar, or in Guest options on a phone).';

export const GUIDE_TOTAL_LABEL = 'about 7 minutes with navigation';
export const guideTotalSeconds = () => GUIDE_STEPS.reduce((sum, step) => sum + step.seconds, 0);

/** "about 30 s" / "about 1 min" / "about 1 min 15 s". */
export function approxTime(seconds: number): string {
  if (seconds < 60) return `about ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `about ${minutes} min` : `about ${minutes} min ${rest} s`;
}

/** The buttons a step offers to the guest that is looking at the page. */
export const stepActions = (step: GuideStep, role: GuideRole): GuideAction[] => (role === 'teacher' ? step.teacher : step.student);

/** The guest the learner must switch to before the step works; null when the current guest is the right one. */
export const stepNeeds = (step: GuideStep, role: GuideRole): GuideRole | null => (step.guest !== null && step.guest !== role ? step.guest : null);

export const SCOPE_IS = [
  'A safe virtual place to reason, decide and make mistakes.',
  'Immediate feedback, then the chance to retry and progress before real laboratory practice.',
  'Gamification (code fragments, the Code Vault, the exit) that serves the learning, not the reverse.',
];

export const SCOPE_IS_NOT = [
  'A replacement for teachers, laboratory placements, real laboratory practice or biomedical experts.',
  'A diagnostic tool, or clinical guidance of any kind.',
  'A source of clinical or diagnostic images or reference: images are illustrative training material only.',
];

export const QUALITY_POINTS = [
  { title: 'The server decides', text: 'Scoring, the timer, hints and unlocks are decided by the server. The browser only displays what the server decides.' },
  { title: 'Automated tests', text: 'Automated tests cover the server and the interface, and they run locally.' },
  { title: 'Adversarial audits by AI agents', text: 'Repeated adversarial audits, carried out by AI review agents of the project team, tried to break the application. They are not an external or independent human review. They also run locally.' },
  { title: 'Local validation only', text: 'All validation so far is local: no remote continuous-integration run, and no independent human security or accessibility review.' },
  { title: 'Accessibility testing', text: 'Not yet tested with a real screen reader; the Blood Smear Code mission has no non-visual alternative.' },
];

export const QUALITY_LOCAL = [
  'Scoring, timer, hints and unlocks are decided by the server and exercised by automated tests.',
  'The browser displays what the server decides; it does not compute it.',
  'Automated tests and adversarial audits (by AI review agents of the project team) were run, locally.',
];

export const QUALITY_PENDING = [
  'Questions, answers, explanations and hints.',
  'Clinical interpretations, values and units.',
  'Images, including their provenance and licensing, and the pedagogical effectiveness of the game.',
];

export type RoadmapPhase = { id: string; letter: string; title: string; text: string };

export const ROADMAP: RoadmapPhase[] = [
  { id: 'expert-review', letter: 'A', title: 'Biomedical expert review', text: 'Qualified experts review every mission, value, unit, answer, hint and image.' },
  { id: 'educator-validation', letter: 'B', title: 'Educator validation', text: 'Educators validate the difficulty, the feedback and the scoring.' },
  { id: 'student-pilot', letter: 'C', title: 'Small student pilot', text: 'A pre-test, a period of use of Escape Lab, then a post-test. It would require ethics and data-protection approval.' },
  { id: 'usability', letter: 'D', title: 'Usability and engagement', text: 'Evaluation of usability and engagement, with an analysis of the errors students make.' },
  { id: 'refinement', letter: 'E', title: 'Refinement and transfer', text: 'Refine the content and the game from the findings, then transfer them to other teaching contexts.' },
];

export const ROADMAP_LOOP = [
  { verb: 'Create', where: 'Monastir' },
  { verb: 'Observe & Learn', where: 'HEPL / Liège' },
  { verb: 'Validate & Transfer', where: 'Monastir' },
];

export const ROADMAP_LOOP_LABEL = 'Proposed academic direction';
export const ROADMAP_LOOP_NOTE = 'This is a proposal, not an agreement: the roles of the institutions still have to be confirmed by them.';
export const ROADMAP_PILOT_NOTE = 'A pilot with students would require ethics and data-protection approval.';

export const ABOUT_FOOT = 'Images in this prototype are presented as illustrative training material, not as clinical or diagnostic reference. Their provenance and licensing still have to be documented and reviewed before any teaching use. This is a teaching prototype, not a medical device or diagnostic tool.';
