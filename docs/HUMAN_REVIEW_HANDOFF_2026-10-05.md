# Escape Lab — handoff des revues humaines G8

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.

Ce document est destiné aux reviewers externes. Il ne constitue pas une signature et ne change pas le verdict `ESCALATE`.

## Paquet de preuve commun

- Rapport : `docs/FINAL_VALIDATION_REPORT.md`
- Plan : `docs/ULTRA_STRICT_EXECUTION_PLAN.md`
- Registre : `docs/AUDIT_EVIDENCE_2026-10-04.md`
- Décision release : `docs/RELEASE_GATE_DECISION_2026-10-05.md`
- Fiche de signature : `docs/REVIEW_SIGNOFF_TEMPLATE_2026-10-04.md`
- CI : `.github/workflows/escape-lab-validation.yml`
- Manifeste CI attendu : `.ci-artifacts/validation-manifest.json` (run, tentative, SHA, ref, Node et artefacts)
- Replay local complet : `.ci-artifacts/local-2026-10-06/` (npm ci, seed, OpenAPI, backend 48/48, frontend 14/14, build, audits, Chromium 18/18)
- Artefact local de référence : `web/playwright-report/index.html` généré par la commande CI exacte, 533 615 octets observés lors de la dernière passe.

## Rôles et action attendue

| Reviewer | Gates | Action minimale | Sortie attendue |
|---|---|---|---|
| AppSec | G2 | Examiner auth, rôles, isolation, anti-fuite, headers, CORS et le scénario Chromium de falsification score/timer/unlock | Décision + blockers + signature dans la fiche |
| Contract specialist | G1 | Examiner la matrice API, OpenAPI, le contrôle frontend méthode+route et les schémas consommés | Décision + routes/champs acceptés ou corrections |
| Senior E2E | G3/G5 | Rejouer le workflow CI et vérifier les assertions UI/résultats serveur | Décision + run ID/artefacts |
| State-machine specialist | G4 | Examiner expiration, retry, hints concurrents, compensation et idempotence | Décision + preuve des transitions |
| Accessibility/performance | G5/G7 | Rejouer Axe, clavier, responsive, reduced-motion, réseau lent, budget JS/CSS et compléter lecteur d’écran/performance | Décision + outils/version + blockers |
| Education/content specialist | G6 | Valider chaque mission, valeur, unité, corrigé, explication, hint, asset et hotspot | Décision clinique mission par mission |
| Build/CI specialist | G0 | Vérifier Node 22.18, npm ci, seed, healthchecks, deux runs propres et artefacts | Décision + liens de runs |
| Release Manager | G8 | Relire tous les gates et blockers après signatures | Décision finale PASS/NEEDS_FIX/ESCALATE |

## Commandes de reproduction

Depuis la racine, avec Node `22.18.0` actif :

```text
cd be && npm ci && npm run seed:demo && npm test && npm run typecheck && npm audit --audit-level=high
cd ../web && npm ci && npx playwright install --with-deps chromium
npm test && npm run build && npm audit --audit-level=high
npm run test:e2e
```

Le harness Playwright démarre les services et vérifie les healthchecks. Résultats locaux de référence : backend 48/48, frontend 14/14, E2E 19/19, Axe dashboard/mission/faculty 0 violation, contrôle OpenAPI 12 opérations littérales + 10 dynamiques avec méthodes HTTP, normalisation de tentative et valeurs zéro couvertes, erreur 503 annoncée par `role="alert"` avant Retry, échec `PUT /profile` annoncé et rollback vérifié, démarrage automatique en invité et bascule de démo, et audits npm backend/frontend à 0 vulnérabilité high. Le workflow régénère OpenAPI puis échoue si elle diffère de la versionnée ; il archive même en cas d’échec le rapport HTML, `web/test-results/`, `be/openapi.json`, le manifeste d'identification et les sorties OpenAPI, backend, unitaires, build/typecheck, audits et E2E dans `.ci-artifacts/`.

## Preuve CI distante à compléter avant G0 PASS

| Run | Run ID / lien | Résultat | Artefacts archivés | Reviewer Build/CI |
|---|---|---|---|---|
| CI-1 | À compléter | 18/18 attendu | Rapport HTML, traces, `.ci-artifacts/`, manifeste, OpenAPI | À compléter |
| CI-2 | À compléter | 18/18 attendu | Rapport HTML, traces, `.ci-artifacts/`, manifeste, OpenAPI | À compléter |

Les deux runs doivent être postérieurs aux 18 scénarios actuels, indépendants, terminés avec succès et vérifiables via leur archive CI. Les anciennes passes 13/13, 15/15, 16/16 ou 17/17 ne ferment pas cette exigence.

## Règle de signature

Le reviewer doit remplir sa section dans `REVIEW_SIGNOFF_TEMPLATE_2026-10-04.md` avec nom, date, version des outils, décision et blockers. Toute absence de preuve ou validation clinique vaut `NEEDS_FIX` ou `ESCALATE`; aucune signature ne doit être déduite du fait que les tests automatisés sont verts.

## Addendum 2026-10-08 — boucle adversariale

Résultats locaux de référence au 2026-10-08 (antérieurs ; les chiffres à jour sont dans `docs/FINAL_VALIDATION_REPORT.md`) : backend **108/108**, frontend **186/186**, Playwright **232/232**, contrat **13 littérales + 12 dynamiques**, budget JS **326 243 / 400 000**, audits npm **0 vulnérabilité**. Les reviewers doivent lire en priorité `docs/KNOWN_LIMITATIONS.md` (session invitée partagée, classement `cohort=all`, statut de contenu global) et la section « Boucle adversariale » de `docs/FINAL_VALIDATION_REPORT.md`. Les rapports des superviseurs adversariaux sont des audits internes : ils ne remplacent aucune signature indépendante.

