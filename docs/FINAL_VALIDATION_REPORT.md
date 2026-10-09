# Escape Lab — rapport unique de validation

Date de consolidation : 2026-10-09 (historique des passes du 2026-10-04 au 2026-10-08 conservé plus bas)

## État vérifié le plus récent — passe du 2026-10-09, tours 34 à 39 (LOCAL UNIQUEMENT)

> **Validation locale uniquement.** Pas de dépôt Git distant, pas de CI distante, pas de revue humaine indépendante. Les auditeurs sont des **agents IA de la même équipe** (lecture seule), pas des auditeurs externes. **Techniquement vérifié ne veut pas dire biomédicalement validé** : questions, réponses, explications, indices, valeurs, unités, interprétations cliniques, images et efficacité pédagogique n'ont été relus par aucun expert (voir `docs/SCIENTIFIC_REVIEW_BACKLOG.md`). Les illustrations ne sont pas du matériel clinique ni de référence diagnostique.

Cette section décrit l'état **courant du code**. Les sections plus bas sont de l'historique : leurs chiffres (258, 265, 322, 411) ne sont plus ceux du code actuel. Chaque chiffre ci-dessous a été **réexécuté par le superviseur dans cette passe** ; journaux dans `.ci-artifacts/local-2026-10-09-verify-r37-final/` (état courant) ; les dossiers `...-verify-r34/`, `...-verify-r36-fix/` et `...-verify-r36-final/` décrivent des états antérieurs du code (chacun porte un `SUPERSEDED.md`).

| Élément | Valeur |
|---|---|
| Identifiant d'instantané (pas de Git) | `54dd91f62beef5aa9f7d519534986d762b8783b6d9d786af6a0e3429a5cfdde2` : SHA-256 de la liste triée des lignes « sha256  chemin » de **143 fichiers** : sources et tests du backend et du frontend, scripts, `be/openapi.json`, manifestes et fichiers de verrouillage, `tsconfig`/vite/vitest/playwright, `index.html`, `be/Dockerfile`, `be/.env.example`, `.nvmrc`, `.github/`. **Exclus volontairement** : `docs/`, les README, `reports/`, `.ci-artifacts/`, `node_modules`, les dossiers générés. Reproductible : `sh .ci-artifacts/local-2026-10-09-verify-r34/snapshot-id.sh` depuis la racine. L'identifiant change à chaque modification du code ; les identifiants des dossiers antérieurs ne se reproduisent pas avec ce script élargi (voir leur `SUPERSEDED.md`). |
| Instantané audité par les tours 36 à 39 | `96233cf7caabeb02b0d9cf871892151627ae48bf3bbc20b7cd2974def258c81d` (143 fichiers). **Le code produit et les tests du frontend sont identiques** à ceux de l'instantané courant ci-dessus ; la **seule** différence est `be/test/r36-fixes.test.ts` (un test ajouté après le tour 39, A39-001, car le test d'égalité ne distinguait pas `RANK()` de `ROW_NUMBER()`). Les 143 fichiers sont comptés de la même façon. |
| Empreintes complémentaires | `be/openapi.json` : `f1dbd031f6c1ee65ddec55d9d22bc7c98b86004c4e9abcdf00d4949bec48c6c6` (inchangé par les corrections du tour 36) ; `be/src/content.ts` : `d4bd3b647676886062b914b9b50c50600dc39bba3e63984037f4849badd85a39` (**contenu biomédical non modifié**) |
| Environnement | macOS (Darwin 25.4.0), Node **v22.23.2**, npm **10.9.8** (le shell par défaut est en Node 18, refusé par les contrôles préalables `pretest`, `pretypecheck`, `prebuild`, `pretest:e2e`) |
| Portée | LOCAL UNIQUEMENT |

**Commandes exécutées** (script `.ci-artifacts/local-2026-10-09-verify-r37-final/run-gate.sh` ; backend puis frontend, **puis** Playwright seul, deux fois de suite, sur l'instantané `96233cf7…`). Après l'ajout du test A39-001, la partie sans port (tests backend et frontend, typecheck, audit, build, OpenAPI) a été relancée sur l'instantané courant : `.ci-artifacts/local-2026-10-09-verify-r39-final/` :

```text
cd be  && npm test ; npm run typecheck ; npm audit --audit-level=high ; npm run openapi ; shasum -a 256 openapi.json
cd web && npm test ; npm run build ; npm audit --audit-level=high
cd web && CI=true npm run test:e2e        # exécuté deux fois de suite
```

| Contrôle | Résultat mesuré sur le code courant |
|---|---|
| Backend | **270/270** sur l'instantané courant (269 sur `96233cf7…` + 1 test, A39-001 ; 265 + 5 tests des tours 36 et 37 et 39) |
| Typecheck backend | propre |
| Frontend (Vitest) | **328/328** (18 fichiers ; 322 + 6 tests du tour 36 ; aucun ajouté au tour 37) ; contrat d'API et frontières client vérifiés par `pretest` |
| Playwright E2E | **415/415, passe 1 (4,6 min) et passe 2 (4,6 min)** sur l'instantané `96233cf7…` : Chromium, iPhone 13 émulé, bundle de production (411 + 4 tests des tours 36 et 37). **Non relancé sur l'instantané courant** : les ports 3000 et 5173, imposés par la configuration Playwright, étaient occupés par le site que le propriétaire testait ; le code produit et les tests e2e sont identiques, seul un fichier de test backend diffère. À relancer une fois le site du propriétaire arrêté (`cd web && CI=true npm run test:e2e`). |
| OpenAPI | régénéré : SHA-256 identique à `be/openapi.json` |
| `npm audit --audit-level=high` | **0** vulnérabilité (backend et frontend) |
| Budget de poids | JS **362 040 / 400 000** o, CSS **67 448 / 120 000** o, 2 images raster ≤ 300 000 o (build du contrôle de budget, **sans** `VITE_API_URL` ; un bundle configuré avec l'adresse de l'API pèse un peu plus, 362 080 o selon l'auditeur du tour 39) |

Limites de ces chiffres : les journaux de **cet** état n'existent qu'**une fois** (une exécution backend, une exécution frontend) ; Playwright **deux fois**. Les passes d'autres sessions (`final-r23`, `extra-passes-r32`) portent sur un code antérieur à ces corrections et ne sont pas comptées. **Validation locale uniquement (Local validation only).**

**Corrections du code faites aux tours 36 et 37 (seules modifications du code depuis 12:21)**

1. **A36-001 (P1, reproduit par le superviseur) : un seul compte pouvait immobiliser toute l'API.** `Game.competencies()` utilisait une sous-requête corrélée quadratique, exécutée de façon synchrone dans `node:sqlite` : pour un étudiant, 250 / 1 000 / 2 000 tentatives terminées coûtaient 40 / 313 / 1 256 ms (8,6 s à 4 005 tentatives selon l'auditeur). Corrigé par une seule passe (`RANK() OVER (PARTITION BY step_id ORDER BY solved_at DESC) = 1`, mêmes lignes ex æquo conservées) : 5 / 4 / 10 ms. Test écrit d'abord : `be/test/r36-fixes.test.ts` (équivalence avec l'ancien SQL gardé tel quel, et mise à l'échelle ; le second échouait à 687 ms sur l'ancien code).
2. **B36-001 (P1 selon l'auditeur B) : Lab Value Hacker n'avait aucune alternative textuelle.** Ajout d'une section « Text version of this image » : un vrai tableau (valeurs transcrites du SVG et comparées cellule par cellule dans `web/src/lib/assets.test.ts`) et un bouton « Select » par ligne, utilisables au clavier ; la vérification reste côté serveur (même `{x, y}`). Tests écrits d'abord : `web/e2e/point-text.spec.ts`. **Reste ouvert : Blood Smear Code** (identification visuelle d'un schistocyte ; une description textuelle doit être écrite par des experts, elle n'a pas été inventée). Classé par le superviseur « limitation d'accessibilité documentée, décision pédagogique et revue d'accessibilité humaine requises », **pas** comme défaut logiciel corrigeable : voir `docs/KNOWN_LIMITATIONS.md`, « Round 36 notes ». **Au tour 37, l'auditeur B a de nouveau classé cet élément P1 (deuxième avis indépendant, contre la classification du superviseur)** : il est donc traité comme **P1 permanent S-1, ouvert**, voir plus bas.
3. **A37-001 (P1, reproduit par le superviseur) : même défaut dans les analyses enseignant.** `Game.analytics()` (« clean first try ») : sous-requête corrélée `MIN()` quadratique ; avec une base en ordre de mission, 1 000+1 000 / 2 000+2 000 / 3 000+3 000 / 4 000+4 000 tentatives coûtaient 68 / 272 / 617 / 1 094 ms (3,6 s à 8 000 tentatives par l'API selon l'auditeur) ; corrigé par `RANK()`, 3 / 4 / 6 / 8 ms. Tests écrits d'abord dans `be/test/r36-fixes.test.ts` (équivalence et mise à l'échelle ; le second échouait à 618 ms). Mon affirmation du tour 36 « aucune autre occurrence du motif » était fausse (corrigée dans `docs/KNOWN_LIMITATIONS.md`).
4. **B37-002/003/004 (P2/P3, ma propre nouveauté) : ** état sélectionné invisible en couleurs forcées, drapeau lu « H » seul, légende coupée sur téléphone : corrigés (`web/e2e/point-text.spec.ts`).

**Boucle adversariale de cette passe** (trois auditeurs IA en lecture seule par tour : backend/API, parcours étudiant dans un vrai navigateur, Faculty et cohérence des données ou vérité des documents ; ports et bases isolés ; `reports/test-e2e/r34/`, `r35/`, `r36/`, copies des tours 34 et 35 dans `.ci-artifacts/local-2026-10-09-verify-r34/audit-r34/` et `audit-r35/`) :

| Tour | P0 | P1 | P2 | P3 | Remarque |
|---|---:|---:|---:|---:|---|
| 31 | 0 | 0 | 0 | 1 | contrôle ciblé des corrections du tour 30 (`reports/test-e2e/r31/`). Les « tours 32 et 33 » sont des passes Playwright supplémentaires et un test de contrainte (`.ci-artifacts/local-2026-10-09-round21-22/extra-passes-r32/` et `stress-r33/`), pas des audits à trois vagues. |
| 34 | 0 | 0 | 7 | 19 | aucun P0/P1 sur le code d'alors |
| 35 | 0 | **1** | 6 | 22 | le P1 était documentaire (C35-001 : le rapport affirmait « aucun P2 connu non traité » alors que 7 étaient ouverts). Corrigé. |
| 36 | 0 | **2** | 5 | 24 | A36-001 (code) et B36-001 (accessibilité) : traités ci-dessus. Le code a changé. |
| 37 | 0 | **3** | 7 | 11 | A37-001 (code, corrigé), **B37-001 = S-1 (Blood Smear Code, ouvert)**, C37-001 (documentaire : nombres de tests périmés recopiés dans `EXTERNAL_REVIEW_REQUEST.md`, corrigé en ne recopiant plus aucun nombre). **Le code a changé : les tours 34 à 37 ne comptent pas comme tours propres pour le code courant.** |
| 38 | 0 | 0 | 6 | 16 | **premier tour conforme au critère de travail (P0 = P1 = 0 hors S-1) sur le code courant** (snapshot `96233cf7…c81d`, code inchangé depuis la passe de contrôle). A 0/0/1/6, B 0/0/0/6, C 0/0/5/4. Les corrections de documents faites après ce tour (bandeaux des documents historiques, limites d'ouverture du script, liste des P2) restent à faire auditer par le tour suivant. |
| 39 | 0 | 0 | 7 | 17 | **deuxième tour consécutif conforme au critère de travail (P0 = P1 = 0 hors S-1)**, même instantané audité (`96233cf7…`). A 0/0/0/7, B 0/0/2/4 (dont le bundle de production réellement exercé sur ordinateur, iPhone 13 et Pixel 7), C 0/0/5/6. Copies des tours 36 à 39 : `.ci-artifacts/local-2026-10-09-verify-r37-final/audit-r38/` et `audit-r39/` (les tours 36 et 37 : `audit-r36/` dans `verify-r36-final/`, `audit-r37/` dans `verify-r37-final/`). |

**P1 permanent S-1 (ouvert, décision du propriétaire requise) : Blood Smear Code n'a pas d'alternative non visuelle.** Deux auditeurs indépendants (tours 36 et 37) le classent P1 ; il bloque le reste de l'Hématologie et le Master Lab pour un étudiant qui ne voit pas l'image. Ce n'est pas un défaut que l'ingénierie peut fermer seule : il faut une évaluation alternative rédigée par des enseignants, une dispense enseignant, ou une requalification explicite par le propriétaire. **Tant que S-1 est ouvert, la règle « P0/P1 bloquent la convergence » ne peut pas être satisfaite à la lettre.** Critère de travail adopté par le superviseur pour les tours suivants (et annoncé comme tel) : P0 = 0 et P1 = 0 **hors S-1**, sur deux tours consécutifs, sur le code courant. Cela ne remplace pas la décision du propriétaire sur S-1.

**Convergence selon le critère de travail du superviseur : ATTEINTE** (tours 38 et 39 consécutifs, P0 = P1 = 0 hors S-1, même code produit). **Convergence au sens littéral de la règle du propriétaire (« P0/P1 bloquent la convergence ») : NON atteinte, à cause de S-1 seul**, qui reste un P1 ouvert nécessitant une décision du propriétaire. Les corrections de documents faites après le tour 39 (script de démonstration, rapport, limites connues) n'ont pas été relues par un tour d'audit supplémentaire.

**Critère « zéro P2 sur l'état audité en dernier » (reformulé le 2026-10-09 dans `docs/GOAL_FINAL_MVP.md`) : NON atteint.** Chaque tour laisse des P2 ouverts (code, accessibilité, documents), non corrigés par décision. La consigne actuelle du propriétaire est que P0/P1 bloquent la convergence et que P2/P3 ne bloquent pas la démonstration académique sauf effet matériel sur elle ; les P2 sont donc déclarés ouverts, pas masqués.

**P2 qui touchent la démonstration** (S-1, Blood Smear Code, est un P1 ouvert traité plus haut, il n'est pas dans cette liste ; le point « rejouer une mission change les chiffres affichés », C35-006, est un P3 de présentation, cité dans le script de démonstration) (liste unique ; détail et contournements dans `docs/KNOWN_LIMITATIONS.md`, sections « Round 34 notes » à « Round 38 notes ») : l'explication de la dernière étape réussie n'est pas affichée sur l'écran de résultat (B-001) ; les erreurs répétées sur une même étape ne sont annoncées qu'une fois aux lecteurs d'écran (B35-001 / B36-002) ; la phrase du détail étudiant sur le Master Lab est inexacte pour l'XP (C-003) ; le prix affiché de l'indice (15 XP) ignore la perte du bonus « sans indice » (B39-003) ; le coffre se verrouille 10 minutes si l'on maintient Entrée (B39-001) ; la réinitialisation de l'invité étudiant retire Alex des classes d'autres enseignants (C38-005) ; les données de classe vieillissent avec l'horloge (C-002) ; les limiteurs de débit ignorent le regroupement IPv6 (A36-002, hors démonstration locale, à corriger avant toute exposition publique).

**Verdict de cette passe : DEMO-READY ACADEMIC MVP — TECHNICALLY VERIFIED LOCALLY, AVEC UN P1 D'ACCESSIBILITÉ OUVERT (S-1) EN ATTENTE D'UNE DÉCISION DU PROPRIÉTAIRE.** Techniquement vérifié ne veut pas dire biomédicalement validé : **BIOMEDICALLY VALIDATED : NON.** **PRODUCTION / SCIENTIFIC RELEASE : ESCALATE** (revue humaine de sécurité et d'accessibilité avec lecteur d'écran, validation biomédicale, validation par des enseignants, CI distante reproductible : non faits). Ce n'est pas « prêt pour la production ».

## Verdict de la passe archivée du 03:04 (2026-10-09, historique)

> **État le plus récent : section « État vérifié le plus récent » en haut de ce fichier** (tours 34 et suivants). Les lignes ci-dessous décrivent l'état des tours 20 à 22 : **section « Tour 20 / Tour 21 / Tour 22 » plus bas** (backend 265/265, frontend 322/322, Playwright 411/411 deux passes consécutives, après les corrections du tour 20). Les chiffres des blocs « Verdict final » et « Résultats » ci-dessous (258, 411 trois fois, etc.) sont ceux de la passe archivée du 03:04, avant ces corrections.

**PROTOTYPE ACADÉMIQUE DÉMONSTRABLE — VÉRIFIÉ TECHNIQUEMENT EN LOCAL.**
**Production et validité scientifique : ESCALATE.**

**Validation locale uniquement.** Aucune exécution CI distante (pas de remote Git), aucune revue humaine indépendante (sécurité, accessibilité, pédagogie), aucune validation biomédicale. Ce rapport ne dit pas « prêt pour la production » et ne le dira pas avant les éléments listés dans « Ce qui reste à faire ».

Distinguer :

- **Techniquement vérifié (en local)** : comportement du serveur (score, minuteur, indices, déverrouillage décidés côté serveur), contrats d'API, parcours étudiant et enseignant dans un vrai navigateur, accessibilité automatisée, budget de poids.
- **Biomédicalement validé : NON.** Questions, réponses, explications, indices, valeurs et unités, interprétations cliniques, images et efficacité pédagogique n'ont été relus par aucun expert. Voir `docs/SCIENTIFIC_REVIEW_BACKLOG.md` (25 constats, dont 1 bloquant provisoire à confirmer par les experts ; document de préparation rédigé par un assistant IA, non signé, ce n'est pas une revue). Aucune liste de constats de contenu ne figure dans le présent rapport. Toutes les images sont présentées comme illustratives ; leur provenance et leur licence ne sont pas documentées.

## Identification de l'état vérifié

| Élément | Valeur |
|---|---|
| Identifiant d'état (pas de Git) | `c2b0cf3b7d5c3e4b713f97a60c12261fef1d29f7c95c7bf9b555c0000f76542c` : **non reproductible, indicatif seulement.** La méthode décrite dans `.ci-artifacts/local-2026-10-09/validation-manifest.json` ne nomme ni la liste exacte des fichiers, ni la sérialisation, ni les trois documents inclus, et aucun script n'est archivé ; le tour 20 n'a pas pu retrouver cette valeur. Ne pas l'utiliser comme preuve. |
| Preuves d'identité reproductibles (qui existent) | SHA-256 de `be/openapi.json` **au moment de la passe archivée du 03:04** : `a10dd1e501fb3254e608fa6c87e6318efb5ec0bd6f18bf5c042d2e3a32c951eb` (identique à `.ci-artifacts/local-2026-10-09/openapi.json` ; **le fichier actuel est `f1dbd031…c6c6`** après les corrections du tour 20, voir la section « Tour 20 / Tour 21 / Tour 22 ») ; SHA-256 de `be/src/content.ts` : `d4bd3b647676886062b914b9b50c50600dc39bba3e63984037f4849badd85a39` (identique à l'empreinte notée dans `docs/SCIENTIFIC_REVIEW_BACKLOG.md`). Vérifiables avec `shasum -a 256 be/openapi.json be/src/content.ts`. |
| Environnement | macOS (Darwin 25.4.0), Node **v22.23.2**, npm **10.9.8** ; Node 18 par défaut dans le shell. Les contrôles préalables (`pretest`, `pretypecheck`, `prebuild`, `pretest:e2e`) refusent Node 18 ; **`npm start` et `npm run seed:demo` n'ont pas de contrôle préalable** et échouent sur Node 18 avec `node: bad option: --disable-warning=ExperimentalWarning` (voir `docs/FACULTY_DEMO_SCRIPT.md`, section 2.1) |
| Portée | LOCAL UNIQUEMENT |

**Ce qui a changé après la passe de preuves.** Les preuves du 2026-10-09 (`.ci-artifacts/local-2026-10-09/`, marqueur `DONE` à 03:04) décrivent le code de cette passe. Depuis, (1) ce rapport, `README.md` et d'autres documents ont été modifiés (le rapport l'a été après le marqueur `DONE`) ; (2) au tour 20, `web/e2e/audit-fixes.spec.ts` a été modifié (correction d'une course dans les assistants des tests R5-02/R5-03 et R6-01 : `isVisible()` n'attend pas) ; (3) les corrections du tour 20 (code, textes d'interface, captures) ont été faites ensuite. Les chiffres ci-dessous ne couvrent donc pas ces modifications. La nouvelle archive est `.ci-artifacts/local-2026-10-09-round21-22/` : voir la section « Tour 20 / Tour 21 / Tour 22 » plus bas.

## Commandes exécutées (par moi, sur l'état ci-dessus)

```text
cd be  && npm test && npm run typecheck && npm audit --audit-level=high
cd be  && npm run openapi   (puis comparaison binaire avec be/openapi.json)
cd web && npm test && npm run build && npm audit --audit-level=high
cd web && CI=true npm run test:e2e        (3 exécutions consécutives)
```

`npm ci` n'a pas été rejoué dans cette passe (dépendances inchangées). Journaux : `.ci-artifacts/local-2026-10-09/`.

## Résultats

| Contrôle | Résultat |
|---|---|
| Backend | **258/258** |
| Typecheck backend | propre |
| Frontend (Vitest) | **322/322** (17 fichiers), contrat API **13 littérales + 12 dynamiques**, frontières client OK |
| Playwright E2E | **411/411 trois fois de suite** (Chromium, iPhone 13 émulé, bundle de production) |
| OpenAPI | identique à `be/openapi.json` au moment de la passe archivée (sha256 `a10dd1e5…951eb` ; hash actuel `f1dbd031…c6c6`, voir la section du tour 22) |
| `npm audit --audit-level=high` | **0** vulnérabilité (backend et frontend) |
| Budget de poids | JS **359 139 / 400 000** o, CSS **65 969 / 120 000** o |
| P0 ouverts | **0** |
| P1 ouverts | **0** |

Précision d'honnêteté : une première passe de preuves a montré 1 à 2 échecs Playwright par exécution (1, 1 et 2 échecs sur 411 pour les trois passes). **Le même test**, R17-D-01 (« the note is shown while the class data fails to load », `getByRole('alert')` introuvable), a échoué dans les **3 passes sur 3** à la première tentative : sous cette charge l'échec était donc déterministe, pas aléatoire ; un autre test (R2V-01/02) a échoué une fois. L'analyse l'attribue à une **course d'ordonnancement dans les tests** (rechargement avant la fin du changement de rôle Faculty, et requête `route.fetch` encore en vol à la fin du test) ; ce n'est pas une preuve par les seuls journaux, et aucun défaut du produit n'a pu être exclu à partir d'eux seuls. La correction a porté **uniquement sur les tests** (et l'assistant `patched`) ; **le code du produit n'a pas changé** ; la passe complète a ensuite été rejouée trois fois de suite : **411/411 × 3**. La première tentative est archivée dans `.ci-artifacts/local-2026-10-09-first-attempt/`.

## Boucle de convergence adversariale (tours 9 à 19)

Chaque tour : auditeurs en lecture seule (backend / API, parcours étudiant en navigateur réel, Faculty et cohérence chiffrée ; à partir du tour 16 un relecteur de la page de démonstration). Les défauts P0/P1 sont corrigés à la racine avec un test écrit d'abord, puis tout est revérifié. Totaux calculés à partir des fichiers `reports/test-e2e/r*/round-1/*.json`.

| Tour | Vagues | P0 | P1 | P2 | P3 | Remarque |
|---|---|---:|---:|---:|---:|---|
| 9 | A B C | 0 | 5 | 13 | 17 | corrigés |
| 10 | A B C | 0 | 1 | 8 | 17 | corrigé |
| 11 | A B C | 0 | 0 | 4 | 19 | premier tour sans P0/P1 |
| 12 | A B C | 0 | 1 | 5 | 18 | clé de comparaison des noms non transitive : refonte (clé unique) |
| 13 | A B C | 0 | 0 | 3 | 21 | |
| 14 | A B C | 0 | 0 | 5 | 18 | |
| 15 | A B (ciblé) | 0 | 0 | 3 | 7 | |
| 16 | A B C D | 0 | 1 | 8 | 14 | P1 dans la page de démonstration (formulation « audits indépendants ») |
| 17 | A B D | 0 | 2 | 2 | 14 | P1 : défilement bloqué par la sidebar fixe ; données de démonstration non signalées côté Faculty |
| 18 | A B (rapide) | 0 | 0 | 0 | 3 | **tour propre sur le code final** |
| 19 | A B (rapide) | 0 | 0 | 1 | 6 | **deuxième tour propre consécutif** ; répétition du script de démonstration |

Convergence : **les tours 18 et 19 étaient deux tours consécutifs sans P0 ni P1 sur le code d'alors (appelé « code final » à l'époque ; le code a changé depuis, voir la section en haut de ce fichier)**, couche de démonstration comprise. Les tours 13 à 15 étaient aussi sans P0/P1 avant l'ajout de la page de démonstration et de la sidebar fixe ; les tours 16 et 17 ont trouvé des P1 uniquement dans ces ajouts, tous corrigés.

**Limite importante de cette preuve** : tous ces auditeurs sont des agents IA de la même équipe de développement. Ce n'est ni une revue indépendante humaine ni un audit externe, et la page de démonstration le dit.

## Principaux défauts trouvés puis corrigés pendant la boucle

- Indice payé en XP perdu au rafraîchissement ou en cas d'arrêt : maintenant enregistré dans la même transaction que la facturation (texte stocké, relu après redémarrage).
- Absence de délai maximal sur les requêtes : abandon après 20 s avec alerte et reprise.
- Comparaison des noms d'enseignants contournable (homoglyphes, caractères invisibles, cas des majuscules, signes combinants) : clé canonique unique et transitive, testée de façon exhaustive.
- Filtre anti-fuite des indices générés par IA (désactivé par défaut) : contournements corrigés ; reste une heuristique, non une garantie.
- Réinitialisation de la démo : transaction unique, ne touche plus au travail d'autres enseignants.
- Chiffres incohérents entre écrans (labs terminés, dénominateurs 9 contre 10 missions) : une seule définition côté serveur.
- Interface : focus clavier, débordements de texte long, messages d'erreur vides, notices de session croisées entre rôles, classement avec joueur non classé, sidebar fixe qui avalait le défilement.
- Page de démonstration : suppression d'une formulation trompeuse (« audits indépendants »), ajout de la mention « données de démonstration générées » sur toutes les vues Faculty, correction d'affirmations inexactes (rejouer une mission, nouveau record).

## P2/P3 connus et choix volontairement non traités

Liste complète et à jour dans `docs/KNOWN_LIMITATIONS.md` (notes des tours 10 à 17) et dans `reports/test-e2e/r19/`. Points principaux : taille de police du navigateur ignorée (px au lieu de rem) ; l'illustration de la mission bio-02 met en évidence la réponse (relecture biomédicale nécessaire) ; l'écran de résultat diffère juste après la mission et après rechargement ; tous les invités partagent le même utilisateur serveur de démonstration ; revue de contenu globale et non par classe ; pas de routage par URL ; test de lecteur d'écran, WebKit/Safari non effectués ; filtre d'indices IA heuristique ; sidebar défilant d'abord en paysage téléphone très court.

## Ce qui reste à faire avant tout autre statut que « démonstrable »

1. Relecture par des experts biomédicaux de chaque mission, valeur, unité, corrigé, indice et image (`docs/SCIENTIFIC_REVIEW_BACKLOG.md`).
2. Validation par des enseignants (difficulté, retour, score) ; documenter la provenance et la licence des images.
3. Deux exécutions CI distantes consécutives archivées (dépôt Git distant requis).
4. Revues humaines indépendantes : sécurité, accessibilité (dont lecteur d'écran), performance, état/concurrence, contrats.
5. Pilote étudiant (pré-test, usage, post-test) soumis à l'accord éthique et à la protection des données.

## Démonstration

Page intégrée « About & demo guide » (menu, pour les deux profils), script de présentation dans `docs/FACULTY_DEMO_SCRIPT.md`, captures du portfolio dans `docs/demo-screenshots/` (10 images et légendes). Préparation : réinitialiser les données de démonstration avant de présenter (détail dans le script).

## Tour 20 / Tour 21 / Tour 22 — état après les corrections (2026-10-09 ; les lignes couvrent aussi les tours 23 à 30)

> Faits mesurés par le superviseur à partir de ses propres journaux (`.ci-artifacts/local-2026-10-09-round21-22/`, voir son `README.md`). Validation **locale uniquement**. Les auditeurs sont des agents IA de la même équipe, pas une revue humaine externe. Convergence adversariale, **état réel** : tour 21 (code d'avant la correction R21-A-01) P0 = P1 = 0 ; tour 22 (code final : API ; documents et captures) P0 = P1 = 0, aucun P2 sur le code, 4 P2 de formulation dans les documents, corrigés ; tour 23 (documents, état final) P0 = P1 = 0, 2 P2 de formulation, corrigés. Le critère d'origine « aucun P2 nouveau introduit par ces corrections » de `docs/GOAL_FINAL_MVP.md` n'était **pas** démontrable au sens strict ; il a été reformulé avec l'accord de l'utilisateur en « zéro P2 sur l'état audité en dernier » (tours 22, 26 et 29, chacun pour sa portée : voir les lignes de tours) : les retouches de documents ont fait apparaître des P2 de formulation à plusieurs tours (22, 23, 25, 27 et 28), et l'état final n'a pas été réaudité après la dernière correction. **(Phrase corrigée au tour 35, C35-001 :** cette phrase valait pour l'état du tour 22 ; elle n'est plus vraie. Les tours 34 et 35 ont laissé respectivement 7 et 6 P2 ouverts, dont des défauts de code, voir la section « État vérifié le plus récent » en haut de ce fichier et `docs/KNOWN_LIMITATIONS.md`.**)** Les critères techniques (tests, deux passes Playwright, P0 = P1 = 0 sur deux tours consécutifs) **étaient remplis à l'époque de ces tours, pour le code d'alors** (le code a changé au tour 36 : voir la section en haut de ce fichier, qui seule décrit l'état courant) ; la validation biomédicale et la mise en production restent **ESCALATE**.

| Élément | Valeur |
|---|---|
| Archive de preuves | `.ci-artifacts/local-2026-10-09-round21-22/` (dont `final-r23/` pour l'état final) |
| Modifications depuis `local-2026-10-09` | tour 20 : course dans les assistants de tests R5-02/R5-03 et R6-01 ; tour 21 : textes d'interface (D-06 note « Approved n'est pas une validation », « guest demo session », « server-side scoring », « Milestones » + « N of M earned », « accuracy NN% », lede du résultat), correction d'un chevauchement introduit puis corrigé (note d'approbation sous la bannière de données de démonstration), backend (clé d'e-mail NFC, corps vide pour `start` et `demo/reset`, `user.demo`, OPTIONS/405, connexion multi-candidats R21-A-01), documents, 10 captures refaites, journal de sortie des serveurs de prévisualisation (`playwright.config.ts`) |
| Backend (final) | **265/265** (258 + 7 nouveaux tests : `be/test/r20-fixes.test.ts`), typecheck propre, `npm audit --audit-level=high` : 0 |
| Frontend (final) | **322/322** (17 fichiers), contrat API 13 littérales + 12 dynamiques, frontières client OK, `npm audit` : 0 |
| Budget | JS **359 503 / 400 000** o, CSS **66 025 / 120 000** o |
| Playwright (état final) | **411/411 deux passes consécutives** (`final-r23/e2e1.log`, `e2e2.log`) ; auparavant 411/411 ×2 au tour 22 sur le code d'avant la correction R21-A-01 |
| Passe en échec, non cachée | tour 21, passe 2 : 408/411, les 3 tests `production-bundle` en `ERR_CONNECTION_REFUSED` (ports 4173/4174). **Cause non établie** (voir `docs/KNOWN_LIMITATIONS.md` point 14). Ne s'est pas reproduite sur les 4 passes complètes suivantes (tours 22 et 23) ni sur le projet `production-bundle` lancé seul (3/3, `r21-failed-pass/prod-only.log`), avec observateur de ports. |
| Échec au tour 20 | R5-02/R5-03 : course de test (`isVisible()` ne patiente pas), corrigée ; répétée 30/30 dans la configuration à 1 worker (sortie console, **journal non archivé**), puis 411/411 dans les passes archivées |
| SHA-256 `be/openapi.json` | `f1dbd031f6c1ee65ddec55d9d22bc7c98b86004c4e9abcdf00d4949bec48c6c6` (régénéré, identique au fichier ; l'ancien `a10dd1e5…` est celui de l'archive du 03:04 avant les corrections du tour 20) |
| SHA-256 `be/src/content.ts` | `d4bd3b647676886062b914b9b50c50600dc39bba3e63984037f4849badd85a39` (contenu biomédical non modifié) |
| Tour 20 (avant corrections) : P0 / P1 / P2 / P3 | 0 / 0 / 13 / 24 (`reports/test-e2e/r20/`) |
| Tour 21 (après corrections) : P0 / P1 / P2 / P3 | 0 / 0 / 3 / 16 : visuel 0/0/0/6, documents 0/0/2/7, backend 0/0/1/3 (`reports/test-e2e/r21/`) ; les 3 P2 ont été traités (hash OpenAPI obsolète présenté comme vérifiable et bandeaux trop confiants : corrigés ; R21-A-01 régression sur d'anciennes lignes : corrigée avec test, la base de développement n'a aucune collision) ; un P1 visuel (chevauchement) trouvé par l'agent des captures a été corrigé avant le tour (test de géométrie ajouté ; trace : `reports/test-e2e/r21/internal-p1-overlap.json`) |
| Tour 22 (état final) : P0 / P1 / P2 / P3 | backend 0 / 0 / 0 / 2 (environ 3 100 requêtes, `reports/test-e2e/r22/wave-A-backend-findings.json`) ; documents et captures 0 / 0 / 4 / 7 (`wave-D-docs-findings.json`). R21-A-01 confirmé résolu (50 connexions sur 1 paire et 2 triplets de lignes en collision : chaque propriétaire retrouve son compte). Non-régression : 395 requêtes mal formées sans 5xx, intégrité du score sur 40 tentatives en course |
| Tour 23 (documents, état final) : P0 / P1 / P2 / P3 | 0 / 0 / 2 / 8 (`reports/test-e2e/r23/wave-D-docs-findings.json`) : P2 = la formulation de convergence ci-dessus (« tours 21 et 22 sur l'état final ») et « 2 paires » au lieu d'« 1 paire », corrigés |
| Tour 24 (documents, vérification ciblée) : P0 / P1 / P2 / P3 | 0 / 0 / 0 / 2 (`reports/test-e2e/r24/wave-D-docs-findings.json`) : les 2 P2 du tour 23 confirmés corrigés ; les 2 P3 (clause redondante du script, chemin du fichier du P1 visuel) corrigés |
| Tour 25 (documents complets + captures) : P0 / P1 / P2 / P3 | documents 0 / 0 / 2 / 8, captures 0 / 0 / 0 / 7 (`reports/test-e2e/r25/`) : les 2 P2 (deux nombres de tests périmés dans des documents secondaires) corrigés |
| Tour 26 (documents, ciblé + balayage des chiffres périmés) : P0 / P1 / P2 / P3 | 0 / 0 / 0 / 4 (`reports/test-e2e/r26/`) |
| Tour 27 (état final complet : documents, code, captures) : P0 / P1 / P2 / P3 | 0 / 0 / 1 / 10 (`reports/test-e2e/r27/final-state-findings.json`) : le P2 (chemin du fichier du P1 visuel annoncé corrigé mais absent du rapport) est corrigé dans la ligne du tour 21 |
| Tour 28 (vérification des corrections du tour 27) : P0 / P1 / P2 / P3 | 0 / 0 / 1 / 1 (`reports/test-e2e/r28/post-r27-edits-findings.json`) : le P2 (le troisième `watch.log` n'était pas nommé dans `docs/KNOWN_LIMITATIONS.md` point 14 alors que la ligne ci-dessous disait le contraire) et le P3 (intitulé « tours 23 à 28 ») sont corrigés |
| Tour 29 (dernières modifications du tour 28) : P0 / P1 / P2 / P3 | 0 / 0 / 0 / 2 (`reports/test-e2e/r29/last-edits-findings.json`) : aucun P2 |
| Tour 30 (reformulation du critère du goal) : P0 / P1 / P2 / P3 | 0 / 0 / 2 / 2 (`reports/test-e2e/r30/reformulation-findings.json`) : 2 P2 (la note omettait le cas de code R21-A-01 ; le rapport citait un tour 29 sans ligne) corrigés par la présente version |
| Non réaudité par un agent adversarial après coup | uniquement les corrections du tour 30 (note de reformulation de `docs/GOAL_FINAL_MVP.md`, phrase de la ligne 108, lignes des tours 29 et 30, intitulé « tours 23 à 30 ») : vérifiées par script (recomptage des sévérités, existence des fichiers cités), pas par un agent. Aucun code n'a changé depuis la chaîne finale (`final-r23/`) |
| Verdict (de l'époque des tours 20 à 30 ; l'état courant et sa réserve sont en haut de ce fichier) | **DEMO-READY ACADEMIC MVP — TECHNICALLY VERIFIED LOCALLY.** Production / publication scientifique : **ESCALATE** |

## Verdict historique (2026-10-08)

> Toutes les sections de ce point jusqu'à la fin du fichier sont **historiques** (passes du 2026-10-05 au 2026-10-08, chiffres et gates G0–G8 d'alors). L'état courant est la section « État vérifié le plus récent » en haut de ce fichier ; l'« Action suivante obligatoire » ci-dessous est une instruction passée, non une consigne en cours.

**Automatisation locale : PASS. Release finale : ESCALATE.**

Le socle fonctionnel est vert, mais « tout fonctionne sans faute » n’est pas encore démontré au niveau release : la CI distante, la revue indépendante spécialisée et la couverture complète des gates G1–G8 restent à fermer.

## Preuves établies

| Domaine | Résultat | Preuve |
|---|---:|---|
| Backend | **108/108** | tests Node natifs réussis (mise à jour 2026-10-08 ; 48 au 2026-10-06) |
| Frontend | **186/186** (16 fichiers) | Vitest réussi, dont les sondes des scripts de garde (14/14 au 2026-10-06) |
| Contrat API | **25 opérations** | 13 littérales + 12 dynamiques, méthode et chemin contrôlés ; scripts durcis (méthode non littérale, alias, génériques imbriqués refusés) |
| Build production | **PASS** | TypeScript + Vite réussis ; budget JS 326 243 / 400 000 o, CSS 54 785 / 120 000 o |
| E2E Playwright | **232/232** | 3 projets (Chromium bureau, iPhone 13 émulé, bundle de production) ; 3 passes consécutives sans flake |
| E2E ciblés d'audit | **41** | `web/e2e/audit-fixes.spec.ts` : un test par défaut trouvé par les audits adversariaux |
| Runtime | **Node v22.23.2** | compatible avec la contrainte `>=22.18.0` |
| UI fonctionnelle automatisée | **PASS** | navigation, progression, reprise, clavier, accessibilité automatisée et réseau lent |

## Parcours couverts

Mode invité démo, dashboard étudiant, progression, missions, six moteurs, erreur/retry, indice, reprise d’une tentative, résultat serveur, parcours enseignant, gouvernance éditoriale, contrôle Axe, focus clavier, mobile/tablette, reduced motion, démarrage dans le budget smoke et comportement sous réseau ralenti.

## Limites et risques restant à fermer

- Une inspection visuelle UX humaine n’est pas remplacée par les tests automatisés.
- G0 exige deux exécutions CI distantes consécutives et archivage d’artefacts ; cette preuve n’est pas disponible localement.
- G1–G8 du plan strict doivent être audités avec reviewers spécialisés indépendants, notamment sécurité, contrats API, machine d’état, accessibilité, responsive, performance et release.
- Aucun verdict « production ready » ne doit être donné avant fermeture documentée de ces gates.

## Référence d’exécution

Le journal détaillé des boucles reste disponible dans [E2E_VALIDATION_REPORT_2026-10-04.md](./E2E_VALIDATION_REPORT_2026-10-04.md). Le plan de correction strict est [ULTRA_STRICT_EXECUTION_PLAN.md](./ULTRA_STRICT_EXECUTION_PLAN.md).

## Action suivante obligatoire

Exécuter le goal strict ci-dessous dans l’ordre G0 → G8, corriger chaque écart avec un diff minimal, faire examiner chaque plan/rework par le rôle spécialisé indiqué, puis produire un verdict `PASS`, `NEEDS_FIX` ou `ESCALATE` accompagné des artefacts.

## G0 — reprise vérifiée le 2026-10-06

Avec Node **v22.23.2** et npm **10.9.8**, la suite locale compatible a réussi : backend **48/48**, typecheck backend **PASS**, frontend **2/2**, contrat API **10 routes**, build **PASS**, Playwright **15/15 en 10,0 s**. Le shell par défaut Node **v18.20.7** est refusé par les preflights, conformément à la contrainte `>=22.18.0`.

Décision G0 : **PASS technique local / ESCALATE pour fermeture release**. Il manque toujours deux exécutions CI distantes indépendantes, terminées avec succès, leurs artefacts archivés et la signature du reviewer Build/CI. Aucun changement de code n’a été nécessaire pour cette reprise.

## G1 — audit initial des contrats

Le contrôle existant confirme **10 routes littérales** contre `be/openapi.json`, et les E2E couvrent plusieurs routes dynamiques. Toutefois, le script `web/scripts/check-api-contract.mjs` exclut explicitement les appels contenant `${...}` et ne valide pas les payloads/réponses ni la matrice route → état UI. Les routes dynamiques d’authentification, missions, tentatives, classes, contenu et résultats ne sont donc pas entièrement prouvées par ce check.

Correction appliquée au check : les templates dynamiques sont désormais extraits et normalisés contre les paramètres OpenAPI. Nouvelle preuve : **10 routes littérales + 10 routes dynamiques** détectées, contrat de routes et tests frontend **2/2** réussis.

Décision G1 : **NEEDS_FIX résiduel**. La couverture des chemins est améliorée, mais les méthodes, payloads et réponses n’ont pas encore une matrice contractuelle exhaustive. Revue indépendante Contract specialist obligatoire avant PASS.

La matrice initiale est maintenant livrée dans [API_CONTRACT_MATRIX.md](./API_CONTRACT_MATRIX.md), couvrant auth, dashboard, labs, attempts, hints, résultats, vault/unlock, profil, classes, analytics, roster, détail étudiant et gouvernance contenu. Décision inchangée tant que les schémas détaillés n’ont pas été examinés et signés indépendamment.

La génération OpenAPI a été rejouée sous Node v22.23.2 et comparée à l’artefact existant : sortie identique. Les schémas de payload critiques (`demo`, `unlock`, `answer`, `hint`, `content status`) ont été relevés dans la matrice. G1 reste en attente de tests de réponse exhaustifs et de signature indépendante.

## G2 — sécurité et autorité serveur

Preuve actuelle : `npm audit --audit-level=high` retourne **0 vulnérabilité** pour `be/` et `web/`; les **48 tests backend** passent, incluant tokens invalides/expirés, rôles, isolation, anti-fuite des corrigés, timer/scoring/hints côté serveur, expiration, rate limit, headers et payloads malformés.

Décision G2 : **PASS technique automatisé / revue AppSec requise**. La signature indépendante AppSec et une tentative navigateur documentée de falsification score/timer/unlock restent nécessaires pour fermer le gate.

## G3/G4 — parcours étudiant et récupération

Rejeu actuel sous Node **v22.23.2** : backend **48/48** et Playwright **15/15 en 10,1 s**. Les scénarios couvrent dashboard, reprise après refresh, indice, erreur puis retry, les moteurs point/decision/stepper/order/matching, parcours faculty, résultat serveur, mobile, clavier et réseau lent. Les tests backend couvrent en plus expiration, pénalités, budget d’indices, concurrence, tentative terminée et reprise après redémarrage.

Décision G3 : **PASS technique automatisé / revue Senior frontend E2E requise**.

Décision G4 : **PASS technique automatisé / revue Backend state-machine specialist requise**. Les signatures indépendantes et les artefacts de revue restent nécessaires ; aucun verdict release n’est déduit de ces passes locales seules.

## G5 — moteurs et accessibilité d’interaction

Les 15 scénarios rejoués incluent les moteurs point/image, decision, stepper, order et matching, avec contrôles clavier et scénario point sans souris. Axe dashboard et focus visible sont également exécutés. Le catalogue backend confirme les six familles (`image_identify`, `choice`, `drag_order`, `matching`, `decision`, `stepper`).

Décision G5 : **PASS technique partiel / Accessibility specialist requis**. La couverture automatisée ne remplace pas la revue indépendante de chaque moteur sur desktop et mobile ni la vérification de toutes les séquences correct/incorrect/retry/reload.

## G6 — enseignant et gouvernance de contenu

Les scénarios faculty couvrent analytics, roster, détail étudiant et workflow de review ; les tests backend couvrent les permissions, les métriques et la transition `draft → reviewed → approved`.

Décision G6 : **PASS technique automatisé / Education-content specialist requis**. La validation clinique/pédagogique indépendante reste absente.

## G7 — responsive, accessibilité et performance

Les scénarios rejoués couvrent viewport mobile, tablette, reduced motion, erreurs console, réseau lent, smoke budget, focus clavier et violations Axe dashboard.

Décision G7 : **PASS technique automatisé / revue UX-accessibilité-performance requise**. Une inspection visuelle humaine et une signature indépendante sont encore nécessaires ; aucune conclusion de qualité visuelle finale n’est portée par les tests seuls.

## G8 — release gate

Décision actuelle : **ESCALATE**. Les tests locaux sont verts, mais G0 exige deux runs CI distants archivés, et G1–G7 exigent encore les signatures indépendantes Contract, AppSec, Senior E2E, state-machine, Accessibility, Education/content et UX/performance. Le produit ne peut pas être déclaré `production-ready` tant que ces preuves ne sont pas attachées.

La matrice de traçabilité détaillée est disponible dans [GATE_TRACEABILITY_MATRIX.md](./GATE_TRACEABILITY_MATRIX.md).

## Limitation d’environnement d’audit

Le miroir courant ne contient pas de métadonnées Git (`git status`/`git remote` indisponibles). Aucun commit, remote ou run CI distant ne peut donc être vérifié depuis ce workspace. Cette limitation renforce, plutôt qu’elle ne réduit, le statut `ESCALATE` de G0/G8 : les preuves CI et les signatures doivent être fournies depuis le dépôt/runner autorisé.

## Validation réelle locale demandée — 2026-10-06

Périmètre volontairement limité au fonctionnement réel local, sans Git ni CI : backend lancé par le harness, frontend lancé par le harness, navigateur Chromium réel et interactions Playwright.

- Backend : **48/48** réussis.
- Frontend : **2/2** réussis ; contrat **10 littérales + 10 dynamiques**.
- Build production : **réussi**.
- E2E navigateur réel : **15/15** réussis en **10,6 s**.
- Parcours observés : authentification, dashboard, progression, refresh/reprise, indice, erreur/retry, moteurs point/decision/stepper/order/matching, faculty, mobile, tablette, reduced motion, clavier, Axe, console et réseau lent.

Verdict fonctionnement local : **PASS**. Ce verdict répond au test réel demandé et ne dépend pas de Git. Il ne prétend pas remplacer les signatures spécialisées du plan ultra-strict.

## Revalidation en fonctionnement réel — 2026-10-06

Cette revalidation a été exécutée localement avec **Node v22.23.2**. Playwright a démarré le backend en mode démo et le frontend Vite, puis a piloté le binaire Chromium installé par Playwright. Aucune correction de code n'a été requise : aucun échec reproductible n'a été observé.

| Vérification exécutée | Résultat observé | Preuve directe |
|---|---:|---|
| Tests backend | **48/48 PASS** | suite Node native, 0 échec |
| Typecheck backend | **PASS** | `tsc --noEmit` terminé sans diagnostic |
| Tests frontend + contrat | **2/2 PASS** | Vitest vert ; contrôle API : **10 routes littérales + 10 dynamiques** |
| Build frontend production | **PASS** | TypeScript puis Vite terminés sans erreur |
| Chromium E2E, passe 1 | **15/15 PASS** | **10,8 s** |
| Chromium E2E, passe 2 | **15/15 PASS** | **10,3 s** |
| Chromium E2E, passe 3 | **15/15 PASS** | artefact Playwright `test-results/.last-run.json` : `status: passed`, `failedTests: []` |

Les 15 scénarios Chromium couvrent le parcours étudiant et enseignant, la reprise après rafraîchissement, un indice serveur, une erreur suivie d'un retry, les six moteurs (`image_identify`, `choice`, `drag_order`, `matching`, `decision`, `stepper`), les viewports mobile/tablette, reduced motion, le clavier, Axe, l'absence d'erreurs page/console, le budget de démarrage et un réseau API volontairement ralenti.

**Verdict de cette exécution locale : PASS.** La portée est le fonctionnement réel local constaté. Le verdict release demeure **ESCALATE** tant que les preuves CI distantes et signatures indépendantes requises par G0–G8 ne sont pas jointes.

## Renforcement G1 — contrat route et méthode — 2026-10-06

Le contrôle frontend/OpenAPI a été renforcé : il vérifie désormais le couple **méthode HTTP + chemin**, y compris les segments dynamiques, au lieu de vérifier uniquement le chemin. La passe locale a confirmé **11 opérations littérales** et **10 opérations dynamiques** consommées par le frontend et documentées dans OpenAPI ; les tests frontend (**2/2**), le build de production et Chromium (**15/15**, 11,0 s) ont ensuite réussi.

Cette preuve réduit le risque qu'un appel `POST`/`PUT` soit accepté à tort contre une route OpenAPI qui n'exposerait qu'une autre méthode. Elle ne ferme pas G1 à elle seule : les validations exhaustives de schémas de réponses et la revue indépendante Contract specialist restent requises avant toute décision de release.

## Renforcement G2 — falsification depuis Chromium — 2026-10-06

Un scénario Chromium sur compte neuf tente directement, depuis le contexte navigateur, d'injecter `score`, `elapsedSec`, `timeLimitSec`, `penalties` et `unlocked` dans les requêtes métier. Les deux charges forgées sont rejetées en **400** par le schéma serveur ; l'état de tentative reste avec `wrongTotal: 0` et un temps calculé serveur inférieur à 60 secondes ; un code de sortie valide mais prématuré est refusé en **409** avec `vault_incomplete`. La suite Chromium compte désormais **16/16** scénarios réussis en **10,2 s**.

Cette preuve navigateur complète les tests backend existants sur l'autorité serveur. G2 reste soumis à la revue indépendante AppSec exigée par le plan avant fermeture de release.

## Consolidation technique locale — 2026-10-06

Sous Node **v22.23.2**, les contrôles de l'état courant ont réussi : backend **48/48**, typecheck backend **PASS**, audit dépendances backend **0 vulnérabilité high** et audit dépendances frontend **0 vulnérabilité high**. Les résultats s'ajoutent aux preuves frontend/build et Chromium **16/16** ci-dessus. Aucun de ces résultats locaux ne remplace les exécutions CI distantes archivées ou les signatures de revue exigées pour G0 et G8.

## Renforcement G4/G7 — incident réseau transitoire — 2026-10-06

L'interface expose désormais un bouton **Retry** lorsqu'un chargement de données échoue. Un scénario Chromium intercepte le premier appel dashboard avec un **503**, vérifie l'affichage du message d'erreur, déclenche Retry, puis confirme le retour du dashboard et de la carte des laboratoires sans perte de session. Après ce changement : tests frontend **2/2**, build **PASS** et Chromium **17/17** en **10,8 s**.

Ce test couvre une reprise de réseau transitoire sur le chargement dashboard. Les scénarios d'expiration, concurrence des hints, retry de réponse et reprise d'une tentative restent également couverts par la suite backend/E2E existante. Les revues indépendantes state-machine et UX/accessibilité/performance restent requises pour la clôture de release.

## Renforcement G1 — normalisation de tentative — 2026-10-06

La normalisation d'une tentative reçue de l'API est désormais isolée et testée. Elle conserve l'identifiant de tentative, la mission, l'étape courante, le temps, la limite, les pénalités et la progression fournis par le serveur. Les valeurs légitimes à zéro (`elapsedSec`, `timeLimitSec`, `wrongTotal`, `stepsSolved`) ne sont pas remplacées par une valeur par défaut côté interface.

Après cette extraction, les tests frontend sont **4/4 PASS**, le build production est **PASS** et le parcours Chromium complet est **17/17 PASS** en **15,7 s**. La preuve porte sur l'adaptation fiable de l'affichage à l'état serveur ; elle ne remplace pas la validation indépendante et exhaustive des schémas de réponse requise pour clôturer G1.

## Renforcement G6 — gouvernance éditoriale depuis Chromium — 2026-10-06

Le parcours enseignant pilote désormais la gouvernance de contenu dans le navigateur réel : consultation du détail étudiant, ouverture de la revue de contenu, puis transition contrôlée **draft → reviewed → approved → draft**. Chaque action est envoyée à l'API enseignant-scopée et l'état affiché est relu après réponse serveur.

Après ajout de cette preuve, Chromium est **17/17 PASS** en **14,3 s**. Elle valide le workflow applicatif et l'absence de rupture UI dans le navigateur ; elle ne constitue pas une validation biomédicale ou pédagogique indépendante du contenu.

## Consolidation G1 — matrice de consommation API — 2026-10-06

La matrice de contrat sépare maintenant explicitement le payload émis, la réponse consommée et l'état UI attendu pour les **21 opérations réellement appelées** par l'interface : **11 littérales** et **10 dynamiques**. Une route documentée mais non appelée (`GET /attempts/:id/result`) a été retirée de cette matrice de consommation ; l'écran de résultat est alimenté par la réponse autoritative de `POST /attempts/:id/answer`.

Le contrôle automatique reste limité à la correspondance route+methode avec OpenAPI ; la revue Contract doit toujours valider indépendamment les schémas complets, les erreurs et les compatibilités d'évolution.

## Renforcement G0 — traçabilité CI et OpenAPI — 2026-10-06

Le workflow distant régénère désormais OpenAPI et échoue si le fichier généré diffère de celui versionné. Il archive aussi la sortie Playwright, en plus du rapport HTML, des traces, de l'OpenAPI et des journaux backend/frontend/audits. Cette préparation facilite l'examen des deux exécutions CI indépendantes requises par G0.

Preuve locale associée : sous Node **v22.23.2**, régénération OpenAPI avec empreinte SHA-256 inchangée, backend **48/48 PASS**, typecheck **PASS** et audit backend **0 vulnérabilité high**. Ces résultats sont locaux et ne remplacent pas les deux archives CI distantes ni la signature Build/CI.

## Correction UX — navigation selon le rôle — 2026-10-06

La navigation latérale est maintenant adaptée au rôle autorisé par le serveur : un élève ne voit plus les entrées réservées à l'enseignant, et un enseignant ne voit plus les parcours apprenant qui produiraient des erreurs d'autorisation inutiles. Le fil d'Ariane affiche aussi correctement **Lab results** au lieu d'un libellé générique erroné.

Chromium confirme le comportement élève/enseignant et le libellé de résultats ; la suite complète reste **17/17 PASS** en **14,6 s**. Cette correction ne change aucun droit : les contrôles d'accès restent exclusivement appliqués par le backend.

## MVP invité sans compte — 2026-10-06

L'interface ne présente plus de connexion, création de compte ou choix d'accès. Au chargement, elle ouvre automatiquement une session **Guest learner** sur la démo étudiante, avec un token émis par le backend de démonstration. L'utilisateur peut basculer explicitement vers **Faculty guest** pour vérifier les fonctionnalités enseignant, puis revenir au mode étudiant. La remise à zéro efface la tentative locale, réinitialise l'état démo côté serveur et ramène le visiteur au dashboard.

Les comptes et les contrôles d'authentification backend restent présents pour préserver l'isolation des données, les rôles et les tests de sécurité ; ils ne sont plus une étape du parcours MVP. Chromium vérifie l'ouverture automatique, la bascule de rôle et le retour étudiant. Après correction d'un retour d'écran lors de la remise à zéro : frontend **4/4 PASS**, build **PASS**, contrat **12 opérations littérales + 10 dynamiques** et Chromium **17/17 PASS** en **13,9 s**.

Verdict fonctionnel MVP local : **PASS en mode invité démo**. Le verdict release reste **ESCALATE** jusqu'aux preuves CI distantes et signatures indépendantes prévues par les gates.

## Rejeu fonction par fonction — 2026-10-06

La validation n'est plus traitée comme une seule passe opaque. Chaque bloc ci-dessous a été rejoué séparément dans Chromium après le passage au mode invité :

| Fonctionnalité | Scénarios Chromium dédiés | Résultat |
|---|---:|---:|
| Mission, réponse, indice, reprise et résultat serveur | 3 | **3/3 PASS** |
| Moteurs decision, stepper, order et matching | 2 | **2/2 PASS** |
| Démo enseignant, analytics, roster, détail étudiant et revue éditoriale | 2 | **2/2 PASS** |
| Mobile, tablette, clavier, Axe, réseau lent, Retry, console et performance smoke | 8 | **8/8 PASS** |
| Falsification navigateur score/timer/unlock | 1 | **1/1 PASS** |

Le démarrage automatique invité, le retour depuis Faculty guest et la remise à zéro font partie des scénarios ci-dessus. Toute nouvelle fonctionnalité doit suivre cette règle : implémentation minimale, scénario Chromium dédié, correction immédiate en cas d'échec, puis seulement passage au bloc suivant.

## Renforcement technique — frontière API et session invitée — 2026-10-06

L'interface avait une implémentation MVP trop fragile : lecture directe du token depuis `localStorage`, parsing d'erreur dupliqué dans le composant principal et absence de représentation typée des erreurs HTTP. La couche `web/src/lib/api.ts` centralise maintenant :

- un jeton et une tentative de démonstration isolés à l'onglet via `sessionStorage` ;
- l'ajout contrôlé des en-têtes Bearer et JSON ;
- des erreurs HTTP structurées (`status`, `code`, `message`) ;
- la conservation de l'autorité backend : aucun score, timer, unlock ou état métier n'est calculé dans ce client.

Les nouveaux tests unitaires vérifient que le jeton invité n'est pas écrit dans `localStorage`, que l'en-tête Bearer est transmis et qu'une erreur backend est conservée avec son statut et son code. État après changement : frontend **6/6 PASS**, build TypeScript/Vite **PASS**, rapport Playwright complet `status: passed` et `failedTests: []`.

Limite explicite : `sessionStorage` réduit la persistance du bearer token, mais ne remplace pas une session HttpOnly/BFF pour une release production. C'est acceptable pour le MVP invité local ; une architecture de session serveur reste une exigence d'évolution avant exposition publique.

## Renforcement technique — garde-fou de frontière client — 2026-10-06

Une règle exécutable (`web/scripts/check-client-boundaries.mjs`) est maintenant intégrée aux commandes frontend de test et de build. Elle échoue si le code de production réintroduit `localStorage` ou un `fetch()` direct hors du client API dédié. Elle empêche donc une régression silencieuse vers un token persistant ou une couche réseau dispersée dans les écrans.

La règle, les tests unitaires et le build sont verts. Le scénario Chromium ciblé d'ouverture invitée et de reprise de mission après rafraîchissement est **2/2 PASS** après son ajout.

## Renforcement technique — contrats TypeScript de session — 2026-10-06

Le chemin critique de démarrage n'utilise plus de valeurs `any` pour l'identité invitée, le token de démonstration, le dashboard ou le catalogue de laboratoires. Les contrats `GuestUser`, `DemoLogin`, `Dashboard` et `LabsResponse` bornent désormais les données reçues et les props de navigation/dashboard. Cela rend une dérive de rôle, de token ou de structure de progression détectable lors du build, avant d'atteindre le navigateur.

Après cette étape : frontière client **PASS**, tests frontend **6/6 PASS**, build strict **PASS**, et Chromium étudiant + enseignant **2/2 PASS**. Les payloads de mission et de moteurs restent volontairement à compléter par génération OpenAPI ou validateurs de schéma avant de prétendre à une couverture de typage exhaustive.

## Réorientation LabEscape — expérience invitée et laboratoire visuel — 2026-10-06

L'entrée étudiant ne présente plus un prénom ou un tableau de points fictif. Elle annonce désormais **LabEscape**, un laboratoire biomédical virtuel en mode invité, et invite directement à choisir une première investigation. Le bandeau affiche un visuel éditorial d'établi d'investigation biomédicale, créé pour cette démo et explicitement présenté comme illustratif ; il ne constitue ni une image clinique ni une promesse diagnostique.

Les informations initiales sont maintenant orientées vers l'action : stations de laboratoire disponibles, état de l'investigation et vérification serveur. La session reste sans compte, avec remise à zéro et bascule faculty réservées à la démonstration. Les animations ajoutées sont limitées à un balayage d'établi, un mouvement lent de l'illustration et une entrée de cartes ; elles sont supprimées lorsque le système demande la réduction des mouvements.

Une régression responsive observée à **768 px** a été corrigée pendant cette passe : le titre de l'investigation pouvait élargir la page. Après correction, la suite Chromium complète est **17/17 PASS** (missions, six moteurs, erreur/réessai, reprise, faculty, mobile, tablette, reduced motion, clavier, Axe, console et réseau lent). Le build TypeScript/Vite et les tests frontend **6/6** sont également verts.

**Verdict UX de cette passe : amélioration fonctionnelle validée localement, mais pas encore direction artistique finale.** Il reste à construire une bibliothèque de scènes et de vrais médias pédagogiques validés, des missions plus riches par discipline, des retours narratifs animés et une revue visuelle humaine sur écrans réels. Le verdict de release demeure **ESCALATE** : les preuves CI distantes et les revues indépendantes G0–G8 restent nécessaires.

## Renforcement du moteur image — média illustratif et accessibilité — 2026-10-06

Le moteur `image_identify` n'affiche plus une scène CSS qualifiée de *placeholder*. Il utilise désormais une image de microscopie **illustrative de formation**, avec un libellé visible et une légende qui indiquent explicitement qu'elle ne sert pas au diagnostic clinique. La sélection reste fournie au backend sous forme de coordonnées ; aucun corrigé, seuil de réponse ou calcul métier n'a été ajouté au frontend.

La zone de sélection est maintenant un bouton HTML natif, tout en conservant le pointage souris et les flèches clavier. Les scénarios Chromium dédiés point/erreur/retry, point au clavier et Axe sont **3/3 PASS** ; la suite Chromium complète est ensuite **17/17 PASS**. Build TypeScript/Vite et tests frontend **6/6 PASS**. Les images restent illustratives jusqu'à validation indépendante scientifique et pédagogique.

## Cohérence du mode invité — aucune identité fictive — 2026-10-06

L'écran précédemment nommé *Profile* est devenu **Learning settings** : il ne rend plus le nom, l'e-mail, le niveau ni la progression d'un utilisateur démonstratif. Il explique que les réglages sont limités à la session invitée et qu'aucun compte personnel n'est créé. Le scénario Chromium étudiant le vérifie explicitement et réussit après ce changement. Le backend conserve l'identité technique de démonstration uniquement pour l'isolation, les rôles et les tests ; elle n'est plus présentée comme l'identité du visiteur.

## Renforcement de récupération — indice unique et layout tablette — 2026-10-06

Une demande d'indice est maintenant **single-flight** côté interface : le bouton affiche `Requesting hint…`, devient indisponible pendant l'appel et redevient disponible après la réponse. Un scénario Chromium ralentit volontairement la route d'indice, confirme cet état et prouve qu'une seule requête est émise. L'autorité sur le budget, les pénalités et le contenu de l'indice reste entièrement backend.

La même passe a exposé un débordement horizontal tablette intermittent. La correction ne masque pas le problème : la colonne de contenu flex peut désormais se contracter à côté de la navigation. Le scénario tablette avec reduced motion a réussi **3/3** en rejeu isolé, puis la suite Chromium complète est **18/18 PASS**. Le build et les tests frontend précédemment verts restent les preuves applicables à cette version. Verdict release inchangé : **ESCALATE** tant que CI distante et revues externes manquent.

## Renforcement technique — contrat d'entrée des six moteurs — 2026-10-06

Les réponses envoyées par les moteurs ne sont plus représentées par `any` : un contrat frontend unique borne maintenant les coordonnées du moteur image, les choix, les décisions, l'ordre et les associations. Ce contrat ne valide pas une bonne réponse et ne contient aucun corrigé ; il ne fait que rendre les formats d'entrée explicites avant leur envoi au backend.

Build TypeScript/Vite et tests frontend sont passés après ce changement. Les quatre scénarios Chromium dédiés couvrant point/image, décision, stepper, ordre, matching et clavier sont **4/4 PASS**, suivis de la suite complète **18/18 PASS**. Les schémas de réponse de mission, résultat et indice restent à compléter par un contrat runtime/OpenAPI généré avant toute affirmation de typage exhaustif.

## Renforcement G1/G4 — normalisation stricte des tentatives — 2026-10-06

La normalisation du lecteur de mission ne substitue plus de valeurs par défaut locales pour `elapsedSec`, `timeLimitSec`, `stepsSolved`, `wrongTotal`, l'identifiant ou la mission. Un payload incomplet est maintenant rejeté explicitement ; l'interface ne fabrique donc ni timer, ni progression, ni pénalité. Un test unitaire supplémentaire prouve ce rejet, portant les tests frontend à **7/7 PASS**.

Cette exigence a révélé le chemin terminal : une tentative finalisée n'a volontairement plus d'étape en cours. Le client traite donc d'abord le résultat final autoritatif, au lieu d'essayer de normaliser une étape inexistante. Les scénarios Chromium qui terminent point/image, décision/stepper et ordre/matching sont **3/3 PASS**, puis la suite complète est **18/18 PASS**. La fermeture G1/G4 reste conditionnée aux schémas de réponse exhaustifs et à la revue indépendante requise.

## Renforcement G1 — réponses answer et hint — 2026-10-06

Les réponses de soumission et d'indice sont maintenant normalisées à partir du format réel backend. Le navigateur exige `correct`, le feedback structuré, une tentative complète lorsqu'elle continue, un résultat lorsque l'API signale la fin, et une chaîne d'indice non vide. Il ne déduit ni réponse correcte ni contenu d'indice. Cette passe a aussi corrigé un défaut visuel : le préfixe serveur `Correct.`/`Not quite.` est affiché une seule fois, avec le détail scientifique intact.

La normalisation dispose de tests unitaires de payload valide et invalide ; les tests frontend sont **10/10 PASS**. Les cinq scénarios Chromium mission/indice ciblés sont **5/5 PASS**, puis build production et Chromium complet sont **18/18 PASS**. Les autres réponses d'écrans secondaires restent à typer/valider pour une couverture de contrat réellement exhaustive.

## Revalidation backend et dépendances — 2026-10-06

Après cette consolidation, la suite backend est **48/48 PASS**, le typecheck backend est **PASS**, et `npm audit --audit-level=high` retourne **0 vulnérabilité** pour `be/` et `web/`. Ces preuves s'ajoutent au build frontend réussi, aux tests frontend **10/10** et à Chromium **18/18**. Elles ne remplacent toujours pas les deux exécutions CI distantes archivées ni les signatures indépendantes exigées par G0–G8.

## Renforcement G1 — résultats et Code Vault — 2026-10-06

Les réponses de `GET /labs/:slug/results` et `GET /vault` disposent maintenant de normalisateurs dédiés côté client. Ils vérifient les identifiants de laboratoire, statistiques, missions, scores déjà calculés, emplacements de fragments et flags `complete/exited`; ils n'effectuent aucun calcul d'XP, de code ou de déverrouillage. Les erreurs de forme remontent à l'état d'erreur UI au lieu d'être rendues comme des données plausibles.

Build et tests frontend restent **PASS** (10/10), puis la suite Chromium incluant progression, résultats, unlock, analytics, roster, détail et gouvernance est **18/18 PASS**. La couverture complète des réponses secondaires (badges, leaderboard et écrans faculty) reste un écart G1 documenté avant revue Contract indépendante.

## Renforcement G1 — badges et classement — 2026-10-06

Les réponses `GET /badges` et `GET /leaderboard` disposent maintenant de contrats de lecture dédiés. Le client vérifie les identifiants, libellés, états `earned`, rangs, noms anonymisés, XP et laboratoires avant rendu ; il ne calcule ni récompense, ni rang, ni XP. Une réponse invalide remonte à l'état d'erreur au lieu d'être affichée partiellement.

Après cette étape : build **PASS**, tests frontend **10/10 PASS**, Chromium **18/18 PASS**. La matrice API couvre désormais les consommations principales étudiant (tentatives, indice, résultats, vault, badges et classement) avec normalisation côté client. Les contrats faculty et les schémas d'erreur exhaustifs restent soumis à revue Contract indépendante.

## Renforcement G6 — gouvernance éditoriale typée — 2026-10-06

Les réponses `GET /content/missions` et `PUT /content/missions/:id/status` sont maintenant normalisées avec l'état fermé `draft | reviewed | approved`. Le client ne peut pas inventer un statut ni approuver localement : chaque transition est demandée au backend puis remplacée par la mission renvoyée par le serveur.

Les tests frontend sont **12/12 PASS**, le scénario Chromium de gouvernance éditoriale est **1/1 PASS**, et la suite complète est **18/18 PASS**. La validation pédagogique/biomédicale indépendante reste obligatoire avant release.

## Renforcement G6 — détail étudiant et roster — 2026-10-06

Les appels faculty `GET /classes`, `GET /classes/:id/students` et `GET /classes/:id/students/:studentId` sont maintenant normalisés pour les champs utilisés par l'écran de détail : classe, identité autorisée, précision, historique, scores et réponses soumises. Un payload incomplet remonte à l'état d'erreur ; le client ne fabrique aucun indicateur étudiant.

Le test Chromium détail étudiant + gouvernance est **1/1 PASS**, puis Chromium complet est **18/18 PASS**. Build et tests frontend sont **12/12 PASS**. Les contrats d'erreur et les champs faculty secondaires restent à signer par la revue Contract indépendante.

## Renforcement G1/G6 — analytics faculty — 2026-10-06

Le dashboard faculty normalise maintenant les chiffres de cohorte, les signaux de mission et le roster résumé reçus de `GET /classes/:id/analytics`. Les valeurs `students`, `avgCompletionPct`, `needsAttention`, titres de mission, succès et noms d'élèves sont vérifiées avant rendu ; aucun indicateur n'est recalculé côté navigateur.

Les parcours Chromium faculty analytics/roster et détail/gouvernance sont **2/2 PASS**, puis la suite complète est **18/18 PASS**. Build et tests frontend restent verts. Les détails étudiant et les transitions de contenu restent à compléter dans un contrat runtime dédié avant fermeture Contract indépendante.

## Renforcement G1/G4 — résultat final de mission typé — 2026-10-06

Le payload final de `POST /attempts/:id/answer` est maintenant normalisé pour exiger le score serveur, les statistiques d'exécution et, lorsqu'il existe, le fragment avec sa position. Le composant de résultat n'utilise plus de fallback local pour ces valeurs sensibles. Les réponses intermédiaires continuent d'exiger une tentative complète ; les réponses terminales exigent un résultat complet.

Build et tests frontend sont **12/12 PASS**. Les scénarios de fin point/image, décision/stepper et ordre/matching sont **3/3 PASS**, puis Chromium complet **18/18 PASS**. Cela renforce G1/G4, mais ne constitue pas la revue state-machine indépendante exigée pour la release.

## Synthèse de clôture de passe — statut réel — 2026-10-06

Le MVP Escape Lab est fonctionnel localement en mode invité démo : aucune création de compte n'est requise, le parcours étudiant démarre directement sur le dashboard, et les six moteurs sont exercés par la suite Chromium. Les parcours mission, indice, erreur/réessai, reprise après rafraîchissement, résultat serveur, progression, faculty, mobile/tablette, clavier, Axe, reduced motion, réseau lent et console sont couverts par les preuves locales disponibles.

État de preuve consolidé : backend **48/48 PASS**, typecheck backend **PASS**, tests frontend **12/12 PASS**, build production **PASS**, audit npm backend/frontend **0 vulnérabilité haute**, suite Chromium **18/18 PASS** ; backend `/api/health` répond `status: ok` avec 4 laboratoires et 10 missions, frontend répond HTTP 200.

Verdict fonctionnel MVP local : **PASS**. Verdict de release : **ESCALATE**. Il manque encore deux exécutions CI distantes archivées et les revues indépendantes Build/CI, Contract, AppSec, state-machine, frontend E2E, accessibilité/performance, contenu biomédical et Release Manager. La direction artistique est améliorée (hero illustré, image pédagogique illustrative, thème clair, animations et reduced motion), mais elle n'est pas encore considérée comme une bibliothèque visuelle pédagogique finale validée humainement.

## Revalidation fraîche — runtime Node et Chromium — 2026-10-06

Un lancement depuis le shell par défaut a été refusé par les preflights car il utilisait Node **v20.18.3**. Ce n'est pas un échec applicatif : la contrainte projet est `>=22.18.0`. La même passe a ensuite été relancée avec Node **v22.23.2**, le runtime compatible présent dans l'environnement.

Preuves fraîches avec ce runtime : frontend **12/12 tests**, build production **PASS**, contrat **12 opérations littérales + 10 dynamiques**, audits frontend/backend **0 vulnérabilité** high/critical, backend **48/48 tests**, typecheck **PASS**, Chromium **18/18 PASS en 16,8 s**. Playwright a démarré et arrêté ses propres serveurs sans réutiliser un état précédent. Les serveurs de démo ont ensuite été relancés pour l'essai manuel local (`http://127.0.0.1:5173/`).

Le garde-fou Node est donc confirmé : toute CI ou session locale doit sélectionner le runtime `v22.23.2` (ou supérieur compatible) avant les commandes de validation.

La génération OpenAPI a également été rejouée sous ce runtime : empreinte avant/après identique (`bb6ac7c22a74173a2d448bade8a9c966a006688eefb2b83bff9715cb88ae73c8`). Le contrat versionné n'a donc pas dérivé pendant cette passe.

## Renforcement G1 — chemin mission sans `any` — 2026-10-06

Les appels de reprise `GET /attempts/:id` et de démarrage `POST /missions/:id/start` ne passent plus par `api<any>`. Ils reçoivent désormais `unknown`, puis doivent traverser `normalizeAttempt` avant d'entrer dans l'état React. Le type de navigation et le composant de statistique ont aussi été resserrés (`View`, `ReactNode`). Cette correction ne déplace aucune logique métier côté client ; elle réduit seulement le risque de contourner la validation de forme sur le chemin critique étudiant.

Après ce diff : tests frontend **12/12 PASS**, build **PASS**, et Chromium complet **18/18 PASS en 17,2 s**. Les serveurs de démo ont été relancés ensuite pour l'essai manuel local.

## Renforcement G1 — profil et faculty sans réponses `any` — 2026-10-06

Les préférences `GET /profile` sont maintenant validées par `normalizeProfileSettings`, qui exige les trois booléens explicites et refuse un payload incomplet sans inventer de valeurs. Les listes `GET /classes` et `GET /classes/:id/students` du parcours faculty traversent désormais `normalizeClasses` et `normalizeRoster` avant rendu. Le roster affiché n'est plus alimenté par une structure `any`.

Le frontend ne contient plus de `api<any>`, `useState<any>` ni de callback roster `any` dans les sources de production contrôlées. Les tests frontend sont **14/14 PASS**, le build est **PASS**, puis Chromium complet **18/18 PASS en 15,3 s**. Cette amélioration ferme une faiblesse de normalisation côté client, mais la signature Contract indépendante reste obligatoire.

## Snapshot local complet après renforcement profil/faculty — 2026-10-06

Une passe backend/frontend complète a été rejouée avec Node **v22.23.2** après les derniers changements : backend **48/48**, typecheck backend **PASS**, frontend **14/14**, contrôle contrat **12 opérations littérales + 10 dynamiques**, build **PASS**, audits npm backend/frontend **0 vulnérabilité** high/critical. Le runtime manuel répond toujours `/api/health = { status: ok, labs: 4, missions: 10 }` et le frontend répond HTTP **200**.

Cette preuve est locale et fraîche. Elle ne doit pas être confondue avec les deux runs CI distants archivés exigés par G0, qui restent absents du workspace.

Le workflow `.github/workflows/escape-lab-validation.yml` archive désormais aussi `validation-manifest.json` avec `runId`, tentative, SHA, ref, version Node et la liste des journaux/artefacts attendus. Cette amélioration prépare une comparaison vérifiable des deux runs distants sans modifier les critères de réussite ni transformer une exécution locale en preuve CI.

Un replay local au plus près du workflow CI a ensuite été archivé dans `.ci-artifacts/local-2026-10-06/` : `npm ci` backend/frontend, seed de démonstration, génération OpenAPI, backend **48/48**, typecheck **PASS**, frontend **14/14**, build **PASS**, audits **0 vulnérabilité** et Chromium **18/18 en 18,2 s**. Le manifeste local marque explicitement `remoteCi: false` et `independentReviews: false`; il constitue une preuve de reproductibilité locale, jamais une preuve de fermeture G0/G8.

## Renforcement G5/G7 — annonces d'erreur et de chargement — 2026-10-06

Les erreurs réseau rendues par le shell, le contenu, les résultats et la progression portent maintenant `role="alert"`. Le chargement de l'analytics faculty est exposé comme `role="status"` avec `aria-live="polite"`. Les messages visuels existants restent inchangés pour les utilisateurs voyants ; cette correction ajoute une annonce fiable aux technologies d'assistance sans déplacer de logique métier.

Après ce changement : tests frontend **14/14 PASS**, build **PASS**, Chromium complet avec Axe/clavier/mobile/réseau lent **18/18 PASS en 15,7 s**. La revue indépendante accessibilité/performance reste requise pour la fermeture G5/G7.

Le scénario E2E de panne dashboard vérifie maintenant explicitement que le message 503 est exposé dans un élément `role="alert"` avant l'action Retry. La preuve couvre donc à la fois le rendu visuel de l'erreur et son annonce sémantique dans le navigateur réel.

La portée Axe a été vérifiée dans le code E2E, et non déduite du seul nom du test : l'analyse s'exécute sur le dashboard faculty, le dashboard étudiant et la mission active, avec `violations=[]` pour chaque écran. Cela reste une preuve automatisée ; la revue indépendante lecteur d'écran, contraste sur appareils réels et performance spécialisée reste ouverte.

## Renforcement UX — état de chargement dashboard — 2026-10-06

Le dashboard affiche maintenant un état de chargement explicite et annoncé (`role="status"`, `aria-live="polite"`) tant que les données serveur ne sont pas disponibles. Les assertions E2E réseau lent et Retry ciblent le contrôle accessible réel **Lab map** plutôt qu'un libellé inexistant ; après correction, Chromium complet est **18/18 PASS en 17,1 s**. Cela ferme la vérification locale du rendu de chargement sans prétendre fermer la revue UX humaine.

## Renforcement G7 — chargement des visuels — 2026-10-06

Le hero illustratif au-dessus de la ligne de flottaison porte maintenant `fetchPriority="high"` et `decoding="async"`; l'image illustrative du moteur image porte `loading="lazy"` et `decoding="async"`. Aucun asset n'est présenté comme clinique ou diagnostique. Après cette optimisation non fonctionnelle : tests frontend **14/14 PASS**, build **PASS**, Chromium **18/18 PASS en 16,9 s**. Le poids binaire des images et la direction artistique finale restent à revoir par le spécialiste UX/performance.

## Renforcement G7 — budget de bundle — 2026-10-06

Le script `web/scripts/check-build-budget.mjs` est maintenant exécuté automatiquement en `postbuild`. Il bloque une régression au-delà de **400 000 octets JS** ou **120 000 octets CSS** dans `dist/assets`. La passe actuelle mesure **271 429 octets JS** et **29 114 octets CSS**, donc **PASS**. Ce budget porte sur le code compilé ; les images illustratives restent explicitement dans le périmètre de la revue UX/performance humaine.

Le manifeste local `.ci-artifacts/local-2026-10-06/validation-manifest.json` a été enrichi avec ces mesures de bundle et la portée Axe (`student-dashboard`, `mission`, `faculty`, 0 violation), ainsi que les assertions `role="alert"` et `role="status"`. Il reste marqué explicitement local, sans CI distante ni signature indépendante.

Une inspection visuelle Chromium desktop a aussi été capturée dans `.ci-artifacts/local-2026-10-06/dashboard-desktop.png` (1280×720). Elle confirme localement la hiérarchie hero, le visuel de laboratoire, la navigation, les cartes de statistiques et l'état invité ; cette capture n'est pas une approbation UX humaine et ne remplace pas la revue appareil réel demandée par G7.

Contrôle d'autorité externe rejoué : `git rev-parse --is-inside-work-tree` confirme que ce miroir n'est pas un worktree Git et aucun remote n'est disponible. Le workflow CI est présent, mais aucun identifiant de run distant ni archive distante ne peut être résolu depuis cet environnement. G0/G8 restent donc explicitement `ESCALATE` pour absence de preuve externe, et non pour un échec des tests locaux.

## Renforcement G7 — erreurs de préférences invitées — 2026-10-06

L'écran Learning settings n'ignore plus les erreurs de lecture ou d'enregistrement de profil. Les erreurs API sont affichées avec `role="alert"`; une mise à jour optimiste est restaurée si le `PUT /profile` échoue, et la confirmation de sauvegarde est exposée comme `role="status"`. Après cette correction : tests frontend **14/14 PASS**, build avec budget **PASS**, Chromium **18/18 PASS en 16,8 s**.

Le scénario Chromium dédié **profile preference failure is announced and rolled back** force un `503` sur `PUT /profile`, vérifie l'alerte accessible et confirme que la case revient à son état serveur initial. La suite est passée à **19/19 PASS en 17,3 s**.

## Boucle adversariale E2E + backend — 2026-10-07 / 2026-10-08

Méthode : équipe principale (corrections) et superviseurs adversariaux (agents IA de la même équipe, indépendants seulement au sens « sans accès aux conclusions des autres » ; lecture seule, pile réelle isolée par agent : API + SQLite + Vite + Chromium, captures PNG relues une à une, ports distincts). Chaque round réexécute tout depuis le début ; un défaut P0/P1 confirmé est corrigé à la racine, couvert par un test, puis le round suivant revérifie et attaque à nouveau. Aucune validation par « un autre test le couvre ».

| Round | P0 | P1 | P2 | P3 | Suite |
|---|---:|---:|---:|---:|---|
| 1 (contrat/Faculty, backend, visuel) | 0 | 1+4+1 | 10+7+6 | 7+6+9 | corrigés ou documentés (voir ci-dessous) |
| 2 (backend, visuel) | 0 | 1 | 7+6 | 7+11 | corrigés |
| 3 (backend, visuel) | 0 | 0+1 | 3+7 | 10+7 | le P1 visuel était une régression introduite par un correctif du round 2 |
| 4 (backend, visuel) | 0 | 0+2 | 2+5 | 6+4 | les 2 P1 visuels étaient des régressions CSS de correctifs précédents |
| 5 (visuel) | 0 | 3 | 1 | 5 | nouvelles familles : noms très longs, moteur d'ordre à 300–320 px |
| 6 (visuel) | 0 | 1 | 7 | 7 | nom de classe d'un seul mot très long |
| 7 (visuel) | 0 | 2 | 7 | 6 | dont 1 régression (en-tête fixe masquant le focus) |
| 8 (visuel + robustesse) | 0 | 4 | 4 | 5 | dont 1 régression (classement) ; boucle de recréation de session détectée et bornée |
| Revue de code profonde (max) | — | 15 findings vérifiés | | | 14 corrigés avec test (ReDoS e-mail, verrouillage login concurrent, purge du limiteur, Content-Type, DB_PATH vide, garde anti-fuite IA, stockage bloqué…), 1 documenté (série en UTC) |

Convergence : le **backend** a tenu deux rounds consécutifs sans P0/P1 (rounds 3 et 4) avant la revue de code ; la revue a ensuite trouvé des défauts de sécurité/robustesse qu'aucun round dynamique n'avait vus, tous corrigés. Le **visuel** n'a pas convergé : chaque round trouve encore au moins un P1, de gravité décroissante (entrées extrêmes, régressions de correctifs CSS). Ce n'est donc pas « sans faute » démontré.

Corrections majeures (toutes avec test de non-régression) :

- **Backend** : relecture de l'état sous verrou d'écriture pour `answer`, `startMission`, `unlockLab`, `setContentStatus` (plus de double application ni d'étape sautée, plus de 500 sur démarrage concurrent) ; cycle de contenu strict `draft → reviewed → approved → draft` (409 `illegal_transition`) ; ledger de score cohérent avec le score quand les pénalités dépassent les points (pénalités plafonnées, ligne marquée « capped », HUD plafonné au score maximal de la mission, règle publiée dans `/rules`) ; JSON profondément imbriqué sans 500 ; `POST /demo/reset` restaure nom, programme, niveau et classes ; validation de chaînes (caractères de contrôle et NUL refusés, texte invisible refusé, longueur en caractères) ; noms de classe valides ; recherche du roster insensible aux accents ; OpenAPI déclare 400/401/403/404/405/409/413/415/422/429 par route ; en-tête `Allow` sur 405.
- **Contrat frontend** : plus aucune copie inventée (raison de verrouillage, raison d'attention Faculty) ; réponses fausses sans pénalité, pourcentages hors 0..100, `completed > total`, slots de vault incohérents et `needsAttention > students` deviennent des erreurs explicites ; `useLoad` ne montre plus les données d'une dépendance précédente pour la nouvelle (cause d'un 404 Faculty au changement de classe) ; scripts `check-api-contract` et `check-client-boundaries` durcis, 8 sondes dédiées.
- **UX/accessibilité** : section « How LabEscape works » et mention « données de démonstration » ; feedback étiqueté « Step N correct. » ; tentative réinitialisée = message clair + Restart ; focus restauré après chaque action (soumission, indice, unlock, sortie de mission, résultat, bascule d'invité, revue de contenu) ; lien d'évitement ; landmarks uniques sur Lab results ; panneaux d'erreur avec `h1` ; hero sans débordement ni mot coupé (image sous le texte quand les deux ne tiennent pas) ; cartes de laboratoire à largeur minimale ; étape d'appariement sans défilement horizontal dès 320 px ; fond continu sans bande.

Limites ouvertes (voir `KNOWN_LIMITATIONS.md`) : **tous les invités partagent le même utilisateur serveur « Alex Martin »** (décision produit requise avant toute démo publique concurrente), classement `cohort=all`, statut de contenu global, absence de routage par URL, content/clinique non validés.

Verdict : **MVP invité local PASS ; release ESCALATE** — aucune exécution CI distante ni signature indépendante n'existe dans ce workspace (pas de remote Git). Une boucle d'agents du même éditeur, un test Playwright vert ou une capture ne constituent pas une signature indépendante.

