// Illustrative placeholder content. Faculty must validate every case, value, key and
// explanation before it ships to students. Image hotspot coordinates are percentages of the
// ARTWORK itself (the web client renders each image at its natural aspect ratio, so 1% of the
// width/height maps 1:1). They must be recalibrated whenever an image asset is replaced.
import type { Lab, Mission, ScoringProfile, Step } from './types.ts';

export const LABS: Lab[] = [
  { slug: 'hematology', name: 'Hematology Lab', discipline: 'hematology', ordinal: 1, playable: true, codeLength: 3,
    blurb: 'Blood cells, indices and the pre-analytical checks behind every count.' },
  { slug: 'microbiology', name: 'Microbiology Lab', discipline: 'microbiology', ordinal: 2, playable: true, codeLength: 3,
    blurb: 'Stains, cultures and the logic that turns a plate into an identification.' },
  { slug: 'biochemistry', name: 'Clinical Biochemistry Lab', discipline: 'biochemistry', ordinal: 3, playable: true, codeLength: 3,
    blurb: 'Interpret organ panels, spot interference and read acid-base status.' },
  { slug: 'master', name: 'Master Lab', discipline: 'master', ordinal: 4, playable: true, codeLength: 4,
    blurb: 'One patient, three disciplines. Integrate everything you have learned.' },
  { slug: 'immunology', name: 'Immunology Lab', discipline: 'immunology', ordinal: 5, playable: false, codeLength: 0, blurb: 'Coming soon.' },
  { slug: 'parasitology', name: 'Parasitology Lab', discipline: 'parasitology', ordinal: 6, playable: false, codeLength: 0, blurb: 'Coming soon.' },
  { slug: 'blood-bank', name: 'Blood Bank / Immunohematology Lab', discipline: 'bloodbank', ordinal: 7, playable: false, codeLength: 0, blurb: 'Coming soon.' },
  { slug: 'molecular-biology', name: 'Molecular Biology Lab', discipline: 'molecular', ordinal: 8, playable: false, codeLength: 0, blurb: 'Coming soon.' },
  { slug: 'cytology', name: 'Cytology Lab', discipline: 'cytology', ordinal: 9, playable: false, codeLength: 0, blurb: 'Coming soon.' },
  { slug: 'histology', name: 'Histology Lab', discipline: 'histology', ordinal: 10, playable: false, codeLength: 0, blurb: 'Coming soon.' },
  { slug: 'quality-management', name: 'Quality Management Lab', discipline: 'quality', ordinal: 11, playable: false, codeLength: 0, blurb: 'Coming soon.' },
];

export const STANDARD_SCORING: ScoringProfile = { base: 100, firstTryMode: 'all', firstTry: 30, timeMax: 30, noHint: 20 };
export const MASTER_SCORING: ScoringProfile = { base: 300, firstTryMode: 'perStep', firstTry: 30, timeMax: 90, noHint: 60 };

const HEM = 'Hematology interpretation';
const MIC = 'Microbiology investigation';
const BIO = 'Clinical biochemistry';
const PRE = 'Pre-analytical quality';
const CLI = 'Clinical reasoning';

const abcd = (...labels: string[]) => labels.map((label, i) => ({ id: 'ABCDE'[i]!, label }));

// ---------------------------------------------------------------- Hematology
const hem1: Step[] = [{
  id: 'hem-01-s1', kind: 'point', competency: HEM,
  context: 'Peripheral blood smear, 100x oil. Hemolytic anemia work-up, post-mechanical valve.',
  prompt: 'Click the schistocyte (fragmented red cell).',
  data: { image: { asset: 'smear-schistocyte-01', caption: 'Stylised blood smear (illustrative)' } },
  // Centre of the schistocyte in web/src/assets/blood-smear-hero.webp (1230,440 of 1672x941).
  key: { kind: 'point', x: 73.6, y: 46.8, r: 6 },
  explanation: 'Schistocytes are irregular red cell fragments with sharp edges and no central pallor. They point to mechanical fragmentation of red cells.',
  recheck: 'Look for fragments, not whole cells: sharp angles and no central pallor.',
  hints: ['Ignore the round cells with central pallor.', 'The cell you want is smaller than its neighbours and has pointed corners.'],
}];

const hem2: Step[] = [
  {
    id: 'hem-02-s1', kind: 'decision', competency: PRE,
    context: 'Sample 1. EDTA tube, adult female outpatient (female reference ranges shown).',
    prompt: 'A fibrin clot is visible in the tube. Platelets 38 ×10⁹/L (flagged). What do you do?',
    data: { sample: { id: 'S1', label: 'EDTA tube with visible clot' }, values: [{ name: 'Platelets', value: '38', unit: '×10⁹/L', ref: '150-400', flag: 'LL' }] },
    key: { kind: 'decision', answer: 'reject' },
    explanation: 'A clotted EDTA sample consumes platelets and invalidates the count. The specimen cannot be corrected, so it is rejected and a new one is requested (a smear check for platelet clumps also helps explain a falsely low count).',
    recheck: 'Ask whether any step in the lab can repair this specimen.',
    hints: ['Inspect the tube before reading the number.'],
  },
  {
    id: 'hem-02-s2', kind: 'decision', competency: PRE,
    context: 'Sample 2. Lipemic plasma, adult female inpatient (female reference ranges shown).',
    prompt: 'Hb 8.1 g/dL with MCHC 41 g/dL (analyzer flag). Plasma is milky. What do you do?',
    data: { sample: { id: 'S2', label: 'Lipemic specimen' }, values: [
      { name: 'Hb', value: '8.1', unit: 'g/dL', ref: '12.0-15.5', flag: 'L' },
      { name: 'MCHC', value: '41', unit: 'g/dL', ref: '32-36', flag: 'H' }] },
    key: { kind: 'decision', answer: 'repeat' },
    explanation: 'Lipemia scatters light and falsely raises hemoglobin readings and MCHC. The specimen itself is sound: replace the plasma with saline and repeat the measurement.',
    recheck: 'Is the specimen unusable, or is the measurement disturbed?',
    hints: ['A physiologically impossible MCHC is a clue to interference, not to the patient.'],
  },
  {
    id: 'hem-02-s3', kind: 'decision', competency: PRE,
    context: 'Sample 3. EDTA tube, adult female, routine check-up (female reference ranges shown).',
    prompt: 'Hb 13.2 g/dL, MCV 89 fL, no flags, adequate fill, delta check consistent. What do you do?',
    data: { sample: { id: 'S3', label: 'Clean routine specimen' }, values: [
      { name: 'Hb', value: '13.2', unit: 'g/dL', ref: '12.0-15.5' },
      { name: 'MCV', value: '89', unit: 'fL', ref: '80-100' }] },
    key: { kind: 'decision', answer: 'accept' },
    explanation: 'Quality checks pass and the result is plausible against the previous value. Accept and report.',
    recheck: 'Count how many quality checks actually failed.',
    hints: ['Not every sample needs rescuing.'],
  },
];

const hem3: Step[] = [
  {
    id: 'hem-03-s1', kind: 'choice', competency: HEM,
    context: '34-year-old woman, fatigue for three months.',
    prompt: 'Classify the anemia by red cell size.',
    data: { options: abcd('Microcytic', 'Normocytic', 'Macrocytic', 'Cannot be classified'),
      values: [{ name: 'Hb', value: '8.9', unit: 'g/dL', ref: '12.0-15.5', flag: 'L' }, { name: 'MCV', value: '72', unit: 'fL', ref: '80-100', flag: 'L' }] },
    key: { kind: 'choice', answer: 'A' },
    explanation: 'An MCV of 72 fL is below the reference range, so the anemia is microcytic.',
    recheck: 'Compare the MCV with the reference range first.',
    hints: ['Size classification uses one index only.'],
  },
  {
    id: 'hem-03-s2', kind: 'choice', competency: HEM,
    prompt: 'Iron studies are back. Which diagnosis fits best?',
    data: { options: abcd('Anemia of chronic disease', 'Beta-thalassemia trait', 'Iron deficiency anemia', 'Sideroblastic anemia'),
      values: [{ name: 'Ferritin', value: '9', unit: 'ng/mL', ref: '15-150', flag: 'L' }, { name: 'TIBC', value: '450', unit: 'µg/dL', ref: '250-400', flag: 'H' }, { name: 'RDW', value: '17.8', unit: '%', ref: '11.5-14.5', flag: 'H' }] },
    key: { kind: 'choice', answer: 'C' },
    explanation: 'Low ferritin with high TIBC and a raised RDW is the pattern of depleted iron stores.',
    recheck: 'Ask what ferritin and TIBC each say about iron stores, then compare with the other options.',
    hints: ['Ferritin reflects stores. Which conditions lower it?', 'In thalassemia trait the stores are normal.'],
  },
  {
    id: 'hem-03-s3', kind: 'choice', competency: CLI,
    prompt: 'What should the report recommend next?',
    data: { options: abcd('Start vitamin B12 only', 'Repeat the smear in six months', 'Bone marrow aspirate now', 'Evaluate for a source of chronic blood loss') },
    key: { kind: 'choice', answer: 'D' },
    explanation: 'In an adult woman, iron deficiency needs a cause: chronic menstrual or gastrointestinal blood loss is the first thing to look for.',
    recheck: 'Treating the number is not enough. What caused the iron to run out?',
    hints: ['Iron is lost faster than it is absorbed.'],
  },
];

// ------------------------------------------------------------- Microbiology
const mic1: Step[] = [
  {
    id: 'mic-01-s1', kind: 'choice', competency: MIC,
    context: 'Wound swab from a 52-year-old man.',
    prompt: 'The Gram stain shows purple spherical cells in clusters. What is the reading?',
    data: { options: abcd('Gram-negative bacilli', 'Gram-positive cocci in clusters', 'Gram-positive cocci in chains', 'Gram-negative cocci in pairs') },
    key: { kind: 'choice', answer: 'B' },
    explanation: 'Purple means Gram-positive, round means cocci, irregular clusters point towards staphylococci.',
    recheck: 'Separate colour, shape and arrangement, in that order.',
    hints: ['Crystal violet retained means Gram-positive.'],
  },
  {
    id: 'mic-01-s2', kind: 'choice', competency: MIC,
    prompt: 'The catalase test is positive. Which genus is favoured?',
    data: { options: abcd('Streptococcus', 'Enterococcus', 'Clostridium', 'Staphylococcus'),
      values: [{ name: 'Catalase', value: 'Positive', unit: '' }] },
    key: { kind: 'choice', answer: 'D' },
    explanation: 'Catalase-positive Gram-positive cocci in clusters are staphylococci. Streptococci and enterococci are catalase-negative.',
    recheck: 'Which cocci break down hydrogen peroxide?',
    hints: ['Bubbles with hydrogen peroxide mean catalase-positive.'],
  },
  {
    id: 'mic-01-s3', kind: 'choice', competency: MIC,
    prompt: 'The tube coagulase test is positive. Name the organism.',
    data: { options: abcd('Staphylococcus epidermidis', 'Staphylococcus saprophyticus', 'Staphylococcus aureus', 'Micrococcus luteus'),
      values: [{ name: 'Coagulase (tube)', value: 'Positive', unit: '' }] },
    key: { kind: 'choice', answer: 'C' },
    explanation: 'Of these four, only Staphylococcus aureus is coagulase-positive; the others are coagulase-negative.',
    recheck: 'Which species in the list is the coagulase-positive one?',
    hints: ['Three of these four are coagulase-negative.'],
  },
];

const mic2: Step[] = [{
  id: 'mic-02-s1', kind: 'order', competency: MIC,
  prompt: 'Put the Gram stain steps in the correct order (air-drying and the water rinses between reagents are left out).',
  data: { items: [
    { id: 'iodine', label: 'Gram iodine (mordant)' },
    { id: 'heat', label: 'Heat-fix the smear' },
    { id: 'safranin', label: 'Safranin counterstain' },
    { id: 'crystal', label: 'Crystal violet (primary stain)' },
    { id: 'decolor', label: 'Decolorize with alcohol or acetone' },
  ] },
  key: { kind: 'order', order: ['heat', 'crystal', 'iodine', 'decolor', 'safranin'] },
  explanation: 'The air-dried smear is heat-fixed, stained, mordanted with iodine to lock the dye in, decolorized, then counterstained so Gram-negative cells become visible. Each reagent is rinsed off before the next.',
  recheck: 'The counterstain only makes sense after the decolorizer has done its work.',
  hints: ['The mordant follows the primary stain directly.'],
}];

const mic3: Step[] = [{
  id: 'mic-03-s1', kind: 'match', competency: MIC,
  prompt: 'Match each plate observation to the organism it most suggests (presumptive identification).',
  data: {
    left: [
      { id: 'pink-mac', label: 'Pink colonies on MacConkey agar' },
      { id: 'beta-hemo', label: 'Clear zone of beta-hemolysis on blood agar, Gram-positive cocci in chains' },
      { id: 'swarm', label: 'Swarming growth that spreads across the blood agar plate' },
      { id: 'green', label: 'Green pigment with a sweet, fruity odor' },
    ],
    right: [
      { id: 'proteus', label: 'Proteus mirabilis' },
      { id: 'ecoli', label: 'Escherichia coli' },
      { id: 'pseudo', label: 'Pseudomonas aeruginosa' },
      { id: 'spyo', label: 'Streptococcus pyogenes' },
    ],
  },
  key: { kind: 'match', pairs: { 'pink-mac': 'ecoli', 'beta-hemo': 'spyo', swarm: 'proteus', green: 'pseudo' } },
  explanation: 'Lactose fermenters turn MacConkey pink (E. coli is the classic one), S. pyogenes is beta-hemolytic, Proteus swarms, and Pseudomonas makes pyocyanin with a characteristic odor. These are presumptive identifications: confirmation needs further tests (for example Lancefield grouping for the streptococcus).',
  recheck: 'Start with the pair you are most certain of and remove it from the list.',
  hints: ['Only one organism swarms.', 'Pigment and odor together point to a non-fermenter.'],
}];

// -------------------------------------------------------- Clinical biochemistry
const bio1: Step[] = [
  {
    id: 'bio-01-s1', kind: 'choice', competency: BIO,
    context: '67-year-old man, reduced urine output after surgery.',
    prompt: 'Which organ is most likely failing?',
    data: { options: abcd('Liver', 'Pancreas', 'Heart', 'Kidney'),
      values: [{ name: 'Creatinine', value: '4.2', unit: 'mg/dL', ref: '0.7-1.3', flag: 'H' }, { name: 'BUN', value: '62', unit: 'mg/dL', ref: '7-20', flag: 'H' }] },
    key: { kind: 'choice', answer: 'D' },
    explanation: 'Creatinine and BUN (blood urea nitrogen) rising together with low urine output indicate reduced glomerular filtration.',
    recheck: 'Which organ clears creatinine?',
    hints: ['Both markers are cleared by the same organ.'],
  },
  {
    id: 'bio-01-s2', kind: 'choice', competency: BIO,
    prompt: 'Which result is the most immediately life-threatening if confirmed?',
    data: { options: abcd('Creatinine 4.2 mg/dL', 'BUN 62 mg/dL', 'Potassium 6.1 mmol/L', 'Sodium 138 mmol/L'),
      values: [{ name: 'Potassium', value: '6.1', unit: 'mmol/L', ref: '3.5-5.1', flag: 'HH' }, { name: 'Sodium', value: '138', unit: 'mmol/L', ref: '135-145' }] },
    key: { kind: 'choice', answer: 'C' },
    explanation: 'Hyperkalemia can trigger life-threatening arrhythmias, so a potassium of 6.1 mmol/L in a patient with falling renal function is notified at once and confirmed urgently (repeat sample and ECG).',
    recheck: 'Which abnormal value can stop the heart before the others cause harm?',
    hints: ['Think about which electrolyte controls cardiac conduction.'],
  },
  {
    id: 'bio-01-s3', kind: 'choice', competency: BIO,
    prompt: 'Before calling it, which action best rules out pseudohyperkalemia?',
    data: { options: abcd('Repeat potassium on a non-hemolyzed sample', 'Repeat sodium', 'Add a glucose measurement', 'Wait until tomorrow') },
    key: { kind: 'choice', answer: 'A' },
    explanation: 'Hemolysis releases intracellular potassium and falsely raises the result, so confirm on a clean sample while the clinician is notified.',
    recheck: 'What in the tube itself could raise potassium?',
    hints: ['Check the hemolysis index first.'],
  },
];

const bio2: Step[] = [{
  id: 'bio-02-s1', kind: 'point', competency: BIO,
  context: 'Panel from a morning draw. Hemolysis index 3+ (illustrative scale). Apart from the one discordant result, the panel is consistent with the patient.',
  prompt: 'Click the result most likely affected by the specimen problem.',
  data: { image: { asset: 'panel-hemolysis-01', caption: 'Chemistry panel with specimen indices' } },
  // Centre of the potassium result cell in web/src/assets/chemistry-panel.svg (880,395 of 1600x900).
  key: { kind: 'point', x: 55, y: 43.9, r: 5.5 },
  explanation: 'Hemolysis releases potassium (and LDH and AST) from red cells; here the potassium is the discordant result, so it is the one to question.',
  recheck: 'Which analyte is concentrated inside red cells?',
  hints: ['Look at the specimen indices before the values.', 'Only one value is out of step with the rest.'],
}];

const bio3: Step[] = [
  {
    id: 'bio-03-s1', kind: 'choice', competency: BIO,
    context: 'Emergency department, arterial blood gas.',
    prompt: 'What is the primary acid-base disorder?',
    data: { options: abcd('Respiratory acidosis', 'Metabolic acidosis', 'Metabolic alkalosis', 'Respiratory alkalosis'),
      values: [{ name: 'pH', value: '7.28', unit: '', ref: '7.35-7.45', flag: 'L' }, { name: 'HCO3', value: '14', unit: 'mmol/L', ref: '22-26', flag: 'L' }, { name: 'PaCO2', value: '30', unit: 'mmHg', ref: '35-45', flag: 'L' }] },
    key: { kind: 'choice', answer: 'B' },
    explanation: 'Low pH with low bicarbonate means metabolic acidosis. The low PaCO2 is the lung compensating.',
    recheck: 'Read pH first, then ask which of HCO3 or PaCO2 moved in the matching direction.',
    hints: ['Acidemia plus low bicarbonate.'],
  },
  {
    id: 'bio-03-s2', kind: 'choice', competency: BIO,
    prompt: 'Calculate the anion gap (Na - Cl - HCO3). What does it show?',
    data: { options: abcd('Normal anion gap (about 12)', 'Low anion gap (about 4)', 'High anion gap (about 18)', 'Cannot be calculated'),
      values: [{ name: 'Na', value: '140', unit: 'mmol/L', ref: '135-145' }, { name: 'Cl', value: '108', unit: 'mmol/L', ref: '98-107', flag: 'H' }] },
    key: { kind: 'choice', answer: 'C' },
    explanation: '140 - 108 - 14 = 18, above the usual upper limit of about 12, so unmeasured anions are present (the cut-off is method-dependent and no albumin correction is applied here).',
    recheck: 'Do the subtraction with the three values shown.',
    hints: ['Sodium minus the sum of chloride and bicarbonate.'],
  },
  {
    id: 'bio-03-s3', kind: 'choice', competency: BIO,
    prompt: 'Use Winter\'s formula (expected PaCO2 = 1.5 x HCO3 + 8, plus or minus 2). Is the respiratory response appropriate?',
    data: { options: abcd('Appropriate compensation', 'Additional respiratory acidosis', 'Additional respiratory alkalosis', 'No compensation expected') },
    key: { kind: 'choice', answer: 'A' },
    explanation: '1.5 x 14 + 8 = 29, so the expected PaCO2 is 27 to 31 mmHg. The measured 30 mmHg falls inside it.',
    recheck: 'Compute the expected range and place the measured value against it.',
    hints: ['Expected PaCO2 comes out near 29.'],
  },
];

// ---------------------------------------------------------------- Master Lab
const master: Step[] = [
  {
    id: 'master-s1', kind: 'choice', competency: HEM, fragment: 3,
    context: 'Case file. 58-year-old man, fatigue and weight loss. Admitted with fever.',
    prompt: 'Step 1 of 4. Interpret the blood count.',
    data: { options: abcd('Microcytic anemia', 'Macrocytic anemia', 'Normocytic anemia with thrombocytopenia', 'Polycythemia'),
      values: [{ name: 'Hb', value: '8.2', unit: 'g/dL', ref: '13.5-17.5', flag: 'L' }, { name: 'MCV', value: '70', unit: 'fL', ref: '80-100', flag: 'L' }, { name: 'WBC', value: '13.4', unit: '×10⁹/L', ref: '4.0-11.0', flag: 'H' }] },
    key: { kind: 'choice', answer: 'A' },
    explanation: 'An MCV of 70 fL with Hb 8.2 g/dL is a microcytic anemia; leukocytosis fits the fever.',
    recheck: 'Classify by MCV before looking at anything else.',
    hints: ['Size comes from the MCV.'],
  },
  {
    id: 'master-s2', kind: 'choice', competency: MIC, fragment: 9,
    prompt: 'Step 2 of 4. Blood cultures grow Gram-positive cocci in chains: catalase negative, bile-esculin positive, no growth in 6.5% NaCl. Name the organism.',
    data: { options: abcd('Enterococcus faecalis', 'Streptococcus pyogenes', 'Streptococcus gallolyticus (bovis group)', 'Staphylococcus aureus'),
      values: [{ name: 'Catalase', value: 'Negative', unit: '' }, { name: 'Bile-esculin', value: 'Positive', unit: '' }, { name: '6.5% NaCl', value: 'No growth', unit: '' }] },
    key: { kind: 'choice', answer: 'C' },
    explanation: 'Bile-esculin positive but salt intolerant separates the group D Streptococcus bovis group from Enterococcus.',
    recheck: 'Which result separates this organism from the enterococci?',
    hints: ['Enterococci tolerate 6.5% NaCl.'],
  },
  {
    id: 'master-s3', kind: 'choice', competency: BIO, fragment: 1,
    prompt: 'Step 3 of 4. Iron studies and CRP are available. Can ferritin be trusted to assess iron stores here?',
    data: { options: abcd('No: with inflammation ferritin is unreliable in either direction', 'Yes: inflammation can only raise ferritin, so a low value despite a raised CRP still points to depleted stores', 'No: ferritin is never useful for assessing iron stores', 'No: a CRP result must be normal before any ferritin is valid'),
      values: [{ name: 'Ferritin', value: '8', unit: 'ng/mL', ref: '30-400', flag: 'L' }, { name: 'CRP', value: '48', unit: 'mg/L', ref: '<5', flag: 'H' }] },
    key: { kind: 'choice', answer: 'B' },
    explanation: 'Ferritin is an acute-phase reactant: inflammation raises it. A low ferritin despite a raised CRP is therefore a strong marker of depleted iron stores, whereas a normal or high value would have been uninterpretable.',
    recheck: 'Which way does inflammation move ferritin, and is it present here?',
    hints: ['Inflammation pushes ferritin up, never down.'],
  },
  {
    id: 'master-s4', kind: 'decision', competency: CLI, fragment: 6,
    prompt: 'Step 4 of 4. Put the findings together. What does the report recommend?',
    data: { sample: { id: 'M4', label: 'Final interpretation' },
      options: [
        { id: 'discharge', label: 'Report iron deficiency anemia and discharge the patient on oral iron alone' },
        { id: 'contaminated', label: 'Reject the blood cultures as contaminated and repeat the blood count next week' },
        { id: 'alert', label: 'Alert the clinician: iron deficiency with Streptococcus gallolyticus bacteremia needs a gastrointestinal work-up and exclusion of endocarditis' },
      ] },
    key: { kind: 'decision', answer: 'alert' },
    explanation: 'Bacteremia with S. gallolyticus is strongly associated with colonic neoplasia (and with endocarditis, which also needs excluding), and iron deficiency in a man suggests occult gastrointestinal blood loss. The findings converge on the same work-up.',
    recheck: 'Do the three disciplines point at the same organ system?',
    hints: ['Look for a single cause that explains both the anemia and the organism.'],
  },
];

export const STEP_COMPETENCIES = [HEM, MIC, BIO, PRE, CLI];

const m = (
  id: string, labSlug: string, ordinal: number, title: string, engine: Mission['engine'],
  difficulty: Mission['difficulty'], estMinutes: number, timeLimitSec: number,
  fragment: number | undefined, steps: Step[], scoring: ScoringProfile = STANDARD_SCORING,
): Mission => ({ id, labSlug, ordinal, title, engine, difficulty, estMinutes, timeLimitSec, fragment, scoring, steps });

export const MISSIONS: Mission[] = [
  m('hem-01', 'hematology', 1, 'Blood Smear Code', 'image_identify', 'Foundation', 4, 240, 7, hem1),
  m('hem-02', 'hematology', 2, 'Fix the Sample', 'decision', 'Foundation', 6, 360, 4, hem2),
  m('hem-03', 'hematology', 3, 'Anemia Detective', 'stepper', 'Intermediate', 8, 480, 2, hem3),
  m('mic-01', 'microbiology', 1, 'Microbe Detective', 'stepper', 'Foundation', 7, 420, 3, mic1),
  m('mic-02', 'microbiology', 2, 'Gram Stain Challenge', 'drag_order', 'Foundation', 4, 240, 8, mic2),
  m('mic-03', 'microbiology', 3, 'Petri Dish Mystery', 'matching', 'Intermediate', 6, 360, 5, mic3),
  m('bio-01', 'biochemistry', 1, 'Organ Rescue Mission', 'stepper', 'Intermediate', 8, 480, 9, bio1),
  m('bio-02', 'biochemistry', 2, 'Lab Value Hacker', 'image_identify', 'Intermediate', 4, 240, 1, bio2),
  m('bio-03', 'biochemistry', 3, 'Acid-Base Emergency', 'stepper', 'Advanced', 10, 600, 6, bio3),
  m('master-01', 'master', 1, 'Clinical Detective', 'stepper', 'Advanced', 15, 900, undefined, master, MASTER_SCORING),
];

export const MISSION_BY_ID = new Map(MISSIONS.map((x) => [x.id, x]));
export const LAB_BY_SLUG = new Map(LABS.map((x) => [x.slug, x]));
export const STANDARD_LAB_SLUGS = ['hematology', 'microbiology', 'biochemistry'];
export const missionsOf = (slug: string) => MISSIONS.filter((x) => x.labSlug === slug).sort((a, b) => a.ordinal - b.ordinal);

/** Digits a lab hands out, in vault order: one per mission, or one per step in the Master Lab. */
export function fragmentSlots(slug: string): { position: number; digit: number; sourceId: string }[] {
  if (slug === 'master') {
    return missionsOf('master').flatMap((x) => x.steps.map((s, i) => ({ position: i + 1, digit: s.fragment!, sourceId: s.id })));
  }
  return missionsOf(slug).map((x) => ({ position: x.ordinal, digit: x.fragment!, sourceId: x.id }));
}

export const exitCode = (slug: string) => fragmentSlots(slug).map((f) => f.digit).join('');
