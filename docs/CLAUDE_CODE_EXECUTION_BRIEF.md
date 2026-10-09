# Escape Lab — rapport d’état et goal d’exécution Claude Code

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.


Date de consolidation : 2026-10-06

## 1. Mission

Finaliser Escape Lab comme un MVP de laboratoire biomédical virtuel gamifié, immédiatement testable en mode invité, sans création de compte et sans identité fictive imposée. L’expérience doit expliquer clairement le concept LabEscape, guider l’utilisateur dans des investigations scientifiques illustratives, rendre chaque fonctionnalité réellement utilisable, et fournir une preuve technique reproductible avant toute décision de release.

Le produit doit commencer par les fonctionnalités et les parcours. Les comptes personnels, profils persistants, classement réel et personnalisation avancée sont hors du MVP initial, sauf si leur présence est strictement nécessaire à l’isolation backend ou au parcours Faculty guest.

## 2. Verdict actuel à respecter

### MVP local

**PASS fonctionnel local en mode invité démo.**

Preuves locales actuelles :

- Backend : **108/108 tests** (48 au 2026-10-06).
- Frontend : **186/186 tests** (16 fichiers).
- Contrat API : **13 opérations littérales + 12 dynamiques** avec méthode et chemin contrôlés.
- Build production : **PASS**.
- Budget bundle : **326 243 octets JS / 400 000**, **54 785 octets CSS / 120 000**.
- Playwright E2E : **232/232 PASS** (3 projets : Chromium, iPhone 13 émulé, bundle de production).
- Axe : 0 violation sur toutes les pages étudiant et Faculty et tous les états de mission balayés par les audits adversariaux à 375/768/1440 px.
- Node utilisé pour la preuve : **v22.23.2**.
- Audits npm backend/frontend : **0 vulnérabilité high/critical**.
- API locale : `status: ok`, 4 laboratoires, 10 missions.
- Frontend local : `http://127.0.0.1:5173/`.
- Archive locale : `.ci-artifacts/local-2026-10-06/`.

### Release

**ESCALATE — ne pas déclarer production-ready.**

Les preuves suivantes sont encore absentes :

1. Deux exécutions CI distantes consécutives et archivées.
2. Signature Build/CI.
3. Signature Contract/API.
4. Signature AppSec.
5. Signature state-machine backend.
6. Signature Senior frontend E2E.
7. Signature accessibilité/performance.
8. Validation pédagogique et biomédicale des missions, valeurs, corrigés, hints et images.
9. Signature Release Manager.

Le workspace courant ne contient pas de remote Git exploitable. Ne jamais transformer les preuves locales en preuve CI distante.

## 3. Produit voulu

Escape Lab doit se présenter comme un laboratoire virtuel de sciences biomédicales :

- observation d’indices et de résultats expérimentaux ;
- raisonnement par hypothèses ;
- mini-défis interactifs ;
- progression et fragments de Code Vault ;
- déverrouillage d’une sortie de laboratoire ;
- mode démo immédiat ;
- explication claire de la gamification et de la finalité pédagogique.

Le produit ne doit pas commencer par « Bonjour Alex », une fiche personnelle ou une demande de compte. Le premier écran doit être une invitation à choisir une investigation.

Toutes les images sont à présenter comme **illustratives / pédagogiques**, jamais comme images cliniques, diagnostiques ou preuves biomédicales validées tant qu’un reviewer scientifique ne les a pas approuvées.

## 4. État fonctionnel par fonctionnalité

| Fonctionnalité | État local | Ce qui fonctionne déjà | Ce qui manque pour la finition complète |
|---|---|---|---|
| Entrée invité étudiant | PASS | Ouverture automatique de la démo, pas de compte requis, session serveur | Vérifier la copie UX sur appareils réels et la stratégie de session production |
| Bascule Faculty guest | PASS | Accès enseignant de démonstration, navigation par rôle | Revue indépendante des permissions et de la confidentialité |
| Dashboard | PASS | Hero, carte des laboratoires, progression serveur, loading et erreurs accessibles | Direction artistique plus riche, revue visuelle humaine, états vides plus travaillés |
| Carte des laboratoires | PASS | États locked/current/available/completed, cartes par discipline | Illustrations/scènes par laboratoire et contenu scientifique validé |
| Explication LabEscape | PARTIEL | Copy de laboratoire biomédical et gamification présents | Ajouter une explication narrative plus mémorable, onboarding court et visuel |
| Moteur image / hotspot | PASS local | Pointage souris, clavier, image illustrative, feedback, retry | Validation biomédicale des assets et revue interaction mobile réelle |
| Moteur choice | PASS local | Options serveur, réponse et feedback | Enrichir feedback narratif après validation pédagogique |
| Moteur decision | PASS local | Contrôles sélectionnables et réponse serveur | Vérifier tous les cas pédagogiques avec reviewer contenu |
| Moteur stepper | PASS local | Progression par valeurs, clavier et résultat serveur | Revue UX de la séquence et des explications |
| Moteur order | PASS local | Contrôles Move up/down et clavier | Animation de réordonnancement plus explicite, test tactile réel |
| Moteur matching | PASS local | Sélecteurs accessibles et réponse serveur | Revue visuelle et contenu pédagogique |
| Réponse incorrecte | PASS | Feedback sans fuite de corrigé, état conservé | Rejouer sur chaque moteur avec reviewer E2E indépendant |
| Indice | PASS | Hint serveur, single-flight, pénalité serveur | Revue state-machine et contenu de chaque hint |
| Retry réseau | PASS | 503 dashboard, `role=alert`, Retry et session conservée | Vérification appareils/réseaux réels |
| Refresh / reprise | PASS | Tentative récupérée depuis API et normalisée strictement | Revue concurrence et expiration indépendante |
| Résultat de mission | PASS | Score, stats, temps et fragment exclusivement serveur | Validation métier et state-machine indépendante |
| Progress vault | PASS | Fragments, badges, leaderboard normalisés depuis API | Contrat indépendant, design de récompenses plus riche |
| Code Vault / unlock | PASS local | Code serveur, refus des sorties prématurées et unlock serveur | Tests CI distants et revue AppSec/état concurrent |
| Résultats de laboratoire | PASS local | Lab results calculés serveur, aucun score inventé localement | Revue UX après plusieurs labs complétés |
| Faculty analytics | PASS local | Cohorte, missions en difficulté, statistiques serveur | Validation confidentialité et revue faculty indépendante |
| Roster | PASS local | Roster normalisé et scoped par classe | Vérification cross-class/cross-role indépendante |
| Student detail | PASS local | Profil scoped et historique de tentatives | Validation données affichables et confidentialité |
| Content review | PASS local | draft → reviewed → approved → draft via backend | Validation biomédicale de chaque mission et asset |
| Learning settings | PASS local | Préférences serveur, alertes d’échec et rollback optimiste | Revue de persistance et UX appareil réel |
| Responsive | PASS automatisé | Desktop/mobile/tablette, pas d’overflow détecté | Inspection visuelle réelle 375/768/desktop |
| Clavier / focus | PASS automatisé | Contrôles nommés, focus visible, moteurs utilisables sans souris | Revue lecteur d’écran complète |
| Reduced motion | PASS automatisé | Scénario reduced motion | Validation animation par animation |
| Visuels | PARTIEL | Hero et image pédagogique illustratifs, watermark/caption | Bibliothèque visuelle et validation scientifique/pédagogique |
| Performance | PASS smoke | DOMContentLoaded, budget JS/CSS, lazy loading image mission | Mesure réseau/appareil réel et optimisation PNG si nécessaire |

## 5. Architecture technique à préserver

### Autorité backend obligatoire

Le backend reste l’unique source de vérité pour :

- réponses correctes ;
- score et XP ;
- pénalités ;
- temps et expiration ;
- tentative courante ;
- indices et budget d’indices ;
- fragments ;
- badges ;
- leaderboard ;
- unlock et Code Vault ;
- analytics Faculty ;
- transitions de contenu.

Ne jamais ajouter de calcul critique dans React pour faire fonctionner l’écran. Le frontend peut uniquement présenter et normaliser les payloads reçus.

### Contrats frontend

Les routes consommées doivent passer par `web/src/lib/api.ts` et un normalisateur strict. Un payload incomplet doit produire une erreur UI, jamais une valeur par défaut plausible.

Fichiers importants :

- `web/src/lib/api.ts`
- `web/src/lib/attempt.ts`
- `web/src/lib/progression.ts`
- `web/src/lib/faculty.ts`
- `web/src/lib/content.ts`
- `web/src/lib/profile.ts`
- `web/scripts/check-api-contract.mjs`
- `web/scripts/check-client-boundaries.mjs`
- `web/scripts/check-build-budget.mjs`

### Invariants non négociables

1. Aucun `localStorage` pour le bearer démo.
2. Aucun `fetch` direct hors client API.
3. Aucun score/timer/unlock/corrigé inventé par le navigateur.
4. Aucun secret de contenu envoyé avant autorisation serveur.
5. Aucun accès Faculty à une autre classe ou un autre rôle.
6. Toute transition métier est effectuée après réponse backend.
7. Les erreurs de forme API remontent à l’UI.

## 6. Goal à exécuter par Claude Code

### Goal principal

> Finaliser Escape Lab comme un MVP invité de laboratoire biomédical gamifié, réellement fonctionnel et impressionnant visuellement, en traitant chaque fonctionnalité une par une. Pour chaque fonctionnalité : inspecter le code et le backend, corriger le comportement, améliorer l’UI/animation/visuels, ajouter ou renforcer le contrat runtime, ajouter un test unitaire ou E2E ciblé, exécuter le test ciblé puis la suite complète, et documenter la preuve. Ne jamais déplacer la logique métier critique du backend vers le frontend. Ne jamais introduire une création de compte obligatoire. Ne jamais présenter une image illustrative comme une image clinique validée. Garder le verdict release `ESCALATE` jusqu’à deux runs CI distants archivés et toutes les signatures indépendantes.

### Ordre d’exécution demandé

#### Phase A — reprise et état

1. Lire ce fichier et `docs/FINAL_VALIDATION_REPORT.md`.
2. Vérifier Node `>=22.18.0`, backend, frontend, OpenAPI et l’absence de remote Git.
3. Lancer les tests existants avant toute modification.
4. Ne pas effacer les changements existants ni les artefacts de preuve.

#### Phase B — UX fondation

1. Entrée invité immédiate.
2. Dashboard avec hero, illustration, explication LabEscape, CTA clair.
3. Carte des laboratoires avec états et discipline.
4. Loading/error/empty states pour chaque page.
5. Erreurs `role=alert`, chargements `role=status`, focus visible, labels clavier.
6. Mobile 375 px, tablette 768 px, desktop.
7. Reduced motion et animations sans bloquer l’usage.

#### Phase C — fonctionnalités étudiant

Traiter séparément : dashboard → carte → démarrage → six moteurs → erreur → retry → indice → refresh/reprise → résultat → progression → fragments → Code Vault → unlock → résultats de laboratoire.

Pour chaque bloc, vérifier :

- happy path ;
- mauvaise réponse ;
- retry ;
- refresh ;
- expiration ;
- réseau lent ;
- double action/concurrence ;
- réponse serveur invalide ;
- clavier et mobile ;
- absence de fuite de corrigé.

#### Phase D — fonctionnalités Faculty

Traiter séparément : bascule Faculty guest → analytics → roster → détail étudiant → content review.

Vérifier les permissions backend, l’isolation par classe, les données minimales affichées, les erreurs 401/403/404 et les transitions de contenu serveur.

#### Phase E — hardening technique

1. Normaliser toutes les réponses API consommées.
2. Supprimer tout `any` du chemin critique.
3. Maintenir la matrice route → méthode → payload → réponse → état UI.
4. Régénérer OpenAPI et vérifier l’absence de dérive.
5. Exécuter audits et budget de bundle.
6. Vérifier les assets illustratifs et leur poids.

#### Phase F — preuves et handoff

Exécuter et archiver :

```text
Node >=22.18.0
cd be && npm ci && npm run seed:demo && npm run openapi && npm test && npm run typecheck && npm audit --audit-level=high
cd ../web && npm ci && npm test && npm run build && npm audit --audit-level=high && npm run test:e2e
```

Archiver les logs, OpenAPI, Playwright, traces, manifeste, bundle budget et capture visuelle. Mettre à jour le rapport unique et le handoff humain.

## 7. Critères d’acceptation fonctionnels

Le goal n’est accepté que si :

1. Un visiteur arrive sans compte sur une investigation claire.
2. Aucun écran MVP ne dépend d’un prénom ou compte fictif obligatoire.
3. Les six moteurs permettent de répondre, se tromper, réessayer et reprendre.
4. Le score, timer, pénalités, hints, fragments, badges et unlock sont backend-only.
5. Chaque page possède loading, erreur et état vide utilisables.
6. Les images sont explicitement illustratives.
7. Les parcours mobile, tablette, clavier et reduced motion fonctionnent.
8. Les erreurs API sont visibles et récupérables.
9. Les tests ciblés et la suite complète sont verts.
10. Le rapport contient la preuve exacte, les limites et les risques résiduels.

## 8. Critères d’acceptation release

Ne pas passer `ESCALATE` à `PASS` avant :

- deux runs CI distants consécutifs avec artefacts archivés ;
- Build/CI reviewer signé ;
- Contract reviewer signé ;
- AppSec reviewer signé ;
- state-machine reviewer signé ;
- Senior frontend E2E reviewer signé ;
- accessibility/performance reviewer signé ;
- education/biomedical reviewer signé ;
- Release Manager signé.

Une preuve locale, une capture d’écran, un build vert ou un test Playwright vert ne constitue pas une signature indépendante.

## 9. Fichiers à remettre après exécution

- `docs/CLAUDE_CODE_EXECUTION_BRIEF.md` — ce brief mis à jour.
- `docs/FINAL_VALIDATION_REPORT.md` — rapport unique avec preuves et verdict.
- `docs/HUMAN_REVIEW_HANDOFF_2026-10-05.md` — paquet pour reviewers.
- `docs/REVIEW_SIGNOFF_TEMPLATE_2026-10-04.md` — signatures externes.
- `docs/GATE_TRACEABILITY_MATRIX.md` — traçabilité G0–G8.
- `.ci-artifacts/local-2026-10-06/` — preuves locales.
- `.ci-artifacts/<remote-run>/` — archives CI distantes lorsqu’elles seront disponibles.

## 10. Décision actuelle

**MVP invité local : PASS.**

**Release production : ESCALATE.**

Ne pas fermer le goal et ne pas annoncer `production-ready` tant que les éléments externes de la section 8 ne sont pas présents.

## Mise à jour d'exécution — 2026-10-08

Boucle `test-e2e` (équipe de correction + superviseurs adversariaux, 5 rounds, piles réelles isolées) exécutée sur ce brief (précision du 2026-10-09 : ces superviseurs étaient des agents IA de la même équipe, non une revue humaine externe ; « indépendants » est à lire ainsi) : détail des défauts trouvés, des corrections et des limites dans `docs/FINAL_VALIDATION_REPORT.md` (section « Boucle adversariale ») et `docs/KNOWN_LIMITATIONS.md`. Points ouverts qui exigent une décision humaine : (1) **session invitée partagée** — tous les visiteurs utilisent le même utilisateur serveur « Alex Martin » ; (2) `cohort=all` du classement ; (3) statut de contenu global. Le verdict release reste `ESCALATE`.

