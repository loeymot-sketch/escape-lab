# Escape Lab — registre de provenance des visuels

Date de l’audit : 15 octobre 2026.

Ce registre ne transforme pas une image en contenu libre de droits. Il recense uniquement ce que le dépôt permet de prouver aujourd’hui. Tant qu’une ligne n’a pas une source, une licence et une autorisation documentées par le propriétaire, l’image doit rester limitée à la démonstration locale/interne.

## Règle d’usage

- Les visuels scientifiques et les scènes de jeu sont déclarés illustratifs dans l’interface ; ils ne constituent pas une preuve clinique ni une identification automatique.
- Les coordonnées de réponses biomédicales restent validées par le serveur et ne sont pas déduites des pixels.
- Aucun fichier n’est supprimé ou recompressé par cet audit.
- Les empreintes SHA-256 servent à identifier exactement les fichiers contrôlés ; elles ne constituent pas une preuve de licence.

## État vérifiable dans le dépôt

| Groupe | Fichiers embarqués | Preuve locale | Statut de provenance/licence |
|---|---|---|---|
| Images d’observation microbiologique | `web/src/assets/culture-observation-01.webp` à `04.webp` | WebP 720×720, empreintes stables dans Git | À documenter avant diffusion pédagogique |
| Scènes de missions | `web/src/assets/mission-*.webp` | WebP 1400×934, référencées par `mission-scenes.ts` | Illustrations de démonstration ; source/licence à documenter |
| Décors de laboratoires | `web/src/assets/lab-*.webp` | WebP 1400×934, états verrouillé/ouvert couverts par E2E | Source/licence à documenter |
| Héros, coffre et trophée | `labescape-investigation-hero.webp`, `progression-vault.webp`, `mission-result-trophy.webp` | Actifs utilisés par les écrans correspondants | Source/licence à documenter |
| Assistant et schéma | `lab-assistant-robot.webp`, `chemistry-panel.svg` | Références directes dans le frontend | Source/licence à documenter |
| Scènes Master historiques | `mission-master-board.png`, `mission-master-case.png`, `mission-master-console.png`, `mission-master-exit.png` | PNG 1536×1024 présents dans Git | Source/licence à documenter |
| Alias publics optimisés | `web/public/2.webp` à `13.webp` | Certains octets sont identiques aux actifs `src/assets` correspondants | Conserver uniquement si l’alias est nécessaire ; provenance héritée de l’actif source |

## Empreintes de contrôle principales

Les fichiers sont contrôlés par leur chemin source et non par leur nom visuel :

```text
web/src/assets/blood-smear-hero.webp
  bcf771c36e5188b2fd3c3ef3008f5f2b09d3e0065ce6be2cec52eaf0b868f0c3
web/src/assets/mission-result-trophy.webp
  7928a7cd136059d566b87cbef0f33efadd6f2555584444cc0ae805ce49eaabbc
web/src/assets/progression-vault.webp
  79ba37304a3df6a7fc608f97bbabd2566da6e987b3a9acdc4a085ff92550c4e1
web/src/assets/chemistry-panel.svg
  65d4f92e9777ff9a4c8323f72039ed3e6049993b9f27642545beffbfd01f96b6
```

## Action requise avant une présentation publique

Pour chaque groupe, joindre au dépôt ou au dossier de présentation : le créateur ou fournisseur, la date d’obtention, la licence applicable, l’autorisation de modification/recadrage et la portée d’utilisation (école, concours, publication, déploiement). En l’absence de ces éléments, conserver la mention « simulation pédagogique — visuels illustratifs » et ne pas présenter les images comme des photographies scientifiques authentifiées.
