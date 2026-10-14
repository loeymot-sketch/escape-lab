# Escape Lab — rapport de la passe « premium » du 14 octobre 2026

Branche : `feat/premium-polish-2026-10-14` (commits `5d48790` → `6fe7a82` et suivants, après le point de contrôle `09fd61e` du travail hérité de la session précédente).
Spécification : `docs/superpowers/specs/2026-10-14-escape-lab-premium-polish-design.md`. Plan exécuté : `docs/superpowers/plans/2026-10-14-escape-lab-premium-polish.md`.
Environnement de preuve : macOS, Node v22.23.2, Playwright 1.52 (Chromium, iPhone 13 émulé, bundle de production, **WebKit** bureau et iPhone). Validation **locale uniquement**, par des agents IA ; aucune revue humaine indépendante.

## 1. Ce qui a été fait

### 1.1 Audit visuel complet

106 captures (bureau 1440 px et téléphone 390 px, anglais et français) de chaque écran : porte d'entrée, tableau de bord, carte et salles, les cinq moteurs de mission, mauvaise réponse, correction, indice, étape multi-zones et sa version texte, expiration, résultat standard et Master, coffre (avant et après déverrouillage), badges, classement, résultats, paramètres, À propos, et les trois écrans enseignant.

| # | Écran | Défaut constaté | État |
|---|---|---|---|
| D1 | Mission (bureau) | Le robot de l'assistant recouvrait les titres « Observe before you decide » / « Take a moment to understand. » | Corrigé (`.assistant-card`, `assistant-art.spec.ts`) |
| D2 | Mission (téléphone) | Le même robot masquait la valeur « Wrong answers » de la carte État du dossier | Corrigé (même spec, vérification `elementFromPoint`) |
| D3 | Étape multi-zones | Liste d'observations brute (« Hemolysis indexPending ») | Corrigé : lignes numérotées, cochées, cible active surlignée |
| D4 | Coffre | Bande vide d'environ 250 px sous l'illustration | Corrigé : scène recadrée, titre superposé, géométrie mesurée dans `vault-art.spec.ts` |
| D5 | Résultats des laboratoires | Lignes de mission, compétences et conseils illisibles | Corrigé, contraste mesuré ≥ 4,5:1 (`readability.spec.ts`) |
| D6 | Enseignant (3 écrans) | Noms de missions, effectif, détail étudiant, note « données de démonstration » illisibles | Corrigé, mesuré |
| D7 | À propos | Titre, sous-titres, introductions et points qualité illisibles | Corrigé, mesuré ; les cartes claires gardent leur palette |
| D8 | Paramètres | Libellé « Reduce motion » illisible, case non thématisée | Corrigé |
| D9 | Coffre | Champ de code blanc hors thème | Corrigé, mesuré |
| D10 | Mission expirée | Bouton Valider désactivé encore affiché | **Conservé volontairement** : dix tests E2E existants encodent ce comportement |

Cause commune de D5 à D9 : la palette claire de `visual-refresh.css` / `refine.css` / `polish.css` / `about.css` (`#29484e`, `#41595e`, `#173344`, `#52696c`) n'avait jamais été surchargée par les thèmes sombres `neon-theme.css` et `game-world.css` sur ces écrans. La réparation ajoute des surcharges ciblées en fin de `game-world.css` ; aucun CSS mort n'a été supprimé (point de la spécification non réalisé, la dette de superposition des cinq feuilles reste à traiter).

### 1.2 Gamification, uniquement à partir des données du serveur

| # | Où | Quoi | Donnée serveur | Preuve |
|---|---|---|---|---|
| E1 | Tableau de bord | Bandeau de niveau : niveau, XP total, XP restants avant le niveau suivant, barre animée | `dashboard.user.levelProgress {into,size}` (le client l'ignorait) | `student.test.ts`, `dashboard-level.spec.ts` (compare aux valeurs de `GET /dashboard`, FR et EN) |
| E2 | Résultat | Compteur de score qui monte jusqu'au chiffre serveur, barre qui se remplit, pastille « +XP » seulement si des XP ont été ajoutés, badges et fragments qui apparaissent | `MissionResult` inchangé | `motion.test.ts`, `result-celebration.spec.ts`, `authority.spec.ts` renforcé |
| E3 | Résultat | Statistique « Étapes sans faute » (`firstTrySteps / steps`) | `result.stats` | mêmes specs |
| E4 | Badges | Date d'obtention (horodatage serveur), cadenas sur les badges verrouillés | `badge.earnedAt` | `progress.test.tsx` |
| E5 | Classement | Podium or / argent / bronze | rangs serveur | captures `game-navigation` |
| E6 | Coffre | État « READY » lumineux, message de succès thématisé | existant | `vault-art.spec.ts` |
| E7 | Multi-zones | Liste d'observations lisible | existant | `render.test.ts`, `point-text.spec.ts` |
| E8 | Mission | Chronomètre ambre sous 60 s, rouge pulsé sous 20 s (pulsation coupée en mouvement réduit) | `remainingSec` | `common.test.ts`, `timer-tone.spec.ts` |

Toutes les animations s'arrêtent sous `prefers-reduced-motion` et sous la préférence serveur `data-reduce-motion`, y compris lorsque celle-ci arrive après l'affichage du résultat (observateur de mutation dans `useCountUp`).

### 1.3 Outillage de test

- `E2E_API_PORT` / `E2E_WEB_PORT` : la suite Playwright se déplace entière (API, serveur de développement, bundles, helpers) quand les ports 3000 / 5173 sont occupés par une autre session locale. Trois specs qui codaient ces ports en dur ont été corrigés.
- Projets WebKit `webkit-smoke` (descripteur Desktop Safari) et `webkit-iphone13` : parcours de fumée réel sur le moteur WebKit de Playwright (porte, tableau de bord, Blood Smear Code jusqu'au résultat, moteur d'ordre, coffre, badges, français, écrans enseignant). **Moteur, pas appareil physique.**
- Nouveaux specs : `readability`, `assistant-art`, `dashboard-level`, `result-celebration`, `timer-tone`, `webkit`.
- Budgets de build relevés une fois (JS 400 000 → 440 000 o, CSS 120 000 → 140 000 o) avec la mesure gzip inscrite dans `web/scripts/check-build-budget.mjs`.

### 1.4 Documentation

README (statut), `docs/KNOWN_LIMITATIONS.md` (WebKit, version française), `docs/FACULTY_DEMO_SCRIPT.md` (question 7 : la version française existe, non relue), `plans/PLAN_ESCAPE_LAB_GAMIFICATION_ADVANCED_2026-10-13.md` (section du 14 octobre).

## 2. Preuves (toutes locales, Node v22.23.2)

| Contrôle | Résultat |
|---|---|
| Tests backend (`be`, node:test) | **276 / 276** |
| Tests frontend (Vitest, 26 fichiers, contrat API, frontières client, TypeScript, couverture FR) | **373 / 373** |
| Build de production `VITE_API_URL=/api` | JS entrée **402 137 / 440 000 o** (121 Ko gzip), JS différé 114 879 / 160 000 o, CSS **126 336 / 140 000 o** (28 Ko gzip), 34 rasters ≤ 300 000 o |
| Playwright, suite intégrale (`CI=true`, ports 3200 / 5280) | **582 / 582 en 9,5 min** : Chromium 546, iPhone 13 émulé 23, bundle de production 3, WebKit bureau 5, WebKit iPhone 5 |
| `npm audit --audit-level=high` | 0 vulnérabilité (API et web) |
| Captures « après » | 106 captures rejouées ; D1 à D9 et E1 à E8 vérifiés à l'œil sur bureau et téléphone |
| Revue finale indépendante (agent IA, contexte neuf) | 1 critique (voir §3), 1 important, 7 mineurs ; les correctifs retenus ont chacun un test rouge puis vert |

La première passe intégrale donnait 557 / 582 : deux vraies régressions de contraste sur À propos (textes recolorés dans des cartes claires, corrigées) et vingt-trois échecs dus aux ports codés en dur ou à une attente de chargement trop courte dans un spec ; la seconde passe intégrale est propre.

## 3. Point critique à décider par le propriétaire

Le commit `5e35be3` (« upp », fait depuis le poste du propriétaire pendant la session) a ajouté **environ 946 Mo** de rapports et captures Playwright (`.ci-artifacts/`, 802 PNG) à la branche, qui a ensuite été poussée vers GitHub. Le commit `6fe7a82` cesse de suivre ce dossier (les fichiers restent sur le disque, `.gitignore` les exclut désormais), mais l'historique de la branche contient toujours ces blobs. Avant toute fusion dans `main`, il faut choisir : réécrire l'historique de la branche (par exemple `git rebase -i` en retirant `.ci-artifacts` de `5e35be3`, puis `git push --force-with-lease`), ou accepter le poids. Cette décision n'a pas été prise à votre place.

## 4. Ce qui reste strictement humain

- **Validation scientifique** des zones, réponses, explications, indices et valeurs : aucune n'a été ajoutée ni modifiée par cette passe. Le pilote multi-zones `bio-02-s1` (indice d'hémolyse puis potassium) vient de la session précédente et n'est pas validé par un expert, comme l'indique `docs/ESCAPE_LAB_CONTENT_VALIDATION_MATRIX_2026-10-14.md`.
- **Provenance et licences** des images : toutes restent étiquetées « illustratives » à l'écran.
- **Relecture native** du français : traduction préparée automatiquement ; l'anglais reste la référence.
- **Safari sur appareil physique** : le moteur WebKit est couvert, pas un iPhone réel.
- **Lecteur d'écran réel** : non testé ; Blood Smear Code n'a toujours pas d'alternative non visuelle.

## 5. Points mineurs laissés tels quels

- Pendant la première seconde du compteur de score, un lecteur d'écran peut lire une valeur intermédiaire ; la barre de score porte la valeur serveur (`aria-valuenow`).
- Sur la liste d'observations, `aria-pressed` signifie « cible active » alors que le mot visible dit « Sélectionnée / En attente » (sémantique héritée).
- Les cinq feuilles de style superposées ne sont pas fusionnées ; les budgets ont été relevés plutôt que la dette réduite.

---

# Passe 2 — la boucle pédagogique visible (15 octobre 2026)

Point de départ : le rapport d'audit remis par le propriétaire le 15 octobre (« Rapport d'audit — Escape Lab »). Lecture de superviseur : ses sections UI/UX, progression et écran de résultat relèvent de la démonstration (phase 1) et sont réalisables sans inventer de contenu biomédical ; le studio enseignant, les comptes et la production (phases 2 et 3) sont des semaines de travail sensibles en sécurité et ne sont pas un polish UI/UX. Spécification : `docs/superpowers/specs/2026-10-15-escape-lab-pedagogical-loop-design.md` ; plan : `docs/superpowers/plans/2026-10-15-escape-lab-pedagogical-loop.md`.

## 1. Ce qui a été ajouté (données serveur uniquement, aucun contenu biomédical nouveau)

| Où | Quoi | Donnée serveur (nouvelle ou existante) | Preuve |
|---|---|---|---|
| Mission | **Journal d'enquête** : une ligne par étape (compétence entraînée, prouvée / en cours / à venir, erreurs et indices) | `attempt.journal` et `step.competency` (nouveaux, sans aucune question ni clé) | `pedagogy.test.ts` (API), `render.test.ts`, `pedagogy.spec.ts` |
| Résultat | **Progression personnelle** : meilleur précédent → maintenant, écart | `result.previousBest` (nouveau, figé avec le résultat) | idem |
| Résultat | **Compétences** démontrées (barres, point fort, axe de travail) | `result.competencies / strongest / improvement` (existaient, le client les ignorait) | idem |
| Résultat | **Débriefing par étape** : question, compétence, erreurs, indices, explication | `result.steps` (nouveau, explications gagnées à la fin) | idem |
| Résultat | **Sortie prête** : ouvre la porte avec les fragments gagnés, sans retaper le code | route `/labs/:slug/unlock` existante, chiffres de `result.fragments` | `pedagogy.spec.ts` (sortie serveur `exited: true`, refus 429 affiché tel quel) |
| Résultat et tableau de bord | **Mission recommandée** avec sa raison et un bouton Commencer | `recommended` (règle unique partagée serveur) | `pedagogy.test.ts`, `pedagogy.spec.ts` |
| Salle de laboratoire | **Parcours** missions → fragments → sortie, et pastilles **Maîtrisée / À revoir** | `mission.mastery` (nouveau : ≥ 80 % maîtrisée, < 50 % à revoir, seuils publiés dans `/api/rules`) | idem |
| Mission | Lueur persistante réservée aux actions et aux récompenses | — | captures |
| Réponse finale | La réponse finale embarque le même résultat complet que `GET /attempts/:id/result` : un seul écran, une seule source | — | `pedagogy.test.ts`, `authority.spec.ts` |

Points du rapport **écartés avec raison** : remplacer le coffre à code par un déverrouillage automatique (identité « escape », script de démo et douze fichiers E2E ; la sortie ouverte depuis le résultat supprime la ressaisie sans changer la règle serveur) ; nouvelles zones, calques et comparaisons d'images (contenu biomédical à valider) ; studio enseignant, comptes, production, exports, notifications (phases 2 et 3).

## 2. Preuves (locales, Node v22.23.2)

| Contrôle | Résultat |
|---|---|
| Tests backend (dont `pedagogy.test.ts`) | **279 / 279**, typecheck propre (une erreur de typage héritée corrigée dans `content.test.ts`) |
| Tests frontend (26 fichiers) | **394 / 394** |
| Build de production | JS entrée **414 414 / 440 000 o** (123 Ko gzip), JS différé 116 972 / 160 000 o, CSS **133 342 / 140 000 o** (29 Ko gzip) |
| Playwright intégral, tous projets | **590 / 590 en 9,4 min** (après la passe de relecture) : Chromium 554, iPhone 13 émulé 23, bundle de production 3, WebKit bureau 5, WebKit iPhone 5 |
| Captures après passe | tableau de bord, salle, mission (journal), résultat (débriefing, sortie), téléphone et bureau, FR et EN |

## 3. Relecture indépendante et correctifs

Un relecteur à contexte neuf a relu l'ensemble de la passe : aucun bloquant, trois points importants corrigés avec test rouge puis vert (le débriefing proposait la recommandation secondaire au lieu de la prochaine mission du parcours ; le bouton « Commencer » du débriefing échouait en silence ; la lecture du résultat complet s'exécutait dans la transaction de la réponse finale), et les mineurs retenus (pluriel français du journal, `!important`, journal d'une tentative expirée, ombre du panneau, branches E2E figées, test de rendu d'un ancien résultat).

## 4. Toujours humain

Inchangé : validation scientifique des contenus (dont le pilote multi-zones hérité), provenance et licences des images, relecture native du français, Safari sur appareil physique, lecteur d'écran réel. Les seuils de maîtrise (80 % / 50 %) sont une règle de produit à confirmer par l'équipe pédagogique ; ils sont publiés par le serveur et modifiables en un endroit (`be/src/scoring.ts`).
