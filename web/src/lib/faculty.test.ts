import { describe, expect, it } from 'vitest';
import { analyticsPayload, classesPayload, clone, rosterPayload, studentDetailPayload } from './fixtures';
import { cohortSummary, displayName, isolatedName, nameTags, normalizeClasses, normalizeFacultyDashboard, normalizeRoster, normalizeStudentDetail, rankMissions } from './faculty';

describe('faculty classes and analytics', () => {
  it('reads classes, including an empty list', () => {
    expect(normalizeClasses(classesPayload())[0]).toEqual({ id: 1, name: 'L3 Biomedical Sciences', students: 38 });
    expect(normalizeClasses({ classes: [] })).toEqual([]);
    expect(() => normalizeClasses({})).toThrow('classes');
    expect(() => normalizeClasses({ classes: [{ id: 1, name: 'x' }] })).toThrow('students');
  });
  it('reads the cohort and the mission signal; null success stays null', () => {
    const a = normalizeFacultyDashboard(analyticsPayload());
    expect(a.cohort).toEqual({ students: 38, avgCompletionPct: 62, needsAttention: 4 });
    expect(a.missions[0]).toMatchObject({ missionId: 'bio-03', successPct: 59, needsAttention: true });
    expect(a.missions[1]!.successPct).toBeNull();
    expect(a.className).toBe('L3 Biomedical Sciences');
  });
  it('does not coerce a missing needsAttention flag to false', () => {
    const bad = clone(analyticsPayload());
    delete (bad.missions[0] as Record<string, unknown>).needsAttention;
    expect(() => normalizeFacultyDashboard(bad)).toThrow('needsAttention');
    for (const field of ['cohort', 'missions', 'class']) {
      const x = clone(analyticsPayload()) as Record<string, unknown>;
      delete x[field];
      expect(() => normalizeFacultyDashboard(x)).toThrow();
    }
    const noCohortField = clone(analyticsPayload());
    delete (noCohortField.cohort as Record<string, unknown>).needsAttention;
    expect(() => normalizeFacultyDashboard(noCohortField)).toThrow('needsAttention');
  });
});

describe('roster and student detail', () => {
  it('reads the roster with its total, so the UI can say "showing N of M"', () => {
    const r = normalizeRoster(rosterPayload());
    expect(r.total).toBe(38);
    expect(r.students[0]).toMatchObject({ id: 5, name: 'Inès Moreau', accuracyPct: 94, needsAttention: false, attentionReason: null });
    expect(() => normalizeRoster({ students: [] })).toThrow('total');
    expect(normalizeRoster({ total: 0, students: [] }).students).toEqual([]);
  });
  it('requires every roster flag', () => {
    for (const field of ['id', 'name', 'accuracyPct', 'progressPct', 'needsAttention', 'attentionReason']) {
      const bad = clone(rosterPayload());
      delete (bad.students[0] as Record<string, unknown>)[field];
      expect(() => normalizeRoster(bad)).toThrow();
    }
  });
  it('reads the student record with no invented program or level', () => {
    const d = normalizeStudentDetail(studentDetailPayload());
    expect(d.student).toMatchObject({ name: 'Inès Moreau', level: 7, xp: 11980, missionsCompleted: 4, hintsUsed: 2 });
    expect(d.student).not.toHaveProperty('program');
    expect(d.history[0]).toMatchObject({ missionId: 'hem-01', score: 168, elapsed: '01:00', completedAt: 5 });
  });
  it('reads the lab and competency breakdown the server returns', () => {
    const d = normalizeStudentDetail(studentDetailPayload());
    expect(d.labs[0]).toEqual({ slug: 'hematology', name: 'Hematology Lab', completed: 3, total: 3, accuracyPct: 97, escaped: true });
    expect(d.labs[1]!.accuracyPct).toBeNull();
    expect(d.competencies.items[1]).toEqual({ name: 'Clinical biochemistry', pct: 61, steps: 2 });
    expect(d.competencies.improvement?.name).toBe('Clinical biochemistry');
    for (const field of ['labs', 'competencies', 'strongest', 'improvement']) {
      const bad = clone(studentDetailPayload()) as Record<string, unknown>;
      delete bad[field];
      expect(() => normalizeStudentDetail(bad)).toThrow();
    }
    const noEscaped = clone(studentDetailPayload());
    delete (noEscaped.labs[0] as Record<string, unknown>).escaped;
    expect(() => normalizeStudentDetail(noEscaped)).toThrow('escaped');
  });
  it('throws on missing student or history fields', () => {
    for (const field of ['level', 'xp', 'missionsCompleted', 'hintsUsed', 'name']) {
      const bad = clone(studentDetailPayload());
      delete (bad.student as Record<string, unknown>)[field];
      expect(() => normalizeStudentDetail(bad)).toThrow();
    }
    for (const field of ['missionId', 'title', 'score', 'answersSubmitted', 'wrongAnswers', 'hintsUsed', 'elapsed', 'completedAt']) {
      const bad = clone(studentDetailPayload());
      delete (bad.history[0] as Record<string, unknown>)[field];
      expect(() => normalizeStudentDetail(bad)).toThrow();
    }
    const { history: _history, ...noHistory } = studentDetailPayload();
    expect(() => normalizeStudentDetail(noHistory)).toThrow('history');
  });
});

describe('audit hardening: faculty flags and percentages', () => {
  it('throws when a student needs attention without a reason', () => {
    const roster = clone(rosterPayload()) as { students: Record<string, unknown>[] };
    Object.assign(roster.students[0]!, { needsAttention: true, attentionReason: null });
    expect(() => normalizeRoster(roster)).toThrow('attentionReason');
  });
  it('throws on a percentage above 100', () => {
    const roster = clone(rosterPayload()) as { students: Record<string, unknown>[] };
    roster.students[0]!.progressPct = 180;
    expect(() => normalizeRoster(roster)).toThrow('progressPct');
  });
});

describe('audit hardening round 3: faculty lab progress', () => {
  it('rejects a laboratory with more completed missions than missions', () => {
    const detail = clone(studentDetailPayload()) as { labs: { completed: number; total: number }[] };
    detail.labs[0]!.completed = detail.labs[0]!.total + 2;
    expect(() => normalizeStudentDetail(detail)).toThrow('completed');
  });
});

describe('same-name students (R9-C-04)', () => {
  const student = (id: number, name: string) => ({ id, name });
  it('tags only the students whose names collide, ignoring case and surrounding space', () => {
    const tags = nameTags([student(3, 'Alex Martin'), student(8, 'Ines Moreau'), student(12, ' alex martin '), student(20, 'Alex Martin')]);
    expect([...tags.entries()]).toEqual([[3, '#3'], [12, '#12'], [20, '#20']]);
  });
  it('R11-C-03: also tags namesakes that differ only by inner whitespace, no-break space, accents or compatibility forms', () => {
    const tags = nameTags([student(1, 'Alex  Martin'), student(2, 'Alex Martin'), student(3, 'Alex\u00a0Martin'), student(4, 'ALEX\tmartin'), student(5, 'Alèx Martin'), student(6, 'Ｂob Lee'), student(7, 'Bob Lee'), student(8, 'Carol Day')]);
    expect([...tags.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(tags.has(8)).toBe(false);
  });
  it('adds nothing when every name is unique', () => {
    expect(nameTags([student(1, 'A B'), student(2, 'C D')]).size).toBe(0);
  });
});

describe('an empty class (R9-C-03)', () => {
  it('shows no-data states instead of a measured-looking 0%', () => {
    expect(cohortSummary({ students: 0, avgCompletionPct: 0, needsAttention: 0 })).toEqual({
      completion: { value: '—', detail: 'No students yet' },
      attention: { value: '—', detail: 'No students yet' },
    });
  });
  it('shows the server figures once a class has students', () => {
    expect(cohortSummary({ students: 38, avgCompletionPct: 62, needsAttention: 4 })).toEqual({
      completion: { value: '62%', detail: 'Average across the class' },
      attention: { value: '4', detail: 'Follow-up recommended' },
    });
    expect(cohortSummary({ students: 5, avgCompletionPct: 0, needsAttention: 0 }).attention.detail).toBe('No follow-up flagged');
  });
});

describe('mission ranking (R9-C-07)', () => {
  const m = (missionId: string, labSlug: string, successPct: number | null, needsAttention = false) => ({ missionId, title: missionId, labSlug, successPct, studentsCompleted: 1, needsAttention });
  it('lists the flagged mission first, then lowest success, no-data last, and the Master mission after every standard one', () => {
    const ranked = rankMissions([m('master-01', 'master', 10), m('a', 'hematology', 80), m('b', 'microbiology', null), m('c', 'biochemistry', 59, true), m('d', 'hematology', 65)]);
    expect(ranked.map((x) => x.missionId)).toEqual(['c', 'd', 'a', 'b', 'master-01']);
  });
});

describe('round 12 names and history', () => {
  it('R12-C-09: namesakes that differ only by a zero-width or other format character are tagged too', () => {
    const tags = nameTags([{ id: 1, name: 'Alex Martin' }, { id: 2, name: 'Al\u200bex Martin' }, { id: 3, name: 'Alex Mar\u00adtin' }, { id: 4, name: '\u202eAlex Martin' }, { id: 5, name: 'Bea Day' }]);
    expect([...tags.keys()]).toEqual([1, 2, 3, 4]);
  });
  it('R12-C-01/02: a name shown as plain text (an option) is isolated when it can disturb its neighbours, and cannot carry bidi controls out of its isolate', () => {
    expect(isolatedName('Bob\u202e')).toBe('\u2068Bob\u2069');
    expect(isolatedName('A\u2069\u202eB')).toBe('\u2068AB\u2069');
    expect(isolatedName('Zed Quinn')).toBe('Zed Quinn');
    expect(isolatedName('\u05d3\u05d5\u05d3')).toBe('\u2068\u05d3\u05d5\u05d3\u2069');
  });
  it('R12-C-07: the history rows keep completedAt and the optional total makes a capped list visible', () => {
    const base = studentDetailPayload();
    expect(normalizeStudentDetail(base).historyTotal).toBeNull();
    expect(normalizeStudentDetail({ ...base, historyTotal: 27 }).historyTotal).toBe(27);
    expect(() => normalizeStudentDetail({ ...base, historyTotal: 'many' })).toThrow('historyTotal');
    expect(normalizeStudentDetail(base).history[0]!.completedAt).toBe(5);
  });
});

describe('round 13 names and history', () => {
  it('R13-C-03: names that differ only by a blank-looking character (Hangul filler, Braille blank, half-width filler) are tagged', () => {
    for (const blank of ['\u3164', '\u2800', '\u115f', '\u1160', '\uffa0']) {
      const tags = nameTags([{ id: 1, name: 'Alex Martin' }, { id: 2, name: `Alex Martin${blank}` }, { id: 3, name: `Alex${blank}Martin` }, { id: 4, name: 'Bea Day' }]);
      expect([...tags.keys()], blank.codePointAt(0)!.toString(16)).toEqual([1, 2, 3]);
    }
  });
  it('R13-C-03: other names stay untagged, and a name made only of blanks does not crash', () => {
    expect(nameTags([{ id: 1, name: 'Alex Martin' }, { id: 2, name: 'Alex Martyn' }]).size).toBe(0);
    expect(nameTags([{ id: 1, name: '\u3164' }, { id: 2, name: '\u2800' }]).size).toBe(2);
  });
  it('R13-C-06: displayName drops bidi controls so every surface spells a student the same way', () => {
    expect(displayName('Eve \u202enathan')).toBe('Eve nathan');
    expect(displayName('\u200f\u0645\u0631\u064a\u0645')).toBe('\u0645\u0631\u064a\u0645');
    expect(displayName('Zed Quinn')).toBe('Zed Quinn');
  });
  it('R13-C-08: historyTotal is a safe integer not below the rows listed; null and absent mean no note; anything else is an invalid payload', () => {
    const base = studentDetailPayload();
    const n = base.history.length;
    expect(normalizeStudentDetail({ ...base, historyTotal: null }).historyTotal).toBeNull();
    expect(normalizeStudentDetail({ ...base, historyTotal: n }).historyTotal).toBe(n);
    for (const bad of [27.5, 1e21, -1, Number.NaN, n - 1, '27', true, {}]) {
      expect(() => normalizeStudentDetail({ ...base, historyTotal: bad }), String(bad)).toThrow('historyTotal');
    }
  });
  it('R13-C-08: a level below 1 can never come from the server and is rejected', () => {
    const base = studentDetailPayload();
    expect(() => normalizeStudentDetail({ ...base, student: { ...base.student, level: 0 } })).toThrow('level');
    expect(() => normalizeStudentDetail({ ...base, student: { ...base.student, level: 2.5 } })).toThrow('level');
    expect(normalizeStudentDetail({ ...base, student: { ...base.student, level: 1 } }).student.level).toBe(1);
  });
});

describe('round 14 payload consistency and names', () => {
  it('R14-C-06: a level that is not a safe whole number is an invalid payload', () => {
    const base = studentDetailPayload();
    for (const level of [1e21, 2 ** 53, Number.POSITIVE_INFINITY]) {
      expect(() => normalizeStudentDetail({ ...base, student: { ...base.student, level } }), String(level)).toThrow('student.level');
    }
    expect(normalizeStudentDetail({ ...base, student: { ...base.student, level: 40 } }).student.level).toBe(40);
  });
  it('R14-C-06: an empty history cannot sit beside a positive total of attempts, and a student with no attempt may have none', () => {
    const base = studentDetailPayload();
    expect(() => normalizeStudentDetail({ ...base, history: [], historyTotal: 5 })).toThrow('historyTotal');
    expect(normalizeStudentDetail({ ...base, history: [], historyTotal: 0 }).historyTotal).toBe(0);
    expect(normalizeStudentDetail({ ...base, history: [], historyTotal: null }).history).toEqual([]);
  });
  it('R14-C-06: the missions completed must equal the sum over the labs', () => {
    const base = studentDetailPayload();
    expect(() => normalizeStudentDetail({ ...base, student: { ...base.student, missionsCompleted: 9 } })).toThrow('missionsCompleted');
    expect(() => normalizeStudentDetail({ ...base, student: { ...base.student, missionsCompleted: 0 } })).toThrow('missionsCompleted');
    const fresh = { ...base, student: { ...base.student, missionsCompleted: 0 }, labs: base.labs.map((l) => ({ ...l, completed: 0, escaped: false })) };
    expect(normalizeStudentDetail(fresh).student.missionsCompleted).toBe(0);
  });
  it('R14-C-06: a mission cannot have been completed by more students than the class holds', () => {
    const bad = clone(analyticsPayload());
    bad.missions[0]!.studentsCompleted = bad.cohort.students + 1;
    expect(() => normalizeFacultyDashboard(bad)).toThrow('studentsCompleted');
    const ok = clone(analyticsPayload());
    ok.missions[0]!.studentsCompleted = ok.cohort.students;
    expect(normalizeFacultyDashboard(ok).missions[0]!.studentsCompleted).toBe(38);
  });
  const tagged = (...names: string[]) => [...nameTags(names.map((name, i) => ({ id: i + 1, name }))).keys()];
  it('R14-C-03: distinct names of scripts whose marks are letters are not namesakes', () => {
    expect(tagged('\u0938\u0940\u0924\u093e', '\u0938\u0924\u093e')).toEqual([]);
    expect(tagged('\u3131\u314f', '\uac00')).toEqual([]);
    expect(tagged('\u0e01\u0e34', '\u0e01')).toEqual([]);
    expect(tagged('\uae40\ubbfc\uc218', '\uae40\ubbfc\uc11c')).toEqual([]);
  });
  it('R15-B-02: letters that are distinct in their alphabet (й/и, ї/і, ў/у) are not namesakes, while ё/е and Latin accents still fold', () => {
    expect(tagged('\u0410\u043d\u0434\u0440\u0435\u0439', '\u0410\u043d\u0434\u0440\u0435\u0438')).toEqual([]);
    expect(tagged('\u041a\u0438\u0457\u0432', '\u041a\u0438\u0456\u0432')).toEqual([]);
    expect(tagged('\u0412\u0430\u045e', '\u0412\u0430\u0443')).toEqual([]);
    expect(tagged('\u0418\u0438', '\u0419\u0439')).toEqual([]);
    expect(tagged('\u0410\u043d\u0434\u0440\u0435\u0439', '\u0410\u043d\u0434\u0440\u0435\u0438\u0306', 'Bea')).toEqual([1, 2]);
    expect(tagged('\u00c1lex', 'Alex')).toEqual([1, 2]);
  });
  it('R14-C-03: accent folding still applies to Latin, Greek, Cyrillic, Arabic and Hebrew, and identical or canonically equal names are tagged', () => {
    expect(tagged('Al\u00e8x', 'Alex')).toEqual([1, 2]);
    expect(tagged('Ale\u0300x', 'Al\u00e8x', 'Bea')).toEqual([1, 2]);
    expect(tagged('\u0410\u043b\u0451\u043d\u0430', '\u0410\u043b\u0435\u043d\u0430')).toEqual([1, 2]);
    expect(tagged('\u0395\u03bb\u03ad\u03bd\u03b7', '\u0395\u03bb\u03b5\u03bd\u03b7')).toEqual([1, 2]);
    expect(tagged('\u0645\u064f\u062d\u0645\u062f', '\u0645\u062d\u0645\u062f')).toEqual([1, 2]);
    expect(tagged('\u05e9\u05b8\u05c1\u05dc\u05d5\u05dd', '\u05e9\u05dc\u05d5\u05dd')).toEqual([1, 2]);
    expect(tagged('\u0938\u0940\u0924\u093e', '\u0938\u0940\u0924\u093e')).toEqual([1, 2]);
    expect(tagged('\uac00', '\u1100\u1161')).toEqual([1, 2]);
    expect(tagged('\u0301Alex', 'Alex', 'Zed')).toEqual([1, 2]);
  });
});
