# Escape Lab — matrice de contrat API/UI

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.

Date : 2026-10-05  
Source de vérité : `be/openapi.json`, `be/src/routes.ts`, `web/src/app.tsx`.

Cette matrice couvre les routes réellement consommées par l’interface. Les champs métier sont lus depuis les réponses serveur ; aucun score, timer, corrigé ou unlock n’est reconstruit côté client.

| Appel UI | Route serveur | Consommation | Preuve |
|---|---|---|---|
| Connexion démo | `POST /api/auth/demo` | `token`, `user`, `demo` | E2E student/faculty ; route OpenAPI |
| Session | `GET /api/me` | identité, rôle, profil | E2E dashboard/teacher |
| Dashboard | `GET /api/dashboard` | progression, XP, streak, labs | E2E dashboard ; tests backend dashboard |
| Carte labs | `GET /api/labs` | labs, ordinal, state, blurb | E2E dashboard/mobile |
| Démarrage mission | `POST /api/missions/{id}/start` | `attempt`, `mission`, `step` | E2E six moteurs |
| Reprise mission | `GET /api/attempts/{id}` | état courant de tentative | E2E refresh |
| Réponse | `POST /api/attempts/{id}/answer` | feedback, tentative, résultat éventuel | E2E wrong/retry/success ; backend scoring |
| Indice | `POST /api/attempts/{id}/hint` | texte d’indice, niveau | E2E hint ; backend concurrence/expiration |
| Résultat | `GET /api/attempts/{id}/result` | résultat serveur | backend résultat verrouillé ; UI ResultScreen |
| Profil | `GET/PUT /api/profile` | préférences persistées | E2E profile ; backend profile |
| Vault | `GET /api/vault` | fragments et états d’unlock | UI ProgressHub ; backend journey |
| Badges | `GET /api/badges` | badges serveur | UI ProgressHub ; backend journey |
| Leaderboard | `GET /api/leaderboard?scope=all&cohort=class` | rangs et XP | UI ProgressHub ; backend leaderboard |
| Résultats lab | `GET /api/labs/{slug}/results` | scores et métriques serveur | UI LabResults |
| Unlock lab | `POST /api/labs/{slug}/unlock` | validation code côté serveur | backend full journey |
| Classes | `GET /api/classes` | classes autorisées | E2E teacher/student detail |
| Analytics | `GET /api/classes/{id}/analytics` | cohort, missions, signaux | E2E faculty ; backend analytics |
| Roster | `GET /api/classes/{id}/students` | étudiants autorisés | E2E faculty |
| Détail étudiant | `GET /api/classes/{id}/students/{studentId}` | historique et métriques | E2E student detail |
| Revue contenu | `GET /api/content/missions` | statut éditorial | E2E content review |
| Statut contenu | `PUT /api/content/missions/{id}/status` | transition persistée | backend content approval ; UI review |

## Normalisation de tentative

`normalizeAttempt()` ne crée aucune décision métier. Il adapte uniquement le contrat serveur vers les propriétés de rendu :

- `attempt.attemptId` ← `attempt.attemptId`
- `attempt.missionId` ← `attempt.mission.id`
- `step` ← `attempt.step`
- `stepIndex` ← `stepsSolved`
- `stepCount` ← `mission.steps`
- `elapsedSec` / `timeLimitSec` ← valeurs serveur
- `penalties` ← `wrongTotal`

Le backend reste l’autorité pour la validité de la réponse, le score, l’expiration, la pénalité, les hints, les fragments et les unlocks.

## Écart restant G1

La matrice est complète pour les appels UI identifiés. Le script `web/scripts/check-api-contract.mjs` vérifie désormais automatiquement que les routes littérales frontend existent dans `be/openapi.json`. Les réponses frontend restent largement typées `any` et aucun générateur de types OpenAPI n’est encore branché : G1 reste donc **PASS technique partiel**, à faire signer par un Contract specialist.
