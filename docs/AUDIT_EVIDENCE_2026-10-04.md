# Escape Lab — registre d’audit G0–G8

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.

> **Précision (2026-10-09) :** dans ce document, « indépendant(e) » désigne des agents IA de la même équipe, pas une revue humaine externe ; aucune revue humaine indépendante n'a eu lieu. L'historique n'est pas réécrit.

Date : 2026-10-04  
Nature : registre de validation reproductible et contre-revue indépendante technique
Verdict : **CONDITIONAL PASS**

## Preuves exécutées

| Gate | Preuve actuelle | Statut | Revue indépendante |
|---|---|---|---|
| G0 | Runtime verrouillé `>=22.18.0` (`.nvmrc` + engines + preflight bloquant), workflow CI, webServer Playwright avec healthcheck, backend 48/48, unit 2/2, E2E **15/15**, rapport HTML Playwright généré, build PASS, audits npm backend + frontend 0 high exécutés localement et déclarés explicitement dans le workflow CI | PASS technique conditionnel | Signature Build/CI specialist et run CI distant absents |
| G1 | Matrice route → payload → état UI, check automatique frontend → OpenAPI, `normalizeAttempt()` aligné sur le payload serveur, tests backend de contrats et persistance | PASS technique partiel | Génération de types et signature Contract specialist restent requises |
| G2 | Tests de rôles, tokens, isolation tentative, anti-fuite corrigé, expiration serveur, headers de durcissement, score/timer/hints/unlock serveur ; runtime health 200, OpenAPI 200/29 routes, dashboard sans token 401, scan public sans `key/answer/explanation/recheck` | PASS technique après rework | À revalider par AppSec specialist |
| G3 | Parcours étudiant, mission, résultat server-calculated, fragments et progression E2E ; reset démo vérifié par token + statut HTTP après correction d’une régression 401/expiration | PASS technique partiel | À signer par Senior E2E engineer |
| G4 | Wrong answer → feedback → retry, hint, refresh/reprise, expiration serveur, verrou d’essai et compensation concurrente couverts par tests/probes dédiés | PASS technique final | Signature State-machine specialist requise |
| G5 | Point/image clavier, decision, stepper, ordre et matching : interactions UI et résultats ; contrôles nommés | PASS technique après rework | À revalider par Accessibility specialist |
| G6 | Analytics, roster, student detail, content review UI ; transitions contenu backend ; checklist biomédicale préparée dans `CONTENT_VALIDATION_CHECKLIST_2026-10-05.md` | PASS technique partiel | Validation clinique et signature Education/content specialist absentes |
| G7 | Viewports 375/768 px sans overflow, point/image clavier, reduced-motion, focus visible, parcours critique sans pageerror/console error, Axe dashboard + mission + faculty 0 violation, réseau lent 600 ms, smoke DOMContentLoaded <3 s, bundle 263.37 kB JS / 20.32 kB CSS | PASS technique automatisé | Lecteur d’écran et mesure performance spécialisée non signés |
| G8 | Suite complète relancée après les derniers changements ; contre-revue indépendante technique effectuée | ESCALATE | Signatures Release Manager et rôles spécialisés absentes |

## Commandes de référence

Depuis `be/` :

```text
npx --yes node@22 --disable-warning=ExperimentalWarning --test "test/*.test.ts"
```

Depuis `web/` (le harness Playwright démarre automatiquement les deux serveurs et vérifie leurs healthchecks) :

```text
npx --yes node@22 node_modules/vitest/vitest.mjs run
npx --yes node@22 node_modules/@playwright/test/cli.js test
npm run build
npm audit --audit-level=high
```

Résultats de la dernière passe vérifiée du 2026-10-05 : backend 48/48, unit 2/2, contrat API 10 routes, E2E 15/15 en 10,4 s puis 15/15 en 10,7 s sur deux exécutions locales consécutives, build/typecheck pass, 0 vulnérabilité high côté backend et frontend. Ces passes locales ont utilisé Node v22.23.2 explicitement propagé au harness ; elles renforcent la stabilité mais ne ferment pas l’exigence de deux runs CI distants.

## Contrôle AppSec préliminaire

- Les clés (`key`), explications et rechecks restent dans `be/src/content.ts` et ne sont pas envoyés dans les vues publiques.
- Le frontend consomme uniquement des étapes publiques et envoie les réponses au backend.
- Les réponses, scores, pénalités, temps, hints, fragments et unlocks sont calculés par le backend.
- Les tests serveur vérifient les rôles, tokens expirés/falsifiés, accès aux tentatives d’un autre utilisateur, permissions contenu et payloads sans corrigé.
- Smoke runtime : `/api/health` répond `200`, `/api/openapi.json` répond `200`, `/api/dashboard` sans bearer répond `401`, et les réponses publiques scannées ne contiennent pas `key`, `answer`, `explanation` ou `recheck`.
- En-têtes observés dans le code/runtime : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, et CORS explicite par configuration.
- Risque restant : cette vérification n’est pas une pénétration indépendante ; la signature AppSec est obligatoire avant G8.
- La limite de connexion démo reste à 60/10 min en production ; l’environnement `NODE_ENV=test` utilise un plafond séparé de 1000 pour éviter qu’un serveur localhost partagé ne rende les runs E2E non reproductibles.

## Contrôle accessibilité préliminaire

- Navigation mobile visible à 375 px.
- Ordre utilisable via boutons `Move up` / `Move down`.
- Matching utilisable par éléments `select`.
- Point/image expose un nom accessible et une activation clavier basique.
- Axe dashboard, mission et faculty exécuté séparément : 0 violation après ajout du titre document, `lang` et correction du contraste de session.
- Risques restants : revue lecteur d’écran, focus persistant exhaustif et mesure performance spécialisée non exécutés dans ce run.

## Règle de décision

Ce registre ne transforme pas une auto-vérification en approbation indépendante. G8 reste bloqué tant que chaque reviewer spécialisé n’a pas fourni une décision écrite et que les éventuels reworks n’ont pas relancé les gates impactés.

La revue indépendante initiale et son rework sont consignés dans [INDEPENDENT_REVIEW_REPORT_2026-10-04.md](INDEPENDENT_REVIEW_REPORT_2026-10-04.md).

La fiche de signature prête à l’emploi est [REVIEW_SIGNOFF_TEMPLATE_2026-10-04.md](REVIEW_SIGNOFF_TEMPLATE_2026-10-04.md).

La décision de release consolidée est [RELEASE_GATE_DECISION_2026-10-05.md](RELEASE_GATE_DECISION_2026-10-05.md).
