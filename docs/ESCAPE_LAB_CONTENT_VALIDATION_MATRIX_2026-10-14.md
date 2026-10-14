# Escape Lab — matrice de validation du contenu visuel

Cette matrice sépare les faits visibles dans les assets livrés, les corrections actuellement utilisées par le serveur et les éléments qui nécessitent encore une validation pédagogique/scientifique. Une image illustrative ne devient jamais une preuve clinique par simple présence dans l’interface.

## Règle de publication

Une zone interactive biomédicale ne peut être ajoutée que si les trois éléments suivants sont disponibles :

1. l’asset exact et sa version sont identifiés ;
2. la zone, son libellé et la réponse attendue sont relus par le responsable du contenu ;
3. un test confirme la correspondance entre la zone privée du serveur et le label public, sans exposer la correction au client.

## Zones actuellement jouables

| Étape | Asset | Observation utilisée | Position | État |
|---|---|---|---|---|
| `hem-01-s1` | `smear-schistocyte-01` | Schistocyte / fragment érythrocytaire | 73,6 % × 46,8 %, rayon 6 % | Point unique techniquement couvert ; validation scientifique externe encore requise |
| `bio-02-s1` / `hemolysis-index` | `panel-hemolysis-01` | Indice d’hémolyse | 18,1 % × 18,6 %, rayon 8 % | Première zone du pilote multi-zone ; position mesurée sur l’asset livré |
| `bio-02-s1` / `potassium-result` | `panel-hemolysis-01` | Résultat potassium | 55 % × 43,9 %, rayon 5,5 % | Deuxième zone du pilote multi-zone ; position mesurée sur l’asset livré |

Les deux zones de `bio-02-s1` sont aussi accessibles par une alternative textuelle contrôlée par `targetId`; les coordonnées et les sélections privées restent côté serveur.

## Observations microbiologiques disponibles

Les quatre images sont inspectables dans `mic-03-s1`, mais le parcours actuel reste volontairement une association observation → organisme, sans hotspots biomédicaux inventés :

| Observation déclarée par le contenu | Asset inspectable | Interaction actuelle | Pourquoi aucune zone n’est publiée |
|---|---|---|---|
| Colonies roses sur MacConkey | `culture-observation-01.webp` | Inspection visuelle puis association à *Escherichia coli* | La propriété porte sur l’aspect global de la boîte ; aucune sous-zone unique n’est définie dans le contenu validé |
| Bêta-hémolyse sur gélose au sang, cocci en chaînettes | `culture-observation-02.webp` | Inspection visuelle puis association à *Streptococcus pyogenes* | Les halos et colonies se chevauchent ; une coordonnée unique exigerait une relecture experte |
| Croissance en nappe | `culture-observation-03.webp` | Inspection visuelle puis association à *Proteus mirabilis* | Le motif est global et concentrique, pas une cible ponctuelle déjà validée |
| Pigment vert | `culture-observation-04.webp` | Inspection visuelle puis association à *Pseudomonas aeruginosa* | Le pigment couvre une large région ; aucune frontière de hotspot n’est approuvée |

## Garde-fous vérifiés

- Les coordonnées sont privées et validées par le serveur.
- Les labels publics et les cibles privées doivent rester en parité exacte.
- Les coordonnées doivent être finies, bornées et rattachées à l’asset exact.
- Les étapes sans cibles privées ne peuvent pas dissimuler des hotspots supplémentaires.
- Les visuels marqués `illustrative` ne sont pas présentés comme des résultats cliniques.
- Toute extension des images microbiologiques doit d’abord ajouter une ligne validée ici, puis un test de contenu et un scénario E2E correspondant.

## Décision au 14 octobre 2026

Le pilote multi-zone est publiable techniquement. L’extension multi-zone aux quatre observations microbiologiques et aux autres missions reste en attente d’une validation de contenu explicite ; cette attente est volontaire et empêche de déclarer le goal complet sur la seule base des tests logiciels.
