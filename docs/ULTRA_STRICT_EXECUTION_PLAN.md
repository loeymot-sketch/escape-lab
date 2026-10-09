# Escape Lab — plan ultra-strict d’exécution, examen et audit

> **État au 2026-10-09 :** les chiffres de ce document datent de passes antérieures. L'état de référence est dans `docs/FINAL_VALIDATION_REPORT.md` (validation locale uniquement) : son **état courant** (nombres de tests, identifiant d'instantané, statut de la convergence) est dans sa section « État vérifié le plus récent » en haut du fichier ; ses sections plus bas sont de l'historique. Le verdict de release reste **ESCALATE** : aucune CI distante, aucune revue humaine indépendante, aucune validation biomédicale.

## Goal strict

Rendre chaque parcours Escape Lab démontrablement fonctionnel, récupérable et sûr, avec une preuve reproductible par gate. Aucun verdict « production ready » ne peut être donné tant qu’un gate échoue, qu’une preuve manque ou que la revue spécialisée désignée n’a pas signé.

## Invariants non négociables

- Le backend reste l’unique autorité pour réponses, score, pénalités, temps, tentatives, indices, fragments, déverrouillages, badges et analytics.
- Aucun corrigé, score final ou décision d’unlock ne doit être déduit par le frontend.
- Toute donnée étudiant/enseignant est isolée par identité et autorisation serveur.
- Le timer affiché est dérivé de l’état serveur ; le rafraîchissement ne doit pas réinitialiser une tentative.
- Les six moteurs utilisent des contrats de données explicites et partageables.
- Chaque bug corrigé relance tous les gates impactés ; aucune correction ne contourne un test.

## Protocole de gate

Pour chaque gate, produire : commande exacte, commit ou diff ciblé, sortie de test, captures si UI, rapport du reviewer, décision PASS/FAIL. Le reviewer n’est pas l’implémenteur. Un FAIL bloque les gates suivantes et déclenche une fiche de rework.

### G0 — Reproductibilité et environnement

Owner : Release Engineer. Revue : Build/CI specialist.

- Verrouiller Node `>=22.18.0`, npm lockfile, ports et base de test isolée ; le workflow `.github/workflows/escape-lab-validation.yml` doit être la référence CI.
- Démarrer backend et frontend depuis zéro via `web/playwright.config.ts` ; vérifier healthchecks.
- Rejouer les 48 tests backend, 2 tests unitaires frontend et les 15 scénarios E2E actuels, incluant Axe dashboard, mission et faculty.
- PASS seulement si deux exécutions CI distantes consécutives donnent le même résultat et archivent leurs artefacts ; une seule passe locale 15/15 ne suffit pas à fermer G0.
- FAIL si une commande dépend d’un état local non documenté ou si Node incompatible est accepté silencieusement.

### G1 — Contrats API et parité UI

Owner : Backend/API Engineer. Revue : Contract specialist.

- Construire une matrice route → payload → état UI pour auth, dashboard, labs, attempts, hints, results, unlock, profile, analytics, roster, student detail et content review.
- Vérifier les champs réels d’essai (`attemptId`, `step`, `stepsSolved`, `wrongTotal`, `elapsedSec`, `timeLimitSec`) contre `normalizeAttempt()`.
- Ajouter un test de contrat pour chaque route consommée.
- PASS si aucun écran ne dépend d’un champ inventé ou d’un fallback métier frontend.
- FAIL si un changement backend casse l’UI sans échec de contrat explicite.

### G2 — Autorité serveur et sécurité

Owner : Security Engineer. Revue : AppSec specialist.

- Tenter de modifier score, réponse, timer, pénalité et unlock depuis le navigateur ; vérifier que le serveur refuse ou recalcule.
- Vérifier accès croisé étudiant/enseignant, ID inexistant, lab non autorisé et tentative d’un autre utilisateur.
- Vérifier absence de corrigés et de données sensibles dans les payloads navigateur.
- PASS si toutes les décisions critiques sont serveur-side et les accès refusés sont testés.
- FAIL immédiat sur fuite de corrigé, contournement de score ou fuite inter-utilisateurs.

### G3 — Happy path étudiant de bout en bout

Owner : Product QA. Revue : Senior frontend E2E engineer.

- Login démo → dashboard → carte laboratoire → mission → chaque étape → réussite → résultat → progression → fragment/code → unlock.
- Vérifier score, temps, XP, badge et état de complétion depuis les réponses serveur, pas seulement depuis le rendu.
- Conserver traces/captures en cas d’échec et payloads réseau minimisés ; la suite de référence actuelle contient 15 scénarios Playwright.
- PASS si le parcours est rejouable sur base neuve et après rafraîchissement.
- FAIL si une transition dépend d’un clic impossible, d’un état local perdu ou d’une valeur calculée client.

### G4 — Erreurs, pénalités et récupération

Owner : Reliability QA. Revue : Backend state-machine specialist.

- Pour chaque moteur : mauvaise réponse, indice, retry, réponse correcte, expiration, refresh et erreur réseau transitoire.
- Vérifier la pénalité attendue (-15 pour indice selon contrat), le compteur d’erreurs, le timer et l’idempotence.
- Tester reprise après fermeture/rouverture et après session expirée.
- PASS si aucune séquence ne duplique une tentative ou ne perd la progression serveur.
- FAIL si le frontend affiche une réussite contradictoire avec le serveur.

### G5 — Les six moteurs et accessibilité d’interaction

Owner : Interaction QA. Revue : Accessibility specialist.

- Choice/decision : clavier, sélection, feedback et retry.
- Point/image : coordonnées, bornage, précision et alternative clavier si applicable.
- Order : déplacement haut/bas accessible, ordre envoyé exact.
- Matching : sélection de paires, état incomplet et validation.
- Stepper : valeurs par étape, navigation et reprise.
- Mesurer chaque moteur en desktop et mobile ; aucun moteur ne doit être testé uniquement par snapshot.
- PASS si chaque moteur possède au moins un cas correct, incorrect, retry et reload.
- FAIL si une action essentielle exige la souris ou si le payload envoyé ne correspond pas au contrat.

### G6 — Parcours enseignant et gouvernance contenu

Owner : Faculty QA. Revue : Education/content specialist.

- Analytics → roster → détail étudiant → progression et signaux de risque.
- Liste missions → ouverture review → changement de statut → relecture après refresh.
- Vérifier permissions enseignant et absence d’accès étudiant aux routes de gouvernance.
- PASS si les métriques affichées correspondent aux données backend et si l’approbation est persistée.
- FAIL si le contenu peut être publié sans autorisation ou si les chiffres UI divergent du serveur.

### G7 — Responsive, accessibilité et performance

Owner : UX QA. Revue : Accessibility/performance specialist.

- Viewports 375 px, 768 px et desktop ; vérifier carte, mission, drag/order, tableaux et navigation.
- Navigation clavier complète, focus visible, labels, contrastes, messages d’erreur et `prefers-reduced-motion`.
- Mesurer bundle, erreurs console, requêtes échouées, temps de démarrage et comportement réseau lent.
- PASS si les parcours critiques sont utilisables sans souris et sans overflow bloquant.
- FAIL si une information critique est invisible, non annoncée ou si une erreur console critique persiste.

### G8 — Release gate final

Owner : Release Manager. Revue : Independent audit agent/reviewer.

- Rejouer toute la suite : backend, unit, E2E, build, typecheck, audit dépendances.
- Joindre la matrice de traçabilité, les rapports G0–G7 et la liste des risques résiduels.
- Faire une revue indépendante finale ; l’auteur des changements ne peut pas signer seul.
- PASS uniquement si tous les gates sont PASS, sans blocker ouvert, avec artefacts archivés.
- Sinon verdict `NEEDS_FIX` ou `ESCALATE`, jamais « pass with hope ».

## Règle d’examen par agent skilled

Chaque plan, sous-plan et rework doit comporter un reviewer spécialisé nommé par rôle, son entrée d’examen, sa preuve et sa décision. Les rôles minimaux sont : AppSec, backend state machine, frontend E2E, interaction/accessibilité, contenu pédagogique et release audit. Une auto-relecture peut détecter des problèmes mais ne remplace pas cette approbation indépendante.

## Verdict initial du plan

**CONDITIONAL PASS** : le socle automatisé est vert ; la déclaration « tout fonctionne sans faute » reste bloquée jusqu’à la fermeture documentée de G1–G8, en particulier G4–G7 et la revue indépendante spécialisée.
