# Escape Lab — matrice de contrat frontend/backend

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.

Source backend : `be/openapi.json` et `be/src/routes.ts`. Source frontend : `web/src/app.tsx`. Toute décision métier reste serveur-side.

| Parcours UI | Méthode et route | Payload frontend | Réponse consommée | État/UI attendu | Contrôle |
|---|---|---|---|---|---|
| Connexion démo | POST `/auth/demo` | `{ role }` | `token`, profil/rôle | token stocké, dashboard/teacher ouvert | E2E auth |
| Session | GET `/me` | aucun | identité, rôle, XP/niveau | identité et rôle chargés | backend auth |
| Dashboard | GET `/dashboard` | aucun | utilisateur, streak, overall, continue | XP, streak, progression, recommandation | backend dashboard + E2E |
| Règles de score | GET `/rules` | aucun | pénalités, plafond de score, bonus | pénalité d'indice affichée | backend rules + E2E |
| Carte des labs | GET `/labs` | aucun | collection `labs` et états | états `locked/current/available/completed` ; `lockedReason` obligatoire si locked | backend catalogue + E2E |
| Lobby d'un lab | GET `/labs/:slug` | aucun | lab, missions, vault | missions ; `unlocksWith` obligatoire si locked | backend lobby + E2E |
| Résultat d'une tentative | GET `/attempts/:id/result` | aucun | résultat serveur d'une tentative terminée | écran de résultat restauré après reload | backend result + E2E |
| Démarrer/reprendre mission | POST `/missions/:id/start` | aucun | `attempt` public + mission/étape | tentative normalisée, étape courante | backend resume + E2E refresh |
| Tentative courante | GET `/attempts/:id` | aucun | état public, timer, étape, pénalités | timer serveur, étape, pénalités | backend timer |
| Réponse et résultat | POST `/attempts/:id/answer` | `{ stepId, response }` | correct, feedback, tentative ou résultat serveur | feedback, progression ou résultat serveur | backend scoring + E2E engines |
| Indice | POST `/attempts/:id/hint` | `{ stepId }` | indice contextualisé | indice sans corrigé, pénalité serveur | backend hint + E2E |
| Vault | GET `/vault` | aucun | fragments/slots par lab | fragments sans code complet | backend anti-leak |
| Unlock | POST `/labs/:slug/unlock` | `{ code }` | état de sortie mis à jour | lab/badge/résultats mis à jour | backend unlock |
| Résultats lab | GET `/labs/:slug/results` | aucun | lab, stats, missions et XP | résultats uniquement après escape | backend guard |
| Badges | GET `/badges` | aucun | badges avec `earned` | état earned/locked serveur | backend badge |
| Leaderboard | GET `/leaderboard?scope=all&cohort=class` | query | classement anonymisé et rang personnel | classement et ligne utilisateur | backend privacy |
| Profil | GET `/profile` | aucun | settings courants | préférences courantes | backend profile |
| Préférence | PUT `/profile` | `{ sound|reduceMotion|notifications }` | préférences persistées | confirmation de sauvegarde | backend profile |
| Classes enseignant | GET `/classes` | aucun | classes autorisées | classes autorisées | rôle teacher |
| Roster | GET `/classes/:id/students` | aucun | étudiants de la classe | élèves isolés par classe | permissions + E2E |
| Détail étudiant | GET `/classes/:id/students/:studentId` | aucun | profil, métriques, historique scoped | métriques/historique scoped | permissions + backend |
| Analytics | GET `/classes/:id/analytics` | aucun | cohort et signaux missions | cohort/missions/risque | permissions + E2E |
| Review contenu | GET `/content/missions` | aucun | missions et statuts | statuts draft/reviewed/approved | workflow contenu |
| Changer statut | PUT `/content/missions/:id/status` | `{ status }` | statut persisté | transition persistée, action suivante | backend workflow + E2E |
| Réinitialiser démo invitée | POST `/demo/reset` | aucun | état étudiant démo restauré | retour au dashboard et tentative locale effacée | backend demo + E2E |

## Règles de preuve

- Les paramètres `:id`, `:slug` et `:studentId` sont résolus par le serveur ; le frontend ne fabrique aucun score, timer, unlock ou résultat.
- Les réponses sensibles (corrigés, clés, explications non gagnées, code complet) doivent rester absentes avant autorisation serveur.
- La matrice couvre les **25 opérations** réellement appelées par l'interface : **13 littérales** et **12 dynamiques**. Le script `web/scripts/check-api-contract.mjs` vérifie leurs routes et méthodes contre OpenAPI.
- La matrice ne vaut pas signature indépendante : le Contract specialist doit vérifier les schémas de payload/réponse et signer G1.

## Reproductibilité OpenAPI

La commande `be/npm run openapi` a été rejouée le 2026-10-06 sous Node v22.23.2 ; le fichier généré est identique à la version contrôlée (`cmp` réussi). Les corps générés imposent notamment : `role` enum pour demo, `code` numérique 3–4 chiffres pour unlock, `stepId` + `response` pour answer, `stepId` pour hint, et `status` enum pour la gouvernance contenu.
