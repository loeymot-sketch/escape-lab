# Escape Lab — décision de release G8

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.


Date : 2026-10-05  
Décision actuelle : **ESCALATE — release non clôturable**

## Synthèse des gates

| Gate | Preuve technique actuelle | Reviewer requis | Décision release |
|---|---|---|---|
| G0 | Node `>=22.18.0`, preflight, CI, webServer + healthchecks, backend 48/48, frontend 14/14, E2E 18/18, builds et audits verts ; OpenAPI régénérée et diff vérifié, logs E2E et manifeste local archivés | Build/CI specialist | PASS technique local conditionnel |
| G1 | Matrice API des 22 opérations consommées, check frontend → OpenAPI (12 littérales + 10 dynamiques), normalisation documentée | Contract specialist | PASS technique partiel |
| G2 | Auth/rôles/isolation/anti-fuite/timer/score/unlock et headers testés | AppSec specialist | PASS technique à revalider |
| G3 | Parcours étudiant, missions, refresh, résultats et progression automatisés | Senior E2E engineer | PASS technique partiel |
| G4 | Expiration, concurrence hints, compensation, retry et reprise : 48 tests + probes | State-machine specialist | PASS technique |
| G5 | Six familles d’interaction, clavier, feedback et retry couverts | Accessibility specialist | PASS technique partiel |
| G6 | Analytics, roster, détail, workflow éditorial et checklist biomédicale | Education/content specialist | ESCALATE : validation clinique absente |
| G7 | Axe dashboard/mission/faculty 0 violation, responsive, focus, reduced-motion, réseau lent, smoke performance | Accessibility/performance specialist | PASS technique automatisé |
| G8 | Dossier et workflow CI présents ; signoffs incomplets | Release Manager + auditeur indépendant | ESCALATE |

## Blockers de clôture

1. Signatures indépendantes AppSec, Contract, Senior E2E, state-machine, accessibilité/performance et Education/content specialist, ainsi que la signature Build/CI.
2. Validation biomédicale humaine des valeurs, corrigés, explications, rechecks, hints, images et coordonnées.
3. Deux exécutions CI distantes consécutives archivées (rapport Playwright, traces, résultats, manifeste et OpenAPI), distinctes des preuves locales, puis signature Build/CI.
4. Signature Release Manager après revue des risques résiduels.

## Règle de décision

Les preuves automatisées sont vertes, mais aucune signature n’est implicite. G8 ne peut devenir `PASS` que lorsque chaque reviewer requis a inscrit une décision `PASS`, une date et une signature dans [REVIEW_SIGNOFF_TEMPLATE_2026-10-04.md](REVIEW_SIGNOFF_TEMPLATE_2026-10-04.md), et que les blockers ci-dessus sont fermés.

Le handoff prêt à transmettre aux reviewers est [HUMAN_REVIEW_HANDOFF_2026-10-05.md](HUMAN_REVIEW_HANDOFF_2026-10-05.md).
