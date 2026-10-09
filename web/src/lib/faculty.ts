import { normalizeCompetencies, type Competencies } from './competency';
import { PayloadError, arr, bool, nonNeg, nullable, optional, pct, rec, str } from './guard';
import { t } from '../i18n';

export type FacultyClass = { id: number; name: string; students: number };

export function normalizeClasses(payload: unknown): FacultyClass[] {
  const root = rec(payload, 'classes');
  return arr(root.classes, 'classes', 'classes').map((item) => {
    const row = rec(item, 'classes', 'class');
    return { id: nonNeg(row.id, 'classes', 'class.id'), name: str(row.name, 'classes', 'class.name'), students: nonNeg(row.students, 'classes', 'class.students') };
  });
}

export type FacultyMissionSignal = { missionId: string; title: string; labSlug: string; successPct: number | null; studentsCompleted: number; needsAttention: boolean };
export type FacultyDashboard = {
  className: string;
  cohort: { students: number; avgCompletionPct: number; needsAttention: number };
  missions: FacultyMissionSignal[];
};

const F = 'faculty dashboard';
export function normalizeFacultyDashboard(payload: unknown): FacultyDashboard {
  const root = rec(payload, F);
  const cohort = rec(root.cohort, F, 'cohort');
  const cls = rec(root.class, F, 'class');
  return {
    className: str(cls.name, F, 'class.name'),
    cohort: {
      students: nonNeg(cohort.students, F, 'cohort.students'),
      avgCompletionPct: pct(cohort.avgCompletionPct, F, 'cohort.avgCompletionPct'),
      needsAttention: ((): number => {
        const flagged = nonNeg(cohort.needsAttention, F, 'cohort.needsAttention');
        if (flagged > nonNeg(cohort.students, F, 'cohort.students')) throw new PayloadError(`Invalid server ${F} payload: cohort.needsAttention.`);
        return flagged;
      })(),
    },
    missions: arr(root.missions, F, 'missions').map((item) => {
      const row = rec(item, F, 'mission');
      // More students finishing a mission than the class holds is a contradiction, not a figure.
      if (nonNeg(row.studentsCompleted, F, 'mission.studentsCompleted') > nonNeg(cohort.students, F, 'cohort.students')) throw new PayloadError(`Invalid server ${F} payload: mission.studentsCompleted.`);
      return {
        missionId: str(row.missionId, F, 'mission.missionId'),
        title: str(row.title, F, 'mission.title'),
        labSlug: str(row.labSlug, F, 'mission.labSlug'),
        successPct: nullable(row.successPct, (v) => pct(v, F, 'mission.successPct')),
        studentsCompleted: nonNeg(row.studentsCompleted, F, 'mission.studentsCompleted'),
        needsAttention: bool(row.needsAttention, F, 'mission.needsAttention'),
      };
    }),
  };
}

export type FacultyStudent = { id: number; name: string; accuracyPct: number | null; progressPct: number; needsAttention: boolean; attentionReason: string | null };
export type FacultyRoster = { total: number; students: FacultyStudent[] };

const readStudent = (item: unknown, label: string): FacultyStudent => {
  const row = rec(item, label, 'student');
  const needsAttention = bool(row.needsAttention, label, 'student.needsAttention');
  return {
    id: nonNeg(row.id, label, 'student.id'),
    name: str(row.name, label, 'student.name'),
    accuracyPct: nullable(row.accuracyPct, (v) => pct(v, label, 'student.accuracyPct')),
    progressPct: pct(row.progressPct, label, 'student.progressPct'),
    needsAttention,
    // A student flagged for attention comes with the server's reason: the page never writes one itself.
    attentionReason: needsAttention ? str(row.attentionReason, label, 'student.attentionReason') : nullable(row.attentionReason, (v) => str(v, label, 'student.attentionReason')),
  };
};

export function normalizeRoster(payload: unknown): FacultyRoster {
  const root = rec(payload, 'roster');
  return { total: nonNeg(root.total, 'roster', 'total'), students: arr(root.students, 'roster', 'students').map((item) => readStudent(item, 'roster')) };
}

export type FacultyStudentDetail = {
  student: FacultyStudent & { level: number; xp: number; missionsCompleted: number; hintsUsed: number };
  labs: Array<{ slug: string; name: string; completed: number; total: number; accuracyPct: number | null; escaped: boolean }>;
  competencies: Competencies;
  history: Array<{ missionId: string; title: string; score: number; answersSubmitted: number; wrongAnswers: number; hintsUsed: number; elapsed: string; completedAt: number }>;
  /** How many completed attempts the student has in all, when the server says so (the list itself may be shorter); null when it does not. */
  historyTotal: number | null;
};

const S = 'student detail';
export function normalizeStudentDetail(payload: unknown): FacultyStudentDetail {
  const root = rec(payload, S);
  const student = rec(root.student, S, 'student');
  const history = arr(root.history, S, 'history').map((item) => {
    const row = rec(item, S, 'history');
    return {
      missionId: str(row.missionId, S, 'history.missionId'),
      title: str(row.title, S, 'history.title'),
      score: nonNeg(row.score, S, 'history.score'),
      answersSubmitted: nonNeg(row.answersSubmitted, S, 'history.answersSubmitted'),
      wrongAnswers: nonNeg(row.wrongAnswers, S, 'history.wrongAnswers'),
      hintsUsed: nonNeg(row.hintsUsed, S, 'history.hintsUsed'),
      elapsed: str(row.elapsed, S, 'history.elapsed'),
      completedAt: nonNeg(row.completedAt, S, 'history.completedAt'),
    };
  });
  // The total of attempts is optional (absent or null means the server did not say): when present it is a whole number that can
  // not be smaller than the rows it sits beside. Anything else is a broken payload, never a figure to print.
  const historyTotal = ((): number | null => {
    const value = root.historyTotal;
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < history.length) throw new PayloadError(`Invalid server ${S} payload: historyTotal.`);
    // The list is the latest attempts of that total: attempts cannot exist and be absent from it altogether.
    if (history.length === 0 && value > 0) throw new PayloadError(`Invalid server ${S} payload: historyTotal.`);
    return value;
  })();
  const detail: FacultyStudentDetail = {
    student: {
      ...readStudent(student, S),
      level: ((): number => {
        // Levels start at 1 and are whole numbers: "Level 0" or "Level 2.5" can only be a broken payload.
        const level = nonNeg(student.level, S, 'student.level');
        if (!Number.isSafeInteger(level) || level < 1) throw new PayloadError(`Invalid server ${S} payload: student.level.`);
        return level;
      })(),
      xp: nonNeg(student.xp, S, 'student.xp'),
      missionsCompleted: nonNeg(student.missionsCompleted, S, 'student.missionsCompleted'),
      hintsUsed: nonNeg(student.hintsUsed, S, 'student.hintsUsed'),
    },
    labs: arr(root.labs, S, 'labs').map((item, i) => {
      const lab = rec(item, S, `labs[${i}]`);
      return {
        slug: str(lab.slug, S, 'labs.slug'),
        name: str(lab.name, S, 'labs.name'),
        ...((): { completed: number; total: number } => {
          const completed = nonNeg(lab.completed, S, 'labs.completed');
          const total = nonNeg(lab.total, S, 'labs.total');
          if (completed > total) throw new PayloadError(`Invalid server ${S} payload: labs.completed.`);
          return { completed, total };
        })(),
        accuracyPct: nullable(lab.accuracyPct, (v) => pct(v, S, 'labs.accuracyPct')),
        escaped: bool(lab.escaped, S, 'labs.escaped'),
      };
    }),
    competencies: normalizeCompetencies(root, S),
    historyTotal,
    history,
  };
  // The standard labs partition the completed missions: the two figures come from one count on the server and must agree.
  if (detail.student.missionsCompleted !== detail.labs.reduce((sum, lab) => sum + lab.completed, 0)) throw new PayloadError(`Invalid server ${S} payload: student.missionsCompleted.`);
  return detail;
}

/**
 * The name as a reader compares it. Invisible format characters (zero-width space, soft hyphen, bidi controls) change nothing a reader sees, so they never tell two names apart.
 * Look-alike letters from other scripts are NOT folded here: that table lives on the server. Blank-looking characters that take room (Hangul fillers, Braille blank,
 * half-width filler) read as a space; the other default-ignorable ones draw nothing. Accents are folded where an accent is decoration (Latin, Greek, Cyrillic, and the vowel
 * points of Arabic and Hebrew), as is a stray mark with no letter before it; the marks of every other script (Devanagari vowel signs, Thai, Hangul) are part of the letter and
 * stay significant. The Cyrillic letters й, ї and ў are kept whole (ё is folded to е, as on the server). Hangul is only composed (a syllable and its conjoining jamo are the same glyphs), never taken apart, and compatibility jamo stay what they are.
 */
const FOLDED_SCRIPTS = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}]/u;
function foldName(name: string): string {
  let out = '';
  let marksCount = false;
  for (const ch of name.replace(/[\u115f\u1160\u2800\u3164\uffa0]/gu, ' ').normalize('NFC')) {
    // Hangul is never taken apart, and neither are the Cyrillic letters that are letters of their own, not an accented base: й, ї and ў differ from и, і and у.
    const parts = /[\p{Script=Hangul}\u0419\u0439\u0407\u0457\u040e\u045e]/u.test(ch) ? [ch] : [...ch.normalize('NFKD')];
    for (const part of parts) {
      if (/[\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(part)) continue;
      if (/\p{M}/u.test(part)) {
        if (marksCount) out += part;
        continue;
      }
      marksCount = /\p{L}/u.test(part) && !FOLDED_SCRIPTS.test(part);
      out += part;
    }
  }
  return out.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en');
}

/**
 * Students whose names collide (same name as the browser and the roster search read it: case, accents, compatibility forms and runs of space ignored) get the server student number as a short
 * discriminator ("#12"), so a teacher can tell two "Alex Martin" apart. Unique names get no tag. Nothing is invented: the id is in the payload.
 */
export function nameTags(students: ReadonlyArray<{ id: number; name: string }>): Map<number, string> {
  const counts = new Map<string, number>();
  for (const s of students) counts.set(foldName(s.name), (counts.get(foldName(s.name)) ?? 0) + 1);
  return new Map(students.filter((s) => (counts.get(foldName(s.name)) ?? 0) > 1).map((s) => [s.id, `#${s.id}`]));
}

/** A stored name as every screen spells it: bidi control characters are dropped, so no surface reorders it differently from another. Callers keep the bdi wrapper. */
export function displayName(name: string): string {
  return name.replace(/\p{Bidi_Control}/gu, '');
}

/**
 * A name as plain text inside a longer label (an option cannot hold markup). Bidi control characters are dropped, and a name that can
 * pull the text around it into its own direction (it held such a control, or it has right-to-left letters) is wrapped in first-strong
 * isolate characters, so nothing in a stored name reorders the tag that follows it. Any other name is returned as it is.
 */
export function isolatedName(name: string): string {
  const stripped = displayName(name);
  const needsIsolate = stripped !== name || /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(name);
  return needsIsolate ? `\u2068${stripped}\u2069` : name;
}

/** The two cohort figures that are meaningless for a class without students: they show a no-data state, never a measured-looking 0%. */
export function cohortSummary(cohort: FacultyDashboard['cohort']): { completion: { value: string; detail: string }; attention: { value: string; detail: string } } {
  // Called while rendering: the details are shown in the display language.
  if (cohort.students === 0) return { completion: { value: '—', detail: t('No students yet') }, attention: { value: '—', detail: t('No students yet') } };
  return {
    completion: { value: `${cohort.avgCompletionPct}%`, detail: t('Average across the class') },
    attention: { value: String(cohort.needsAttention), detail: cohort.needsAttention === 0 ? t('No follow-up flagged') : t('Follow-up recommended') },
  };
}

/**
 * Display order only (no verdict): standard missions first, the one the server flagged leading them, then the lowest success first and
 * missions without data last. The Master Lab mission is never counted in class figures, so it is listed after all standard missions.
 */
export function rankMissions(missions: readonly FacultyMissionSignal[]): FacultyMissionSignal[] {
  return [...missions].sort((a, b) => Number(a.labSlug === 'master') - Number(b.labSlug === 'master') || Number(b.needsAttention) - Number(a.needsAttention) || (a.successPct ?? 101) - (b.successPct ?? 101));
}
