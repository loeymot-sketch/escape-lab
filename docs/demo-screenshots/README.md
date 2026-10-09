# Escape Lab – Portfolio screenshots (Erasmus+)

Ten screenshots of the Escape Lab prototype, taken on 2026-10-09 (regenerated the same day after the wording changes of round 20: sidebar footer "Guest demo · server-side scoring", "Milestones", "accuracy NN%", Content review note, result screen text) for the Erasmus+ portfolio (see `docs/FACULTY_DEMO_SCRIPT.md`, section 5).

## Honesty notes (to keep with any reuse)

- Illustrative images of a local academic prototype. Not a medical device, not a diagnostic tool, not a clinical reference.
- All students, classes, scores and results are generated demonstration data (fictitious names). No real learner appears.
- The biomedical content is not validated by experts; images are illustrative and their provenance is still to be documented.
- Technical checks were run locally only (automated tests and audits by the team's AI agents); no external human review.
- Screens 03 to 05 were played in the student guest "Alex Martin" (prepared demo data). The result on screen 05 comes from a replay, so the server reported that it did not beat the best score.

## Files

| file | what it shows | caption (FR) | caption (EN) |
|---|---|---|---|
| `01-about-student-1440.png` | About page (student guest): principle, "Escape Lab is / is not" and the complete "Before you present" box (presenter guidance for the demo, not part of the product pitch) | Page de présentation : un environnement sûr pour s'entraîner avant la pratique réelle. Il ne remplace ni enseignants, ni stages, ni experts. Prototype local ; capture illustrative. | About page: a safe environment to practise before real laboratory work. It does not replace teachers, placements or experts. Local prototype; illustrative screenshot. |
| `02-lab-map-1440.png` | Laboratory map: Hematology (cleared), Microbiology and Clinical Biochemistry (active), locked Master Lab, seven "Coming soon" labs | Les laboratoires sont organisés par discipline. Seuls trois laboratoires et le Master Lab sont jouables dans ce prototype ; les autres sont annoncés « bientôt ». | Laboratories are organised by discipline. Only three laboratories and the Master Lab are playable in this prototype; the others are marked "Coming soon". |
| `03-mission-blood-smear-code-1440.png` | Blood Smear Code mission, question state: illustrative smear, instruction, "Illustrative training image" label | Mission d'hématologie. L'image est illustrative : elle n'est pas une référence clinique et sa provenance reste à documenter. | Hematology mission. The image is illustrative: it is not a clinical reference and its provenance remains to be documented. |
| `04-fix-the-sample-error-feedback-1440.png` | Fix the Sample after a deliberate wrong answer: "Not quite." feedback, "XP penalty: -10", Lab Assistant hint still available | Décision pré-analytique. Une erreur est permise : le retour oriente sans donner la réponse, puis l'étudiant réessaie. | Pre-analytical decision. A mistake is allowed: the feedback guides without giving the answer, then the student tries again. |
| `05-mission-result-1440.png` | Result screen (Fix the Sample, one wrong answer, no hint): score 140 of 180 XP "Server-calculated", accuracy 75%, time "Official timer" (00:19, replay), XP ledger; the lede says "The backend has recorded your result" | Le score et le temps sont calculés par le serveur. Il s'agit de données de démonstration, pas de résultats d'étudiants réels. | Score and time are calculated by the server. These are demonstration data, not real student results. |
| `06-progress-code-vault-1440.png` | Progress vault: Code Vault fragments per lab (Hematology exit unlocked) and the "Milestones" card ("4 of 7 earned"; locked milestones are labelled LOCKED). Cropped above the leaderboard | Les fragments de code et le Code Vault récompensent la progression. La ludification sert l'apprentissage. | Code fragments and the Code Vault reward progress. Gamification serves learning. |
| `07-faculty-class-intelligence-1440.png` | Faculty "Class intelligence" with the "Demonstration data" note, class figures and the mission signal list: "N of 38 students completed" with "accuracy NN%" and the sentence that defines it (class mean accuracy on each student's best attempt). Tall capture | Tableau de bord enseignant. Les étudiants, la classe et les résultats sont des données de démonstration générées, pas des apprenants réels. | Teacher dashboard. Students, class and results are generated demonstration data, not real learners. |
| `08-faculty-student-detail-1440.png` | Student detail of a fictitious student (Sana Benali): laboratories, competencies, attempt history with wrong answers, hints and time. Tall capture (full page) | Détail d'un étudiant fictif : l'enseignant voit ses tentatives, ses indices et sa précision. Données générées. | Detail of a fictitious student: the teacher sees attempts, hints and accuracy. Generated data. |
| `09-faculty-content-review-draft-1440.png` | Content review: all 10 missions in "Draft" status, the note that "Approved" is a faculty workflow flag and not a scientific validation, demonstration-data note | Suivi de relecture du contenu : toutes les missions sont en Draft. Le contenu biomédical n'est pas validé par des experts. | Content review tracking: all missions are in Draft. The biomedical content is not validated by experts. |
| `10-about-quality-roadmap-375.png` | About page on a 375 px phone, scrolled from the "Technically verified locally" card ("Local only") through "Not yet biomedically validated" to the start of "Scientific validation roadmap" ("Planned, not done"). The section heading "How quality is assured" does not fit in the same 812 px viewport (heading to "Not yet biomedically validated" is about 900 px) | Vérifié techniquement en local seulement. Contenu non validé biomédicalement. Feuille de route : propositions, pas des accords. | Technically verified locally only. Content not biomedically validated. Roadmap: proposals, not agreements. |

## Format

- Light theme, reduced motion, device scale factor 2 (PNG pixel size = 2 x viewport).
- Desktop width 1440 px. Viewport heights: 900 (03, 05), 960 (04, so that the Submit button is complete), 1224 (01, down to the end of the "Before you present" box), 1717 (02, whole map), 1007 (06, Code Vault and Milestones, without the leaderboard), 1382 (07, down to the sentence defining the percentage), 1865 (08, whole page), 1178 (09, all 10 missions). The taller ones are viewport-sized captures, not stitched images.
- 10: 375 x 812 viewport.
- **Not every capture is 1440 x 900.** The "1440" in the file names is the width only. PNG sizes when this was written (2 x CSS pixels, read with `file`): 01 = 2880 x 2448 (1440 x 1224); 02 = 2880 x 3434 (1440 x 1717); 03, 05 = 2880 x 1800 (1440 x 900); 04 = 2880 x 1920 (1440 x 960); 06 = 2880 x 2014 (1440 x 1007); 07 = 2880 x 2764 (1440 x 1382); 08 = 2880 x 3730 (1440 x 1865); 09 = 2880 x 2356 (1440 x 1178); 10 = 750 x 1624 (375 x 812). If a capture is re-cropped or retaken, the file itself is the reference, not this list.
- On 03 the case timer shows its start value (04:00) and on 04 as well (06:00); on 05 the 00:19 time is a real replay (about 6 s of reading time per step was left between answers; no value was edited).

## How they were produced

1. Throwaway database seeded with `be/scripts/seed-demo.ts` (`NODE_ENV=test`, scratch `DB_PATH`, never `be/data`).
2. API on 127.0.0.1:7101 (`DEMO_MODE=1`), Vite dev server on 127.0.0.1:7102 with `VITE_API_URL=http://127.0.0.1:7101/api`.
3. Before the shots, `POST /api/demo/reset` for the student guest and for the teacher guest (see section 2.2 of the demo script); student re-reset before the progress shot (06).
4. Chromium driven by Playwright (`playwright-core` from `web/node_modules`), real clicks through the interface: lab map, Hematology lab, mission pickers, one deliberate wrong answer in Fix the Sample then correct answers to the end, Faculty guest, roster row, Content review. Nothing was edited in the interface or the database by hand; no "Mark reviewed" was clicked.
5. Each capture waited for fonts, network idle and a short settle delay, then was checked by eye (no spinner, no error, no cut-off text on the key content).
