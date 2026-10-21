// Seeds the presentation data: Alex Martin (student), Dr. Claire Moreau (teacher) and a class of 38 students.
// Everything is produced by playing the real game with a controlled clock, so the numbers are the rules' own.
//   DB_PATH=./data/demo.db npm run seed:demo      then start the API with DEMO_MODE=1
import { DEMO_PASSWORD, DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, ensureShowcaseRooms, seedDemo } from '../src/demo.ts';
import { openDb } from '../src/db.ts';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_IN_PRODUCTION !== '1') {
  console.error('Refusing to seed public demo credentials with NODE_ENV=production.');
  process.exit(1);
}
const db = openDb(process.env.DB_PATH || './data/escape-lab.db');
const out = await seedDemo(db, Date.now());
if (!out) {
  const rooms = ensureShowcaseRooms(db, Date.now());
  console.log(rooms ? `Demo data already present; added the Teacher Studio showcase: ${rooms.rooms} rooms, ${rooms.attempts} simulated attempts.` : 'Demo data already present, nothing to do.');
} else {
  const m = out.metrics;
  console.log(`Seeded the demo (plan #${out.seed}): 38 students, class accuracy ${m.avgAccuracyPct}%, completion ${m.avgCompletionPct}%; Teacher Studio: ${out.showcase.rooms} rooms, ${out.showcase.attempts} simulated attempts.`);
}
console.log(`Teacher: ${DEMO_TEACHER_EMAIL} / ${DEMO_PASSWORD}\nStudent: ${DEMO_STUDENT_EMAIL} / ${DEMO_PASSWORD}\nStart the API with DEMO_MODE=1 to get one-click sign-in (POST /api/auth/demo) and POST /api/demo/reset.`);
db.close?.();
