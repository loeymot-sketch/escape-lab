# GOAL — MVP fonctionnelle, démontrable, validée localement

Créé le 2026-10-09 après le tour 20 du superviseur adversarial (`reports/test-e2e/r20/`).

## Objectif
Amener Escape Lab à un état **« DEMO-READY ACADEMIC MVP — TECHNICALLY VERIFIED LOCALLY »** sans aucun défaut visible pendant la démonstration, puis boucler avec le skill `test-e2e` (équipe GStack + superviseurs adversariaux) jusqu'à la convergence.

## Périmètre (à corriger)
1. **Honnêteté de l'interface** : Content review (« Approved » ≠ validation scientifique), texte « secure guest session », « server verified », titre « Earned milestones » avec badges verrouillés, définition du pourcentage de la carte « Mission signal ».
2. **Documents** : étape Node 22 dans la procédure de démo, lien cassé KNOWN_LIMITATIONS, identifiant d'état non reproductible, bandeaux sur les anciens documents, mot « indépendante », durées et dimensions du script, backlog scientifique complété (B-01, B-02, B-03).
3. **Backend (petits, sûrs)** : normalisation Unicode de l'e-mail, corps JSON non objet refusé sur les routes sans schéma, indicateur `demo` cohérent.
4. **Captures du portfolio** : régénérées après les changements, recadrées (01, 07), légende 10 alignée sur l'image.

## Hors périmètre (inchangé)
Pas de px→rem, pas de remplacement d'illustrations, pas de nouveau contenu ni de nouvelle mission, pas de modification du contenu biomédical (relecture d'experts requise), pas d'authentification de production, pas de cloud, pas d'extension infinie des homoglyphes. Jamais « production ready » ni « validé biomédicalement ».

## Critères de sortie (tous requis)
- Backend, typecheck, vitest, contrat d'API, budget du bundle, `npm audit --audit-level=high` : tous verts.
- OpenAPI régénéré identique au fichier commité.
- Playwright (Chromium, iPhone 13 émulé, bundle de production) : 100 % vert, **deux passes consécutives**.
- Deux tours adversariaux consécutifs (backend, navigateur, documents, visuel) avec **P0 = 0 et P1 = 0**, et **zéro P2 sur l'état audité en dernier** (critère reformulé le 2026-10-09 avec l'accord de l'utilisateur, voir la note ci-dessous).
- Preuves archivées dans `.ci-artifacts/local-<date>/` avec manifeste, rapport `docs/FINAL_VALIDATION_REPORT.md` mis à jour.
- Validation locale uniquement : pas de dépôt distant, pas de CI distante, auditeurs = agents IA (à dire).

## Règles de la boucle
- Aucun « flake » accepté sans cause racine (voir les tours 17 et 20).
- Un seul Playwright à la fois (la config impose `workers: 1`, une base partagée).
- Les agents de correction lancent backend/vitest mais pas Playwright ; le superviseur lance Playwright.

## Note de reformulation (2026-10-09)
Le critère d'origine était « aucun P2 nouveau introduit par ces corrections ». Il ne pouvait pas être démontré au sens strict : les corrections ont introduit des P2, dans le code (R21-A-01, régression de la correction backend du tour 20, corrigée avec test et réauditée au tour 22) et dans des documents (tours 22, 23, 25, 27 et 28, corrigés ensuite), et un audit ne peut pas effacer ce fait. L'utilisateur a accepté de le remplacer par « zéro P2 sur l'état audité en dernier ». Chaque audit ne couvre que sa portée (tour 22 : API et code ; tour 26 : documents, ciblé ; tour 29 : dernières modifications) : le détail est dans les lignes de tours de `docs/FINAL_VALIDATION_REPORT.md`.

## Mise à jour du 2026-10-09, tours 34 à 39 (C35-001, C37-008, C39-005)
Le critère « zéro P2 sur l'état audité en dernier » **n'est pas atteint** : les tours 34 à 38 laissent respectivement 7, 6, 5, 7 et 6 P2 ouverts (code, accessibilité et documents compris), non corrigés. Ce fichier ne doit pas être lu comme « critère rempli ». La consigne courante du propriétaire (P0/P1 bloquent la convergence ; P2/P3 ne bloquent pas la démonstration académique sauf effet matériel sur elle) est appliquée ; les P2 sont déclarés ouverts dans `docs/KNOWN_LIMITATIONS.md` et dans le rapport de validation.

Depuis le tour 36 le code a changé (deux défauts de performance corrigés, une version texte ajoutée à Lab Value Hacker) : les tours antérieurs ne comptent plus comme tours propres pour le code courant. **Convergence non atteinte** tant que `docs/FINAL_VALIDATION_REPORT.md` (section en haut) ne montre pas deux tours consécutifs P0 = P1 = 0 sur le code courant. Un élément d'accessibilité reste ouvert et dépasse le logiciel : **S-1**, Blood Smear Code n'a pas d'alternative non visuelle (voir `docs/KNOWN_LIMITATIONS.md`, « Round 36 notes » et « Round 37 notes »). **Précision sur le critère « deux tours consécutifs P0 = P1 = 0 »** : appliqué à la lettre, il ne peut pas être satisfait tant que S-1 est ouvert ; le superviseur a donc appliqué le critère de travail « hors S-1 », satisfait par les tours 38 et 39 sur le même code produit, **sans que cela remplace la décision du propriétaire sur S-1**.
