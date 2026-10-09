# Escape Lab — checklist de validation contenu biomédical

> **Note (tour 39, C39-006) :** ce document a été préparé par un assistant IA ; il n'est ni signé ni une revue par des experts biomédicaux.

Statut : **NON SIGNÉ — préparation du reviewer uniquement**  
Reviewer requis : spécialiste biomédical indépendant, distinct de l’implémenteur.

## Périmètre à examiner

| Mission | Famille UI | Points à valider |
|---|---|---|
| hem-01 | point/image | identité du schistocyte, coordonnées et rayon hotspot, image finale |
| hem-02 | decision | rejet/reprise/acceptation pré-analytique, valeurs et explications |
| hem-03 | choice/stepper | indices érythrocytaires, fer, diagnostic différentiel, recommandation |
| mic-01 | choice/stepper | identification microbiologique et indices associés |
| mic-02 | order | ordre de coloration de Gram et libellés opératoires |
| mic-03 | matching | correspondance morphologie/hémolyse/organisme |
| bio-01 | choice/stepper | interprétation du bilan d’organe et conduite associée |
| bio-02 | point/image | hotspot d’image, légende et interprétation de valeur |
| bio-03 | choice/stepper | urgence acido-basique, valeurs de référence et action |
| master-01 | choice/stepper | cohérence interdisciplinaire, fragments et réponse intégrée |

## Preuves techniques déjà disponibles

- Le catalogue et la cohérence interne sont vérifiés par `be/test/content.test.ts`.
- Les clés, explications, rechecks et hints sont conservés côté backend et ne sont pas exposés avant autorisation.
- Le workflow éditorial serveur `draft → reviewed → approved` est couvert par les tests backend et l’interface faculty.
- Les assets actuels sont explicitement marqués illustratifs/placeholders dans `be/src/content.ts` et doivent être remplacés ou approuvés avant publication.

## Décision du reviewer biomédical

- Exactitude des données et unités : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Exactitude des corrigés et explications : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Validité des rechecks et hints : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Images finales et coordonnées : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Validation globale G6 : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Blockers :
- Reviewer / date / signature :

Cette checklist ne constitue pas une validation clinique et ne ferme pas G6 sans signature.
