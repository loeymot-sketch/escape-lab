# Revue indépendante Escape Lab — 2026-10-04

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.

> **Précision (2026-10-09) :** dans ce document, « indépendant(e) » désigne des agents IA de la même équipe, pas une revue humaine externe ; aucune revue humaine indépendante n'a eu lieu. L'historique n'est pas réécrit.

Reviewer : agent indépendant G0–G8  
Verdict initial : **ESCALATE**  
Statut après rework : **G0/G4/G7 PASS technique conditionnel — G8 ESCALATE**

## Contre-vérification finale du 5 octobre 2026

- G0 : deux suites E2E consécutives à 13/13 avant les scénarios additionnels, puis harness automatisé à 15/15 ; signature Build/CI encore absente.
- G7 : Axe dashboard et mission à 0 violation, responsive 375/768 px, clavier, focus visible, reduced-motion, réseau lent et smoke DOMContentLoaded <3 s vérifiés ; lecteur d’écran et performance spécialisée restent ouverts.
- G6 : le scénario faculty analytics/roster inclut désormais Axe et passe ; la validation clinique du contenu reste entièrement ouverte.
- G8 : aucune signature humaine spécialisée ni Release Manager n’est enregistrée.

## Résultats de la revue initiale

- Backend initial : 46/46.
- Frontend unit initial : 2/2.
- Playwright initial : 10/10.
- Build initial : PASS.
- Audit npm initial : 0 vulnérabilité high.

La revue a toutefois identifié des blockers que la suite nominale ne couvrait pas :

1. L’expiration serveur n’était pas refusée lors d’une soumission forcée au-delà de `timeLimitSec`.
2. Deux demandes d’indice concurrentes pouvaient réserver le même niveau et doubler la pénalité.
3. Le point/image ne permettait pas de positionner un point au clavier.
4. Le frontend pouvait transformer `{ error: { message } }` en message incohérent.
5. Le durcissement HTTP et l’exigence CORS production étaient incomplets.
6. Le contenu biomédical reste explicitement illustratif et nécessite une validation clinique indépendante.

## Rework exécuté

- `be/src/game.ts` refuse désormais answer/hint après expiration serveur.
- La réservation d’indice est atomique avant l’appel assistant ; les niveaux concurrents ne peuvent plus être dupliqués.
- `be/src/http.ts` ajoute `X-Frame-Options`, `Referrer-Policy` et CSP d’API.
- `be/src/app.ts` exige `CORS_ORIGIN` en production.
- `web/src/app.tsx` décode correctement l’objet d’erreur backend.
- `web/src/components/engines.tsx` permet le placement point/image par flèches, Enter et espace.
- Nouveaux tests backend : expiration et concurrence des hints.

## Résultats après rework

- Backend : **48/48 PASS**.
- Frontend unit : **2/2 PASS**.
- Playwright historique : **10/10 PASS** ; les contre-vérifications successives couvrent désormais **15/15 PASS**.
- Build : **PASS**.
- Audit npm : **0 vulnérabilité high**.

## Risques non clos

- Les contrats frontend par route n’ont pas encore un générateur/validator dédié.
- Le code unlock complet sur base neuve et après refresh doit recevoir une preuve E2E dédiée.
- Revalidation locale post-rework : Playwright **15/15 PASS**, Axe dashboard + mission + faculty **0 violation** ; cette preuve technique ne remplace pas la signature spécialisée G7.
- Le lecteur d’écran et la mesure performance spécialisée ne sont pas encore audités ; 768 px, reduced-motion et réseau lent sont couverts par Playwright.
- Le contenu, les clés, explications, rechecks et assets scientifiques nécessitent une approbation biomédicale humaine.

## Revalidation G4 post-rework

Les probes indépendants finaux passent :

- Answer pendant une hint en vol : `409 hint_in_progress` ; la hint obtient `200`, niveau 1 ; compteurs cohérents.
- Hint concurrente pendant expiration : `409 time_expired` ; compensation effective, `hintsTotal = 0` et `stepHints = 0`.

Décision : **G4 PASS technique**, sous réserve de la signature formelle du State-machine specialist. Le verdict global reste `ESCALATE` tant que G0–G8 et les revues humaines ne sont pas signés.
