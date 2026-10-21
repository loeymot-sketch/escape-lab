# Escape Lab — rapport de la passe « premium » du 14 octobre 2026

Branche : `feat/premium-polish-2026-10-14` (commits `5d48790` → `6fe7a82` et suivants, après le point de contrôle `09fd61e` du travail hérité de la session précédente).
Spécification : `docs/superpowers/specs/2026-10-14-escape-lab-premium-polish-design.md`. Plan exécuté : `docs/superpowers/plans/2026-10-14-escape-lab-premium-polish.md`.
Environnement de preuve : macOS, Node v22.23.2, Playwright 1.52 (Chromium, iPhone 13 émulé, bundle de production, **WebKit** bureau et iPhone). Validation **locale uniquement**, par des agents IA ; aucune revue humaine indépendante.

## 1. Ce qui a été fait

### 1.0 Correctif de robustesse réseau — 15 octobre 2026

Le limiteur d'inscription, de connexion et de session démo ne dépend plus d'une simple représentation textuelle de l'adresse socket : les IPv4-mappées sont repliées sur leur IPv4 et les IPv6 natives partagent un budget par préfixe `/64`. Des variantes textuelles d'une même adresse sont couvertes par un test backend dédié. Le fonctionnement reste volontairement en mémoire et par processus ; un déploiement multi-instance devra utiliser un limiteur partagé.

Les réponses de mission anormalement volumineuses ne sont plus persistées telles quelles dans `answer_log` : elles sont remplacées par un digest SHA-256 compact, tandis que les réponses normales restent lisibles pour la revue. Cette protection est testée avec un payload hostile de 50 Ko.

La configuration accepte maintenant explicitement `RATE_* = 0` comme désactivation du seul plafond configurable concerné, sans supprimer la protection fixe de huit échecs par compte lors des connexions ; une valeur vide conserve le défaut sûr. Ce comportement est couvert par un test API.

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
- **Lecteur d'écran réel** : non testé ; Blood Smear Code dispose maintenant d'une description neutre et d'un contrôle de repérage utilisable au clavier, mais la validation avec un lecteur d'écran réel reste humaine.

## 5. Points mineurs laissés tels quels

- Le compteur visuel peut toujours s'animer, mais un lecteur d'écran reçoit désormais directement la valeur finale serveur via une annonce stable ; il ne lit pas chaque frame intermédiaire.
- Sur la liste d'observations, `aria-pressed` représente maintenant la sélection réelle et `aria-current="step"` représente la cible active ; les deux états sont séparés.
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

## Addendum de stabilisation UI — 15 octobre 2026

- Le résumé de la version texte des images possède maintenant un indicateur d’ouverture/fermeture visible, compatible clavier et contrasté dans le thème néon ; le tableau conserve un vrai `caption` sémantique lors d’une copie ou d’une lecture assistée.
- Les résultats de compétences n’affichent plus un domaine arbitraire lorsqu’il existe une égalité : toutes les compétences au meilleur pourcentage sont listées sous « Strongest areas ».
- Une réponse envoyée depuis un onglet devenu obsolète affiche maintenant une alerte explicite de synchronisation (« Enquête mise à jour ») et conserve l'étape relue depuis le serveur, au lieu d'un échec générique.
- L'adresse API de développement suit maintenant le nom d'hôte de l'interface ouverte (`localhost` ou `127.0.0.1`) ; cela élimine l'échec local dû à une résolution loopback différente.
- Le moteur de pointage annonce désormais dans une région `aria-live` unique la position du marqueur après déplacement au clavier ; en mode multi-zone, l'observation active et le nombre de zones sélectionnées sont également annoncés.
- Les anciens points B39-001/B39-002 (répétition par Enter dans le coffre et sur Submit), B39-005 (égalité des compétences) et B39-006 (course entre onglets) sont désormais couverts par les gardes de soumission, l'affichage ex æquo et le scénario E2E de synchronisation ; ils ne sont plus des défauts reproductibles du code actuel. C39-002 est également exposé dans la page À propos via la ligne de validation lecteur d'écran.
- Régression ciblée : composant de rendu `25/25` ; suite frontend complète `398/398` ; build production et budgets conformes.
- E2E ciblés (accessibilité, moteurs et interactions de pointage) : `39/39`.
- Preuve E2E ciblée de la concurrence : scénario stale-tab vert.
- Preuve E2E finale après correction : `594/594` en `9,2 min`, Chromium desktop/mobile, bundle de production, WebKit desktop et WebKit iPhone.
- Vérification de diff (`git diff --check`) : PASS.
- Dette CSS ciblée réduite : suppression de la règle orpheline `.result-seal` dans `completion-styles.css` et `visual-refresh.css` ; aucune occurrence produit restante et aucune règle métier ou visuelle utilisée n'a été supprimée.
- Après ce nettoyage : frontend `398/398`, build et budgets conformes, E2E résultats/trophées `24/24` sur 320/390/768/1280 px et états chargement/erreur/réduction de mouvement/expiration.
- Régression intégrale après nettoyage : E2E `594/594` en `9,2 min`, sans échec, avec Chromium desktop/mobile, bundle de production, WebKit desktop et WebKit iPhone.

## Correctif final de robustesse des annonces — 15 octobre 2026

- La mission conserve désormais une seule région `aria-live` persistante pour annoncer les réponses correctes, les fragments gagnés et les indices. Elle conserve les clés anglaises traduisibles plutôt que le texte déjà rendu : un changement FR/EN ne laisse donc pas une annonce anglaise dans une interface française.
- Les sélecteurs E2E des moteurs ont été resserrés pour distinguer l'annonce invisible du retour visuel de correction, sans supprimer ni dégrader les deux informations utiles.
- Tests frontend après ce correctif : `398/398`.
- E2E ciblés moteurs + parcours français : `23/23`.
- Régression E2E intégrale finale : `596/596` en `9,3 min`, sans échec, Chromium desktop/mobile, bundle de production, WebKit desktop et WebKit iPhone.
- Build de production : JS entrée `416 499 / 440 000 o`, JS différé `119 130 / 160 000 o`, CSS `134 003 / 140 000 o`, 34 rasters sous la limite de `300 000 o`.
- `git diff --check` : PASS. Aucun backend, frozen zone, migration ou secret n'a été modifié dans cette passe.
- La vue d'impression de l'À-propos masque désormais navigation, en-tête, menu mobile et contrôles de session pour produire un document présentable ; un test E2E sous média `print` verrouille ce comportement (B35-013).
- E2E ciblé du guide et de l'impression : `33/33`.
- Le lobby donne maintenant la priorité à l'état réel `inProgress` : une mission rejouée affiche « En cours » avec « Reprendre », sans contradiction avec « Terminée » (B35-012) ; le scénario E2E dédié passe.
- Le parcours visuel applique aussi cet état : la pastille et le `data-state` de la mission reprise redeviennent actifs, sans marqueur de mission terminée ; le test de composant dédié passe.
- Vérification la plus récente après ce correctif : frontend `399/399`, backend `279/279` et typecheck, build avec JS entrée `416 619 / 440 000 o`, lazy `119 130 / 160 000 o`, CSS `134 003 / 140 000 o`, E2E intégral `596/596` en `9,2 min`, `git diff --check` PASS.

## Correctif final de synchronisation du coffre — 15 octobre 2026

- La vue Progression relit maintenant le coffre et les laboratoires au retour de focus ou de visibilité, comme la vue Mission ; focus et `visibilitychange` sont regroupés dans une seule requête et le premier retour n'est pas bloqué par le throttling.
- Régression E2E : après une modification puis un `POST /demo/reset` externe, le coffre ouvert passe bien de `ESCAPED` à `NOT STARTED` sans rechargement manuel.
- Suite frontend : `399/399` ; E2E ciblé du coffre : vert ; E2E intégral : `597/597` en `9,5 min`, Chromium desktop/mobile, bundle de production, WebKit desktop et WebKit iPhone.
- Build production et budgets : JS entrée `417 337 / 440 000 o`, JS différé `119 130 / 160 000 o`, CSS `134 003 / 140 000 o`, 34 rasters sous `300 000 o` ; `git diff --check` : PASS.

## Correctif de continuité du parcours enseignant — 15 octobre 2026

- La classe choisie dans « Class intelligence » est maintenant conservée dans l’état de navigation de la session et réutilisée dans « Student detail » ; les deux vues ne peuvent plus basculer silencieusement vers la première classe.
- Le choix est réinitialisé lors d’un changement de guest, afin qu’une cohorte ne puisse pas fuiter vers une autre session ou un autre rôle.
- Régression E2E : la classe vide sélectionnée dans Faculty reste sélectionnée après navigation vers Student detail, avec ses états vides réels.
- Suite frontend `399/399` et test E2E ciblé vert ; la régression intégrale multi-navigateurs doit être rejouée avant de considérer cette passe comme finale.

## Correctif de cohérence du moteur d'ordre — 15 octobre 2026

- La poignée de glissement décorative a été supprimée : le moteur n'offrait pas de drag-and-drop, seulement des boutons Monter/Descendre.
- Une consigne visible et traduite indique maintenant explicitement l'utilisation des flèches ; les annonces clavier et les boutons restent inchangés.
- Frontend : `399/399`. E2E ciblé du moteur d'ordre : `1/1`. Build production et budgets : PASS (`416 932 / 440 000` JS entrée, `119 276 / 160 000` lazy, `131 087 / 140 000` CSS).
- La première régression a exposé une feuille CSS accidentellement amputée lors de l'ajout de la règle ; elle supprimait les règles de positionnement des marqueurs et du moteur. La feuille complète a été restaurée, puis vérifiée par les tests de géométrie et les snapshots existants.
- Régression intégrale finale après réparation : `597/597` en `9,2 min`, Chromium desktop/mobile, bundle de production, WebKit desktop et WebKit iPhone. Aucun snapshot n'a été régénéré automatiquement.

## Correctif complémentaire d'accessibilité et de transparence — 15 octobre 2026

- La page À propos expose maintenant explicitement la limite S-1 : Blood Smear Code ne possède pas encore de parcours d'évaluation non visuel rédigé par un expert ; cette information reste présentée comme une limite ouverte et non comme une validation d'accessibilité.
- Les réponses incorrectes répétées sont annoncées à chaque soumission dans la région `aria-live` persistante de la mission, en plus du retour visuel `role="alert"`. Le texte reste fourni par le serveur et traduit au rendu ; aucune réponse correcte ni coordonnée n'est exposée.
- Preuves ciblées : E2E accessibilité `2/2`, E2E guide `2/2`, suite frontend `399/399`.

## Vérification E2E maximale et durcissement temporel — 15 octobre 2026

- Les horloges de tentative sont maintenant monotones par tentative : un recul de l'horloge système ne peut plus créer une durée négative, prolonger artificiellement une mission ou accorder un bonus de temps non fiable. En cas de recul détecté, le bonus de temps est neutralisé.
- Les fenêtres du limiteur de débit et du verrouillage du coffre résistent également aux reculs de l'horloge murale ; le délai `Retry-After` reste non négatif.
- Les requêtes de compétences et d'analytics utilisent désormais `json_each` plutôt que de générer une nouvelle forme SQL pour chaque taille de cohorte ; cela évite la croissance du cache de statements SQLite.
- La lecture des badges n'ouvre plus de transaction `BEGIN IMMEDIATE` : les écrans de progression restent en lecture seule et les attributions sont effectuées dans les parcours d'écriture concernés.
- Tests backend : `285/285` ; typecheck backend : PASS ; tests frontend : `399/399`.
- E2E ciblés horloge, coffre et mission : `48/48` ; E2E intégral multi-navigateurs et bundle de production : `599/599` en `9,4 min`.
- Build production et budgets : PASS ; JS entrée `417 224 / 440 000`, lazy JS `119 558 / 160 000`, CSS `134 085 / 140 000`, 34 rasters sous `300 000` octets.
- `git diff --check` : PASS. Aucun déploiement, push, changement de migration ou validation scientifique n'a été simulé.
- Restent volontairement ouverts : validation scientifique/accessibilité S-1, isolation réelle des invités concurrents, limites de capacité publique, pagination leaderboard et décisions pédagogiques de contenu.
- Optimisation complémentaire : le leaderboard ne charge plus les noms de toute la table `users` ; sa requête est bornée aux identifiants de la cohorte sélectionnée via `json_each(?)`. La régression backend dédiée et la suite E2E intégrale restent vertes.
- Le contrôle de concurrence d'authentification borne désormais à 32 les vérifications de mot de passe simultanées par adresse normalisée, sans limiter les connexions réussies séquentielles ; les excès reçoivent un `429` avec `Retry-After`.
- Régression backend : `287/287` ; typecheck : PASS ; E2E ciblés après ce changement : `106/106` en `1,7 min`, avec Chromium, iPhone 13, bundle de production et WebKit bureau/mobile.
- Durcissement HTTP complémentaire : timeouts de requête et d'en-têtes bornés à `30 s` / `15 s`, avec `512` connexions simultanées maximum au niveau du processus ; la nécessité d'un reverse proxy public reste explicitement documentée.
- Le leaderboard ne lance plus la requête `exits()` inutile pour chaque étudiant ; son coût par étudiant baisse d’une requête sans modifier le contrat de réponse. Le coût restant est toujours documenté comme dette d’agrégation à grande échelle.
- Analytics enseignant réutilise désormais les meilleurs essais déjà chargés pour construire les résumés par laboratoire ; les requêtes `mission_best` redondantes par laboratoire ont été supprimées sans changer les résultats.
- Le roster analytics réutilise lui aussi ces mêmes lignes préchargées ; la seconde lecture `mission_best` par étudiant a été supprimée, sans changement des indicateurs affichés.
- Vérification de cohérence documentaire : le correctif existant de `playAlex()` préserve les appartenances de classe externes lors du reset élève ; le point historique C38-005 est maintenant marqué résolu, avec son test de régression associé.
- Analytics compare maintenant les pourcentages exacts non arrondis pour désigner la mission la plus difficile et appliquer le seuil d’attention ; l’arrondi reste uniquement une valeur de présentation. Le point C38-007 est ainsi corrigé sans changer le contrat d’affichage.
- Le leaderboard est maintenant protégé par une limite de lecture par étudiant (`RATE_LEADERBOARD_PER_MINUTE`, 60/minute par défaut) afin qu’une cohorte importante ne puisse pas monopoliser le processus SQLite ; la limite est désactivable explicitement à `0`.
- Le calcul du streak agrège désormais les jours distincts dans SQLite et ne charge plus chaque ligne `answer_log` en mémoire. Le résultat conserve la règle existante : aujourd’hui ou, à défaut, hier démarre la série.
- Les pourcentages moyens utilisent maintenant un arrondi tolérant uniquement au bruit IEEE-754 autour des demi-valeurs ; une valeur réellement inférieure à la demi-valeur conserve son arrondi normal.
- Analytics enseignant charge maintenant les meilleurs essais, les XP reportés et la dernière activité par cohorte, puis réutilise ces données pour le roster et les résumés par laboratoire ; les lectures `mission_best` et d’état par étudiant ont été regroupées sans modifier le contrat de réponse.
- Le roster enseignant réutilise maintenant exactement le même préchargement groupé que l’analytics. Le fallback individuel ne se déclenche plus pour les valeurs valides `0` ou `null`, ce qui évite une régression silencieuse sur les classes sans activité.
- Le classement charge maintenant noms, meilleurs essais et XP par cohortes au lieu de relire ces données étudiant par étudiant ; les règles de classement, de semaine, d’égalité, de confidentialité et de ligne personnelle restent inchangées.
- Vérification finale après ces optimisations : backend `290/290`, typecheck PASS, régression faculty/analytics/roster `12/12`, régression leaderboard `22/22`, E2E intégral frais `599/599` en `9,4 min`, `git diff --check` PASS.

## Correctif de vérité du suivi enseignant — 15 octobre 2026

- L’historique des tentatives enseignant affichait le score de mission avec le suffixe `XP`, alors qu’un rejeu peut avoir un score positif mais rapporter `0 XP` s’il ne bat pas le meilleur score. L’étiquette est maintenant `Mission score` / `Score de la mission`, sans changer la donnée serveur ni le calcul d’XP.
- Une régression E2E vérifie que le libellé corrigé est visible et qu’aucune valeur d’historique ne prétend être de l’XP.
- Contrôles après correction : frontend `399/399`, build et budget conformes, scénario enseignant ciblé `1/1`, E2E intégral `599/599` en `9,5 min`, `git diff --check` PASS.
- Aucun backend, modèle, migration, secret, score ou déploiement n’a été modifié dans cette correction.

## Correctif d'impression des missions — 15 octobre 2026

- La vue d'impression d'une mission pouvait conserver une partie du chrome interactif et rendre une réponse sélectionnée trop proche du fond clair.
- `refine.css` fournit maintenant une sortie papier dédiée : la question, le contexte, les valeurs, la scène scientifique et la réponse restent imprimables ; l'en-tête animé, le hero, le suivi interactif, l'assistant, le rail d'état et les actions sont retirés.
- Une réponse sélectionnée reçoit une palette claire, un texte sombre, un fond sans dégradé et un contour explicite pour rester identifiable sur papier.
- Le scénario E2E `mission print view` vérifie le média `print`, l'absence d'overflow horizontal, la présence du dossier et la lisibilité de la réponse sélectionnée : `1/1` sous Chromium.
