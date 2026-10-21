// Showcase rooms of the demo teacher, and the class's simulated attempts on them, so the Studio results (trap rates, option picks,
// click heatmap) have something to show on the first visit. Like the rest of the demo, every attempt is PLAYED through the Studio service
// with a controlled clock: no score or answer row is written by hand. The rooms are FICTITIOUS teaching content in French, written for
// the demonstration and not reviewed by an expert (docs/KNOWN_LIMITATIONS.md); zone coordinates were checked on the library artwork.
import type { DB } from './db.ts';
import { tx } from './db.ts';
import { validateRoomDoc } from './rooms.ts';
import type { PublicQuestion, Question, RoomDoc } from './rooms.ts';
import { Studio } from './studio.ts';
import { ApiError } from './http.ts';

const DAY = 86_400_000;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The showcase rooms, by fixed id (the demo reset restores exactly these). */
export const SHOWCASE: Array<{ id: string; doc: unknown; difficulty: number[] }> = [
  {
    id: 'room-demo-immunology',
    difficulty: [0.35, 0.45, 0.3, 0.5, 0.4, 0.3],
    doc: {
      title: 'Immunologie : ouverture du laboratoire',
      summary: 'Six énigmes pour ouvrir le futur laboratoire d’immunologie : anticorps, marqueurs, ELISA. Attention aux pièges.',
      discipline: 'immunology', mode: 'escape', vaultCode: 'IGM10', timeLimitSec: 900, shuffleQuestions: false, shuffleOptions: true, passPct: 60,
      showFeedback: true, revealAnswers: true, maxAttempts: 0,
      cover: { asset: 'lab-master', alt: 'Laboratoire illustratif éclairé, paillasses et écrans d’analyse' },
      intro: 'Le laboratoire d’immunologie ouvre bientôt. Chaque énigme résolue révèle un caractère du code du coffre. Trouvez-les tous pour sortir.',
      outro: 'Coffre ouvert : vous maîtrisez les bases de l’immunologie humorale. Rendez-vous à l’ouverture du laboratoire !',
      questions: [
        {
          id: 'imm-1', type: 'choice', points: 20, prompt: 'Quelle immunoglobuline apparaît en premier lors d’une réponse immunitaire primaire ?',
          hints: ['Pensez à la forme pentamérique.'], explanation: 'L’IgM est la première classe produite lors d’une réponse primaire ; la commutation de classe vers l’IgG vient ensuite.',
          feedbackWrong: 'Raisonnez sur la chronologie de la réponse, pas sur la quantité finale d’anticorps.',
          options: [
            { id: 'a', label: 'IgM', correct: true },
            { id: 'b', label: 'IgG', correct: false, trap: true, feedback: 'Piège classique : l’IgG domine la réponse secondaire et la fin de la réponse primaire, mais elle n’apparaît pas en premier.' },
            { id: 'c', label: 'IgE', correct: false },
            { id: 'd', label: 'IgA', correct: false },
          ],
        },
        {
          id: 'imm-2', type: 'truefalse', points: 10, prompt: 'Vrai ou faux : les IgM maternelles traversent le placenta et protègent le nouveau-né.',
          answer: false, trap: true, hints: ['Une seule classe d’immunoglobulines traverse le placenta.'],
          explanation: 'Faux : seule l’IgG traverse le placenta (transport par le récepteur FcRn). L’IgM pentamérique est trop volumineuse.',
          feedbackWrong: 'C’est l’IgG, pas l’IgM, qui traverse le placenta. Une IgM spécifique chez le nouveau-né évoque d’ailleurs une infection congénitale.',
        },
        {
          id: 'imm-3', type: 'match', points: 15, prompt: 'Associez chaque marqueur de surface à la cellule qu’il caractérise.', hints: ['CD19 est un marqueur de la lignée B.'],
          explanation: 'CD4 : lymphocyte T auxiliaire. CD8 : lymphocyte T cytotoxique. CD19 : lymphocyte B. CD56 : cellule NK.',
          pairs: [
            { id: 'p1', left: 'CD4', right: 'Lymphocyte T auxiliaire' },
            { id: 'p2', left: 'CD8', right: 'Lymphocyte T cytotoxique' },
            { id: 'p3', left: 'CD19', right: 'Lymphocyte B' },
            { id: 'p4', left: 'CD56', right: 'Cellule NK' },
          ],
        },
        {
          id: 'imm-4', type: 'number', points: 15, prompt: 'Combien de sites de fixation de l’antigène possède une IgM pentamérique ?', unit: 'sites', value: 10, tolerance: 0,
          hints: ['Comptez les unités, puis les sites par unité.'], explanation: 'Cinq unités de deux sites chacune : 10 sites (valence théorique).',
          traps: [{ value: 5, feedback: 'Cinq est le nombre d’unités, et chacune porte deux sites de fixation.' }, { value: 2, feedback: 'Deux sites, c’est un monomère (IgG par exemple), pas le pentamère.' }],
        },
        {
          id: 'imm-5', type: 'order', points: 15, prompt: 'Remettez dans l’ordre les étapes d’un ELISA indirect.', hints: ['L’anticorps recherché est celui du patient.'],
          explanation: 'Antigène fixé, saturation, sérum du patient, anticorps secondaire conjugué, substrat puis lecture (avec des lavages entre les étapes).',
          items: [
            { id: 'e1', label: 'Fixer l’antigène au fond du puits' },
            { id: 'e2', label: 'Saturer les sites libres (blocage)' },
            { id: 'e3', label: 'Ajouter le sérum du patient' },
            { id: 'e4', label: 'Ajouter l’anticorps secondaire conjugué à une enzyme' },
            { id: 'e5', label: 'Ajouter le substrat et lire l’absorbance' },
          ],
        },
        {
          id: 'imm-6', type: 'text', points: 15, prompt: 'Quelle cellule active le plus efficacement les lymphocytes T CD4 naïfs ?', hints: ['Elle migre des tissus vers les ganglions.'],
          explanation: 'La cellule dendritique est la cellule présentatrice d’antigène professionnelle qui active le mieux les lymphocytes T naïfs.',
          accepted: ['cellule dendritique', 'cellules dendritiques', 'dendritique', 'dendritic cell'], typoTolerance: true,
          traps: [
            { answer: 'macrophage', feedback: 'Le macrophage présente l’antigène, mais il active surtout des lymphocytes T déjà différenciés, pas les T naïfs.' },
            { answer: 'polynucléaire neutrophile', feedback: 'Le neutrophile phagocyte, mais il n’active pas les lymphocytes T naïfs.' },
          ],
        },
      ],
    },
  },
  {
    id: 'room-demo-smear',
    difficulty: [0.35, 0.4, 0.5, 0.3],
    doc: {
      title: 'Hématologie : le frottis piégé',
      summary: 'Repérez le bon élément sur le frottis, au pixel près, sans tomber dans les pièges visuels.',
      discipline: 'hematology', mode: 'escape', vaultCode: 'FRAG', timeLimitSec: 600, shuffleQuestions: false, shuffleOptions: true, passPct: 60,
      showFeedback: true, revealAnswers: true, maxAttempts: 0,
      cover: { asset: 'smear-schistocyte-01', alt: 'Frottis sanguin stylisé avec de nombreuses hématies' },
      intro: 'Un patient porteur d’une valve mécanique présente une anémie. Le frottis vous attend.',
      outro: 'Frottis interprété : vous avez reconnu la fragmentation mécanique et évité les pièges.',
      questions: [
        {
          id: 'sm-1', type: 'hotspot', points: 25, prompt: 'Cliquez sur le schistocyte (hématie fragmentée).',
          context: 'Frottis sanguin, objectif ×100. Bilan d’hémolyse chez un porteur de valve mécanique.',
          image: { asset: 'smear-schistocyte-01', alt: 'Frottis sanguin stylisé : nombreuses hématies rondes, quelques plaquettes violettes, un élément anguleux au centre' },
          tolerance: 5, require: 'any',
          hints: ['Ignorez les cellules rondes avec une pâleur centrale.', 'Cherchez des angles vifs.'],
          explanation: 'Le schistocyte est un fragment d’hématie aux bords anguleux, sans pâleur centrale : il signe une fragmentation mécanique.',
          feedbackWrong: 'Cherchez un fragment, pas une cellule entière.',
          zones: [
            { id: 'schisto', label: 'Fragment anguleux au centre du champ', shape: 'circle', x: 1232, y: 440, r: 66 },
            { id: 'normal', label: 'Grande hématie ronde à droite', shape: 'circle', x: 1330, y: 310, r: 66, trap: true, feedback: 'Cette hématie est entière, ronde, avec une pâleur centrale : elle est normale.' },
            { id: 'overlap', label: 'Deux hématies superposées en haut', shape: 'circle', x: 1075, y: 222, r: 68, trap: true, feedback: 'Deux hématies superposées créent un faux contour : c’est un artefact d’étalement, pas une fragmentation.' },
            { id: 'platelet', label: 'Petit élément violet en bas', shape: 'circle', x: 1105, y: 648, r: 22, trap: true, feedback: 'Ce petit élément violet est une plaquette, pas un fragment d’hématie.' },
          ],
          decoys: ['Hématie en cible', 'Corps de Howell-Jolly'],
        },
        {
          id: 'sm-2', type: 'choice', points: 15, prompt: 'Quel mécanisme explique le mieux la présence de schistocytes chez ce patient ?',
          hints: ['Pensez à la valve.'], explanation: 'Les schistocytes signent une hémolyse mécanique : prothèse valvulaire ou microangiopathie thrombotique.',
          options: [
            { id: 'a', label: 'Hémolyse mécanique (valve, microangiopathie)', correct: true },
            { id: 'b', label: 'Carence martiale', correct: false, trap: true, feedback: 'La carence en fer donne des hématies petites et pâles, pas des fragments.' },
            { id: 'c', label: 'Carence en vitamine B12', correct: false, feedback: 'La carence en B12 donne une macrocytose, pas une fragmentation.' },
            { id: 'd', label: 'Thalassémie mineure', correct: false },
          ],
        },
        {
          id: 'sm-3', type: 'choice', multiple: true, points: 20, prompt: 'Quels résultats soutiennent une hémolyse ? (plusieurs réponses)',
          hints: ['Trois marqueurs varient ensemble lors d’une hémolyse.'], explanation: 'LDH élevée, haptoglobine effondrée et bilirubine libre élevée : la triade biologique de l’hémolyse.',
          options: [
            { id: 'a', label: 'LDH élevée', correct: true },
            { id: 'b', label: 'Haptoglobine effondrée', correct: true },
            { id: 'c', label: 'Bilirubine libre élevée', correct: true },
            { id: 'd', label: 'Ferritine basse', correct: false, trap: true, feedback: 'La ferritine reflète les réserves en fer, pas la destruction des hématies.' },
          ],
        },
        {
          id: 'sm-4', type: 'number', points: 10, prompt: 'Chez l’adulte, sous quel VGM (en fL) parle-t-on de microcytose ?', unit: 'fL', value: 80, tolerance: 0,
          hints: ['Le seuil haut est 100 fL.'], explanation: 'Microcytose sous 80 fL, macrocytose au-delà de 100 fL.',
          traps: [{ value: 100, feedback: '100 fL est le seuil de la macrocytose, pas de la microcytose.' }],
        },
      ],
    },
  },
  {
    id: 'room-demo-microbiology',
    difficulty: [0.5, 0.3, 0.3, 0.4, 0.45],
    doc: {
      title: 'Microbiologie : examen flash',
      summary: 'Évaluation chronométrée : une seule réponse par question, correction à la fin.',
      discipline: 'microbiology', mode: 'exam', vaultCode: '', timeLimitSec: 600, shuffleQuestions: true, shuffleOptions: true, passPct: 50,
      showFeedback: false, revealAnswers: true, maxAttempts: 0,
      cover: { asset: 'mission-microbiology-petri', alt: 'Boîtes de Petri illustratives avec des colonies colorées' },
      intro: 'Dix minutes, une seule réponse par question. La correction apparaît à la fin.',
      outro: 'Examen terminé. Relisez les explications avant la séance de travaux pratiques.',
      questions: [
        {
          id: 'mi-1', type: 'hotspot', require: 'all', points: 20, prompt: 'Marquez les trois grandes colonies filamenteuses (aspect cotonneux) de la boîte centrale.',
          image: { asset: 'mission-microbiology-petri', alt: 'Boîte de Petri illustrative avec de grandes colonies duveteuses bleue, blanche et rose et de petites colonies lisses jaunes' },
          tolerance: 5, hints: [], explanation: 'Les colonies duveteuses à bords irréguliers évoquent des moisissures ; les petites colonies lisses et brillantes n’en sont pas.',
          zones: [
            { id: 'blue', label: 'Grande colonie bleu-vert', shape: 'circle', x: 600, y: 490, r: 105 },
            { id: 'white', label: 'Grande colonie blanche', shape: 'circle', x: 570, y: 628, r: 95 },
            { id: 'pink', label: 'Grande colonie rose', shape: 'circle', x: 868, y: 545, r: 100 },
            { id: 'yellow', label: 'Colonie jaune lisse en bas', shape: 'circle', x: 748, y: 660, r: 40, trap: true, feedback: 'Colonie lisse, brillante, à bords nets : ce n’est pas un aspect filamenteux.' },
            { id: 'yellow-left', label: 'Colonie jaune lisse à gauche', shape: 'circle', x: 445, y: 585, r: 28, trap: true, feedback: 'Petite colonie lisse et bombée : pas de filaments.' },
          ],
          decoys: ['Couvercle de la boîte'],
        },
        {
          id: 'mi-2', type: 'choice', points: 10, prompt: 'Au Gram, Staphylococcus aureus apparaît comme :', hints: [],
          explanation: 'Cocci à Gram positif groupés en amas (« grappes de raisin »).',
          options: [
            { id: 'a', label: 'Cocci à Gram positif en amas', correct: true },
            { id: 'b', label: 'Cocci à Gram positif en chaînettes', correct: false, trap: true, feedback: 'Les chaînettes évoquent les streptocoques.' },
            { id: 'c', label: 'Bacilles à Gram négatif', correct: false },
            { id: 'd', label: 'Diplocoques à Gram négatif', correct: false },
          ],
        },
        {
          id: 'mi-3', type: 'order', points: 15, prompt: 'Ordonnez les étapes de la coloration de Gram.', hints: [],
          explanation: 'Violet de gentiane, Lugol (mordançage), décoloration à l’alcool-acétone, contre-coloration à la fuchsine ou à la safranine.',
          items: [
            { id: 'g1', label: 'Violet de gentiane' }, { id: 'g2', label: 'Lugol' }, { id: 'g3', label: 'Décoloration alcool-acétone' }, { id: 'g4', label: 'Fuchsine ou safranine' },
          ],
        },
        {
          id: 'mi-4', type: 'truefalse', points: 10, prompt: 'Vrai ou faux : après décoloration, les bactéries à Gram négatif perdent le violet de gentiane.', answer: true, hints: [],
          explanation: 'Vrai : leur paroi fine laisse partir le complexe violet-iode ; elles prennent ensuite la contre-coloration rose.',
          feedbackWrong: 'Ce sont les Gram négatifs qui sont décolorés, d’où leur couleur rose finale.',
        },
        {
          id: 'mi-5', type: 'text', points: 15, prompt: 'Quel milieu hypersalé (NaCl 7,5 %) et au mannitol isole les staphylocoques ?', hints: [],
          explanation: 'La gélose de Chapman : sélective par le sel, différentielle par la fermentation du mannitol.',
          accepted: ['Chapman', 'gélose de Chapman', 'milieu de Chapman', 'mannitol salt agar'], typoTolerance: true,
          traps: [{ answer: 'MacConkey', feedback: 'MacConkey sélectionne les bacilles à Gram négatif, pas les staphylocoques.' }],
        },
      ],
    },
  },
];

type Choice = 'right' | 'trap' | 'wrong';

/** A response to `pub` (the question as the learner received it) of the requested kind, built from the stored question `q`. */
function respond(q: Question, pub: PublicQuestion, kind: Choice, rnd: () => number): unknown {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const tok = (label: string, list: { id: string; label: string }[] | undefined) => list!.find((x) => x.label === label)!.id;
  switch (q.type) {
    case 'choice': {
      const traps = q.options.filter((o) => o.trap);
      const wrong = q.options.filter((o) => !o.correct && !o.trap);
      const right = q.options.filter((o) => o.correct);
      if (kind === 'right') return q.multiple ? { choices: right.map((o) => tok(o.label, pub.options)) } : { choice: tok(right[0]!.label, pub.options) };
      const bad = kind === 'trap' && traps.length ? pick(traps) : pick(wrong.length ? wrong : traps);
      return q.multiple ? { choices: [...right.slice(0, -1), bad].map((o) => tok(o.label, pub.options)) } : { choice: tok(bad.label, pub.options) };
    }
    case 'truefalse': return { value: kind === 'right' ? q.answer : !q.answer };
    case 'text': {
      if (kind === 'right') return { text: rnd() < 0.2 ? q.accepted[0]!.slice(0, -1) : pick(q.accepted.slice(0, 2)) };
      if (kind === 'trap' && q.traps.length) return { text: pick(q.traps).answer };
      return { text: pick(['lymphocyte', 'je ne sais pas', 'gélose au sang', 'basophile']) };
    }
    case 'number': {
      if (kind === 'right') return { value: q.value };
      if (kind === 'trap' && q.traps.length) return { value: pick(q.traps).value };
      return { value: q.value + pick([-3, 4, 7, 20]) };
    }
    case 'hotspot': {
      const right = q.zones.filter((z) => !z.trap);
      const traps = q.zones.filter((z) => z.trap);
      const inside = (z: (typeof q.zones)[number], spread: number) => {
        const a = rnd() * 2 * Math.PI;
        const d = Math.sqrt(rnd()) * (z.r ?? 20) * spread;
        return { x: Math.round(z.x + d * Math.cos(a)), y: Math.round(z.y + d * Math.sin(a)) };
      };
      const miss = (z: (typeof q.zones)[number]) => {
        const a = rnd() * 2 * Math.PI;
        const d = (z.r ?? 20) + q.tolerance + 15 + rnd() * 120;
        const w = q.image!.width; const h = q.image!.height;
        return { x: Math.min(w, Math.max(0, Math.round(z.x + d * Math.cos(a)))), y: Math.min(h, Math.max(0, Math.round(z.y + d * Math.sin(a)))) };
      };
      const wrongClick = () => (kind === 'trap' && traps.length ? inside(pick(traps), 0.8) : miss(pick(right)));
      if (q.require === 'all') {
        const pts = right.map((z) => inside(z, 0.75));
        if (kind !== 'right') pts[Math.floor(rnd() * pts.length)] = wrongClick();
        return { points: pts };
      }
      return kind === 'right' ? inside(right[0]!, 0.85) : wrongClick();
    }
    case 'order': {
      const labels = q.items.map((x) => x.label);
      if (kind !== 'right') { const i = Math.floor(rnd() * (labels.length - 1)); [labels[i], labels[i + 1]] = [labels[i + 1]!, labels[i]!]; }
      return { order: labels.map((l) => tok(l, pub.items)) };
    }
    case 'match': {
      const rights = q.pairs.map((x) => x.right);
      if (kind !== 'right') { const i = Math.floor(rnd() * (rights.length - 1)); [rights[i], rights[i + 1]] = [rights[i + 1]!, rights[i]!]; }
      return { pairs: Object.fromEntries(q.pairs.map((x, i) => [tok(x.left, pub.left), tok(rights[i]!, pub.right)])) };
    }
  }
}

/** Plays one attempt through the Studio service, the way a student of this `ability` would. A slow student may run out of time (kept as a timeout). */
function playAttempt(studio: Studio, clock: { t: number }, uid: number, roomId: string, doc: RoomDoc, difficulty: number[], ability: number, rnd: () => number) {
  let a = studio.start(uid, roomId).attempt;
  const lookup = new Map(doc.questions.map((q) => [q.id, q]));
  let guard = 0;
  try {
    while (a.status === 'in_progress' && a.question && guard++ < 60) {
      const pub = a.question;
      const q = lookup.get(pub.id)!;
      const d = difficulty[doc.questions.indexOf(q)] ?? 0.4;
      clock.t += Math.round((15 + rnd() * 40) * (1 + d) * (1.4 - ability)) * 1000;
      if (pub.hintsGiven.length < pub.hintsAvailable && rnd() < 0.18 * (1 - ability)) {
        studio.hint(uid, a.attemptId, pub.id);
        clock.t += 12_000;
      }
      const pRight = Math.min(0.97, Math.max(0.08, ability * (1 - d) + 0.25 + 0.2 * pub.wrong));
      const kind: Choice = rnd() < pRight ? 'right' : rnd() < 0.6 ? 'trap' : 'wrong';
      a = studio.answer(uid, a.attemptId, pub.id, respond(q, pub, kind, rnd)).attempt;
    }
    if (a.status === 'vault') {
      clock.t += 20_000;
      studio.escape(uid, a.attemptId, doc.vaultCode);
    }
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'time_up')) throw e;
  }
}

/** Deletes the demo teacher's rooms and pictures, then recreates the showcase rooms and replays the class's attempts. Deterministic. */
export function seedShowcaseRooms(db: DB, teacherId: number, base: number): { rooms: number; attempts: number } {
  const clock = { t: base - 9 * DAY };
  const studio = new Studio(db, () => clock.t);
  const classes = db.prepare('SELECT id FROM classes WHERE teacher_id = ? ORDER BY id LIMIT 2').all(teacherId) as Array<{ id: number }>;
  const l3 = classes[0]?.id;
  if (l3 === undefined) return { rooms: 0, attempts: 0 };
  const students = db.prepare(`SELECT u.id, u.is_demo FROM class_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.class_id = ? AND u.role = 'student' ORDER BY u.id`).all(l3) as Array<{ id: number; is_demo: number }>;
  let attempts = 0;
  tx(db, () => {
    db.prepare('DELETE FROM rooms WHERE teacher_id = ?').run(teacherId);
    db.prepare('DELETE FROM media WHERE owner_id = ?').run(teacherId);
    for (const [ri, room] of SHOWCASE.entries()) {
      const doc = validateRoomDoc(room.doc, () => null, { publish: true });
      clock.t = base - (9 - ri) * DAY;
      db.prepare(`INSERT INTO rooms (id, teacher_id, title, status, version, doc_json, showcase, created_at, updated_at, published_at)
        VALUES (?,?,?,'published',1,?,1,?,?,?)`).run(room.id, teacherId, doc.title, JSON.stringify(doc), clock.t, clock.t, clock.t);
      for (const c of classes) db.prepare('INSERT INTO room_classes (room_id, class_id) VALUES (?,?)').run(room.id, c.id);
      const rnd = rng(7919 * (ri + 1));
      // Most of the class has played the first two rooms; fewer have taken the exam. The demo student (the shared guest) has not: visitors play it fresh.
      const share = [0.82, 0.7, 0.55][ri] ?? 0.5;
      for (const s of students) {
        if (s.is_demo === 1 || rnd() > share) continue;
        clock.t = base - (8 - ri) * DAY + Math.floor(rnd() * 6 * DAY);
        const ability = 0.3 + 0.65 * rng(s.id * 31 + 7)();
        playAttempt(studio, clock, s.id, room.id, doc, room.difficulty, ability, rnd);
        attempts += 1;
        // A few students replay the escape rooms to improve their score.
        if (doc.mode === 'escape' && rnd() < 0.12) { clock.t += DAY / 3; playAttempt(studio, clock, s.id, room.id, doc, room.difficulty, Math.min(0.95, ability + 0.2), rnd); attempts += 1; }
      }
    }
  });
  return { rooms: SHOWCASE.length, attempts };
}
