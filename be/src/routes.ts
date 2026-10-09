// The route table. It is also the source of the OpenAPI document (scripts/openapi.ts).
import { hashPassword, signToken, verifyPassword } from './auth.ts';
import type { Game } from './game.ts';
import { ApiError, EMPTY_BODY, bad, forbidden, notFound, unauthorized, visibleSecretLength } from './http.ts';
import type { Ctx, RateLimiter, Route, Schema } from './http.ts';
import type { DB } from './db.ts';
import { LABS, MISSIONS } from './content.ts';
import { scoringRules } from './rules.ts';
import { DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, isDemoEmail, resetDemoStudent, resetDemoTeacher } from './demo.ts';

export interface Deps {
  db: DB;
  game: Game;
  limiter: RateLimiter;
  secret: string;
  teacherInviteCode: string;
  now: () => number;
  limits?: { registerPerHour?: number; loginFailuresPerIp?: number; joinPerUser?: number; answerPerMinute?: number; hintPerMinute?: number; startPerMinute?: number; writePerMinute?: number };
  demo?: boolean;
}

/** A new password needs at least this many characters a person can see (after NFC), on top of the 10-character minimum (R15-A-07). */
const MIN_VISIBLE_PASSWORD = 6;
const str = (min = 1, max = 200): Schema => ({ type: 'string', minLength: min, maxLength: max });
const label = (max: number): Schema => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' });
/** Display-name rules, shared by POST /auth/register and PUT /profile (enforced in Game, see names.ts). */
const NAME_RULES = 'Display name, 1 to 80 characters with at least one visible character (a name made only of spaces, invisible, private-use or unassigned characters is a 400 validation_error). '
  + 'It cannot contain a "(teacher #number)" pattern, which is reserved for content-review records (400 validation_error; digits, brackets and "#" are compared after Unicode folding). '
  + 'A teacher name must also be unique among teachers once case, accents, spacing, punctuation, invisible characters, Cyrillic / Greek look-alikes and the Latin look-alikes I / l / 1 / | and O / 0 are folded, and the seeded demo teacher name is reserved: otherwise 409 name_taken. '
  + 'Bidirectional override, embedding and isolate controls (U+202A-U+202E, U+2066-U+2069) are refused (400 validation_error). '
  + 'Students may share names.';
const S = {
  register: {
    type: 'object', required: ['name', 'email', 'password'], additionalProperties: false,
    properties: {
      name: { ...label(80), description: NAME_RULES },
      email: { type: 'string', maxLength: 200, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', example: 'student@university.edu' },
      password: { type: 'string', maxLength: 200, description: 'At least 10 characters, counted after Unicode NFC normalisation (the password is stored as NFC, so a decomposed "e" + accent counts once), of which at least 6 are visible: whitespace, zero-width, format and filler characters (U+200B, U+3164, U+2800 ...) do not count. 400 validation_error otherwise (the length floor is checked by the handler, after NFC, not by this schema).' },
      teacherInviteCode: { type: 'string', maxLength: 100, description: 'Required to create a teacher account.' },
    },
  } satisfies Schema,
  login: {
    type: 'object', required: ['email', 'password'], additionalProperties: false,
    properties: { email: str(3, 200), password: str(1, 200) },
  } satisfies Schema,
  answer: {
    type: 'object', required: ['stepId', 'response'], additionalProperties: false,
    properties: {
      stepId: str(1, 64),
      response: { type: 'object', description: 'Engine specific. point: {x,y} (0-100). choice: {choice}. decision: {decision}. order: {order:[ids]}. match: {pairs:{leftId:rightId}}.' },
    },
  } satisfies Schema,
  hint: { type: 'object', required: ['stepId'], additionalProperties: false, properties: { stepId: str(1, 64) } } satisfies Schema,
  unlock: {
    type: 'object', required: ['code'], additionalProperties: false,
    properties: { code: { type: 'string', pattern: '^[0-9]{3,4}$', example: '000' } },
  } satisfies Schema,
  profile: {
    type: 'object', additionalProperties: false,
    properties: {
      name: { ...label(80), description: `${NAME_RULES} Keeping your own name, even spelled differently, is always allowed.` },
      language: { type: 'string', enum: ['en', 'fr'] },
      sound: { type: 'boolean' }, reduceMotion: { type: 'boolean' }, notifications: { type: 'boolean' },
      program: str(0, 120), studyLevel: str(0, 40),
    },
  } satisfies Schema,
  contentStatus: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { type: 'string', enum: ['draft', 'reviewed', 'approved'] } } } satisfies Schema,
  demoLogin: { type: 'object', required: ['role'], additionalProperties: false, properties: { role: { type: 'string', enum: ['student', 'teacher'] } } } satisfies Schema,
  className: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { ...str(2, 80), pattern: '\\S' } } } satisfies Schema,
  join: { type: 'object', required: ['joinCode'], additionalProperties: false, properties: { joinCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[A-Za-z0-9]{6}$' } } } satisfies Schema,
};

/**
 * The account key of an e-mail: NFC, trimmed, lower-cased (R20-A-01). NFC and NFD spellings of one address are the same account.
 * Accounts stored before this rule keep whatever spelling they were registered with (no migration): findUserByEmail falls back to comparing normalised values.
 */
export const normalizeEmail = (raw: string): string => raw.normalize('NFC').trim().toLowerCase().normalize('NFC');

/**
 * Every user row whose e-mail has this account key. The indexed exact match comes first; only a non-ASCII key also scans the (few)
 * non-ASCII stored e-mails, which may hold another Unicode form. Rows stored before the rule can share one key (R21-A-01), so sign-in tries each.
 */
function findUsersByEmail<T>(db: DB, key: string, columns: string): T[] {
  const hit = db.prepare(`SELECT ${columns} FROM users WHERE email = ?`).get(key) as T | undefined;
  const found: T[] = hit ? [hit] : [];
  if (!/[^\x00-\x7f]/.test(key)) return found;
  const rows = db.prepare(`SELECT email, ${columns} FROM users WHERE email GLOB '*[^ -~]*' AND email <> ?`).all(key) as Array<T & { email: string }>;
  for (const r of rows) if (normalizeEmail(r.email) === key) found.push(r);
  return found;
}

/** The first user row with this account key (enough to say that the address is taken). */
const findUserByEmail = <T,>(db: DB, key: string, columns: string): T | undefined => findUsersByEmail<T>(db, key, columns)[0];

const intParam = (v: string, name: string): number => {
  if (!/^\d{1,9}$/.test(v)) throw bad(`${name} must be an integer`);
  return Number(v);
};

export function buildRoutes(d: Deps): Route[] {
  const { db, game, limiter, secret } = d;
  const uid = (c: Ctx) => c.user!.id;
  // The shared E2E demo learner legitimately bursts far above a human pace.
  const perUserScale = process.env.NODE_ENV === 'test' ? 50 : 1;
  /** Account-changing writes (profile, classes, content review): one shared per-account budget, so a script cannot flood the tables. */
  const write = (c: Ctx) => limiter.hit(`write:${uid(c)}`, (d.limits?.writePerMinute ?? 60) * perUserScale, 60_000);
  const issue = (u: { id: number; role: 'student' | 'teacher' }) =>
    signToken({ sub: u.id, role: u.role, exp: Math.floor(d.now() / 1000) + 7 * 86400 }, secret);

  return [
    { method: 'GET', path: '/api/health', auth: 'none', tag: 'System', summary: 'Liveness probe.', handler: () => ({ status: 'ok', labs: LABS.filter((l) => l.playable).length, missions: MISSIONS.length }) },
    { method: 'GET', path: '/api/rules', auth: 'none', tag: 'System', summary: 'Public scoring rules, published verbatim so the ledger is never a surprise.', handler: () => scoringRules() },

    // ----------------------------------------------------------------- auth
    {
      method: 'POST', path: '/api/auth/register', auth: 'none', tag: 'Auth', summary: 'Create a student account (teacher with invite code). 409 email_taken or, for a teacher, name_taken.', status: 201, body: S.register,
      description: 'Errors: 400 validation_error (invalid body, an empty or invisible name, a name containing "(teacher #number)"), 403 invalid_invite, 409 email_taken (e-mail already registered; addresses are compared after Unicode NFC normalisation, trimming and lower-casing, so composed and decomposed spellings are the same account), 409 name_taken (teacher name already used by another teacher account, or the reserved demo teacher name), 429 too many registrations.',
      handler: async (c) => {
        const b = c.body as { name: string; email: string; password: string; teacherInviteCode?: string };
        // The length is what the stored (NFC) secret has, and a blank password is no password (R14-A-08). Checked before the rate limit so a typo does not use up an attempt.
        const secret = b.password.normalize('NFC');
        if ([...secret].length < 10) throw bad('The password is too short.', ['body.password must be at least 10 characters (counted after Unicode NFC normalisation)']);
        if (visibleSecretLength(secret) < MIN_VISIBLE_PASSWORD) throw bad('The password needs more visible characters.', [`body.password must contain at least ${MIN_VISIBLE_PASSWORD} visible characters (whitespace, zero-width and filler characters do not count)`]);
        limiter.hit(`reg:${c.ip}`, d.limits?.registerPerHour ?? 100, 3600_000);
        let role: 'student' | 'teacher' = 'student';
        if (b.teacherInviteCode !== undefined && b.teacherInviteCode !== '') {
          if (!d.teacherInviteCode || b.teacherInviteCode !== d.teacherInviteCode) throw forbidden('Invalid teacher invite code.', 'invalid_invite');
          role = 'teacher';
        }
        const email = normalizeEmail(b.email);
        if (isDemoEmail(email)) throw new ApiError(400, 'reserved_email', 'This email domain is reserved for the demo accounts.');
        if (findUserByEmail(db, email, '1 AS one')) throw new ApiError(409, 'email_taken', 'An account with this email already exists.');
        const hash = await hashPassword(b.password);
        let id: number;
        try {
          // Name rules (suffix imitation, teacher name uniqueness) and the INSERT run in one write transaction inside the Game.
          id = game.createAccount(email, b.name, hash, role, d.now());
        } catch (e) {
          // Two concurrent registrations can both pass the pre-check; the UNIQUE index is the real guard.
          if (e instanceof Error && /UNIQUE constraint failed: users\.email/.test(e.message)) throw new ApiError(409, 'email_taken', 'An account with this email already exists.');
          throw e;
        }
        return { token: issue({ id, role }), user: game.me(id) };
      },
    },
    {
      method: 'POST', path: '/api/auth/login', auth: 'none', tag: 'Auth', summary: 'Sign in and receive a bearer token (7 days).', description: 'The e-mail is compared after Unicode NFC normalisation, trimming and lower-casing.', body: S.login,
      handler: async (c) => {
        const b = c.body as { email: string; password: string };
        const email = normalizeEmail(b.email);
        // Only FAILED sign-ins count, so a class logging in on one school network is never throttled by its own successes.
        // The per-account bucket is keyed on ip+email so a stranger cannot lock the real owner out.
        const perIp = d.limits?.loginFailuresPerIp ?? 60;
        const ipKey = `loginfail:${c.ip}`;
        const accountKey = `loginfail:${c.ip}:${email}`;
        // Each attempt reserves its failure slots BEFORE the (slow, awaited) password check, so concurrent wrong guesses count
        // against each other; a success gives its slots back, so successes still never throttle anyone.
        limiter.hit(ipKey, perIp, 600_000);
        try { limiter.hit(accountKey, 8, 600_000); } catch (e) { limiter.release(ipKey); throw e; }
        const candidates = findUsersByEmail<{ id: number; role: 'student' | 'teacher'; password_hash: string; is_demo_account: number }>(db, email, 'id, role, password_hash, is_demo_account');
        // Same work and same message whether or not the account exists (one password check at least; several only for rows stored before the e-mail rule that share one key).
        // With DEMO_MODE off the seeded accounts (published password) are refused through the same path as a wrong password.
        let u: (typeof candidates)[number] | undefined;
        let checked = false;
        for (const candidate of candidates) {
          if (!d.demo && candidate.is_demo_account) continue;
          checked = true;
          if (await verifyPassword(b.password, candidate.password_hash)) { u = candidate; break; }
        }
        if (!checked) await verifyPassword(b.password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        if (!u) throw unauthorized('Incorrect email or password.');
        limiter.release(ipKey);
        limiter.release(accountKey);
        return { token: issue(u), user: game.me(u.id) };
      },
    },
    {
      method: 'POST', path: '/api/auth/demo', auth: 'none', tag: 'Demo', summary: 'One-click demo sign-in (student Alex Martin or teacher Dr. Claire Moreau). Only available when the server runs with DEMO_MODE=1.', body: S.demoLogin,
      handler: (c) => {
        if (!d.demo) throw notFound('Demo mode is not enabled on this server.');
        // Keep production demo sign-in rate-limited; the higher test-only ceiling
        // prevents repeated isolated E2E workers from exhausting shared localhost state.
        limiter.hit(`demo:${c.ip}`, process.env.NODE_ENV === 'test' ? 1000 : 60, 600_000);
        const email = (c.body as { role: 'student' | 'teacher' }).role === 'teacher' ? DEMO_TEACHER_EMAIL : DEMO_STUDENT_EMAIL;
        const u = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email) as { id: number; role: 'student' | 'teacher' } | undefined;
        if (!u) throw notFound('Demo data has not been seeded. Run npm run seed:demo.');
        return { token: issue(u), user: game.me(u.id), demo: true };
      },
    },
    { method: 'GET', path: '/api/me', auth: 'user', tag: 'Auth', summary: 'Current user with XP and level.', handler: (c) => game.me(uid(c)) },

    // ------------------------------------------------------------- student
    { method: 'GET', path: '/api/dashboard', auth: 'student', tag: 'Student', summary: 'Dashboard: level, XP, streak, progress, continue and recommended mission.', handler: (c) => game.dashboard(uid(c)) },
    { method: 'GET', path: '/api/labs', auth: 'student', tag: 'Labs', summary: 'Lab map: every lab with its state (completed, current, available, locked, coming_soon).', handler: (c) => ({ labs: game.listLabs(uid(c)) }) },
    { method: 'GET', path: '/api/labs/:slug', auth: 'student', tag: 'Labs', summary: 'Lab lobby: missions with state, best score and the vault.', handler: (c) => game.labLobby(uid(c), c.params.slug!) },
    { method: 'GET', path: '/api/vault', auth: 'student', tag: 'Vault', summary: 'Code Vault: fragments found per lab. The code itself is never returned.', handler: (c) => ({ vaults: game.vault(uid(c)) }) },
    {
      method: 'POST', path: '/api/labs/:slug/unlock', auth: 'student', tag: 'Vault', summary: 'Enter the exit code to unlock a lab. 422 on a wrong code; 429 after five wrong codes in ten minutes.', body: S.unlock,
      handler: (c) => game.unlockLab(uid(c), c.params.slug!, (c.body as { code: string }).code),
    },
    { method: 'GET', path: '/api/badges', auth: 'student', tag: 'Student', summary: 'All badges with earned state.', handler: (c) => ({ badges: game.badges(uid(c)) }) },
    { method: 'GET', path: '/api/competencies', auth: 'student', tag: 'Student', summary: 'Competency percentages, strongest competency and improvement area.', handler: (c) => game.competencies(uid(c)) },

    {
      method: 'GET', path: '/api/labs/:slug/results', auth: 'student', tag: 'Labs', summary: 'Lab results once the lab is escaped: XP, accuracy, time, hints, ledger, competencies and the mission breakdown. 409 lab_not_escaped before that.',
      handler: (c) => game.labResults(uid(c), c.params.slug!),
    },

    // ------------------------------------------------------------- social, profile
    {
      method: 'GET', path: '/api/leaderboard', auth: 'student', tag: 'Social', summary: 'Leaderboard by XP. Other students appear as "Inès M."; your own row is always returned in `me`.',
      description: '`total` is the number of students in the cohort who have XP in the window (all-time or last 7 days): the same figure for every viewer. Students without XP are not ranked and are not listed; a viewer without XP still gets their own row in `me`, placed below everyone ranked (rank = total + 1).',
      query: [
        { name: 'scope', schema: { type: 'string', enum: ['week', 'all'] }, description: 'week = XP earned in the last 7 days; all = all-time (default).' },
        { name: 'cohort', schema: { type: 'string', enum: ['class', 'all'] }, description: 'class = students sharing a class with you (default); all = every student.' },
      ],
      handler: (c) => game.leaderboard(uid(c), (c.query.get('scope') as 'week' | 'all') ?? 'all', (c.query.get('cohort') as 'class' | 'all') ?? 'class'),
    },
    { method: 'GET', path: '/api/profile', auth: 'user', tag: 'Profile', summary: 'Profile: identity, XP and level, accuracy, average mission time, labs, badges and settings (language, sound, reduced motion, notifications).', handler: (c) => game.profile(uid(c)) },
    { method: 'PUT', path: '/api/profile', auth: 'user', tag: 'Profile', summary: 'Update settings and identity. Only the fields you send change. A teacher rename can answer 409 name_taken.', body: S.profile,
      description: 'Errors: 400 validation_error (invalid body, an empty or invisible name, a name containing "(teacher #number)"), 409 name_taken (another teacher account already uses this name, or it is the reserved demo teacher name), 429 too many writes.', handler: (c) => { write(c); return game.updateProfile(uid(c), c.body as Parameters<Game['updateProfile']>[1]); } },

    // ------------------------------------------------------------- missions
    { method: 'POST', path: '/api/missions/:id/start', auth: 'student', tag: 'Missions', summary: 'Start a mission, or resume the attempt already in progress.', status: 201, body: EMPTY_BODY, handler: (c) => { limiter.hit(`start:${uid(c)}`, (d.limits?.startPerMinute ?? 60) * perUserScale, 60_000); return game.startMission(uid(c), c.params.id!); } },
    { method: 'GET', path: '/api/attempts/:id', auth: 'student', tag: 'Missions', summary: 'Current state of an attempt: current step (with the hints already delivered on it, in level order, as step.hintsGiven), revealed values, timer, penalties.', handler: (c) => game.getAttempt(uid(c), c.params.id!) },
    {
      method: 'POST', path: '/api/attempts/:id/answer', auth: 'student', tag: 'Missions', summary: 'Submit the answer for the current step. Correct answers return the explanation and may return a code fragment.', body: S.answer,
      handler: (c) => { limiter.hit(`answer:${uid(c)}`, (d.limits?.answerPerMinute ?? 120) * perUserScale, 60_000); const b = c.body as { stepId: string; response: unknown }; return game.answer(uid(c), c.params.id!, b.stepId, b.response); },
    },
    {
      method: 'POST', path: '/api/attempts/:id/hint', auth: 'student', tag: 'Missions', summary: 'Ask the Lab Assistant (BETA) for a hint. Costs 15 XP. Never returns the answer; falls back to the standard hint. The delivered text is stored and listed in attempt.step.hintsGiven from then on.', body: S.hint,
      handler: (c) => { limiter.hit(`hint:${uid(c)}`, (d.limits?.hintPerMinute ?? 30) * perUserScale, 60_000); return game.hint(uid(c), c.params.id!, (c.body as { stepId: string }).stepId); },
    },
    { method: 'GET', path: '/api/attempts/:id/result', auth: 'student', tag: 'Missions', summary: 'Result screen payload: ledger, stats, badges, competencies.', handler: (c) => game.result(uid(c), c.params.id!) },

    // -------------------------------------------------------------- classes
    { method: 'POST', path: '/api/classes/join', auth: 'student', tag: 'Classes', summary: 'Join a class with its code.', body: S.join, handler: (c) => { limiter.hit(`join:${uid(c)}`, d.limits?.joinPerUser ?? 10, 600_000); return game.joinClass(uid(c), (c.body as { joinCode: string }).joinCode); } },
    { method: 'POST', path: '/api/classes', auth: 'teacher', tag: 'Classes', summary: 'Create a class and get its join code.', description: 'A class name needs at least 2 visible characters (invisible ones do not count). A teacher cannot own two classes with the same name: 409 class_name_taken. Two names are the same when they differ only by case (including ß / SS and final sigma), by whitespace (any whitespace of any length counts as one space), by invisible characters (zero-width, soft hyphen, bidi and format characters, a stray combining U+0345 ypogegrammeni), by compatibility forms (fullwidth letters, ligatures, mathematical alphabets) or by Cyrillic / Greek look-alikes of Latin letters. Punctuation, accents, digits and the shapes I / l / 1 / | and O / 0 are significant, so "Section 1.2" / "Section 12" and "Year 1" / "Year I" are different classes. At most 50 classes per teacher: 409 class_limit_reached.', status: 201, body: S.className, handler: (c) => { write(c); return game.createClass(uid(c), (c.body as { name: string }).name.trim()); } },
    { method: 'GET', path: '/api/classes', auth: 'teacher', tag: 'Classes', summary: 'Your classes.', handler: (c) => ({ classes: game.listClasses(uid(c)) }) },
    {
      method: 'GET', path: '/api/classes/:id/students', auth: 'teacher', tag: 'Classes', summary: 'Roster with progress, accuracy, XP, last activity and the needs-attention flag.',
      query: [
        { name: 'q', schema: { type: 'string', maxLength: 80 }, description: 'Name search.' },
        { name: 'status', schema: { type: 'string', enum: ['all', 'attention', 'active', 'inactive'] } },
      ],
      handler: (c) => game.students(uid(c), intParam(c.params.id!, 'id'), { q: c.query.get('q') ?? undefined, status: (c.query.get('status') as 'all' | 'attention' | 'active' | 'inactive') ?? 'all' }),
    },
    { method: 'GET', path: '/api/classes/:id/students/:studentId', auth: 'teacher', tag: 'Classes', summary: 'One student: metrics, labs, competencies and mission history.', description: '`history` lists the latest 20 completed attempts, newest first; `historyTotal` (integer, always at least `history.length`) is the number of all completed attempts of the student, so a client can say "latest 20 of N".', handler: (c) => game.studentDetail(uid(c), intParam(c.params.id!, 'id'), intParam(c.params.studentId!, 'studentId')) },
    { method: 'GET', path: '/api/classes/:id/analytics', auth: 'teacher', tag: 'Classes', summary: 'Cohort analytics: first-attempt success per mission, weakest mission flagged, roster.', handler: (c) => game.analytics(uid(c), intParam(c.params.id!, 'id')) },

    // ------------------------------------------------------- content, demo
    { method: 'GET', path: '/api/content/missions', auth: 'teacher', tag: 'Content', summary: 'Internal: scientific approval status of every mission (draft, reviewed, approved). Never shown to students.', handler: () => game.contentMissions() },
    { method: 'PUT', path: '/api/content/missions/:id/status', auth: 'teacher', tag: 'Content', summary: 'Internal: move a mission through Draft, Reviewed, Approved. Approval requires a review first.', body: S.contentStatus, handler: (c) => { write(c); return game.setContentStatus(uid(c), c.params.id!, (c.body as { status: 'draft' | 'reviewed' | 'approved' }).status); } },
    {
      method: 'POST', path: '/api/demo/reset', auth: 'user', tag: 'Demo', summary: 'Restore the demo student (Alex Martin) or the demo teacher (Dr. Claire Moreau: name, classes, content review) to the prepared presentation state. 403 for every other account.', body: EMPTY_BODY,
      handler: (c) => { if (!d.demo) throw notFound('Demo mode is not enabled on this server.'); return c.user!.role === 'teacher' ? resetDemoTeacher(db, game, uid(c)) : resetDemoStudent(db, game, uid(c)); },
    },
  ];
}
