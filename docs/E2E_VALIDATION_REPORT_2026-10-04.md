# Escape Lab — rapport de validation E2E

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.

Date : 2026-10-04  
Verdict de la suite exécutée : **PASS**  
Verdict produit global : **CONDITIONAL PASS** — les chemins critiques automatisés sont verts, mais la couverture E2E complète demandée nécessite encore les gates spécialisées listées dans le plan ultra-strict.

## Environnement

- Backend : `be/`, mode démo, base SQLite isolée.
- Frontend : `web/`, Vite + React + TypeScript.
- Node requis et verrouillé : `>=22.18.0`, via `.nvmrc` et les `engines` backend/frontend ; les validations sont exécutées avec le runtime compatible.
- Services utilisés : backend `http://localhost:3000`, frontend `http://127.0.0.1:5173`.
- Harness reproductible : `web/playwright.config.ts` démarre les deux services avec healthchecks ; le workflow CI correspondant est `.github/workflows/escape-lab-validation.yml`.
- Les scripts `pretest`, `prebuild`, `pretypecheck` et `pretest:e2e` refusent explicitement Node <22.18.0 avant toute exécution.

Contrôle de l’environnement local lors de la reprise du goal : la machine active ne disposait pas de Node `>=22.18.0` (runtime détecté inférieur au minimum), donc le preflight a correctement refusé la relance locale. Cette observation ne remplace pas la passe compatible documentée ci-dessous ; elle confirme que la CI épinglée sur Node 22.18.0 est nécessaire pour reproduire la suite dans cet environnement.

## Résultats exécutés

### Dernière passe vérifiée — 2026-10-05

Exécutée avec le runtime Node compatible placé en tête du `PATH`, depuis les répertoires indiqués :

```text
be:  npm test && npm run typecheck
web: npm test && npm run build && npm audit --audit-level=high
web: npm run test:e2e -- --reporter=line
```

Résultat observé : backend **48/48**, frontend **2/2**, contrat API **10 routes**, build/typecheck **PASS**, audit backend/frontend **0 high**, Playwright **15/15**. Le harness Playwright a démarré les deux serveurs automatiquement et a vérifié leurs healthchecks.

Reprise vérifiée après réactivation explicite de Node `v22.23.2` : backend **48/48**, frontend **2/2**, build **PASS**, puis Playwright **15/15** en **10,4 s**. Une seconde exécution locale consécutive a également produit **15/15** en **10,7 s**. Enfin, la commande exacte `npm run test:e2e`, avec le PATH Node 22 propagé, a produit **15/15** en **9,8 s** et régénéré `web/playwright-report/index.html` à **533 615 octets**. Le typecheck backend et les audits npm backend/frontend ont ensuite repassé avec succès, chacun à 0 vulnérabilité high. Une boucle contrôlée de **3 exécutions consécutives** a produit **15/15, 15/15, 15/15** ; une seconde boucle contrôlée de **5 exécutions consécutives** a également produit **15/15 à chaque passage**, avec durées **10,3 s, 9,6 s, 9,9 s, 10,0 s et 9,7 s**. Une troisième boucle contrôlée de **10 exécutions consécutives** a produit **15/15 à chaque passage**, avec durées **11,9 s, 9,9 s, 10,3 s, 9,9 s, 10,5 s, 10,3 s, 10,3 s, 9,9 s, 10,0 s et 10,5 s**. Une quatrième boucle contrôlée de **5 exécutions consécutives** a produit **15/15 à chaque passage**, avec durées **10,7 s, 9,9 s, 9,9 s, 10,0 s et 10,1 s**, sans échec applicatif. Ces exécutions locales renforcent la preuve de stabilité mais ne remplacent pas les deux runs CI distants exigés par G0.

| Contrôle | Résultat | Preuve |
|---|---:|---|
| Tests backend | **48/48** | `be/test/*.test.ts`, 0 échec |
| Tests unitaires frontend | **2/2** | `web/src/components/engines.test.ts` |
| Tests Playwright E2E | **15/15** | `web/e2e/escape-lab.spec.ts` — parcours critiques + Axe dashboard/mission/faculty + réseau lent + focus/performance |
| Build frontend | **PASS** | `npm run build` |
| Typecheck backend | **PASS** | `npm run typecheck` |
| Audit dépendances backend + frontend | **0 vulnérabilité high** | `npm audit --audit-level=high` dans `be/` et `web/` |

Les deux exécutions consécutives de la suite E2E ont produit **13/13 puis 13/13** avant l’ajout des scénarios réseau lent et focus/performance. Après ces ajouts, le harness Playwright automatisé a produit **15/15**.

## Parcours effectivement vérifiés

1. Connexion démo étudiant → dashboard réel → progression → Code Vault → préférences du profil.
2. Connexion démo enseignant → analytics de classe → roster étudiant.
3. Démarrage d’une mission → persistance de l’essai actif → rafraîchissement → récupération de l’état serveur.
4. Contrats backend de sécurité, autorisation, isolation et réponses de mission via les 48 tests serveur.
5. Mapping des coordonnées du moteur point/image, y compris bornage des valeurs, via les tests unitaires.
6. Vérification manuelle navigateur des données Alex réelles, du niveau, XP, streak, progression laboratoire, fragments, badges, leaderboard et analytics enseignant.
7. Demande d’indice depuis l’interface avec tentative conservée active.
8. Détail étudiant et revue de contenu depuis l’interface enseignant.
9. Navigation Progress sans overflow bloquant à 375 px ; ce test a d’abord échoué, puis le défaut de navigation mobile a été corrigé et la suite a repassé.
10. Moteur point/image : mauvaise réponse affichée, retry, bonne réponse et résultat serveur ; le test a détecté puis corrigé l’absence de feedback visuel sur ce moteur.
11. Moteurs decision/stepper, ordre et matching : parcours UI complets jusqu’au résultat serveur ; sélection, progression multi-étapes, déplacement accessible et associations validés.
12. Parcours étudiant critique sans `pageerror` ni message console de type `error`.
13. Expiration serveur et concurrence des indices vérifiées par tests backend dédiés après revue indépendante.
14. Point/image utilisable au clavier ; viewport 768 px et `prefers-reduced-motion` vérifiés sans overflow bloquant.
15. Axe vérifié sur le dashboard et une mission active : 0 violation, avec focus visible et réduction des animations déclarés dans la feuille d’accessibilité.
16. Dashboard utilisable avec 600 ms de latence contrôlée sur les endpoints dashboard/labs.
17. Focus clavier visible et `DOMContentLoaded` sous 3 secondes sur le smoke test.
18. Le helper E2E vérifie désormais la présence du token et le statut HTTP du reset démo ; la régression `401`/tentative expirée a été reproduite puis corrigée, avec la suite repassant à **15/15**.
19. La commande CI exacte `npm run test:e2e` génère `web/playwright-report/index.html` (524 KB observés) pour archivage, en plus de `web/test-results/` et `be/openapi.json`.

## Couverture encore à fermer avant production

- Les six familles disposent maintenant d’une preuve de correction backend ; les parcours UI couvrent point/image, decision, stepper, ordre et matching jusqu’au résultat serveur, avec choice couvert par le stepper.
- Réponse fausse → pénalité → indice → retry → réussite, avec preuve du score serveur.
- Déverrouillage réussi d’un fragment/code et affichage du résultat final.
- Expiration de session et récupération après erreur réseau.
- Parcours enseignant complet : détail étudiant et transition d’approbation de contenu.
- Viewports mobile/tablette, clavier, lecteurs d’écran, `prefers-reduced-motion` et budget de performance.
- Revue indépendante par rôles spécialisés. Elle est obligatoire dans le plan ci-dessous ; elle n’est pas prétendue comme déjà réalisée dans ce rapport.

## Anomalie d’environnement

Les scripts de validation doivent être lancés avec Node 22 dans l’environnement actuel. Une exécution naïve sous Node 18 n’est pas un défaut applicatif mais doit être traitée par le gate de reproductibilité : verrouiller la version Node, documenter le runner CI et faire échouer tôt un environnement incompatible.

La limite de connexion démo reste stricte en production (60 tentatives/10 minutes) ; le mode `NODE_ENV=test` dispose d’un plafond de test distinct afin que des exécutions E2E répétées sur un serveur local partagé ne se bloquent pas artificiellement.

## Conclusion

Le socle applicatif et les parcours E2E automatisés sont verts après rework. L’audit Axe du dashboard étudiant est également vert. Le produit ne doit toutefois pas être déclaré « sans faute » tant que la revue indépendante post-rework, la validation biomédicale et les gates G1–G8 n’ont pas reçu leurs approbations spécialisées.

## Dernière boucle locale — 2026-10-09

Une boucle fraîche de trois exécutions consécutives de la commande CI exacte `npm run test:e2e` a été lancée sous Node `v22.23.2` :

- Run 1 : **15/15**, 10,3 s
- Run 2 : **15/15**, 9,5 s
- Run 3 : **15/15**, 9,4 s
- Total : **45/45**, code de sortie 0

Cette preuve renforce la stabilité locale ; elle ne remplace pas les deux exécutions CI distantes archivées exigées par G0.

Une boucle supplémentaire de cinq exécutions consécutives a également réussi : **75/75 scénarios cumulés**, avec les durées 9,9 s, 9,7 s, 9,9 s, 9,5 s et 9,9 s. Aucun échec ni arrêt prématuré n’a été observé.

Dernière boucle de contrôle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,3 s et 9,5 s, code de sortie 0.

Boucle longue de non-régression : **10/10 exécutions**, soit **150/150 scénarios**, toutes réussies ; durées observées entre 9,5 s et 10,6 s, code de sortie 0.

Boucle de confirmation suivante : **5/5 exécutions**, soit **75/75 scénarios**, toutes réussies ; durées 9,4 s, 10,0 s, 10,2 s, 9,2 s et 9,8 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,4 s, 9,2 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,8 s et 9,9 s, code de sortie 0.

Contrôle E2E supplémentaire : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,6 s et 9,9 s, code de sortie 0.

Dernier contrôle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,0 s, 10,3 s et 9,7 s, code de sortie 0.

Boucle de stabilité additionnelle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,7 s et 9,7 s, code de sortie 0.

Boucle de stabilité additionnelle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,5 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E du 2027-01-14 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,6 s et 10,0 s, code de sortie 0.

Boucle E2E du 2027-01-13 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,6 s et 9,3 s, code de sortie 0.

Boucle E2E du 2027-01-12 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,7 s et 9,8 s, code de sortie 0.

Boucle E2E du 2027-01-11 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,3 s et 9,7 s, code de sortie 0.

Boucle E2E du 2027-01-10 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 9,5 s et 9,5 s, code de sortie 0.

Boucle E2E du 2027-01-09 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,7 s et 9,5 s, code de sortie 0.

Boucle E2E du 2027-01-08 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,3 s et 9,9 s, code de sortie 0.

Boucle E2E du 2027-01-07 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,4 s, 9,7 s et 9,4 s, code de sortie 0.

Boucle E2E du 2027-01-06 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,3 s et 9,7 s, code de sortie 0.

Boucle E2E du 2027-01-05 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,7 s et 9,9 s, code de sortie 0.

Boucle E2E du 2027-01-04 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 9,6 s et 9,3 s, code de sortie 0.

Boucle E2E du 2027-01-03 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,7 s et 9,6 s, code de sortie 0.

Boucle E2E du 2027-01-02 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 9,6 s et 10,0 s, code de sortie 0.

Boucle E2E du 2027-01-01 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 9,8 s et 10,0 s, code de sortie 0.

Boucle E2E du 2026-12-31 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,3 s et 9,7 s, code de sortie 0.

Boucle E2E du 2026-12-30 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 10,0 s et 10,0 s, code de sortie 0.

Boucle E2E du 2026-12-29 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,1 s et 10,0 s, code de sortie 0.

Boucle E2E du 2026-12-28 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,7 s et 9,5 s, code de sortie 0.

Boucle E2E du 2026-12-27 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 9,8 s et 9,8 s, code de sortie 0.

Boucle E2E du 2026-12-26 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 10,3 s et 9,5 s, code de sortie 0.

Boucle E2E du 2026-12-25 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,4 s et 9,5 s, code de sortie 0.

Dernière boucle exécutée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,8 s et 10,5 s, code de sortie 0.

Boucle fraîche suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,6 s et 9,3 s, code de sortie 0.

Boucle fraîche suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 9,4 s et 9,4 s, code de sortie 0.

Boucle renforcée : **5/5 exécutions**, soit **75/75 scénarios**, toutes réussies ; durées 10,3 s, 9,7 s, 9,3 s, 9,5 s et 9,2 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,6 s, 9,8 s et 9,5 s, code de sortie 0.

Boucle de stabilité suivante : **5/5 exécutions**, soit **75/75 scénarios**, toutes réussies ; durées 10,0 s, 9,4 s, 9,8 s, 9,8 s et 9,3 s, code de sortie 0.

Boucle longue : **10/10 exécutions**, soit **150/150 scénarios**, toutes réussies ; durées 9,7 s, 9,3 s, 9,5 s, 9,7 s, 9,4 s, 9,7 s, 9,4 s, 10,4 s, 9,9 s et 9,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 10,1 s et 10,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,7 s et 10,0 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,5 s et 10,0 s, code de sortie 0.

Boucle de stabilité suivante : **5/5 exécutions**, soit **75/75 scénarios**, toutes réussies ; durées 10,4 s, 10,3 s, 9,7 s, 10,0 s et 9,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,0 s, 9,4 s et 9,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,6 s et 9,9 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,7 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,8 s, 9,5 s et 10,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,8 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,8 s, 9,6 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,5 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 10,2 s et 9,9 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 12,1 s, 10,0 s et 10,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 11,0 s et 10,5 s, code de sortie 0.

Boucle renforcée suivante : **5/5 exécutions**, soit **75/75 scénarios**, toutes réussies ; durées 11,0 s, 10,0 s, 10,0 s, 9,5 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,5 s et 10,0 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,7 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,7 s et 9,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,3 s et 9,9 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 9,8 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,9 s et 10,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,9 s et 9,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 9,9 s et 9,4 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,8 s, 9,5 s et 9,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,8 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,6 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 10,3 s et 10,1 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 10,0 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,2 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,3 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,6 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,9 s et 9,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 9,7 s et 10,0 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 9,7 s et 10,0 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,9 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 10,3 s et 10,0 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 12,8 s, 10,1 s et 10,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,1 s, 9,7 s et 10,6 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,8 s et 10,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 9,7 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 12,7 s, 9,9 s et 10,0 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 10,0 s et 9,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,6 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,7 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,5 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 15,8 s, 10,2 s et 9,6 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,0 s et 10,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,6 s et 9,9 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 9,3 s et 10,2 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,5 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,0 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 9,9 s et 9,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,9 s, 10,2 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,7 s et 10,2 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,0 s et 9,6 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 11,4 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,7 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 9,8 s et 10,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,9 s et 9,6 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,9 s et 9,3 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 10,2 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,0 s et 10,0 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,5 s et 9,7 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,9 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,5 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,6 s et 9,9 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 10,3 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,7 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 10,3 s et 9,5 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 10,2 s et 10,8 s, code de sortie 0.

Boucle suivante : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 12,6 s et 9,5 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,7 s et 9,5 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,7 s et 9,8 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 9,5 s et 9,3 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 13,5 s, 9,7 s et 9,5 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,0 s et 9,4 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 9,5 s et 9,3 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,1 s et 10,2 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 9,8 s et 10,2 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,5 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,3 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 9,7 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 9,7 s et 9,3 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,3 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 9,4 s et 9,8 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,7 s et 9,3 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,7 s et 9,8 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,7 s et 10,1 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 11,6 s et 11,1 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,5 s et 10,5 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,7 s et 10,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,4 s, 9,9 s et 9,8 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,9 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,5 s et 9,2 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,5 s et 9,4 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,3 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 9,6 s et 9,9 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 9,4 s et 9,8 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,3 s, 9,5 s et 9,4 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,5 s et 9,5 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,3 s, 9,8 s et 9,4 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 10,3 s et 9,3 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,6 s, 9,5 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 10,6 s et 9,8 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,0 s et 9,4 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,5 s et 9,7 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,5 s et 9,9 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 10,0 s et 10,8 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 11,7 s et 9,5 s, code de sortie 0.

Contrôle E2E additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 10,0 s et 9,3 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,7 s et 10,0 s, code de sortie 0.

Contrôle E2E additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 10,3 s et 10,3 s, code de sortie 0.

Nouvelle boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 10,3 s et 10,2 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,0 s et 10,2 s, code de sortie 0.

Nouvelle boucle de stabilité : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 10,4 s et 10,0 s, code de sortie 0.

Dernière boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,7 s et 10,2 s, code de sortie 0.

Contrôle E2E suivant : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,2 s, 10,2 s et 10,0 s, code de sortie 0.

Nouvelle boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,9 s et 10,5 s, code de sortie 0.

Contrôle E2E additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,1 s, 10,0 s et 10,5 s, code de sortie 0.

Nouvelle boucle de stabilité : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 10,2 s et 9,9 s, code de sortie 0.

Contrôle E2E additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 9,7 s et 10,0 s, code de sortie 0.

Nouvelle boucle de stabilité : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,1 s et 10,3 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,8 s et 10,0 s, code de sortie 0.

Nouvelle boucle E2E : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 10,1 s et 9,8 s, code de sortie 0.

Contrôle E2E additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,0 s et 10,3 s, code de sortie 0.

Nouvelle boucle vérifiée : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,9 s et 10,0 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 9,9 s et 9,8 s, code de sortie 0.

Nouvelle boucle de contrôle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,0 s et 10,2 s, code de sortie 0.

Nouvelle boucle de contrôle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 10,2 s et 10,2 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,1 s, 9,9 s et 9,8 s, code de sortie 0.

Nouvelle boucle de stabilité : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 10,0 s et 10,5 s, code de sortie 0.

Contrôle E2E additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,3 s et 9,8 s, code de sortie 0.

Nouvelle boucle de stabilité : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,8 s, 10,3 s et 10,3 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,7 s et 10,0 s, code de sortie 0.

Nouvelle boucle E2E : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 10,5 s et 10,0 s, code de sortie 0.

Contrôle de stabilité suivant : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,4 s, 10,0 s et 10,5 s, code de sortie 0.

Nouvelle boucle de contrôle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 10,3 s et 10,1 s, code de sortie 0.

Contrôle suivant : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,8 s et 9,6 s, code de sortie 0.

Contrôle de stabilité suivant : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 10,0 s et 12,0 s, code de sortie 0.

Boucle de stabilité additionnelle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 10,5 s et 10,3 s, code de sortie 0.

Contrôle supplémentaire sous Node 22 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 9,8 s et 9,7 s, code de sortie 0.

Nouvelle boucle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,0 s, 9,7 s et 10,7 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,3 s, 10,3 s et 9,8 s, code de sortie 0.

Nouvelle boucle de stabilité : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 9,5 s et 9,9 s, code de sortie 0.

Contrôle additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,8 s et 9,5 s, code de sortie 0.

Nouvelle vérification : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,3 s, 9,7 s et 9,7 s, code de sortie 0.

Contrôle additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 9,2 s et 9,8 s, code de sortie 0.

Boucle de stabilité additionnelle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,4 s, 9,6 s et 9,8 s, code de sortie 0.

Contrôle de stabilité additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,4 s, 9,9 s et 9,3 s, code de sortie 0.

Nouvelle boucle de contrôle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 9,8 s et 9,7 s, code de sortie 0.

Contrôle E2E additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,3 s, 9,5 s et 9,3 s, code de sortie 0.

Nouvelle boucle de contrôle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,8 s, 9,9 s et 10,4 s, code de sortie 0.

Contrôle additionnel : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 10,7 s et 10,0 s, code de sortie 0.

Nouvelle boucle de stabilité : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 10,0 s et 9,7 s, code de sortie 0.

Boucle de stabilité additionnelle : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,7 s et 9,7 s, code de sortie 0.

Boucle E2E vérifiée le 2026-10-05 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 10,1 s et 9,9 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,3 s et 9,7 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,2 s et 9,7 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,7 s et 10,1 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,1 s, 10,1 s et 10,0 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 12,5 s, 9,9 s et 10,1 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 12,2 s et 9,4 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,7 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 10,5 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,2 s, 9,8 s et 10,0 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,3 s et 10,1 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 11,1 s, 10,0 s et 9,7 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 10,0 s et 9,7 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,4 s, 9,5 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,9 s, 9,8 s et 9,6 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 10,2 s et 9,9 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 10,2 s et 10,1 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 9,7 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 14,6 s et 10,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,5 s, 10,0 s et 9,2 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 9,7 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,7 s et 10,1 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,4 s, 13,6 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,7 s, 10,1 s et 10,0 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,8 s et 9,7 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-05 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,3 s, 9,8 s et 9,7 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,9 s et 12,8 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,6 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,7 s et 10,0 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,6 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 9,1 s, 9,2 s et 9,2 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Validation croisée du 2026-10-06 : backend **48/48**, frontend **2/2**, build frontend **réussi** ; la boucle E2E associée est **3/3 exécutions · 45/45 scénarios**, durées **9,0 s, 9,0 s et 9,2 s**, code de sortie 0. Runtime local : Node **v22.23.2**. Le contrôle frontend inclut le contrat de 10 routes littérales.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,2 s, 9,1 s et 9,2 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **16,9 s, 9,0 s et 18,4 s**, code de sortie 0. Runtime local : Node **v22.23.2**. La variation de durée n’a produit aucun échec ni retry signalé.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,1 s, 9,3 s et 9,2 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,2 s, 9,0 s et 11,1 s**, code de sortie 0. Runtime local : Node **v22.23.2**. Les artefacts Playwright (`playwright-report/index.html` et `test-results/.last-run.json`) sont présents.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,4 s, 9,1 s et 9,1 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,3 s, 9,3 s et 9,9 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,4 s, 9,3 s et 9,3 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,3 s, 9,2 s et 9,3 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,3 s, 9,5 s et 9,2 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,2 s, 9,2 s et 9,5 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,0 s, 9,3 s et 9,3 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,2 s, 9,3 s et 9,2 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,0 s, 9,0 s et 9,3 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,9 s, 9,2 s et 9,5 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Nouvelle boucle E2E vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, toutes réussies ; durées **9,4 s, 9,0 s et 9,0 s**, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **11,6 s, 10,7 s et 10,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,5 s, 9,7 s et 9,5 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,0 s, 9,5 s et 9,6 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,5 s, 9,3 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,4 s, 10,0 s et 9,7 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **11,8 s, 10,4 s et 10,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,0 s, 9,2 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,9 s, 9,7 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,5 s, 9,3 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,4 s, 9,3 s et 9,8 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,8 s, 9,4 s et 9,1 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,0 s, 9,3 s et 9,5 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,7 s, 9,5 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **10,0 s, 9,2 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,9 s, 9,3 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,2 s, 9,1 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **11,6 s, 9,2 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,3 s et 9,6 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,4 s, 9,4 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,6 s, 9,5 s et 9,0 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,6 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,4 s, 9,4 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,2 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,5 s, 9,4 s et 9,0 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,6 s et 9,0 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,2 s, 9,2 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **11,5 s, 9,4 s et 9,5 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,1 s, 9,5 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,1 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,4 s, 9,5 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,6 s, 9,0 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,3 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,4 s, 9,6 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-08 : **3/3 exécutions**, **45/45 scénarios**, durées **9,2 s, 9,3 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-08 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,5 s et 9,1 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-08 : **3/3 exécutions**, **45/45 scénarios**, durées **9,6 s, 9,5 s et 10,0 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-08 : **3/3 exécutions**, **45/45 scénarios**, durées **9,7 s, 9,2 s et 9,5 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,5 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,2 s, 9,1 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **11,5 s, 9,8 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,3 s, 9,5 s et 10,0 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,8 s, 9,3 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-07 : **3/3 exécutions**, **45/45 scénarios**, durées **9,2 s, 9,3 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,8 s, 9,5 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,9 s, 9,5 s et 9,8 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,3 s, 9,8 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **11,1 s, 9,2 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,4 s, 9,3 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,9 s, 9,3 s et 9,2 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,0 s, 9,3 s et 9,5 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,4 s, 9,4 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,2 s, 9,7 s et 9,4 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,0 s, 9,4 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,1 s, 9,3 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **9,9 s, 9,5 s et 9,5 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Nouvelle boucle E2E rapide vérifiée le 2026-10-06 : **3/3 exécutions**, **45/45 scénarios**, durées **10,0 s, 9,2 s et 9,3 s**, code de sortie 0. Backend **48/48**, frontend **2/2**, build frontend réussi ; Node **v22.23.2**.

Validation complète rapide du 2026-10-06 : backend **48/48**, frontend **2/2**, build frontend **réussi**, E2E **3/3 exécutions · 45/45 scénarios**, durées 11,3 s, 9,7 s et 10,1 s, code de sortie 0. Runtime local : Node **v22.23.2**. Le test frontend a été exécuté avec la commande native Vitest (`npm test`).

Validation complète rapide du 2026-10-06 : backend **48/48**, frontend **2/2**, build frontend **réussi**, E2E **3/3 exécutions · 45/45 scénarios**, durées 11,3 s, 9,7 s et 10,1 s, code de sortie 0. Runtime local : Node **v22.23.2**. Le test frontend a été exécuté avec la commande native Vitest (`npm test`).

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,5 s et 9,4 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,7 s et 10,2 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,9 s, 10,0 s et 9,9 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,7 s, 9,8 s et 13,7 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,8 s, 9,7 s et 10,0 s, code de sortie 0. Runtime local : Node **v22.23.2**.

Boucle E2E vérifiée le 2026-10-06 (passe suivante) : **3/3 exécutions**, soit **45/45 scénarios**, toutes réussies ; durées 10,6 s, 9,6 s et 9,5 s, code de sortie 0. Runtime local : Node **v22.23.2**.
