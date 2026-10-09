import { describe, expect, it } from 'vitest';
import { FACULTY_VIEWS, resolveView } from '../ui/common';
import { ABOUT_FOOT, BEFORE_PRESENTING, BEFORE_PRESENTING_FACULTY, GUIDE_STEPS, GUIDE_TOTAL_LABEL, QUALITY_LOCAL, QUALITY_PENDING, QUALITY_POINTS, ROADMAP, ROADMAP_LOOP, ROADMAP_LOOP_LABEL, ROADMAP_LOOP_NOTE, ROADMAP_PILOT_NOTE, SCOPE_IS, SCOPE_IS_NOT, SWITCH_NOTE, TIMING_NOTE, guideTotalSeconds, stepActions, stepNeeds, stepPurpose } from './demo-guide';

const everyText = () => JSON.stringify([GUIDE_STEPS, QUALITY_LOCAL, QUALITY_PENDING, ROADMAP, ROADMAP_LOOP, SCOPE_IS, SCOPE_IS_NOT]);

describe('demo guide content', () => {
  it('has the eight steps, in order, with unique ids', () => {
    expect(GUIDE_STEPS).toHaveLength(8);
    expect(new Set(GUIDE_STEPS.map((s) => s.id)).size).toBe(8);
    expect(GUIDE_STEPS[0]!.id).toBe('concept');
    for (const step of GUIDE_STEPS) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.purpose.length).toBeGreaterThan(20);
      expect(step.seconds).toBeGreaterThan(0);
    }
  });

  it('fits the demonstration the page promises (R17: the step times alone are below 7 minutes; the label says navigation is on top)', () => {
    expect(guideTotalSeconds()).toBeGreaterThanOrEqual(5 * 60);
    expect(guideTotalSeconds()).toBeLessThanOrEqual(7 * 60);
    expect(GUIDE_TOTAL_LABEL).toBe('about 7 minutes with navigation');
  });

  it('has the five planned validation phases, none marked as done', () => {
    expect(ROADMAP).toHaveLength(5);
    expect(ROADMAP.map((p) => p.id)).toEqual(['expert-review', 'educator-validation', 'student-pilot', 'usability', 'refinement']);
    expect(ROADMAP_LOOP.map((s) => s.verb)).toEqual(['Create', 'Observe & Learn', 'Validate & Transfer']);
  });

  it('never overclaims and never prints a figure that can go stale', () => {
    const text = everyText();
    expect(text).not.toMatch(/production[- ]ready/i);
    expect(text).not.toMatch(/\b\d+\s*(?:\/\s*\d+\s*)?(?:tests?|specs?|violations?|%)/i);
    expect(text).not.toMatch(/\bvalidated by\b|\bcertified\b|\bclinically proven\b/i);
  });
});

describe('what the guide opens for each role', () => {
  it('never offers a student a faculty screen, nor a faculty guest a student screen', () => {
    for (const step of GUIDE_STEPS) {
      for (const action of stepActions(step, 'student')) if (action.kind === 'go') expect(FACULTY_VIEWS).not.toContain(action.view);
      for (const action of stepActions(step, 'teacher')) if (action.kind === 'go') expect(FACULTY_VIEWS.concat(['about'])).toContain(action.view);
    }
  });

  it('only navigates to views the role is allowed to see (resolveView keeps them)', () => {
    for (const step of GUIDE_STEPS) {
      for (const role of ['student', 'teacher'] as const) {
        for (const action of stepActions(step, role)) if (action.kind === 'go') expect(resolveView(action.view, role === 'teacher')).toBe(action.view);
      }
    }
  });

  it('opens the Hematology laboratory for the two mission steps and the real map and vault elsewhere', () => {
    const byId = (id: string) => GUIDE_STEPS.find((s) => s.id === id)!;
    expect(stepActions(byId('mission'), 'student')).toEqual([{ kind: 'lab', slug: 'hematology', label: 'Open the Hematology lab' }]);
    expect(stepActions(byId('decision'), 'student')).toEqual([{ kind: 'lab', slug: 'hematology', label: 'Open the Hematology lab' }]);
    expect(stepActions(byId('choose'), 'student')).toEqual([{ kind: 'go', view: 'labs', label: 'Open the lab map' }]);
    expect(stepActions(byId('progress'), 'student')).toEqual([{ kind: 'go', view: 'progress', label: 'Open the Progress vault' }]);
    expect(stepActions(byId('concept'), 'student')).toEqual([]);
    expect(stepActions(byId('feedback'), 'student')).toEqual([]);
  });

  it('opens the faculty screens only for the faculty guest, and says which guest a step needs', () => {
    const faculty = GUIDE_STEPS.find((s) => s.id === 'faculty')!;
    expect(stepActions(faculty, 'student')).toEqual([]);
    expect(stepActions(faculty, 'teacher').map((a) => (a.kind === 'go' ? a.view : a.kind))).toEqual(['teacher', 'content']);
    expect(stepNeeds(faculty, 'student')).toBe('teacher');
    expect(stepNeeds(faculty, 'teacher')).toBeNull();
    const mission = GUIDE_STEPS.find((s) => s.id === 'mission')!;
    expect(stepNeeds(mission, 'teacher')).toBe('student');
    expect(stepNeeds(mission, 'student')).toBeNull();
    expect(stepNeeds(GUIDE_STEPS[0]!, 'teacher')).toBeNull();
  });

  it('jumps to the two sections of this page from the last step, for both roles', () => {
    const last = GUIDE_STEPS[7]!;
    for (const role of ['student', 'teacher'] as const) expect(stepActions(last, role).map((a) => (a.kind === 'anchor' ? a.id : a.kind))).toEqual(['about-quality', 'about-roadmap']);
  });
});

const allPageText = () => JSON.stringify([everyText(), QUALITY_POINTS, BEFORE_PRESENTING, SWITCH_NOTE, ROADMAP_LOOP_LABEL, ROADMAP_LOOP_NOTE, ROADMAP_PILOT_NOTE, ABOUT_FOOT]);
const byId = (id: string) => GUIDE_STEPS.find((s) => s.id === id)!;

describe('round 16: the page says only what the repository can prove', () => {
  it('R16-D-01: the word independent only ever appears in a negation, and the audits are said to be run by AI agents of the team', () => {
    const text = allPageText();
    for (const match of text.matchAll(/independent/gi)) {
      const around = text.slice(Math.max(0, match.index! - 24), match.index! + 40).toLowerCase();
      expect(around, 'independent must be negated').toMatch(/\b(no|not an external or) independent human/);
    }
    const audits = QUALITY_POINTS.find((p) => /audit/i.test(p.title))!;
    expect(audits.text).toMatch(/AI review agents of the project team/);
    expect(audits.text).toMatch(/not an external or independent human review/);
    expect(QUALITY_POINTS.map((p) => p.text).join(' ')).toContain('no independent human security or accessibility review');
  });

  it('R16-D-02: steps 3 and 4 tell the presenter to REPLAY the missions the demo student already completed', () => {
    expect(byId('mission').purpose).toMatch(/replay/i);
    expect(byId('mission').purpose).toContain('Blood Smear Code');
    expect(byId('decision').purpose).toMatch(/replay/i);
    expect(byId('decision').purpose).toContain('Fix the Sample');
    expect(byId('decision').hint).toMatch(/new account/i);
    expect(byId('decision').hint).toMatch(/locked until Blood Smear Code is completed/);
    expect(byId('decision').hint).not.toMatch(/^Fix the Sample opens once/);
  });

  it('R16-D-03: a Before you present block gives the verified preparation and keeps the timing at about 6.5 minutes', () => {
    const text = BEFORE_PRESENTING.items.join(' ');
    expect(BEFORE_PRESENTING.title).toBe('Before you present');
    expect(text).toContain('Reset guest session');
    expect(text).toContain('Confirm reset');
    expect(text).toContain('Guest options');
    expect(text).toMatch(/reopen this page/);
    expect(text).toContain('Mark reviewed');
    expect(text).toMatch(/persist/);
    expect(text).toMatch(/Faculty-side reset is not available in the interface/);
    expect(text).toMatch(/level, XP and completed missions already exist/);
    expect(guideTotalSeconds()).toBe(390);
  });

  it('R16-D-04: no image is called artwork; the images are illustrative training material whose provenance is still to be documented', () => {
    const text = allPageText();
    expect(text).not.toMatch(/artwork/i);
    expect(SCOPE_IS_NOT.join(' ')).toMatch(/illustrative training material/);
    expect(ABOUT_FOOT).toMatch(/illustrative training material, not as clinical or diagnostic reference/);
    expect(ABOUT_FOOT).toMatch(/provenance and licensing still have to be documented and reviewed before any teaching use/);
    expect(ABOUT_FOOT).toContain('not a medical device or diagnostic tool');
    expect(QUALITY_PENDING.join(' ')).toMatch(/provenance and licensing/);
  });

  it('R16-D-05: the academic loop is a proposed direction, not an agreement, and the pilot would need ethics and data-protection approval', () => {
    expect(ROADMAP_LOOP_LABEL).toBe('Proposed academic direction');
    expect(ROADMAP_LOOP_NOTE).toMatch(/not an agreement/);
    expect(ROADMAP_PILOT_NOTE).toMatch(/would require ethics and data-protection approval/);
    expect(ROADMAP.find((p) => p.id === 'student-pilot')!.text).toMatch(/would require ethics and data-protection approval/);
  });

  it('R16-D-06/07: the feedback step names its mission, a fallback, and no longer claims the feedback explains', () => {
    const step = byId('feedback');
    const text = `${step.purpose} ${step.hint ?? ''}`;
    expect(text).toContain('Fix the Sample');
    expect(text).toMatch(/Microbe Detective/);
    expect(text).toMatch(/Anemia Detective/);
    expect(text).toContain('does not state the answer (some ordering and matching steps show how many items are in place)');
    expect(text).not.toMatch(/without revealing|explains/);
  });

  it('R16-D-08/10: the faculty switch note works on desktop and phone; the vault step says it may already be unlocked', () => {
    expect(SWITCH_NOTE).toBe('Use the Faculty guest button (in the sidebar, or in Guest options on a phone).');
    expect(byId('progress').hint).toMatch(/already be unlocked/);
  });

  it('R16-C-02: the faculty step reads differently for the guest that is already in the Faculty guest', () => {
    const faculty = byId('faculty');
    expect(stepPurpose(faculty, 'student')).toMatch(/^Switch to the Faculty guest/);
    expect(stepPurpose(faculty, 'teacher')).not.toMatch(/Switch to/);
    expect(stepPurpose(faculty, 'teacher')).toMatch(/class analytics/);
    expect(stepPurpose(byId('mission'), 'teacher')).toBe(byId('mission').purpose);
  });
});

describe('round 17: presenter guidance matches what the app does', () => {
  it('R17-D-02/B-05: Blood Smear Code is not said to be unable to host a retry; Fix the Sample stays the suggested place', () => {
    const text = JSON.stringify(GUIDE_STEPS);
    expect(text).not.toMatch(/cannot host a retry/i);
    const step = byId('feedback');
    expect(step.hint).toMatch(/Blood Smear Code also accepts a wrong answer/);
    expect(step.hint).toMatch(/hint plus a wrong answer plus a retry/);
    expect(step.hint).toContain('Fix the Sample');
    expect(step.hint).toMatch(/Microbe Detective or Anemia Detective/);
  });

  it('R17-D-03: only a new personal best adds XP, and a rehearsal adds attempts to the history', () => {
    const text = BEFORE_PRESENTING.items.join(' ');
    expect(text).not.toMatch(/A replay adds XP to the shared demo student until/);
    expect(text).toMatch(/only a new personal best adds XP/);
    expect(text).toMatch(/adds attempts to the student.s history/);
  });

  it('R17-D-04: a Faculty guest is told what to do without a Reset guest session button', () => {
    const text = BEFORE_PRESENTING_FACULTY.items.join(' ');
    expect(BEFORE_PRESENTING_FACULTY.title).toBe('Before you present');
    expect(text).toMatch(/no Reset guest session/);
    expect(text).toContain('Return to student demo');
    expect(text).toContain('Confirm reset');
    expect(text).toMatch(/Approve, then Return to draft/);
    expect(text).toMatch(/Now draft/);
    expect(text).toMatch(/ask the developer to reset the demo data/);
    expect(text).not.toMatch(/FACULTY_DEMO_SCRIPT|docs\//);
    expect(BEFORE_PRESENTING.items.join(' ')).toMatch(/ask the developer to reset the demo data/);
  });

  it('R17-D-05: the time is stated honestly, with what to cut for five minutes', () => {
    expect(GUIDE_TOTAL_LABEL).toBe('about 7 minutes with navigation');
    expect(TIMING_NOTE).toMatch(/step 2/);
    expect(TIMING_NOTE).toMatch(/result screen of step 5/);
    expect(TIMING_NOTE).toMatch(/5 minutes/);
    expect(BEFORE_PRESENTING.items.join(' ') + JSON.stringify(BEFORE_PRESENTING)).toContain('about 7 minutes');
  });

  it('R17-D-06: step 3 is titled for what the presenter does (a replay), not a start', () => {
    expect(byId('mission').title).toBe('Open one biomedical mission');
  });

  it('R17-D-01: step 7 says the faculty figures are generated demonstration data, for both guests', () => {
    for (const role of ['student', 'teacher'] as const) {
      expect(stepPurpose(byId('faculty'), role)).toMatch(/generated demonstration data, not real learners/);
    }
  });
});
