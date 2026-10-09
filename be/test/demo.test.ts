import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PASSWORD, DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, seedDemo } from '../src/demo.ts';
import { harness } from './helpers.ts';
import type { Harness } from './helpers.ts';

let h: Harness;
let classId = 0;
let alex = '';
let claire = '';
before(async () => {
  h = await harness({ demo: true });
  const out = await seedDemo(h.app.db, h.clock.t);
  classId = out!.classId;
  alex = (await h.call('POST', '/api/auth/demo', { body: { role: 'student' } })).body.token;
  claire = (await h.call('POST', '/api/auth/demo', { body: { role: 'teacher' } })).body.token;
});
after(() => h.close());

test('seeding is idempotent and demo logins work with the printed credentials', async () => {
  assert.equal(await seedDemo(h.app.db, h.clock.t), null);
  for (const email of [DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL]) {
    const r = await h.call('POST', '/api/auth/login', { body: { email, password: DEMO_PASSWORD } });
    assert.equal(r.status, 200);
  }
});

test('demo sign-in is closed when DEMO_MODE is off', async () => {
  const off = await harness();
  assert.equal((await off.call('POST', '/api/auth/demo', { body: { role: 'student' } })).status, 404);
  assert.equal((await off.call('POST', '/api/demo/reset', {})).status, 401);
  await off.close();
});

test('Alex Martin: the persona from the design, produced by the real rules', async () => {
  const p = (await h.call('GET', '/api/profile', { token: alex })).body;
  assert.equal(p.user.name, 'Alex Martin');
  assert.equal(p.user.studyLevel, 'L3');
  assert.equal(p.xp.total, 8240);
  assert.equal(p.xp.level, 6);
  assert.equal(p.xp.earned + p.xp.carriedOver, 8240, 'carried-over XP is shown as such');
  assert.equal(p.stats.accuracyPct, 87);
  assert.equal(p.stats.avgMissionTime, '02:43');
  assert.equal(p.stats.badgesEarned, 4);
  assert.deepEqual(p.labs.map((l: any) => [l.slug, l.state, l.completed]), [['hematology', 'escaped', 3], ['microbiology', 'in_progress', 2], ['biochemistry', 'not_started', 0]]);
  assert.equal(p.settings.sound, false, 'sound is off by default');

  const d = (await h.call('GET', '/api/dashboard', { token: alex })).body;
  assert.equal(d.continue.missionId, 'mic-03');
  assert.equal(d.recommended.missionId, 'bio-01');
  assert.equal(d.streakDays, 6, 'six consecutive days, ending today');
  assert.equal(d.badges.earned, 4);

  const best = (await h.call('GET', '/api/labs/hematology', { token: alex })).body;
  const scores = Object.fromEntries(best.missions.map((m: any) => [m.id, m.bestScore ?? m.score]));
  assert.deepEqual([scores['hem-01'], scores['hem-02'], scores['hem-03']], [168, 180, 87], 'the slower replay never lowers a best score');
});

test('Alex: Hematology results (435 XP, 92%, 09:08, one hint) and its ledger add up', async () => {
  const r = (await h.call('GET', '/api/labs/hematology/results', { token: alex })).body;
  assert.deepEqual([r.xp, r.stats.accuracyPct, r.stats.elapsed, r.stats.hintsUsed, r.stats.wrongAnswers], [435, 92, '09:08', 1, 1]);
  assert.deepEqual(r.ledger.map((x: any) => x.points), [300, 60, 60, 40, -15, -10]);
  assert.equal(r.ledger.reduce((a: number, x: any) => a + x.points, 0), r.xp);
  assert.deepEqual(r.missions.map((m: any) => [m.score, m.elapsed]), [[168, '02:12'], [180, '01:20'], [87, '05:36']]);
  assert.equal(r.badge.name, 'Hematology Detective');
  assert.equal((await h.call('GET', '/api/labs/microbiology/results', { token: alex })).status, 409, 'results stay hidden until the lab is escaped');
});

test('leaderboard: Alex is 4th in the class, week scope uses recent XP only, cohort all adds everyone', async () => {
  const all = (await h.call('GET', '/api/leaderboard?scope=all&cohort=class', { token: alex })).body;
  assert.deepEqual(all.rows.slice(0, 5).map((r: any) => [r.rank, r.name]), [[1, 'Inès M.'], [2, 'Hugo L.'], [3, 'Sana B.'], [4, 'Alex M.'], [5, 'Théo G.']]);
  assert.equal(all.me.rank, 4);
  assert.equal(all.total, 38);
  assert.equal(all.rows.length, 20);
  assert.ok(all.rows.every((r: any) => r.you === (r.name === 'Alex M.')));
  const week = (await h.call('GET', '/api/leaderboard?scope=week&cohort=class', { token: alex })).body;
  assert.ok(week.rows.every((r: any) => r.xp > 0));
  const alexWeek = week.rows.find((r: any) => r.you);
  assert.equal(alexWeek.xp, 732, 'only XP earned by playing counts for the week, not carried-over XP');
  const everyone = (await h.call('GET', '/api/leaderboard?scope=all&cohort=all', { token: alex })).body;
  assert.equal(everyone.total, 38, 'the teacher is not a student');
});

test('teacher dashboard figures: 38 students, 31 active, 81% accuracy, 73% completion, 5 needing attention', async () => {
  const an = (await h.call('GET', `/api/classes/${classId}/analytics`, { token: claire })).body;
  assert.deepEqual([an.cohort.students, an.cohort.activeStudents, an.cohort.avgAccuracyPct, an.cohort.avgCompletionPct, an.cohort.needsAttention], [38, 31, 81, 73, 5]);
  assert.equal(an.hardestMission.missionId, 'bio-03');
  assert.equal(an.hardestMission.successPct, 59);
  const flagged = an.missions.filter((m: any) => m.needsAttention);
  assert.deepEqual(flagged.map((m: any) => m.missionId), ['bio-03'], 'only the hardest mission is flagged');
  assert.equal(an.missions.find((m: any) => m.missionId === 'hem-01').studentsCompleted, 38);
  assert.equal(an.missions.find((m: any) => m.missionId === 'bio-03').studentsCompleted, 17);
  assert.ok(an.missions.find((m: any) => m.missionId === 'bio-03').avgHints > 0.9);
  assert.equal(an.missions.find((m: any) => m.missionId === 'master-01').successPct, null, 'no data, no figure');
  assert.ok(an.roster.every((r: any) => r.email === undefined));
});

test('teacher roster and student detail', async () => {
  const list = (await h.call('GET', `/api/classes/${classId}/students`, { token: claire })).body;
  assert.equal(list.total, 38);
  assert.deepEqual(list.students.slice(0, 4).map((s: any) => s.name), ['Inès Moreau', 'Hugo Lambert', 'Sana Benali', 'Alex Martin']);
  const named = Object.fromEntries(list.students.slice(0, 8).map((s: any) => [s.name, [s.accuracyPct, s.missionsCompleted]]));
  assert.deepEqual(named, { 'Inès Moreau': [94, 9], 'Hugo Lambert': [92, 9], 'Sana Benali': [89, 7], 'Alex Martin': [87, 5], 'Théo Girard': [85, 7], 'Lina Roussel': [78, 4], 'Karim Haddad': [61, 3], 'Marie Dubois': [55, 2] });
  const attention = (await h.call('GET', `/api/classes/${classId}/students?status=attention`, { token: claire })).body;
  assert.equal(attention.total, 5);
  assert.ok(attention.students.some((s: any) => s.name === 'Marie Dubois' && s.attentionReason === 'Accuracy under 60%'));
  assert.ok(attention.students.some((s: any) => s.name === 'Karim Haddad' && /^No activity for 12 days/.test(s.attentionReason)));
  assert.equal((await h.call('GET', `/api/classes/${classId}/students?q=alex`, { token: claire })).body.total, 1);

  const alexRow = list.students.find((s: any) => s.name === 'Alex Martin');
  const detail = (await h.call('GET', `/api/classes/${classId}/students/${alexRow.id}`, { token: claire })).body;
  assert.equal(detail.student.accuracyPct, 87);
  assert.equal(detail.student.hintsUsed, 1);
  assert.equal(detail.labs.find((l: any) => l.slug === 'hematology').escaped, true);
  assert.equal(detail.history.length, 6, 'the replay is part of the history');
  assert.ok(detail.history.every((x: any) => x.answersSubmitted === x.wrongAnswers + (x.missionId === 'hem-02' || x.missionId === 'hem-03' ? 3 : x.missionId === 'mic-01' ? 3 : 1)));
  assert.equal((await h.call('GET', `/api/classes/${classId}/students/${alexRow.id}`, { token: alex })).status, 403);
});

test('reset restores Alex only; every other account gets 403', async () => {
  // Alex plays on, then the presenter resets.
  const before = (await h.call('GET', '/api/profile', { token: alex })).body;
  assert.equal(before.stats.badgesEarned, 4);
  await h.call('POST', '/api/missions/mic-03/start', { token: alex });
  const reset = await h.call('POST', '/api/demo/reset', { token: alex });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.reset, true);
  assert.equal(reset.body.profile.xp.total, 8240);
  assert.equal(reset.body.profile.stats.accuracyPct, 87);
  assert.equal((await h.call('GET', '/api/dashboard', { token: alex })).body.continue.resume, false, 'the unfinished attempt is gone');

  const other = await h.signup('Someone Else');
  assert.equal((await h.call('POST', '/api/demo/reset', { token: other.token })).status, 403);
  const list = (await h.call('GET', `/api/classes/${classId}/students`, { token: claire })).body;
  assert.equal(list.students.find((s: any) => s.name === 'Inès Moreau').xp, 11980, 'the rest of the class is untouched');
});

test('content approval: draft -> reviewed -> approved, students cannot see or change it', async () => {
  const list = (await h.call('GET', '/api/content/missions', { token: claire })).body;
  assert.equal(list.missions.length, 10);
  assert.ok(list.missions.every((m: any) => m.status === 'draft'));
  const skip = await h.call('PUT', '/api/content/missions/hem-01/status', { token: claire, body: { status: 'approved' } });
  assert.equal(skip.status, 409);
  assert.equal(skip.body.error.code, 'review_required');
  const rev = await h.call('PUT', '/api/content/missions/hem-01/status', { token: claire, body: { status: 'reviewed' } });
  assert.deepEqual([rev.status, rev.body.status], [200, 'reviewed']);
  assert.match(rev.body.reviewedBy, /^Dr\. Claire Moreau \(teacher #\d+\)$/, 'name plus account id');
  const app = await h.call('PUT', '/api/content/missions/hem-01/status', { token: claire, body: { status: 'approved' } });
  assert.equal(app.body.status, 'approved');
  const back = await h.call('PUT', '/api/content/missions/hem-01/status', { token: claire, body: { status: 'draft' } });
  assert.deepEqual([back.body.status, back.body.reviewedBy], ['draft', null]);
  assert.equal((await h.call('PUT', '/api/content/missions/nope/status', { token: claire, body: { status: 'reviewed' } })).status, 404);
  assert.equal((await h.call('GET', '/api/content/missions', { token: alex })).status, 403);
  assert.equal((await h.call('PUT', '/api/content/missions/hem-01/status', { token: alex, body: { status: 'reviewed' } })).status, 403);
});

test('reset also restores the demo student identity and drops extra classes (ADV-04)', async () => {
  const profile = () => h.call('GET', '/api/profile', { token: alex });
  assert.equal((await h.call('PUT', '/api/profile', { token: alex, body: { name: 'Mallory Reset', program: 'Other', studyLevel: 'M2' } })).status, 200);
  const classes = (await h.call('GET', '/api/classes', { token: claire })).body;
  const other = (Array.isArray(classes) ? classes : classes.classes).find((c: any) => c.name !== 'L3 Biomedical Sciences');
  assert.equal((await h.call('POST', '/api/classes/join', { token: alex, body: { joinCode: other.joinCode } })).status, 200);
  assert.equal((await h.call('POST', '/api/demo/reset', { token: alex })).status, 200);
  const p = (await profile()).body.user;
  assert.deepEqual([p.name, p.studyLevel], ['Alex Martin', 'L3']);
  const rosterOther = (await h.call('GET', `/api/classes/${other.id}/students`, { token: claire })).body;
  assert.ok(!rosterOther.students.some((s: any) => s.name === 'Alex Martin'), 'Alex left the extra class');
});
