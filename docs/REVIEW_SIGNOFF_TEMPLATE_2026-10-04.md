# Escape Lab — fiche de revue spécialisée

Cette fiche est à remplir par un reviewer indépendant de l’auteur des changements. Une case non prouvée vaut FAIL ou ESCALATE ; aucune approbation implicite.

## AppSec reviewer

- Scope : G2, routes, authentification, autorisations, isolation, anti-fuite, score/timer/unlock serveur.
- Preuves à examiner : `be/test/api.test.ts`, `be/test/demo.test.ts`, `be/src/routes.ts`, smoke runtime `/api/health`, `/api/dashboard` sans token et scan des payloads.
- Tests additionnels exigés : examiner le scénario Chromium de falsification score/timer/pénalités/unlock, puis compléter l'accès cross-user et cross-role ainsi que l'inspection des payloads réseau.
- Décision : `PASS | NEEDS_FIX | ESCALATE`
- Blockers :
- Reviewer / date / signature :

## Backend state-machine reviewer

- Scope : G1/G4, transitions de mission, reprise, expiration, retry, hints, pénalités, idempotence, fragments.
- Preuves à examiner : 48 tests backend, E2E refresh/retry/hint, scoring et game services.
- Tests additionnels exigés : répétition de requête, réseau interrompu, session expirée, action après completion.
- Décision : `PASS | NEEDS_FIX | ESCALATE`
- Blockers :
- Reviewer / date / signature :

## Senior E2E reviewer

- Scope : G3/G5, couverture Playwright réelle et assertions sur résultats serveur.
- Preuves à examiner : `web/e2e/escape-lab.spec.ts`, harness `webServer` avec healthchecks, run actuel 18/18, traces sur échec, résultats backend et manifeste CI.
- Tests additionnels exigés : exécution sur base neuve, parcours correct/incorrect/retry/reload de chaque moteur.
- Décision : `PASS | NEEDS_FIX | ESCALATE`
- Blockers :
- Reviewer / date / signature :

## Accessibility/performance reviewer

- Scope : G5/G7, clavier, focus, labels, contraste, mobile 375/768/desktop, reduced motion, console et bundle.
- Preuves à examiner : E2E mobile, contrôles nommés, boutons order, selects matching, build output.
- Tests additionnels exigés : Axe dashboard + mission + faculty, lecteur d’écran, focus visible, `prefers-reduced-motion`, réseau lent et console sans erreur.
- Preuves désormais disponibles : Axe dashboard + mission + faculty à 0 violation, focus visible, reduced-motion, latence contrôlée 600 ms et smoke DOMContentLoaded <3 s ; lecteur d’écran et mesure performance spécialisée restent à exécuter.
- Décision : `PASS | NEEDS_FIX | ESCALATE`
- Blockers :
- Reviewer / date / signature :

## Biomedical content reviewer

- Scope : G6, exactitude des cas, valeurs, corrigés, explications, rechecks, indices et assets scientifiques.
- Preuves à examiner : `be/src/content.ts`, catalogue tests, workflow draft → reviewed → approved, registre d’assets.
- Tests additionnels exigés : validation clinique de chaque mission et confirmation des images/coordonnées finales.
- Décision : `PASS | NEEDS_FIX | ESCALATE`
- Blockers :
- Reviewer / date / signature :

## Release auditor

- Scope : G0/G8, reproductibilité, artefacts, versions, audit dépendances, risques résiduels et absence de gate ouvert.
- Preuves à examiner : `AUDIT_EVIDENCE_2026-10-04.md`, rapport E2E, plan G0–G8, sorties de tests archivées.
- Tests additionnels exigés : deux runs propres, vérification de la configuration CI et revue de tous les blockers.
- Décision : `PASS | NEEDS_FIX | ESCALATE`
- Blockers :
- Reviewer / date / signature :

## Règle finale

G8 est `PASS` uniquement quand toutes les sections sont signées `PASS`. En l’état de ce document, les champs sont volontairement non signés : les preuves techniques existent, mais aucune revue indépendante ne doit être simulée.
