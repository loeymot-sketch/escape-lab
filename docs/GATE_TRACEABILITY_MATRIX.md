# Escape Lab — matrice de traçabilité des gates

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.


| Gate | Preuve actuelle | Statut technique | Reviewer indépendant requis | Blocage de release |
|---|---|---|---|---|
| G0 Reproductibilité | Node 22.23.2, preflight, backend 108/108, frontend 186/186, build, E2E 232/232, OpenAPI reproductible ; CI archive logs E2E, manifeste et vérification OpenAPI générée | PASS local | Build/CI specialist | Oui : 2 runs CI distants archivés absents |
| G1 Contrats API | 12 opérations littérales + 10 dynamiques, chemin et méthode vérifiés contre OpenAPI ; normalisation de tentative testée, y compris valeurs zéro ; matrice API, OpenAPI stable | NEEDS_FIX résiduel | Contract specialist | Oui : réponses/payloads exhaustifs non signés |
| G2 Sécurité | 108 tests backend, anti-fuite, rôles, isolation, score/timer/hints serveur, npm audit 0 high ; scénario Chromium de falsification score/timer/unlock rejeté | PASS automatisé renforcé | AppSec specialist | Oui : revue indépendante absente |
| G3 Happy path étudiant | Playwright 232/232, parcours dashboard → mission → résultat → progression et rollback profil | PASS automatisé | Senior frontend E2E | Oui : signature absente |
| G4 Erreurs/récupération | Tests expiration, retry, hints, concurrence, reprise et tentative terminée ; reprise UI après 503 dashboard | PASS automatisé renforcé | Backend state-machine specialist | Oui : signature absente |
| G5 Six moteurs/a11y | E2E moteurs point/choice/decision/stepper/order/matching, clavier, Axe | PASS partiel | Accessibility/interaction specialist | Oui : revue moteur par moteur absente |
| G6 Faculty/contenu | Analytics, roster, détail, permissions ; workflow éditorial Chromium draft → reviewed → approved → draft | PASS automatisé renforcé | Education/content specialist | Oui : validation clinique absente |
| G7 UX/performance | mobile, tablette, reduced motion, réseau lent, échec 503 suivi de Retry, focus, console, smoke budget, navigation adaptée au rôle, budget build 400 Ko JS / 120 Ko CSS | PASS automatisé renforcé | UX/accessibility/performance specialist | Oui : inspection visuelle indépendante absente |
| G8 Release | Rapport unique et artefacts locaux présents | ESCALATE | Release Manager + auditeur indépendant | Oui : dépend de tous les points précédents |

## Règle de clôture

Un gate ne peut devenir `PASS` de release que lorsque sa preuve automatisée, son artefact et la décision du reviewer nommé sont présents. Le statut technique local ne vaut pas approbation indépendante.
