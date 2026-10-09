import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, exitCode } from '../src/content.ts';
import { levelOf } from '../src/scoring.ts';
import { correct, harness, mission, solve, wrong } from './helpers.ts';
import type { Harness } from './helpers.ts';

let h: Harness;
before(async () => { h = await harness(); });
after(async () => { await h.close(); });

// ------------------------------------------------------------------- auth
test('register, login, me; duplicate and weak input are rejected', async () => {
  const r = await h.call('POST', '/api/auth/register', { body: { name: 'Amel', email: 'Amel@Uni.edu', password: 'correct horse battery' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'student');
  assert.equal(r.body.user.xp, 0);
  assert.equal(r.body.user.level, 1);
  assert.equal(r.body.user.password_hash, undefined);

  assert.equal((await h.call('POST', '/api/auth/register', { body: { name: 'Amel', email: 'amel@uni.edu', password: 'correct horse battery' } })).status, 409);
  const weak = await h.call('POST', '/api/auth/register', { body: { name: 'X', email: 'x@uni.edu', password: 'short' } });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.code, 'validation_error');
  assert.equal((await h.call('POST', '/api/auth/register', { body: { name: 'X', email: 'not-an-email', password: 'correct horse battery', admin: true } })).status, 400);

  const ok = await h.call('POST', '/api/auth/login', { body: { email: 'AMEL@uni.edu', password: 'correct horse battery' } });
  assert.equal(ok.status, 200);
  const me = await h.call('GET', '/api/me', { token: ok.body.token });
  assert.equal(me.body.name, 'Amel');
  const bad = await h.call('POST', '/api/auth/login', { body: { email: 'amel@uni.edu', password: 'wrong password!!' } });
  const ghost = await h.call('POST', '/api/auth/login', { body: { email: 'nobody@uni.edu', password: 'wrong password!!' } });
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.body, ghost.body, 'same message whether or not the account exists');
});

test('protected routes need a valid token; tampered and expired tokens fail', async () => {
  assert.equal((await h.call('GET', '/api/dashboard')).status, 401);
  assert.equal((await h.call('GET', '/api/dashboard', { token: 'abc.def' })).status, 401);
  const u = await h.signup('Tok');
  const [body, sig] = u.token.split('.');
  assert.equal((await h.call('GET', '/api/me', { token: `${body}.${sig!.slice(0, -2)}AA` })).status, 401);
  h.clock.t += 8 * 86400_000;
  assert.equal((await h.call('GET', '/api/me', { token: u.token })).status, 401, 'token expired after 7 days');
});

test('teacher accounts require the invite code; roles are enforced', async () => {
  const noCode = await h.call('POST', '/api/auth/register', { body: { name: 'T', email: 't0@uni.edu', password: 'correct horse battery', teacherInviteCode: 'guess' } });
  assert.equal(noCode.status, 403);
  const t = await h.signup('Prof', 't1@uni.edu', { teacherInviteCode: 'FACULTY-INVITE' });
  const s = await h.signup('Student');
  assert.equal((await h.call('GET', '/api/dashboard', { token: t.token })).status, 403);
  assert.equal((await h.call('POST', '/api/classes', { token: s.token, body: { name: 'Hematology 2026' } })).status, 403);
});

test('unknown routes and wrong methods behave', async () => {
  assert.equal((await h.call('GET', '/api/nope')).status, 404);
  assert.equal((await h.call('DELETE', '/api/health')).status, 405);
  assert.equal((await h.call('GET', '/api/health')).body.status, 'ok');
  const spec = await h.call('GET', '/api/openapi.json');
  assert.equal(spec.body.openapi, '3.1.0');
  assert.ok(spec.body.paths['/api/attempts/{id}/answer']);
});

// ------------------------------------------------------------ no leakage
test('answer keys, explanations and hints never appear before they are earned', async () => {
  const u = await h.signup('Leak');
  const labs = await h.call('GET', '/api/labs', { token: u.token });
  const lobby = await h.call('GET', '/api/labs/hematology', { token: u.token });
  const vault = await h.call('GET', '/api/vault', { token: u.token });
  const seen: string[] = [JSON.stringify(labs.body), JSON.stringify(lobby.body), JSON.stringify(vault.body)];
  for (const m of MISSIONS.filter((x) => x.labSlug === 'hematology')) {
    const s = await h.call('POST', `/api/missions/${m.id}/start`, { token: u.token });
    if (s.status === 201) seen.push(JSON.stringify(s.body));
  }
  const all = seen.join('\n');
  for (const m of MISSIONS) for (const st of m.steps) {
    assert.ok(!all.includes(st.explanation), `explanation leaked: ${st.id}`);
    assert.ok(!all.includes(st.recheck), `recheck leaked: ${st.id}`);
    for (const hint of st.hints) assert.ok(!all.includes(hint), `hint leaked: ${st.id}`);
  }
  assert.ok(!/"key"|"answer"|"fragment":\s*\d|"digit"/.test(all.replace(/"fragments":\{[^}]*\}/g, '')), 'no key fields in public payloads');
  for (const code of ['742', '385', '916', '3916']) assert.ok(!all.includes(`"${code}"`), `exit code ${code} leaked`);
});

test('a wrong answer reveals neither the answer nor the explanation', async () => {
  const u = await h.signup('Wrong');
  const m = mission('hem-01');
  const a = (await h.call('POST', `/api/missions/${m.id}/start`, { token: u.token })).body.attempt;
  const r = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } });
  assert.equal(r.status, 200);
  assert.equal(r.body.correct, false);
  assert.equal(r.body.penaltyXp, -10);
  assert.equal(r.body.feedback.verdict, 'Incorrect');
  assert.ok(r.body.feedback.message.startsWith('Not quite.'));
  assert.ok(!JSON.stringify(r.body).includes(m.steps[0]!.explanation));
  assert.equal(r.body.attempt.step.id, m.steps[0]!.id, 'student stays on the same step');
  assert.equal(r.body.attempt.wrongTotal, 1);
});

// --------------------------------------------------------------- gating
test('missions unlock in order; the Master Lab needs three cleared labs', async () => {
  const u = await h.signup('Gate');
  const lobby = await h.call('GET', '/api/labs/hematology', { token: u.token });
  assert.deepEqual(lobby.body.missions.map((m: any) => m.state), ['current', 'locked', 'locked']);
  assert.equal(lobby.body.missions[1].unlocksWith, 'Complete mission 01 to unlock');
  const locked = await h.call('POST', '/api/missions/hem-02/start', { token: u.token });
  assert.equal(locked.status, 403);
  assert.equal(locked.body.error.code, 'mission_locked');
  const master = await h.call('POST', '/api/missions/master-01/start', { token: u.token });
  assert.equal(master.status, 403);
  assert.equal(master.body.error.code, 'lab_locked');
  const labs = (await h.call('GET', '/api/labs', { token: u.token })).body.labs;
  assert.equal(labs.find((l: any) => l.slug === 'master').state, 'locked');
  assert.equal(labs.find((l: any) => l.slug === 'immunology').state, 'coming_soon');
  assert.equal(labs.filter((l: any) => l.state === 'current').length, 1);
});

test('answers must target the current step and be well-formed', async () => {
  const u = await h.signup('Shape');
  const m = mission('bio-01');
  const a = (await h.call('POST', `/api/missions/${m.id}/start`, { token: u.token })).body.attempt;
  const skip = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[1]!.id, response: correct(m.steps[1]!) } });
  assert.equal(skip.status, 409);
  assert.equal(skip.body.error.code, 'wrong_step');
  const junk = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: { choice: 'Z' } } });
  assert.equal(junk.status, 400);
  const state = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
  assert.equal(state.wrongTotal, 0, 'malformed answers are not penalised');
  const other = await h.signup('Other');
  assert.equal((await h.call('GET', `/api/attempts/${a.attemptId}`, { token: other.token })).status, 404, 'attempts are private');
  assert.equal((await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: other.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } })).status, 404);
});

test('starting again resumes the attempt in progress', async () => {
  const u = await h.signup('Resume');
  const a = await h.call('POST', '/api/missions/hem-01/start', { token: u.token });
  const b = await h.call('POST', '/api/missions/hem-01/start', { token: u.token });
  assert.equal(b.body.resumed, true);
  assert.equal(b.body.attempt.attemptId, a.body.attempt.attemptId);
});

// --------------------------------------------------- engines and progress
test('every engine accepts its correct answer and rejects an incorrect one', async () => {
  const u = await h.signup('Engines');
  // hem-01 point, hem-02 decision x3, hem-03 stepper, mic-02 order, mic-03 match: complete the chain by solving each.
  for (const id of ['hem-01', 'hem-02', 'hem-03', 'mic-01', 'mic-02', 'mic-03', 'bio-01', 'bio-02', 'bio-03']) {
    const m = mission(id);
    const a = (await h.call('POST', `/api/missions/${id}/start`, { token: u.token })).body.attempt;
    const badR = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } });
    assert.equal(badR.body.correct, false, `${id} wrong accepted`);
    if (m.steps[0]!.kind === 'order' || m.steps[0]!.kind === 'match') assert.ok(badR.body.progress.total > 0, 'partial progress is reported without the key');
    let last: any;
    for (const st of m.steps) last = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: st.id, response: correct(st) } });
    assert.equal(last.body.completed, true, `${id} did not complete`);
    assert.equal(last.body.fragment.digit, m.fragment, `${id} fragment`);
  }
});

test('steppers reveal values progressively', async () => {
  const u = await h.signup('Reveal');
  const m = mission('bio-01');
  const a = (await h.call('POST', `/api/missions/${m.id}/start`, { token: u.token })).body.attempt;
  assert.deepEqual(a.revealed.map((v: any) => v.name), ['Creatinine', 'BUN']);
  const r = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
  assert.deepEqual(r.body.attempt.revealed.map((v: any) => v.name), ['Creatinine', 'BUN', 'Potassium', 'Sodium']);
});

// ------------------------------------------------------- scoring and XP
test('server-side scoring: perfect run, then penalties and hints', async () => {
  const u = await h.signup('Score');
  h.clock.t += 1000;
  const perfect = await solve(h, u.token, 'hem-01', { elapsedSec: 30 });
  const res = (await h.call('GET', `/api/attempts/${perfect.attemptId}/result`, { token: u.token })).body;
  assert.equal(res.score, 180);
  assert.equal(res.xpAwarded, 180);
  assert.equal(res.totalXp, 180);
  assert.deepEqual(res.ledger.map((r: any) => r.id), ['base', 'first_attempt', 'time_bonus', 'no_hint']);
  assert.equal(res.stats.accuracyPct, 100);
  assert.equal(res.fragments[0], 7);

  // Replay with a hint and a wrong answer: scores lower, XP total must not drop or farm.
  const m = mission('hem-01');
  const a = (await h.call('POST', `/api/missions/${m.id}/start`, { token: u.token })).body.attempt;
  const hint = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: m.steps[0]!.id } });
  assert.equal(hint.body.penaltyXp, -15);
  assert.equal(hint.body.source, 'standard');
  assert.equal(hint.body.hint, m.steps[0]!.hints[0]);
  await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } });
  const fin = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
  const r2 = fin.body.result;
  assert.equal(r2.fragment ?? null, null);
  assert.equal(fin.body.fragment, null, 'a replay never re-awards the fragment');
  assert.ok(r2.score < 180);
  assert.equal(r2.xpAwarded, 0, 'replays cannot farm XP');
  assert.equal(r2.totalXp, 180);
  assert.equal(r2.newBest, false);
  assert.equal(r2.ledger.find((r: any) => r.id === 'hints').points, -15);
  assert.equal(r2.ledger.find((r: any) => r.id === 'wrong').points, -10);
  assert.equal(r2.ledger.find((r: any) => r.id === 'no_hint').kind, 'unearned');
});

test('hint budget is enforced per step and finished attempts reject actions', async () => {
  const u = await h.signup('Hints');
  const m = mission('hem-01');
  const a = (await h.call('POST', `/api/missions/${m.id}/start`, { token: u.token })).body.attempt;
  const sid = m.steps[0]!.id;
  assert.equal((await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: sid } })).body.remaining, 1);
  assert.equal((await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: sid } })).body.remaining, 0);
  const third = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: sid } });
  assert.equal(third.status, 409);
  assert.equal(third.body.error.code, 'no_more_hints');
  await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: sid, response: correct(m.steps[0]!) } });
  assert.equal((await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: sid, response: correct(m.steps[0]!) } })).status, 409);
  assert.equal((await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: sid } })).status, 409);
});

test('time bonus uses the server clock only', async () => {
  const u = await h.signup('Clock');
  const slow = await solve(h, u.token, 'hem-01', { elapsedSec: 240 });
  const r = (await h.call('GET', `/api/attempts/${slow.attemptId}/result`, { token: u.token })).body;
  assert.equal(r.ledger.find((x: any) => x.id === 'time_bonus').points, 0);
  assert.equal(r.score, 150);
});

test('expired attempts reject answers and hints at the server boundary', async () => {
  const u = await h.signup('Expired');
  const m = mission('hem-01');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  h.clock.t += (m.timeLimitSec + 1) * 1000;
  const answer = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
  assert.equal(answer.status, 409);
  assert.equal(answer.body.error.code, 'time_expired');
  const hint = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: m.steps[0]!.id } });
  assert.equal(hint.status, 409);
  assert.equal(hint.body.error.code, 'time_expired');
  h.clock.t -= (m.timeLimitSec + 1) * 1000;
});

test('concurrent hints reserve distinct levels and never exceed the step budget', async () => {
  const slow = await harness({ assistant: { hint: async () => { await new Promise((resolve) => setTimeout(resolve, 25)); return null; } } });
  try {
    const u = await slow.signup('Concurrent hints');
    const m = mission('hem-01');
    const a = (await slow.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
    const out = await Promise.all([
      slow.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: m.steps[0]!.id } }),
      slow.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: m.steps[0]!.id } }),
    ]);
    assert.deepEqual(out.map((x) => x.status).sort(), [200, 409]);
    const levels = out.filter((x) => x.status === 200).map((x) => x.body.level);
    assert.deepEqual(levels, [1]);
  } finally { await slow.close(); }
});

test('result is unavailable until the mission is complete', async () => {
  const u = await h.signup('Early');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  assert.equal((await h.call('GET', `/api/attempts/${a.attemptId}/result`, { token: u.token })).status, 409);
});

// ---------------------------------------------- vault, labs, Master Lab
test('full journey: three labs, Code Vault, Master Lab, Clinical Detective badge', async () => {
  const u = await h.signup('Journey');
  const tok = u.token;

  for (const [slug, ids] of [['hematology', ['hem-01', 'hem-02', 'hem-03']], ['microbiology', ['mic-01', 'mic-02', 'mic-03']], ['biochemistry', ['bio-01', 'bio-02', 'bio-03']]] as const) {
    // Code entry is refused until the vault is complete.
    const early = await h.call('POST', `/api/labs/${slug}/unlock`, { token: tok, body: { code: exitCode(slug) } });
    assert.equal(early.status, 409);
    assert.equal(early.body.error.code, 'vault_incomplete');
    assert.equal(early.body.error.details.found, 0);

    for (const id of ids) await solve(h, tok, id, { elapsedSec: 20 });
    const pending = (await h.call('GET', '/api/dashboard', { token: tok })).body.continue;
    assert.deepEqual([pending.kind, pending.labSlug, pending.missionId], ['unlock', slug, null], 'with the vault full, the next move is the code lock');

    const vault = (await h.call('GET', '/api/vault', { token: tok })).body.vaults.find((v: any) => v.labSlug === slug);
    assert.equal(vault.complete, true);
    assert.deepEqual(vault.slots, exitCode(slug).split('').map(Number));
    assert.equal(vault.exited, false);

    const badCode = await h.call('POST', `/api/labs/${slug}/unlock`, { token: tok, body: { code: '000' } });
    assert.equal(badCode.status, 422);
    assert.equal(badCode.body.error.code, 'incorrect_code');

    const ok = await h.call('POST', `/api/labs/${slug}/unlock`, { token: tok, body: { code: exitCode(slug) } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.unlocked, true);
    assert.ok(ok.body.newBadges.some((b: any) => b.id === { hematology: 'hematology-detective', microbiology: 'microbiology-investigator', biochemistry: 'biochemistry-analyst' }[slug]));
    const again = await h.call('POST', `/api/labs/${slug}/unlock`, { token: tok, body: { code: exitCode(slug) } });
    assert.equal(again.body.alreadyUnlocked, true);
  }

  const dash = (await h.call('GET', '/api/dashboard', { token: tok })).body;
  assert.equal(dash.labsCompleted, 3);
  assert.equal(dash.overall.completedMissions, 9);
  assert.equal(dash.continue.missionId, 'master-01', 'Master Lab is now the next mission');
  assert.equal(dash.user.xp, 9 * 180, 'nine perfect missions');

  // Master Lab
  const labs = (await h.call('GET', '/api/labs', { token: tok })).body.labs;
  assert.equal(labs.find((l: any) => l.slug === 'master').state, 'current');
  const m = mission('master-01');
  const a = (await h.call('POST', '/api/missions/master-01/start', { token: tok })).body.attempt;
  const digits: number[] = [];
  let last: any;
  for (const [i, st] of m.steps.entries()) {
    last = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: tok, body: { stepId: st.id, response: correct(st) } });
    assert.equal(last.body.fragment.digit, st.fragment);
    assert.equal(last.body.fragment.position, i + 1);
    digits.push(last.body.fragment.digit);
  }
  assert.equal(digits.join(''), '3916');
  assert.equal(last.body.completed, true);

  const before = (await h.call('GET', `/api/attempts/${a.attemptId}/result`, { token: tok })).body;
  assert.equal(before.lab.exited, false);
  assert.equal(before.masterCode, null, 'the code is only shown once the lab is escaped');
  assert.equal(before.badge, null);

  const exit = await h.call('POST', '/api/labs/master/unlock', { token: tok, body: { code: '3916' } });
  assert.equal(exit.body.unlocked, true);
  assert.ok(exit.body.newBadges.some((b: any) => b.id === 'clinical-detective'));

  const res = (await h.call('GET', `/api/attempts/${a.attemptId}/result`, { token: tok })).body;
  assert.equal(res.masterCode, '3916');
  assert.equal(res.badge.name, 'Clinical Detective');
  assert.equal(res.stats.firstTrySteps, 4);
  assert.equal(res.ledger[0].points, 300);
  assert.ok(res.competencies.length >= 4);
  assert.ok(res.strongest);

  const badges = (await h.call('GET', '/api/badges', { token: tok })).body.badges;
  assert.equal(badges.filter((b: any) => b.earned).length, 7, 'three lab badges, First Escape, Perfect Mission, No Hint, Clinical Detective');
  const me = (await h.call('GET', '/api/me', { token: tok })).body;
  assert.equal(me.xp, 9 * 180 + 570);
  assert.equal(me.level, levelOf(9 * 180 + 570));
  assert.equal(me.level, 3, 'level 3 starts at 1,500 XP');
});

test('master step fragments are kept if the student abandons the attempt', async () => {
  const u = await h.signup('Partial');
  for (const id of ['hem-01', 'hem-02', 'hem-03', 'mic-01', 'mic-02', 'mic-03', 'bio-01', 'bio-02', 'bio-03']) await solve(h, u.token, id);
  for (const slug of ['hematology', 'microbiology', 'biochemistry']) await h.call('POST', `/api/labs/${slug}/unlock`, { token: u.token, body: { code: exitCode(slug) } });
  const m = mission('master-01');
  const a = (await h.call('POST', '/api/missions/master-01/start', { token: u.token })).body.attempt;
  await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
  const v = (await h.call('GET', '/api/vault', { token: u.token })).body.vaults.find((x: any) => x.labSlug === 'master');
  assert.deepEqual(v.slots, [3, null, null, null]);
  assert.equal(v.complete, false);
});

test('wrong exit codes lock out after five tries and the lock lifts after ten minutes', async () => {
  const u = await h.signup('Brute');
  for (const id of ['hem-01', 'hem-02', 'hem-03']) await solve(h, u.token, id);
  for (let i = 0; i < 5; i++) {
    const r = await h.call('POST', '/api/labs/hematology/unlock', { token: u.token, body: { code: '00' + i } });
    assert.equal(r.status, 422);
  }
  const locked = await h.call('POST', '/api/labs/hematology/unlock', { token: u.token, body: { code: exitCode('hematology') } });
  assert.equal(locked.status, 429, 'even the right code is refused while locked out');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  h.clock.t += 10 * 60_000 + 1000;
  const ok = await h.call('POST', '/api/labs/hematology/unlock', { token: u.token, body: { code: exitCode('hematology') } });
  assert.equal(ok.status, 200);
});

test('login is rate limited', async () => {
  const u = await h.signup('Limiter', 'limiter@uni.edu');
  let last = 0;
  for (let i = 0; i < 10; i++) last = (await h.call('POST', '/api/auth/login', { body: { email: 'limiter@uni.edu', password: 'definitely wrong' } })).status;
  assert.equal(last, 429);
  void u;
  h.app.limiter.reset();
});

// -------------------------------------------------------------- dashboard
test('dashboard: streak, continue and recommended', async () => {
  const u = await h.signup('Dash');
  let d = (await h.call('GET', '/api/dashboard', { token: u.token })).body;
  assert.equal(d.streakDays, 0);
  assert.equal(d.continue.missionId, 'hem-01');
  assert.equal(d.continue.kind, 'mission');
  assert.equal(d.continue.resume, false);
  await solve(h, u.token, 'hem-01');
  d = (await h.call('GET', '/api/dashboard', { token: u.token })).body;
  assert.equal(d.streakDays, 1);
  assert.equal(d.continue.missionId, 'hem-02');
  assert.equal(d.recommended.missionId, 'mic-01');
  assert.equal(d.badges.earned, 2, 'Perfect Mission and No Hint');
  h.clock.t += 86400_000;
  assert.equal((await h.call('GET', '/api/dashboard', { token: u.token })).body.streakDays, 1, 'yesterday still counts');
  h.clock.t += 86400_000;
  assert.equal((await h.call('GET', '/api/dashboard', { token: u.token })).body.streakDays, 0, 'a missed day resets it');
  await h.call('POST', '/api/missions/hem-02/start', { token: u.token });
  assert.equal((await h.call('GET', '/api/dashboard', { token: u.token })).body.continue.resume, true);
});

// ---------------------------------------------------------------- teachers
test('teacher analytics: join code, cohort, weakest mission, privacy', async () => {
  const t = await h.signup('Prof Haddad', undefined, { teacherInviteCode: 'FACULTY-INVITE' });
  const other = await h.signup('Prof Other', undefined, { teacherInviteCode: 'FACULTY-INVITE' });
  const cls = await h.call('POST', '/api/classes', { token: t.token, body: { name: 'BIOMED 301' } });
  assert.equal(cls.status, 201);
  assert.match(cls.body.joinCode, /^[A-Z2-9]{6}$/);

  const students = [];
  for (const n of ['Ines', 'Yanis', 'Lina']) {
    const s = await h.signup(n);
    const j = await h.call('POST', '/api/classes/join', { token: s.token, body: { joinCode: cls.body.joinCode.toLowerCase() } });
    assert.equal(j.status, 200);
    students.push(s);
  }
  assert.equal((await h.call('POST', '/api/classes/join', { token: students[0]!.token, body: { joinCode: 'ZZZZZZ' } })).status, 404);

  // Ines solves hem-01 cleanly; Yanis and Lina each miss once on hem-01.
  await solve(h, students[0]!.token, 'hem-01');
  for (const s of students.slice(1)) {
    const m = mission('hem-01');
    const a = (await h.call('POST', '/api/missions/hem-01/start', { token: s.token })).body.attempt;
    await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: s.token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } });
    await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: s.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
  }
  // Everyone solves hem-02 cleanly.
  for (const s of students) await solve(h, s.token, 'hem-02');

  const an = await h.call('GET', `/api/classes/${cls.body.id}/analytics`, { token: t.token });
  assert.equal(an.status, 200);
  assert.equal(an.body.cohort.students, 3);
  const m1 = an.body.missions.find((m: any) => m.missionId === 'hem-01');
  const m2 = an.body.missions.find((m: any) => m.missionId === 'hem-02');
  assert.equal(m1.successPct, 67, 'one clean (100%) and two with a miss on a one-step mission (50%)');
  assert.equal(m1.cleanFirstTryPct, 33);
  assert.equal(m2.successPct, 100);
  assert.equal(m2.cleanFirstTryPct, 100);
  assert.equal(m1.studentsCompleted, 3);
  assert.equal(an.body.hardestMission.successPct, 67);
  assert.equal(m1.needsAttention, true, 'the weakest mission is flagged');
  assert.equal(m2.needsAttention, false);
  assert.equal(an.body.missions.filter((m: any) => m.needsAttention).length, 1);
  assert.equal(m1.steps[0].avgWrong, 0.67);
  assert.equal(an.body.roster.length, 3);
  assert.ok(an.body.roster.every((r: any) => r.email === undefined), 'roster exposes no emails');

  assert.equal((await h.call('GET', `/api/classes/${cls.body.id}/analytics`, { token: other.token })).status, 404, 'another teacher cannot read this class');
  assert.equal((await h.call('GET', `/api/classes/${cls.body.id}/analytics`, { token: students[0]!.token })).status, 403);
  assert.equal((await h.call('GET', '/api/classes', { token: t.token })).body.classes[0].students, 3);
});
