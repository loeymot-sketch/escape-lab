# Escape Lab — intégration des images et audit des jeux

## Mandat actif

Objectif utilisateur : tester et corriger les jeux pour une expérience lisible, robuste et conforme aux visuels demandés. Cette passe prolonge `docs/ULTRA_STRICT_EXECUTION_PLAN.md`, G3–G5 et G7, sans signer un gate humain de release.

## Références et acceptation

- Images 1–4 (`c1a922df-01f6-4b07-a9f5-0863e3035323`) : conserver les quatre photos fournies dans le défi de Petri et les associer à la bonne observation, sans afficher les noms des organismes comme corrigé.
- Image 5 : une photo accompagne chaque phrase. Les détails doivent pouvoir être examinés sur téléphone, tablette et ordinateur ; les contrôles restent accessibles et la réponse sélectionnée ne change pas pendant l'inspection.
- Image 6 : les salles précèdent les statistiques ; statistiques compactes ; paragraphe de démonstration au bas de la page.
- Parcours : six moteurs, réponse erronée/correcte, réessai, indice, rechargement, fin de mission, retour au laboratoire, progression et déverrouillages restent cohérents avec le serveur.
- Preuves visuelles : dimensions intrinsèques/rendues, absence de débordement à 320/375/390/768/1280 px, inspection des captures, clavier et tactile, récupération après échec d'image.

## SUBSYSTEMS_TOUCHED

Présentation des moteurs étudiant, traduction FR/EN, styles des images et contrôles, feedback pédagogique serveur, vérification E2E et documentation de preuve. Aucune migration, aucun changement de schéma, de secret ou de calcul de score.

## Fichiers autorisés

- `web/src/components/engines.tsx`
- `web/src/game-world.css`
- `web/src/i18n/fr/engines.ts`
- `web/src/pages/student.tsx` seulement si les mesures contredisent l'image 6 ; `web/src/i18n/fr/student.ts` pour les trois niveaux de difficulté encore non traduits
- `web/src/i18n/fr/content-a.ts` et `web/e2e/i18n-fr.spec.ts` : difficulté et feedback de coagulase en français
- `be/src/types.ts`, `be/src/content.ts`, `be/src/engines.ts`, `be/src/game.ts`, `be/test/choice-feedback.test.ts` : feedback d'erreur spécifique au choix de bactérie, demandé dans l'ancienne image 6 des remarques, encore absent du code actuel
- `web/e2e/image-integration.spec.ts`
- `web/e2e/engines.spec.ts` et `web/e2e/mobile.spec.ts` seulement pour une vérification impactée
- `web/e2e/audit-fixes.spec.ts` : maintenir le test de collision des libellés après leur conversion en vrais labels de formulaire
- `web/e2e/behaviour.spec.ts` : attendre la fin des routes simulées du groupe de reprise avant de fermer chaque page (course de teardown confirmée par la suite complète)
- Renommer les quatre `web/src/assets/culture-*.webp` en `culture-observation-01.webp` à `04.webp` sans changer leurs octets : les URL ne doivent pas donner l'organisme à choisir
- ce plan et `docs/IMAGE_GAMEPLAY_AUDIT_2026-10-12.md`

## PLAN → EXÉCUTE → VALIDATE → AUDIT

1. Relever les écarts sur les photos, les libellés, les sélections et la première vue des salles.
2. Agrandir la consultation des photos, conserver tout leur contenu, traiter les erreurs de chargement et rendre la fermeture/focus utilisables au clavier.
3. Vérifier les associations ambiguës/dupliquées, les réponses et la préservation de l'état pendant l'inspection.
4. Tester les dimensions, l'absence de découpe/débordement et les captures multi-écrans ; rejouer les suites impactées puis les contrôles complets.
5. Revue indépendante spécialisée interaction/accessibilité et frontend E2E via Claude terminal ; enregistrer les remarques et corriger les défauts confirmés.
6. Documenter les preuves et limites. Aucun auto-gate humain ; le statut de release reste distinct de la validation locale.

## Invariants à vérifier

- Le serveur conserve l'autorité sur les réponses, scores, pénalités, timer, fragments et déverrouillages.
- Les photos et descriptions n'exposent pas les clés de réponse.
- Une fenêtre d'inspection ne modifie aucune réponse et rend le focus au contrôle qui l'a ouverte.
- Aucune retouche des images de référence ou des fichiers `sources/`.
- Tous les changements préexistants sont préservés ; bases E2E isolées des données locales.
- Invariants FoodKing prix/OrderStatus/branch_id/dispatch/parité OrderService : non applicables à ce dépôt Escape Lab ; aucune zone correspondante modifiée.

## État initial

Les quatre photos 720 × 720 px sont présentes, mais affichées à 72 × 72 px sans inspection agrandie ni récupération spécifique après échec de chargement. Les salles sont déjà placées avant les statistiques et la note de démonstration est au bas de la page. La passe précédente a validé le matching desktop et le parcours mobile ; elle n'a pas fourni de comparaison visuelle multi-écrans complète.

## Rework confirmé pendant l'exécution

- Le test a trouvé une sortie du focus par Tab et une libération tardive du verrou de défilement : gérer les deux explicitement.
- La revue indépendante a demandé les cas tactile, paysage, backdrop et échec de l'image pendant l'inspection : ajouter ces vérifications et une mise en page paysage à deux colonnes.
- `t(m.difficulty)` est présent, mais ses trois traductions sont absentes : compléter le dictionnaire.
- La question de coagulase n'a qu'un `recheck` générique. Ajouter un feedback serveur par distracteur, avec catalase habituellement positive et coagulase en tube négative pour les trois mauvais choix. Source : UK SMI ID 7, issue 5, 01.10.2026, sections 6.4.2 et tableau 2. La formulation de la remarque originale inversait ces signes ; préserver l'intention d'explication ciblée avec des faits corrects.
- Première suite complète : 445/446 réussites, unique erreur `route.fetch: Test ended` issue du mock d'un scénario précédent. Corriger le teardown en attendant les routes actives, sans ignorer leurs erreurs. Compléter la preuve du retour au laboratoire et de la sauvegarde en biochimie.
