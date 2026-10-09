# Demande de relecture externe (humaine)

> Document de préparation, relu en partie par des agents IA de l'équipe lors des tours d'audit 35 à 37 (ce qui n'en fait pas une revue externe). Il ne contient aucune validation : il liste ce qu'une personne extérieure devrait vérifier, car aucun test automatique ni aucun agent IA (tous de la même équipe) ne peut le faire. État technique de référence : `docs/FINAL_VALIDATION_REPORT.md`. Validation locale uniquement ; le verdict reste **ESCALATE** pour la production et la publication scientifique.

## 1. Ce que le projet est
Escape Lab : prototype académique local de laboratoire virtuel biomédical gamifié (3 laboratoires et un Master Lab, 10 missions, mode invité, vue enseignant avec données de démonstration générées). Ce n'est pas un dispositif médical, pas un outil de diagnostic, pas une référence clinique. Les images sont illustratives, leur provenance n'est pas documentée.

## 2. Ce qu'on demande, par profil
| Profil | À relire | Point de départ |
|---|---|---|
| Biologiste médical / enseignant du domaine | exactitude des 10 missions (valeurs de référence, unités, valeurs critiques, logique clinique, retours pédagogiques) | `docs/SCIENTIFIC_REVIEW_BACKLOG.md` (25 constats, dont bio-01 : ordre ambigu pour un potassium critique), contenu dans `be/src/content.ts` (non modifié par l'équipe technique) |
| Pédagogue | alignement avec les objectifs d'apprentissage, effet des pénalités et du système de fragments (une personne peut terminer une mission en devinant, voir `docs/KNOWN_LIMITATIONS.md` point 10) | `docs/FACULTY_DEMO_SCRIPT.md`, `docs/demo-screenshots/` |
| Accessibilité | lecteur d'écran (non testé ; **Blood Smear Code n'a pas d'alternative non visuelle** et bloque l'accès au reste de l'Hématologie et au Master Lab : décision pédagogique et revue d'accessibilité requises, voir `docs/KNOWN_LIMITATIONS.md`, « Round 36 notes » ; Lab Value Hacker a une version texte), clavier, contraste (le bouton « Submit » désactivé est peu contrasté), zoom, WebKit/Safari (non testé) | l'application locale, les captures |
| Sécurité | authentification d'invité sans mot de passe, limites de débit, règles de rôle enseignant (tout enseignant avec le code peut rouvrir un statut « approuvé ») | `docs/KNOWN_LIMITATIONS.md` points 5, 9 à 13, `be/openapi.json` |
| Éthique / données | pilote avec de vrais étudiants : accord éthique, RGPD, consentement (rien n'est prévu ni validé dans ce dépôt) | `docs/KNOWN_LIMITATIONS.md` |

## 3. Pour reproduire (poste local, Node 22)
1. `node -v` doit afficher v22.18 ou plus (`nvm use 22`) ; sinon `npm start` échoue sur `bad option`.
2. Suivre l'étape 0 et les sections 2 à 3 de `docs/FACULTY_DEMO_SCRIPT.md` (réinitialiser les données de démonstration avant de présenter ; ne pas cliquer « Mark reviewed » pendant la démo).
3. Tests : `cd be && npm test`, `cd web && npm test`, `cd web && CI=true npm run test:e2e` (environ 5 minutes, un seul worker). **Les nombres de tests changent à chaque correction : ils ne sont volontairement pas recopiés ici** ; la valeur courante et ses journaux sont dans la section en haut de `docs/FINAL_VALIDATION_REPORT.md`.

## 4. Ce qu'une personne extérieure ne doit pas supposer
- « Vérifié techniquement » ne veut pas dire « biomédicalement correct » : les missions sont toutes en statut Draft, et « Approved » n'est qu'un indicateur de workflow.
- **État des preuves** : voir `docs/FINAL_VALIDATION_REPORT.md` (section « État vérifié le plus récent ») pour les nombres de tests, l'identifiant d'instantané et le statut de la convergence ; ce document ne les répète pas pour ne pas devenir faux à la prochaine correction. Une passe antérieure avait échoué (408/411, cause non établie : `docs/KNOWN_LIMITATIONS.md` point 14). Validation locale uniquement.
- Les étudiants, classes et scores affichés côté enseignant sont des données de démonstration générées.

## 5. Retour attendu
Une liste datée de constats par profil, avec gravité (bloquant / à corriger / amélioration), référence de mission ou d'écran, et la correction proposée. Les constats biomédicaux se reportent dans le backlog scientifique, jamais directement dans `be/src/content.ts` sans décision d'un enseignant responsable.
