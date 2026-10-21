# Escape Lab — images, pixels et parcours de jeu

Campagne commencée le 12 octobre et poursuivie le 13 octobre 2026. Le nom du plan et du rapport conserve la date de démarrage. **Dernière version v4 : 519/519 E2E réussis, 7,7 min, sans mise à jour des 109 références ; aucun flaky/ignoré. Coffre : 33/33 ciblés puis 33/33 sans mise à jour ; focus : 20/20 répétitions.** Frontend350/350 après le fix de focus, backend274/274 dans la même campagne, build/typechecks/audits de production réussis. La validation est locale et bornée, pas une fermeture du goal ni une identité avec toutes les maquettes. Prévisualisation visible : **http://127.0.0.1:5176/**, démo isolée.

## Portée et verdict

Dépôt contrôlé : `/Users/1millnonstop/Downloads/escape-lab/escape-lab`. Node22.23.2. Prévisualisation actuelle vérifiée : http://127.0.0.1:5176/, API3102 ; l'ancien5175 ne répondait plus. Les relances utilisent séparément leurs serveurs de test et bases isolés.

Cette passe corrige l'intégration des images, le parcours de correction et plusieurs écarts précis des remarques. **Validation locale seulement** : elle ne publie rien sur GitHub/Vercel et ne constitue ni une validation biomédicale, ni un gate humain. Le goal global n'est pas accompli tant que ses exigences plus larges ne sont pas toutes prouvées. Dernière lecture du moteur de goal pendant la demande explicite « continue » : `usageLimited` (continuation automatique limitée), pas `complete` ; aucune tentative de modifier ce statut contrôlé par l'utilisateur.

## Dernières références du goal, une par une

Répertoire fourni : `/Users/1millnonstop/.codex/attachments/c1a922df-01f6-4b07-a9f5-0863e3035323/`.

| Image | Demande comprise | Intégration / preuve |
|---|---|---|
| 1 | Photo de culture avec hémolyse sur gélose au sang | Photo `culture-observation-02.webp`, avec sa description correspondante ; 720 × 720 ; inspection agrandie sans donner le nom de l'organisme dans l'URL ou le texte alternatif. |
| 2 | Photo de colonies roses | Photo `culture-observation-01.webp`, auprès de l'observation MacConkey ; mêmes contrôles de taille, proportion et consultation. |
| 3 | Photo de culture verte | Photo `culture-observation-04.webp`, auprès de l'observation de pigment vert ; sélections conservées pendant l'inspection. |
| 4 | Photo de croissance concentrique / swarming | Photo `culture-observation-03.webp`, auprès de l'observation de croissance envahissante ; aucun étirement ni découpage du contenu pédagogique. |
| 5 | Une image accompagne chaque phrase du défi de Petri | Quatre images chargées et quatre descriptions associées ; vignette ≥ 90 px rendus, fenêtre agrandie > 200 px, `object-fit: contain`. Tests des associations incomplètes et dupliquées, erreurs de chargement, réessai et focus. |
| 6 | Salles visibles dès l'arrivée, statistiques réduites, note de démo au bas | Les salles précèdent les statistiques ; premier titre de salle dans la première vue aux cinq formats portrait testés ; hauteur du bloc statistique < 150 px ; note après le guide, en bas. Les quatre grandes cartes restent naturellement défilables sur un téléphone : elles ne sont pas compressées pour prétendre toutes tenir sur un seul écran. |

Les quatre photos de culture ne sont pas remplacées par des illustrations générées. Les images décoratives de laboratoire ne servent jamais de données diagnostiques.

## Remarques antérieures, une par une

Numérotation des huit captures de remarques envoyées le 11 octobre, distincte de celle du goal ci-dessus.

| Capture | Point demandé | Preuve actuelle / limite |
|---|---|---|
| 1 | Master accessible après les missions des trois salles | Test backend explicite : toutes les missions standard terminées débloquent Master avant saisie des codes de sortie. Les nouveaux tests de porte passent par de vraies complétions serveur, puis un rechargement. |
| 2 | Sauvegarde et accès à la mission suivante en biochimie | `engines.spec.ts` termine bio-01, vérifie son statut, le bouton de bio-02 et la persistance après rechargement. |
| 3 | Ne pas clôturer une tentative valide avant la fin du timer | Tests d'autorité, expiration et concurrence ; une erreur réseau ne vaut pas disparition. Une vraie suppression serveur (404 après reset) clôture explicitement le dossier et propose de repartir. |
| 4 | Supprimer le grand bloc introductif / l'image de l'accueil | Accueil directement sur les salles ; preuve de production : absence de `.hero-science`. Le petit guide reste sous les salles, pas avant. |
| 5 | Après une mission intermédiaire, rester dans la même salle | Le bilan offre le retour aux missions du laboratoire ; test de biochimie et parcours complets. |
| 6 | Explication propre à chaque mauvais choix de coagulase | Feedback serveur par distracteur, traduit FR/EN, sans fournir l'organisme correct. Les signes de la remarque étaient inversés : les mauvais choix ont habituellement une catalase positive et une coagulase en tube négative. Source primaire : [UK SMI ID 7, issue 5, sections 6.4.2 et tableau 2](https://www.rcpath.org/asset/DB5F13CB-53CA-4E9E-A0937B78B610D0AC/). Cette correction ponctuelle ne valide pas tout le contenu biomédical. |
| 7 | Expliquer que MCV est la taille moyenne des globules rouges | Explication présente en français et en anglais, vérifiée sur la correction de l'étape ; aucune nouvelle question n'apparaît sous l'explication de la précédente. |
| 8 | Vocabulaire et ordre de Gram demandés | Séquence à six étapes existante conservée ; moteur d'ordre vérifié au clavier et sur mobile. Pas de modification scientifique supplémentaire dans cette passe. |

## Fidélité au thème de jeu

- Palette navy/cyan/or, cartes de laboratoires nommées, état de progression serveur, choix FR/EN persisté, boutons accessibles. Les nombres de scores et de fragments viennent du serveur : ceux des maquettes ne sont pas copiés comme faux résultats.
- Après une réponse correcte non finale : réponse figée, correction verte, explication consultable, puis bouton doré **Continuer**. L'avancement serveur est déjà sauvegardé ; Continuer n'envoie aucun POST.
- Rechargement : reprise à l'étape sauvegardée, jamais renvoi de la précédente réponse. Mise à jour distante, expiration ou reset : invalidation de la correction périmée. Dernière question : bilan et explication finale.
- Master dispose maintenant d'une vraie porte métallique violette, trois emblèmes scientifiques et cadenas central ; le coffre n'est plus réutilisé comme porte. Variante à cadenas ouvert pour une salle accessible / une mission Master autorisée.
- Les libellés et états restent en HTML traduisible ; ils ne sont pas gravés dans les images. Les visuels ne constituent pas une reproduction pixel à pixel de l'ensemble des maquettes : la comparaison de pixels ci-dessous mesure les régressions du rendu réel.
- Contrôle du navigateur local : le bouton microbiologie était activé mais hérité de l'ancien thème clair, avec texte `rgb(0, 73, 75)` et soulignement. La spécificité CSS est corrigée : texte `rgb(155, 237, 255)`, sans soulignement. Les trois boutons des salles ont une vérification de luminance contre le fond navy des cartes ; cinq nouvelles références capturent la carte microbiologie complète, pas uniquement sa photo.
- La revue a aussi trouvé le titre de Master verrouillé trop sombre (`rgb(65, 89, 94)`), confirmé dans le navigateur. Il est désormais blanc (`rgb(246, 251, 255)`), explicitement testé. Les huit captures Master de l'accueil couvrent les cartes complètes, verrouillées et accessibles, avec contrôle du bouton violet après déverrouillage.

## Mesures et comparaisons de pixels

Formats vérifiés pour les quatre photos et la fenêtre : **320 × 568, 375 × 812, 390 × 844, 568 × 320, 667 × 375, 768 × 1024, 844 × 390, 1280 × 900**. Formats supplémentaires Master : 320, 390, 768 et 1280 px.

Contrôles : dimensions intrinsèques/rendues, proportions, rectangles des contrôles, absence de chevauchement, absence de débordement horizontal, lecture complète de la fenêtre en paysage, clavier/tactile, fermeture par Échap/bouton/backdrop, retour du focus, Tab/Shift+Tab, verrou de défilement restauré, associations préservées, photo en échec puis réessai. Le bandeau timer/langues est testé avec fenêtre ouverte et fermée.

40 références locales sous `web/e2e/image-integration.spec.ts-snapshots/` et `web/e2e/step-review.spec.ts-snapshots/` : 16 photos/fenêtres, 3 corrections, 16 scènes Master et 5 cartes microbiologie complètes. Tolérance : ratio maximal de pixels différents 0,002 ; les animations sont neutralisées pour ces captures. Pour le composant d'observations et le héros Master, `stylePath` exclut l'occlusion du bandeau sticky pendant la capture du composant ; les preuves pleine page et tests du bandeau restent sans masque. La première option `style` n'était pas prise en compte par cette assertion et a été corrigée après inspection réelle des PNG. Le chemin de ce CSS est absolu, résolu depuis le fichier de test, pas depuis le répertoire de lancement.

Ces références sont macOS/Chromium : elles ne prouvent pas le rendu d'un vrai iPhone/Safari ni de Firefox. L'iPhone 13 de la suite est une émulation sur Chromium.

## Campagne de validation

| Contrôle | Preuve obtenue |
|---|---|
| Backend | 274/274 tests réussis ; typecheck réussi. |
| Frontend | 350/350 tests réussis (23 fichiers). |
| E2E avant ajout de la porte dédiée | 457/457 réussis, sans mise à jour des références de pixels. |
| E2E après porte Master dédiée verrouillée | 461/461 réussis ; 6,4 minutes. |
| Dernière suite complète — 13 octobre | **463/463 réussis, 7,1 minutes**, sans mise à jour des 40 références de pixels, après toutes les corrections décrites ici. Chromium, iPhone 13 émulé sur Chromium et bundle de production. Artefacts : `final-cards-all/`. |
| Derniers ajouts | 32/32 scénarios ciblés réussis après variante ouverte, capture des cartes complètes, corrections de contraste et deux cas correction réseau/double Continuer. Les mises à jour de références étaient intentionnelles et contrôlées, puis la suite complète a confirmé le rendu sans les réécrire. |
| Dépendances | Audits backend et frontend : 0 vulnérabilité rapportée. Ce n'est pas une revue de sécurité exhaustive. |
| Build configuré | Réussi après variantes et corrections de contraste : entrée JS 394 610/400 000 o, JS différé 102 796/160 000 o, CSS 117 364/120 000 o ; 12 images individuelles ≤ 300 000 o. |
| Revue indépendante | Claude terminal, lecture seule : PASS sur le parcours Continuer et les variantes Master ; addenda CTA/titre ont identifié les deux défauts de cascade et ils sont corrigés. Dernier contrôle statique et des PNG complets : PASS, aucun défaut reproductible dans ce périmètre. Le reviewer n'a pas exécuté les tests et ne signe pas de gate humain. |

Commandes de reproduction, depuis `web/`, avec Node 22.23.2 dans le PATH :

```sh
npm test
VITE_API_URL=/api npm run build
E2E_DB_PATH=/tmp/escape-lab-final-cards-20261013.db E2E_PROD_PORT=4383 E2E_UNCONFIGURED_PORT=4384 npx playwright test --max-failures=5
```

Depuis `be/` : `npm test`, `npm run typecheck`, `npm audit --audit-level=high`. Les bases E2E sont dédiées et ne sont pas les données de l'utilisateur. Les artefacts locaux transitoires sont dans `.ci-artifacts/visual-gameplay-2026-10-12.wt3IDt/` et ignorés par Git ; les références de pixels restent versionnables. Aucun commit/push/publication n'a été effectué par cette passe.

Traçabilité des relances : le run `final-open-all` a été interrompu volontairement (260 réussites, 1 test interrompu, 202 non exécutés) après découverte du défaut de contraste du bouton dans le navigateur local ; le run `final-cta-all` a ensuite été interrompu (203 réussites, 1 test interrompu, 259 non exécutés) pour corriger le titre Master confirmé trop sombre. Aucun de ces deux runs n'est compté comme une suite complète réussie. Les deux corrections sont couvertes par le run final `final-cards-all`, 463/463 réussi ; aucune relance n'est motivée par un simple timeout d'observation.

## Assets décoratifs générés — provenance et prompts

Guide utilisé : ImageGen, outil intégré, sans fallback API/CLI. Conversion de format et optimisation WebP par l'encodeur local, pas de retouche des photos pédagogiques.

- Actif verrouillé : `web/src/assets/lab-master.webp`, 1400 × 934, **183 378 octets**.
- Actif accessible : `web/src/assets/lab-master-open.webp`, 1400 × 934, **161 122 octets**.
- Référence de style : image utilisateur `/Users/1millnonstop/Downloads/f522e9ee-67c5-48a7-b640-2a8ff44fd9f3.JPG`, partie Master. Les fichiers fournis ne sont pas modifiés.

Prompt verrouillé, tel qu'envoyé :

> Use case: precise-object-edit. Asset type: dedicated Escape Lab Master room game environment banner. Input image 1 is the user's visual reference; derive ONLY the violet Master laboratory door pictured in the LOWER card, not the amber biochemistry door above it. Create a standalone wide landscape 3:2 cinematic polished realistic 3D laboratory scene, with the full tall armored metal door centered and large, purple neon perimeter, a central round locking mechanism with a gold padlock and three small round scientific emblems arranged around it: red blood drop above, cyan microbe bottom left, violet flask bottom right. Dark navy high-tech laboratory, subtle cyan highlights, glass racks of violet-capped tubes and analytical instruments at the sides, reflective metal, amber accent light. Preserve the reference's atmosphere and identity. All of the door's three emblems and center lock must fit inside the central half of the image so they survive a shallow banner crop on a narrow phone. Remove ALL screenshot UI: no cards, no headings, no status badges, no numbers, no counters, no words, no logos, no watermarks. Do not add people, trophies or a chest. This is decorative environment artwork, not a diagnostic image. Output one clean high-detail standalone environment image.

Prompt variante ouverte, tel qu'envoyé :

> Use case: precise-object-edit. Input image 1: edit target, the dedicated Master door environment from our game. Make one small state variant for the same game scene: change ONLY the central gold padlock so its shackle is visibly OPEN and rotated sideways, clearly communicating unlocked access. Keep its gold body centered in the same round housing. Keep the door, three neon emblems (red blood drop, cyan microbe, violet flask), all surrounding laboratory equipment, navy/cyan/purple/amber lighting, camera, framing, aspect ratio, and textures unchanged. Do not add any text, numbers, interface, check marks, people or other objects. Do not redesign the scene. Output one high-detail landscape image with the same composition.

## Limites et suite du goal

- Le défaut connu S-1 de Blood Smear Code (alternative pour un élève qui ne voit pas l'image) n'est pas fermé par un zoom accessible ou par ces captures. Il nécessite une vraie évaluation pédagogique équivalente, pas la divulgation du corrigé.
- CI distante reproductible, revue biomédicale/enseignants et gate humain de release : non acquis. Aucun « sans faute » ou « prêt pour la production » n'est déclaré.
- Les budgets JS/CSS passent mais leur marge est faible ; toute nouvelle gamification doit les respecter.
- La conformité de toutes les pages à chaque maquette et l'usage avec lecteur d'écran réel ne sont pas déduits de quelques captures vertes. Continuer ces contrôles avant fermeture du goal général.
- Écart constaté à la clôture de la passe Master : les trois salles standard utilisaient encore des intérieurs plutôt que les portes rouges/cyan/or des maquettes. Il est traité dans la suite ci-dessous ; ne pas déduire sa validation complète de la preuve antérieure.

## Auto-contrôle de la passe

Invariants : décisions métier serveur ; aucune clé de réponse dans les actifs/URL d'observations ; sélection préservée par l'inspection ; correction mémoire non autoritaire ; Continuer sans mutation ; fichiers sources synchronisés et données personnelles préservés. FoodKing prix/OrderStatus/branch_id/dispatch/parité OrderService : non applicables à ce dépôt, aucune zone correspondante modifiée. Aucune migration ou zone frozen touchée.

**VERDICT technique local de cette passe : PASS dans le périmètre documenté. VERDICT de release : ESCALATE.** Ce rapport distingue les corrections prouvées et les exigences encore ouvertes ; il ne ferme pas le goal général.

## Preuves visuelles versionnables

Carte Master verrouillée, français, 390 px :

![Carte Master vérifiée à 390 px](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/image-integration.spec.ts-snapshots/master-locked-390-chromium-darwin.png)

Carte microbiologie et bouton corrigé, 390 px :

![Carte microbiologie et contraste du bouton](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/image-integration.spec.ts-snapshots/microbiology-card-390-chromium-darwin.png)

Inspection de photo en paysage, 568 × 320 px :

![Photo intégrale en fenêtre paysage](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/image-integration.spec.ts-snapshots/inspection-568x320-chromium-darwin.png)

## Suite du 13 octobre — portes des trois salles standard

Les chiffres 463/463 et les 40 références de pixels ci-dessus décrivent la passe Master/Continuer déjà validée. La présente suite apporte les trois portes rouge/cyan/or à la version courante ; sa validation complète ne doit pas être déduite de cette passe précédente.

Trois actifs frères sont intégrés aux cartes et aux héros ; les anciens décors sont conservés dans les sources mais ne sont plus utilisés par ces écrans. Le nom dans la scène est un vrai texte HTML, traduit FR/EN ; les glyphes sont propres à chaque discipline. Les photos de Petri et le frottis d'hématologie ne sont pas remplacés.

| Actif | Dimensions | Poids |
|---|---|---:|
| `web/src/assets/lab-hematology-door.webp` | 1400 × 934 | 162 534 o |
| `web/src/assets/lab-microbiology-door.webp` | 1400 × 934 | 205 548 o |
| `web/src/assets/lab-biochemistry-door.webp` | 1400 × 934 | 176 786 o |

Outil intégré ImageGen, guide appliqué pour des décors de jeu bitmap, conversion locale WebP, pas de fallback API. Références : `88cdf830-b158-4c60-8499-a3f0efaf4a18.JPG` pour hématologie/microbiologie et partie supérieure de `f522e9ee-67c5-48a7-b640-2a8ff44fd9f3.JPG` pour biochimie.

Preuve obtenue : 12/12 nouveaux parcours ciblés initiaux puis 56/56 scénarios combinés, après rework de la revue et création de 49 références propres aux portes (48 cartes FR/EN, carte générale et héros ; 1 bandeau de résultat). Avec les 40 références précédentes, 89 captures sont contrôlées. Formats : 320/390/768/1280 px pour les portes, huit formats pour les photos. Les contrôles comprennent les libellés FR/EN, la troncature réelle (scrollWidth/scrollHeight), les collisions avec numéro/état/emblème/verrou, le budget WebP et la conservation du frottis (dimensions/proportions/cible de pointage), des quatre photos de culture et des valeurs de biochimie. Les 12 fixtures d'état verrouillé sont des simulations explicites de contrat de présentation, pas une preuve de déverrouillage réel.

Deux reworks confirmés : barre de séparation isolée dans le bandeau de mission quand les textes reviennent à la ligne ; puis textes collés après masquage de cette barre. Les textes ont maintenant des spans distincts, un espace explicite et un vrai écart géométrique vérifié. Le masquage mobile ne touche que la mission, pas le bilan, dont le texte est vérifié après une vraie réponse correcte. La dernière revue statique/PNG indépendante Claude conclut PASS dans ce périmètre, sans prétendre avoir exécuté les tests.

La première suite complète sur les portes a donné 486/487 réussites : une inscription de test supplémentaire pour une fixture dépassait le garde existant de 30 registrations, dans le cas d'état vide des résultats. Les fixtures réutilisent maintenant la session démo, sans relever ce garde ni assouplir le limiteur serveur. Cette passe échouée est conservée comme preuve, et n'est pas déclarée réussie. Les captures des cartes sont aussi normalisées sans survol (souris à 0,0) pour ne pas figer un zoom aléatoire causé par le défilement. La validation complète sans mise à jour sur la version corrigée reste à obtenir.

État vérifié après rework : revue indépendante finale **PASS** après inspection statique et PNG des bandeaux mission/bilan ; 56/56 ciblés réussis après normalisation du pointeur. La suite `standard-doors-final-v2` s'est arrêtée à 276 réussites / 5 échecs / 206 non exécutés : les cinq échecs sont des sélecteurs exacts devenus ambigus entre le bandeau fixe et la scène. Les 12 assertions concernées ciblent maintenant `.player-title` explicitement, en conservant toutes leurs vérifications de reprise, pénalités et résultat ; elles ne prennent pas arbitrairement le premier élément. L'addendum de revue confirme ce ciblage plus précis sans affaiblissement des contrôles. Aucun changement produit n'a été fait pour contourner ces assertions.

**Dernière suite complète : 487/487 réussis, 7,4 minutes**, run `standard-doors-final-v3`, **sans mise à jour** des 89 références. Chromium, iPhone 13 émulé sur Chromium et bundle production. **Seconde exécution ciblée : 56/56 réussis, 1,5 minute**, `standard-doors-repeat`, également sans mise à jour. Ces deux exécutions consécutives confirment la stabilité locale des captures sur la même version. Backend 274/274 rejoué, typecheck backend réussi, audits backend/frontend à 0 vulnérabilité rapportée. Le contrôle `git diff --check` est également réussi. La revue indépendante demeure statique/PNG, pas un gate humain ; aucune CI distante ou validation biomédicale n'est déclarée.

Build de cette version : JS principal 395 891/400 000 o, JS différé 102 796/160 000 o, CSS 117 829/120 000 o, 12 rasters tous sous 300 000 o ; frontend 350/350 réussi. Les marges ne sont pas augmentées pour faire passer le changement.

Prompts exacts :

### hematology

> Use case: precise-object-edit. Asset type: standalone decorative game environment for Escape Lab. Input image 1 is the user's supplied reference screenshot. Extract and re-compose ONLY the UPPER hematology laboratory card: RED neon armored lab entrance, a partly open metal door bearing one glowing red BLOOD DROP emblem, blood tubes and microscope at the sides. Preserve its cinematic polished realistic 3D look, dark navy scientific laboratory, cyan ambient light, warm amber reflections, metal rivets and glass details. Output a wide 3:2 landscape scene, eye-level, doorway large and centered, one unmistakable discipline emblem inside the central half of the image, with the full doorway and surrounding laboratory visible. Keep the emblem in the middle vertically so a shallow phone banner crop retains it. Remove ALL screenshot UI and ALL lettering including the door's written name: no words, numbers, status badges, cards, scores, fragments, buttons, logos or watermark. A clean blank metal nameplate is fine; real translated names will be rendered in the website. No padlock, chest, trophy or person. This is illustrative environment artwork, not a diagnostic image. One environment only; no collage.

### microbiology

> Use case: precise-object-edit. Asset type: standalone decorative game environment for Escape Lab. Input image 1 is the user's supplied reference screenshot. Extract and re-compose ONLY the LOWER microbiology laboratory card: CYAN neon armored lab entrance, a partly open metal door bearing one glowing cyan circular MICROBE emblem, Petri plates and microscope at the sides. Preserve its cinematic polished realistic 3D look, dark navy scientific laboratory, cyan ambient light, warm amber reflections, metal rivets and glass details. Output a wide 3:2 landscape scene, eye-level, doorway large and centered, one unmistakable discipline emblem inside the central half of the image, with the full doorway and surrounding laboratory visible. Keep the emblem in the middle vertically so a shallow phone banner crop retains it. Remove ALL screenshot UI and ALL lettering including the door's written name: no words, numbers, status badges, cards, scores, fragments, buttons, logos or watermark. A clean blank metal nameplate is fine; real translated names will be rendered in the website. No padlock, chest, trophy or person. This is illustrative environment artwork, not a diagnostic image. One environment only; no collage.

### biochemistry

> Use case: precise-object-edit. Asset type: standalone decorative game environment for Escape Lab. Input image 1 is the user's supplied reference screenshot. Extract and re-compose ONLY the UPPER clinical biochemistry laboratory card ONLY, not the purple Master door below: AMBER GOLD neon armored lab entrance, a metal door bearing one glowing gold ERLENMEYER FLASK emblem, glass sample tubes and analytical equipment at the sides. Preserve its cinematic polished realistic 3D look, dark navy scientific laboratory, cyan ambient light, warm amber reflections, metal rivets and glass details. Output a wide 3:2 landscape scene, eye-level, doorway large and centered, one unmistakable discipline emblem inside the central half of the image, with the full doorway and surrounding laboratory visible. Keep the emblem in the middle vertically so a shallow phone banner crop retains it. Remove ALL screenshot UI and ALL lettering including the door's written name: no words, numbers, status badges, cards, scores, fragments, buttons, logos or watermark. A clean blank metal nameplate is fine; real translated names will be rendered in the website. No padlock, chest, trophy or person. This is illustrative environment artwork, not a diagnostic image. One environment only; no collage.

Preuves visuelles des nouvelles portes :

![Hématologie, carte française à 320 px](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/laboratory-doors.spec.ts-snapshots/hematology-card-320-chromium-darwin.png)

![Microbiologie, carte française à 390 px](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/laboratory-doors.spec.ts-snapshots/microbiology-card-390-chromium-darwin.png)

![Biochimie, libellé anglais entier à 768 px](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/laboratory-doors.spec.ts-snapshots/biochemistry-card-en-768-chromium-darwin.png)

Écarts globaux non clos par cette passe : la navigation mobile garde six rubriques au-dessus de l'accueil, tandis que les références montrent un bandeau de jeu plus compact et des raccourcis Salles/Coffre/Badges ; le bilan utilise un décor de salle avec une icône de trophée, pas encore la grande scène de trophée de la maquette ; la disposition coffre/badges/classement et les scènes de chaque question restent à confronter aux références page par page. Ces points sont une suite d'implémentation, pas des blockers empêchant le travail actuel.

**VERDICT de cette suite portes : PASS technique local dans son périmètre. Goal global : toujours actif. Release : ESCALATE**, conformément aux limites précédentes. Aucun fichier scientifique, aucune migration, aucun secret et aucune donnée utilisateur n'ont été changés dans cette suite ; les anciens actifs restent conservés. Aucun commit, push ni déploiement n'a été effectué.

## Suite du 13 octobre — navigation compacte et vrais écrans de jeu

Le téléphone ne montre plus une grille de six rubriques au-dessus des laboratoires. Il garde la marque/signature, le choix FR/EN et une barre persistante de trois accès Salles/Coffre/Badges ; les autres rubriques sont dans le menu. Sur ordinateur, les huit accès restent disponibles dans la barre latérale ; la vue enseignant garde ses quatre rubriques, sans accès étudiant indûment ajouté. Les questions et bilans plein écran n'ont pas cette barre.

Le coffre charge uniquement coffre/laboratoires ; les badges uniquement badges ; le classement uniquement classement. Chacun a son chargement, son erreur et son vrai Réessayer, sans calcul métier local. Les assertions historiques de badges/classement ont été déplacées sur leurs vrais écrans, et les scénarios de panne/lenteur/payload invalide ont été ajoutés pour chacun. Les parcours de mission ne sont pas supprimés.

Preuves nouvelles : `web/e2e/game-navigation.spec.ts`, 17 scénarios, 18 PNG versionnables. Largeurs 320/390/600/601/768/1280 px, français/anglais, clavier et menus, changements de rôle, absence de toute mutation de navigation (pas seulement les POST), erreurs isolées, menu court défilable, annulation de remise à zéro et absence de masquage des dernières cartes/contrôles clavier. Les captures de page gardent la vraie barre ; seules les captures isolées de composants masquent le chrome fixe. Une comparaison de pixels est un garde de régression locale, pas une certification d'égalité avec les maquettes utilisateur. Cette campagne totalise 107 PNG : 18 navigation, 37 intégration, 49 portes et 3 correction.

Inspection des premiers PNG : défaut confirmé du menu blanc hérité avec texte clair, corrigé en navy/cyan avec couleurs calculées et axe du menu ouvert. Première passe `navigation-first` : 68 réussites, 4 échecs pour références encore absentes ; les contrôles fonctionnels avaient continué, les images initiales sont inspectées, les deux menus sont recréés après correction. `navigation-menu-rework` : 11/11 réussis, 29,9 s. La suite complète `navigation-all` (504 scénarios) s'est arrêtée : 107 réussites, 5 échecs, 392 non exécutés et une erreur de teardown ; elle n'est pas une validation complète. Les rapports confirment un parcours Tab trop court et un helper qui cherchait immédiatement le menu mobile pendant la transition de rôle au bureau. Ces tests ont été corrigés sans retirer les vérifications métier.

Revue indépendante initiale : NEEDS_FIX. Corrections réalisées : recalcul de hauteur au défilement ; retour en haut et focus lors d'un clic sur l'onglet déjà actif ; focus préservé au passage 600/601 ; `aria-current="true"` pour la catégorie Salles dans la carte, avec une seule page courante. Vérifications supplémentaires : axe du menu ouvert FR/EN, dernier contrôle accessible au clavier au-dessus de la barre, navigation des huit rubriques GET-only, isolation API du rôle enseignant, chargement tardif et navigation pendant une remise à zéro. Le coffre dépend volontairement de `/labs` pour les noms ; l'indépendance constatée concerne badges/classement, pas une tolérance à toute panne de `/labs` dans le coffre.

Après ces reworks, `navigation-review-rework` : **26/26 réussis**, **37,96 s**, aucun flaky ni ignoré, sans réécriture des références ; rapport HTML vérifié (17 navigation, 1 clavier, 8 régressions). Suite complète `navigation-final-all` de **510 scénarios** et addendum de revue indépendante en cours : aucune réussite globale annoncée avant résultats terminaux.

Frontend 350/350 et backend 274/274 rejoués, typechecks et build configuré réussis ; audits précédents des dépendances de production à 0 vulnérabilité rapportée ; `git diff --check` réussi. Build courant : JS principal 398 374/400 000 o, JS différé 103 441/160 000 o, CSS 119 723/120 000 o, 12 rasters tous ≤300 000 o. Aucun budget n'est relevé. Le navigateur utilisateur à 5175 avait montré effectivement la nouvelle navigation et les portes en français lors de la vérification précédente, sans réinitialiser sa session ; cette observation n'est pas une preuve de disponibilité permanente du serveur local.

![Menu de jeu corrigé, 320 px](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/game-navigation.spec.ts-snapshots/menu-320-chromium-darwin.png)

![Accueil français, 320 px](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/game-navigation.spec.ts-snapshots/rooms-fr-320-chromium-darwin.png)

Toujours à traiter/valider pour le goal général : scène de trophée du bilan, présentation visuelle dédiée des badges/classement et coffre avec portes miniatures, scènes propres aux questions ; limites S-1, Safari/lecteur d'écran réels, validation biomédicale, CI distante et gate humain précédemment documentées. La séparation fonctionnelle des écrans et les captures actuelles ne ferment pas ces exigences.

### Second rework et contrôle des références

La revue statique/PNG de l'addendum a conclu NEEDS_FIX : marge droite insuffisante du menu à 320 px et assertion négative qui n'attendait pas la réponse retardée. Marge corrigée à ≥12 px ; les réponses sont maintenant attendues jusqu'à leur fin de téléchargement, puis les routes et deux frames sont traitées avant les assertions. La preuve du garde de requêtes concurrentes dans le même composant reste le test unitaire fail-capable `ui/state.test.tsx`, pas un changement de rubrique qui démonterait naturellement l'ancien composant.

Extensions : menu français et menu enseignant à 320 px avec axe et PNG, fermeture en paysage sans franchir 600/601, derniers vrais tab stops (bouton, lien, champ, checkbox, summary) des écrans secondaires et d'un panneau Réessayer, passage enseignant depuis coffre/badges/classement avec journal des requêtes, réponses tardives de coffre/laboratoires/classement. La page de résultats réussie n'a aucun contrôle tabulable : le test vérifie ce fait et sa dernière ligne au-dessus de la barre, sans inventer de bouton ni déclarer un focus inexistant.

Runs conservés comme preuves d'échec, pas comme validations : `navigation-final-all`, 366 réussites/5 échecs/139 non exécutés, 6,9 min, et une erreur de teardown après max-failures ; `navigation-second-review`, 65 réussites/15 échecs, 2,4 min. Le premier repère le vieux scénario qui mocke `/vault` mais ouvre Classement ; il ouvre désormais Coffre et garde les assertions de réentrée 401. Le second distingue douze différences de références, deux nouvelles captures automatiquement créées et l'exigence erronée de contrôle interactif dans les résultats en lecture seule.

`navigation-reviewed-pixels` : **36/36 réussis**, **1,2 min**, avec renouvellement intentionnel des seules références affectées par l'origine/hauteur du chrome mobile et le correctif de marge. Vérification SHA-256 avant/après : **26 PNG modifiés** (1 menu 320, 8 cartes/carte Master/microbiologie à 320–390, 17 cartes/carte générale des salles à 320–390) ; **aucune** référence de photo/fenêtre d'inspection ou de correction modifiée. Les 2 nouvelles captures portent le total à **109 PNG**. Les PNG de portes/cartes ont été inspectés ; proportions, libellés et contrôles géométriques restent vérifiés. Tolérance inchangée à 0,002, aucun budget ni timeout relevé.

Build après marge : entrée JS 398 374/400 000 o, JS différé 103 441/160 000 o, CSS **119 752/120 000 o**, 12 rasters ≤300 000 o. Audits de dépendances de production rejoués : 0 vulnérabilité rapportée ; typecheck backend et contrôle des diffs réussis. Suite complète **518** scénarios `navigation-final-v2` sans mise à jour et revue statique/PNG finale encore en cours. Leur résultat terminal reste requis.

### Maquettes du thème de jeu : fidélité distincte des tests fonctionnels

Numérotation des huit JPG de thème fournis, distincte des photos de culture et des captures de remarques.

| JPG | État réel de la version actuelle |
|---|---|
| 1 — bilan/trophée | Grande scène dédiée intégrée, coupe/socle entiers sans texte gravé ; vrais chiffres serveur, langues, carte de score, précision/temps et actions vérifiés. Rework et contrôles détaillés en fin de rapport ; comparaison locale de pixels, pas identité exacte avec le JPG. |
| 2 — décision sur S3 | Réponses, données, validation et géométrie des contrôles testées ; décor spécifique de l'échantillon/automate encore à traiter. |
| 3 — classement | Vrai écran séparé, classement serveur, noms/rang/états et responsive testés ; décor de podium/médailles non encore reproduit. |
| 4 — badges | Vrai écran de sept badges et états serveur ; collection illustrée et médaillons de discipline encore à intégrer. |
| 5 — coffre | Fragments et sorties serveur, codes réels et navigation compacte ; porte miniature de chaque salle et composition du grand coffre encore à améliorer. |
| 6 — hématologie/microbiologie | Portes rouge/cyan, emblèmes, noms FR/EN, états et boutons intégrés ; cadrage/collisions/chargement et pixels testés. Pas une égalité pixel à pixel avec le JPG. |
| 7 — biochimie/Master | Portes or/violette, variante Master accessible, noms et états intégrés ; véritables déverrouillages serveur et géométrie testés. |
| 8 — correction/Continuer | Réponse figée, correction verte, explication, indice et Continuer sauvegardés sans double mutation ; robot illustré et scène propre à chaque étape encore à traiter. |

Cette matrice évite de confondre « parcours fonctionnel testé » et « maquette reproduite entièrement ». Elle ne ferme pas le goal général.

### Contrôle final de navigation — alignement et focus natif

`navigation-final-v2` est terminé : **518/518 réussis, 8,9 min**, aucun retry, sans mise à jour des **109 PNG**, vérifiés identiques par SHA-256. La revue Claude suivante est **PASS borné**, en lecture statique/PNG uniquement. Elle ne signe aucun gate humain et n'a pas exécuté les tests. Elle relève le double inset de l'en-tête étudiant, un Tab implicite non couvert sur les résultats, et des limites de preuve sur la course reset/navigation et le menu enseignant.

Correctif de présentation : en-tête aligné à gauche/droite sur les cartes, sans deuxième padding horizontal ; largeur maximale du menu 100vw−32px, donc 16px de marge à 320px, au lieu d'une égalité fragile à 12px. Les contrôles vérifient réellement ces deux alignements. Un vrai Tab depuis le titre des résultats doit maintenant atteindre la première entrée de la barre (il détecterait aussi un scroller implicitement focusable) ; la remise à zéro attend son retour réseau livré/terminé et deux frames, sans prétendre avoir bloqué un second chargement tardif de badges. Tous les boutons du menu enseignant sont vérifiés intégralement dans son viewport et au-dessus de la limite basse de 12px.

`navigation-aligned-check` : 20 réussites/5 échecs de PNG, 56,9 s. Différences d'alignement attendues, inspectées EN/FR/enseignant ; elles ne sont pas ignorées. `navigation-aligned-pixels` : **24/25**, 1,0 min, renouvellement intentionnel des captures, mais découverte d'un vrai défaut de focus au passage 600→601. Pas déclaré vert. Quatre répétitions pré-fix ont échoué avec trace dans `navigation-resize-before` ; run arrêté pour corriger : 4 échecs, 1 interrompu et 5 non exécutés.

Cause : le navigateur peut rendre `document.activeElement` au body en masquant le contrôle, avant le callback de media query. Le Shell mémorise maintenant le dernier focus non-body et rend le titre uniquement si ce contrôle existe encore mais devient caché et le focus courant est absent/body ; un focus visible dans le contenu n'est pas volé. Listener retiré proprement au démontage. Le scénario existant reste inchangé dans ses assertions ; un nouveau scénario couvre bouton de barre mobile, bouton latéral et checkbox visible dans les deux directions. `navigation-resize-after` : **20/20 réussis, 26,2 s** (deux scénarios, dix exécutions chacun, retries=0, aucune mise à jour PNG).

Pour l'alignement, **16 PNG de navigation** ont changé intentionnellement ; les **89 autres**, dont photos/fenêtres/portes/corrections, sont identiques par SHA-256. Total inchangé : 109 = 20 navigation + 37 intégration + 49 portes + 3 correction. Il y a maintenant 26 scénarios de navigation et 519 E2E. La suite `navigation-final-v3`, sans mise à jour des références, et l'addendum de revue final sont en cours ; leur résultat terminal est requis pour cette dernière version.

Réserves non fermées par cette tranche : note enseignant trop sombre, quatrième raccourci Guide isolé et persona tronquée à 320px ; vrai zoom texte, Safari/WebKit/lecteur d'écran et safe-area sur appareils réels ; références de CI Linux. Les tests locaux macOS/Chromium ne certifient ni ces plateformes ni une identité avec les JPG. Les écarts de la matrice de maquettes et la validation biomédicale/humaine restent ouverts. Aucun fichier frozen/migration, secret, donnée utilisateur ou configuration Claude externe n'est modifié.

Build après fix de focus : JS principal **398 662/400 000 o**, différé **103 441/160 000 o**, CSS **119 749/120 000 o**, 12 rasters ≤300 000 o. Frontend **350/350**, 23 fichiers, 2,70 s, contrat d'API, centralisation client, typechecks tests et `git diff --check` réussis. Aucun budget ni timeout augmenté. Dépôt Git effectif vérifié à nouveau : `/Users/1millnonstop/Downloads/escape-lab/escape-lab`, origin `loeymot-sketch/escape-lab`, HEAD `eeb9de6`. Le diff local reste non commité/non poussé ; il n'est pas présenté comme une nouvelle version Vercel.

### Cadre du coffre — défaut réellement mesuré, pas simple impression de capture

La suite `navigation-final-v3` a terminé **519/519, 8,0 min**, sans mise à jour. Rapport HTML lu : total/expected519, unexpected0, flaky0, skipped0 ; Chromium, iPhone13 émulé sur Chromium et bundle de production. La revue en lecture seule de l'alignement/focus a confirmé PASS borné, et a observé un possible dépassement interne dans le coffre, hors du contrôle de document. Ce run vert ne pouvait pas prouver une géométrie qui n'était pas encore mesurée.

`navigation-panel-before` ajoute un vrai contrôle : le test échoue sur les quatre cartes à 320px, de x=33 à **315**, pour une boîte de contenu de **33 à 287** et un bord externe de panneau à304. Dépassement interne28px / externe11px malgré aucune barre de défilement de document. Cause : taille minimale intrinsèque de la piste implicite de grille. Une seule déclaration la corrige : `.vault-cards { grid-template-columns: minmax(0,1fr); }`. Aucun `overflow:hidden`, aucun masquage de titre, code, image ou formulaire ; aucun changement métier/API.

Le contrôle est fait aux six largeurs de navigation, en EN et FR320, pour les quatre cartes du coffre et sept lignes de badges. Il vérifie aussi chaque slot, dont les quatre slots Master, dans la boîte de contenu de sa propre carte. Les cas EN exigent explicitement les nombres de cartes/lignes avant mesure ; le helper, vide sur une autre rubrique, n'est pas compté comme preuve de cartes présentes. Les formulaires/déverrouillages sont rejoués par les sept parcours `fragments-vault` et les tests téléphone/clavier existants ; leurs rectangles internes ne sont pas couverts par ce nouveau helper, et les quatre slots Master ne sont pas dans ces deux captures de viewport. Aucun test inexistant n'est déclaré.

`navigation-panel-after` : **33/33, 46,0 s**, avec renouvellement intentionnel de seulement **vault-320** et **vault-fr-320**, inspectés. Les 107 autres références sont identiques par SHA-256, total109 inchangé. `navigation-panel-repeat` : **33/33, 48,8 s**, avec contrôle des slots ajouté, sans mise à jour ni retry. Revue Claude CSS/helper/2PNG : **PASS pour ce correctif**, lecture seule uniquement ; aucune exécution de tests par le reviewer ni gate humain. Le plan et ce rapport conservent l'échec avant correctif.

Build final de cette correction : JS **398662/400000 o**, lazy **103441/160000 o**, CSS **119798/120000 o** ; 12 rasters ≤300000 o. Typecheck tests et contrôle des diffs réussis ; limites inchangées, marge CSS202 o seulement. Suite complète `navigation-final-v4` de519 scénarios, sans mise à jour, en cours. Le goal n'est pas déclaré complet ; ses écarts visuels, réserves enseignant et validations externes restent ouverts.

![Coffre français à 320px, cartes dans le vrai cadre](/Users/1millnonstop/Downloads/escape-lab/escape-lab/web/e2e/game-navigation.spec.ts-snapshots/vault-fr-320-chromium-darwin.png)

### Prévisualisation visible, indépendante des bases de test et de l'ancien navigateur

Les anciens endpoints5175/3101 ont été contrôlés et ne répondaient plus. Nouvelle démo locale : **http://127.0.0.1:5176/**, API **http://127.0.0.1:3102/api/health**, HTTP200 et health `{status:ok,labs:4,missions:10}`. Base propre `/private/tmp/escape-lab-preview-20261013-navigation-v4.db`, origine navigateur différente pour préserver le storage de5175, aucune base utilisateur/réseau E2E3000 réinitialisée. Binding127.0.0.1, CORS limité au frontend5176, secret aléatoire de développement en mémoire, aucun fichier de secret changé ni clé d'assistant externe héritée.

Contrôle visuel CUA du vrai frontend : accueil français/portes/signature Sawssen Jemaiel ; coffre ; largeur temporaire320×844 et défilement jusqu'à Master. Les **quatre slots Master** sont cette fois réellement visibles dans la preuve JPEG, avec carte/panneau et dernière ligne au-dessus de la barre. Override de viewport retiré, retour sur Salles avec focus du titre et onglet marqué livrable ; aucune erreur console observée dans ce contrôle limité. Aucun reset de session ni réponse de mission envoyés dans ce navigateur. Ce n'est pas une nouvelle preuve Safari/WebKit, de zoom200% ou de biomédecine.

![Vraie prévisualisation à 320px : quatre slots Master visibles](/Users/1millnonstop/Downloads/escape-lab/escape-lab/.ci-artifacts/visual-gameplay-2026-10-12.wt3IDt/preview-v4-master-320.jpg)

### Résultat terminal de la version finale v4 de cette tranche

**519/519 réussis, 7,7 min**, run `navigation-final-v4`, sans mise à jour ni retry. Rapport HTML contrôlé : `total=519, expected=519, unexpected=0, flaky=0, skipped=0, ok=true`, durée464786,613ms. SHA-256 après run : **109/109 références identiques**, aucune modifiée par la relance. Le run inclut les nouveaux contrôles de cadre/slots, les parcours sauvegarde/erreurs/timers/indices/déverrouillages/langues, le clavier/mobile et le bundle de production ; l'iPhone13 reste une émulation Chromium, pas Safari réel.

Revue terminale lecture seule : PASS sur l'alignement/focus et PASS sur la grille/helper/PNG coffre ; aucune exécution des tests par les reviewers, aucune approbation humaine de gate. Typecheck tests et `git diff --check` réussis. Frontend350/350 et backend274/274, build et audits de production restent les preuves de la même campagne ; aucun fichier de dépendance ou backend changé par le dernier correctif CSS. JS398662/400000, lazy103441/160000, CSS119798/120000, 12 rasters sous300000 ; budgets inchangés.

**VERDICT technique local : PASS dans cette tranche d'intégration/navigation. VERDICT de release : ESCALATE.** Goal global non accompli, statut moteur `usageLimited`, pas `complete`. Scènes de trophée/robot/questions, médaillons/podium, miniatures du coffre, réserves enseignant, S-1, vrai zoom/lecteur d'écran/Safari, CI distante et validation biomédicale/humaine restent ouverts selon la matrice. Aucun « tout est parfait » ou déploiement Vercel n'est annoncé. Diff local conservé dans le bon dépôt ; aucun commit/push/déploiement. Prévisualisation démo5176 conservée pour l'inspection demandée, indépendante des données utilisateur.

![Accueil réellement ouvert dans la prévisualisation finale](/Users/1millnonstop/Downloads/escape-lab/escape-lab/.ci-artifacts/visual-gameplay-2026-10-12.wt3IDt/preview-v4-rooms-desktop.jpg)

### Tranche bilan — génération, intégration et première revue

Actif décoratif créé avec **ImageGen intégré**, intention génération `stylized-concept`, image JPG utilisateur comme référence visuelle (pas comme UI à aplatir). Source originale conservée : `/Users/1millnonstop/.codex/generated_images/01a12b10-595d-7391-ade3-23b8a70fb8c5/exec-329b1c8e-42ff-4c5b-a099-5516eefd3ee3.png`. Actif livré dans le dépôt : `web/src/assets/mission-result-trophy.webp`, **1401×934, 139506 octets**, conversion WebP80 sans découpe. Coupe or, anses, goutte/blason/lauriers et socle entier ; microscope/tubes navy-cyan-ambre. Aucun texte, nombre, UI ou résultat baked-in, aucune photo scientifique remplacée. Scène commune de récompense, pas quatre illustrations scientifiques distinctes.

Prompt final exact :

> Use case: stylized-concept. Asset type: Escape Lab mission completion scene, landscape 3:2 bitmap, not a UI mockup. Input image 1 is a visual reference for the gold trophy and cinematic laboratory mood, not text or demo results to reproduce. Generate a dedicated scene closely matching that reference: a large polished gold two-handled trophy with a blood-drop shield and laurel relief, centered on a circular illuminated metallic pedestal in a dark navy biomedical laboratory. Microscope on the left and blood sample tubes on the right; cyan rim lights and warm amber highlights, realistic high-end 3D game rendering. Show the entire trophy, both handles and the entire pedestal with generous margins; trophy occupies about 70 percent of image height. Wide 3:2 composition, crisp detailed gold, restrained background depth of field. No letters, words, numbers, heading, logo, UI, score, buttons, watermark or people. This is decorative celebration art, not diagnostic evidence. Preserve the reference’s gold/navy/cyan palette and laboratory atmosphere.

Titre, nom de mission et langue restent HTML/FR-EN au-dessus de l'image en flux normal, ratio1,5 et `object-fit:contain`. Score, max, temps, précision, ledger, bonus, fragments et récompenses ne sont pas recalculés. Build initial réussi : JS398580/400000, lazy103441/160000, CSS119109/120000 ; treize rasters sous300000. Frontend350/350 (23fichiers,5,56s), backend274/274 (16,75s), typechecks et audits production à0 vulnérabilité rejoués ; aucun budget ou timeout augmenté.

Première collecte `initial` : cinq échecs de références absentes,14 non exécutés ; pas une passe verte. Création contrôlée `pixels` :18/19 (47,2s), seule erreur une assertion d'expiration attendait « Closed » alors que le vrai état est « Time is up » ; assertion corrigée, pas de changement produit. Trente-deux nouvelles références du héros FR/EN aux quatre tailles et quatre disciplines. Run dédié de l'ancienne référence hématologie390 :1/1 (13,5s), après inspection. SHA-256 : **une seule ancienne référence modifiée**, celle autorisée ; les108 autres inchangées. Les nouvelles images ne certifient pas une identité avec le JPG.

Revue Claude lecture seule : NEEDS_FIX dans la tranche. Cadrage, séparation titre/image, autorité des scores et récupération du résultat corrects ; titre trop serré (héritage−.06em), troisième action orpheline et preuve limitée au héros. Le navigateur confirme à1280 le titre à−3,12px et le troisième bouton459px sur la grille918px. Risque de collision de la langue sur l'erreur à mesurer, pas déclaré confirmé. Le risque de score négatif signalé est déjà rejeté par `normalizeAttemptResult`/`nonNeg`, pas de recalcul ni changement métier nécessaire. CSS mort `.result-seal` dans le fichier autorisé à retirer ; autres feuilles hors tranche intactes.

Prévisualisation relancée à5176/API3102 en conservant la base démo précédente, sans seed/reset. Ancien onglet hors connexion : Réouvrir puis rechargement ont restauré la version et le français. Un vrai replay du frottis via contrôles visibles jusqu'au résultat :180/180, précision100%,00:36, seulement+12XP par amélioration de l'ancien record168. Ce résultat est celui du serveur local démo, pas une modification de données utilisateur authentifiées ni une validation biomédicale. Rechargement conserve le bilan, viewport temporaire1280 retiré.

![Bilan réellement parcouru dans la démo, avant rework typographique](/Users/1millnonstop/Downloads/escape-lab/escape-lab/.ci-artifacts/result-trophy-20261013.hoRPts/preview-trophy-fr.jpg)

Suite complète538 sans mise à jour en cours ; attendre son résultat terminal avant les correctifs de revue. Cette suite ne certifie pas encore le rework. Goal contrôlé à nouveau : désormais **active**, non accompli ; le statut `usageLimited` de la passe précédente était historique. Aucun gate humain, commit/push/déploiement.

### Rework du bilan — défauts mesurés et corrections

La suite précédente est terminée : **538/538,9,2min**, sans update, HTML expected538/unexpected0/flaky0/skipped0. Elle ne certifie pas les correctifs appliqués ensuite. Typographie du titre corrigée−.02em (mesure native finale−1,04px à52px,−.68px à34px) ; troisième action sur toute la ligne (930px/930px au navigateur1280). Libellés de bandeau entiers sur mobile, séparateur masqué, scène toujours entière en ratio1,5.

Nouveau contrôle d'erreur avant correction : échec réel sur1px seulement entre langue et titre, sans overlap déclaré. Sélecteur placé en flux normal dans ce seul état, seuil10px conservé ; récupération Réessayer en français vérifiée. Première passe de rework :21/22,43,9s, seul défaut ajouté par axe `page-has-heading-one` dans le chargement. Libellé existant devenu h1, règle axe conservée ; contrôle dédié1/1,8,9s. Panneaux attente/erreur ensuite harmonisés en navy sans changer les autres pages ni textes/permissions.

Inspection de la première capture de bilan pénalisé320 : `01:57` et `Accuracy` coupés sur deux lignes malgré aucun overflow. Cartes précision/temps désormais pleine largeur sous600, comme la référence ; valeur sans coupure, nouvelle assertion du nombre réel de lignes de texte via Range. Rectangles internes de score/statistiques/explication/ledger/actions et boutons44px vérifiés. La troisième action occupe toute la largeur, pas seulement la boîte de document sans débordement.

Parcours pénalisé réellement joué via UI dans la base E2E isolée : mauvais clic, indice, bonne réponse. Score105/180, précision50%,1erreur/1indice et pénalités−15/−10 proviennent du serveur ; chiffres et timer réel comparés avant la fixture. **Seulement pour la capture de pixels**, GET/result conserve ces valeurs et stabilise elapsed=01:57/117s ainsi que sa phrase du ledger ; ce temps n'est pas présenté comme une mesure réelle de parcours. PNG complets à320/1280, sans masquage du bilan. Les tests d'autorité historiques avec nombres alternatifs, fragments, badges et vraie reprise restent exécutés dans la suite complète.

Collecte finale ciblée : **21/21,40,4s**,32 héros FR/EN +3 attente/erreurs +2 bilans complets =37nouveaux PNG. Total146 ; SHA-256 confirme que parmi les109 anciens, **seul** le héros de bilan hématologie390 a changé, les108autres restent identiques. Les images créées/renouvelées ont été inspectées, pas acceptées comme preuve de stabilité avant répétition. Build final de rework : **JS398581/400000, lazy103441/160000, CSS119490/120000**,13rasters sous300000, marge CSS510o ; aucun budget relevé. Frontend350/350 rejoué, typechecks/diff-check et backend274/274 de cette campagne conservés.

Prévisualisation conservée et rechargée après changements : vrai bilan FR, bascule EN/FR sans changement du résultat, reprise et focus du titre, stats en pleine largeur mobile ; défaut du bouton confirmé avant et corrigé après. Viewport temporaire1280 retiré, onglet résultat conservé pour inspection. Le journal du navigateur contient un ancien message Vite WebSocket du13octobre14:13:48UTC, avant ce contrôle ; aucun changement de configuration HMR hors scope, rechargement manuel utilisé. Les21tests ciblés propres n'ont signalé ni erreur console ni requête échouée dans leurs parcours normaux (les tests de panne sont intentionnels).

![Bilan réel français corrigé](/Users/1millnonstop/Downloads/escape-lab/escape-lab/.ci-artifacts/result-trophy-20261013.hoRPts/preview-trophy-final-fr.jpg)

![Actions desktop corrigées, troisième bouton pleine largeur](/Users/1millnonstop/Downloads/escape-lab/escape-lab/.ci-artifacts/result-trophy-20261013.hoRPts/actions-final-1280.jpg)

Suite finale540 sans update et seconde revue readonly en cours. Pas de validation finale annoncée avant leurs résultats ; goal général actif non accompli, scènes de questions/robot, médaillons/podium/miniatures du coffre, réserves enseignant et validations externes restent ouvertes.

### Cohérence des preuves et dernier correctif du bilan

Le run `final-all` ci-dessus est terminé : **540/540, 8,4 min**, sans mise à jour ; rapport HTML `expected540/unexpected0/flaky0/skipped0`, durée505030,446ms. Il précède le dernier correctif de score décrit ici. La seconde revue demandait un rework des preuves : le temps visuel01:57 était incompatible avec le bonus plein+30 conservé dans cette fixture. Le remplacer par **00:42/42s**, et modifier sa phrase du ledger, rend la capture cohérente ; ce temps reste une stabilisation de capture explicitement simulée, pas le temps mesuré du jeu. Les valeurs et lignes complètes du ledger sont comparées au vrai serveur avant cette stabilisation. Les parcours réels sont sous le timeout30s inchangé.

La vérification initiale des fragments échouait parce que la réponse immédiate de validation finale ne contient pas le contexte du coffre que fournit GET/result. Le test recharge désormais ce vrai résultat avant ses assertions de coffre ; aucun contrat produit n'a changé. `proof-context` : **3/3,16,5s** ; `proof-repeat` : **21/21,35,4s**, sans mise à jour. Deux erreurs320 utilisent désormais500 à corps vide et vérifient les textes de repli FR/EN. Nouvelle capture complète FR320, ledger/XP/fragments comparés ; total **147 PNG**, dont38 de bilan. Revue statique et cinq PNG : PASS borné pour ces preuves.

Cette capture française a révélé un dernier détail : XP se retrouvait seul et le code se séparait en7 puis4 2. Le groupe de score peut maintenant passer à la ligne suivante, mais sa valeur et son unité restent entières ; les chiffres du coffre sont joints par des espaces insécables. Tests Range sur les lignes réelles, géométrie interne et textes positifs de panne dans les deux langues. `score-wrap` : **1/1,12,0s**, renouvellement intentionnel du seul PNG `penalized-result-fr-320` inspecté. Comparaison SHA-256 des147 références : une seule modifiée par ce dernier correctif. Revue Claude finale en lecture seule : **PASS**, aucune anomalie concrète dans ce diff ; pas d'exécution runtime ni de gate humain par le reviewer.

Build de cette version : JS principal**398582/400000o**, différé**103441/160000o**, CSS**119543/120000o** (457o de marge),13rasters sous300000o. Frontend**350/350**,23fichiers,3,63s, rejoué après le dernier correctif ; contrôles du contrat et des frontières client réussis. Backend274/274 et audits de production sans vulnérabilité restent ceux de cette campagne, sans nouveau changement backend/dépendances.

Contrôle natif supplémentaire : le navigateur avait retrouvé les salles ; historique consulté sans reset puis un rejeu du frottis terminé via l'image visible. Serveur démo : **180/180,100%,00:25,XP total inchangé**, pas de bonus doublé. Nouveau bilan capturé et onglet conservé. Ce contrôle a ajouté une tentative à la seule démo locale, sans réinitialiser sa progression ; aucun compte authentifié ni donnée externe modifiés.

![Bilan français réel sur la dernière version](/Users/1millnonstop/Downloads/escape-lab/escape-lab/.ci-artifacts/result-trophy-20261013.hoRPts/preview-trophy-score-final-fr.jpg)

Hygiène Git : `.ci-artifacts/result-trophy-*/` exclut les rapports temporaires de cette campagne, sans les supprimer ; les147 PNG de comparaison sous `web/e2e` restent versionnables. La suite `score-final-all` de540 scénarios tourne sans mise à jour sur le dernier produit. Attendre son résultat terminal avant de déclarer cette version validée. Goal général actif, périmètre visuel global encore incomplet selon la matrice ; aucun commit, push, déploiement ni gate humain.

### État terminal du bilan et demande de cadrage utilisateur

`score-final-all` : **539/540,8,7min**, rapport `expected539/unexpected1/flaky0/skipped0`, durée523312,726ms. Unique échec : regex historique exigeant des espaces ordinaires entre les fragments, alors que le snapshot de la même tentative montre bien le résultat sauvegardé et le code7 4 2, désormais insécable. Correction de cette seule assertion de `fragments-vault.spec.ts` vers le texte exact normalisé ; ni nombre, ni libellé, ni visibilité, ni recharge/retour supprimés. Aucun changement produit supplémentaire.

`score-recovery` : **28/28,42,6s**, sept scénarios coffre et21bilan, sans update ni retry. Ces résultats complètent le diagnostic du run539/540 ; ils ne sont pas présentés comme une nouvelle suite540/540. Les147références ont leurs SHA-256 inchangés après la campagne complète. `git diff --check` réussi. Verdict technique de la correction bornée : PASS avec cette traçabilité ; release non approuvée, objectif général non accompli.

L'utilisateur demande maintenant un état d'avancement et le texte d'un **futur objectif de gamification**, sans le lancer, après achèvement du premier. Aucun nouveau goal ni implémentation de ce futur périmètre. Code actuel vérifié : `ImageIdentify` transmet une position en pourcentage et `be/src/engines.ts` compare sa distance à une cible circulaire définie côté serveur. Cela n'est ni une reconnaissance automatique d'organisme ni un atelier zoom/pan complet. Proposition à cadrer : grandes observations annotées, zoom/pan avec coordonnées invariantes, régions validées et tolérance explicite, observation puis justification puis décision ; direction visuelle immersive sur tous les écrans. Les noms, observations et critères biologiques devront être validés avant rédaction du contenu, sans convertir les exemples hésitants de l'utilisateur en vérité scientifique. Le premier objectif et ses écarts restent distincts et actifs.

### Suite du premier objectif : coffre illustré

Écart confirmé par la capture existante : coffre masqué par le titre/voile sombre et cartes sans portes miniatures. Réutilisation des WebP existants, sans nouvelle génération ni retouche, noms et fragments toujours natifs et traduisibles. `ProgressHub` sépare l'illustration du titre ; `VaultCard` ajoute une porte selon la discipline fournie par `/labs`, sans substitut deviné pour une discipline inconnue. Suppression des anciennes règles d'overlay et du trophée décoratif de ce héros uniquement. Grille à deux colonnes, 72px minimum pour la miniature, quatre fragments Master entiers sur320. Aucun calcul/contrat serveur changé.

Premier run : trois échecs de références absentes, trois scénarios non exécutés ; pas de succès annoncé. Collecte suivante :5/6,29,4s, seul échec du mock de panne qui bloquait aussi le module Vite d'importation du WebP. Correction du test pour interrompre uniquement les requêtes de type image. Collecte avec navigation/coffre : **39/39,56,9s** ; huit nouvelles captures complètes FR/EN à320/390/768/1280. SHA-256 : parmi147 références antérieures, seules les quatre vues coffre EN320/390/1280 etFR320 autorisées changent ;143autres identiques. Total155. Les vues320/768 et anciennes390/1280 ont été inspectées ; carte Master visible en défilement natif, au-dessus de la barre mobile.

Build intermédiaire : JS398892/400000, lazy103441/160000, CSS118824/120000,13rasters sous300000. Frontend350/350,23fichiers,2,60s. Revue Claude lecture seule : NEEDS_FIX, portant sur le cadrage complet du coffre, le sens ouvert/fermé Master et la force des preuves panne/formulaire/notice. Le run103 de régression sans update est en cours sur cette première version ; il ne certifie pas les corrections de revue à venir. Les réserves sont reprises dans le plan avant édition. Nouveau goal avancé toujours non lancé.
### Rework final du coffre illustré — vérifié le 13 octobre 2026

Les corrections de revue sont appliquées dans le périmètre borné : héros en ratio intrinsèque 1400×934 sans découpe du coffre, titre en flux normal, porte Master ouverte seulement quand `vault.exited` est vrai, et aucune image devinée pour `coming_soon` ou une discipline inconnue. Le test de panne attend une vraie requête d'image, son échec et `naturalWidth===0`, puis vérifie que le coffre reste déverrouillable par son code réel.

Validation sans mise à jour : **33/33** ciblés (`game-navigation` + `vault-art`), puis **104/104** en régression (`a11y`, autorité serveur, fragments/coffre, navigation, responsive, mobile et production). Frontend **350/350**. Build : JS **398882/400000 o**, lazy JS **103441/160000 o**, CSS **118789/120000 o** ; 13 rasters sous 300000 o. `git diff --check` passe. Aucun flaky, skipped ou retry n'est utilisé pour déclarer ces résultats.

Contrôle visuel local : [coffre FR inspecté à 320px](/Users/1millnonstop/Downloads/escape-lab/escape-lab/.ci-artifacts/result-trophy-20261013.hoRPts/preview-vault-art-fr.jpg). Le coffre entier, ses cartes, portes et fragments sont visibles ; Master READY conserve la porte fermée et expose ses quatre slots/formulaire dans la géométrie testée. Preuve locale uniquement : pas une validation Safari/lecteur d'écran réel ni un gate humain.

**VERDICT de tranche : PASS technique local. VERDICT de release : ESCALATE.** Le goal global reste actif ; questions/scènes gamifiées, trophée/podium, badges/classement et validations externes restent ouverts. Aucun commit, push, déploiement ou changement de données utilisateur.
### Moteur de ciblage — inspection précise des images — 13 octobre 2026

Un point faible concret du moteur `image_identify` était l'absence d'un mode de lecture grand format : la sélection existait, mais l'élève devait viser dans la carte courante. Une inspection agrandie a été ajoutée dans `web/src/components/engines.tsx`, avec clic de sélection conservant les coordonnées normalisées et sans mutation réseau jusqu'à « Valider la réponse ». Le contrôle reste une aide de précision, pas une reconnaissance automatique et pas une preuve scientifique clinique.

Validation : **10/10** tests moteurs, **24/24** accessibilité/axe et **350/350** tests frontend. Le test de focus confirme l'ordre image → inspection → validation ; l'ouverture et la sélection dans la vue agrandie ne déclenchent aucune requête `/answer` prématurée. Build configuré réussi : JS **399989/400000 o**, lazy JS **103441/160000 o**, CSS **119432/120000 o**, 13 images raster sous 300000 o. Aucun budget n'a été relevé.

**VERDICT de tranche : PASS technique local.** Le goal global reste actif : il faut encore enrichir chaque question, les scènes de jeu, les explications, les récompenses et les écrans de progression, puis valider les limites Safari/lecteur d'écran/biomédical humain. Aucun commit, push ou déploiement.

### Rework de robustesse du visualiseur — 13 octobre 2026

Le contrôle de ciblage agrandi est désormais aligné sur l'état du moteur : après désactivation, son bouton d'ouverture et sa surface de sélection sont désactivés. La fermeture native par Échap a été rejouée avec retour de focus au contrôle d'ouverture dans Chromium ; la sélection en inspection reste locale et ne déclenche aucune requête `/answer`.

Validation : **34/34** tests Chromium ciblés (accessibilité et moteurs), **350/350** tests frontend. Build configuré : JS **399984/400000 o**, lazy JS **103441/160000 o**, CSS **119432/120000 o**, 13 rasters sous 300000 o. `git diff --check` reste requis comme contrôle de sortie. Le libellé visible reste traduit ; `aria-label="Image"` est un nom technique non affiché conservé pour la compatibilité budget et devra être harmonisé dans une prochaine tranche si le budget est réalloué.

**VERDICT de tranche : PASS technique local.** Le goal global reste actif ; aucun commit, push, déploiement ou gate humain.

### Régression complète après le rework — 13 octobre 2026

La version courante a été rejouée sur la suite navigateur complète : **522/522 scénarios Chromium réussis en 8,4 minutes**, sans échec, retry ou scénario ignoré. La couverture inclut les six moteurs, le visualiseur d'images, les corrections d'étapes, les expirations, les sauvegardes, les langues FR/EN, les largeurs 320/375/390/568/600/601/667/768/844/1280/1440, les erreurs serveur, les portes, le coffre, les résultats, les badges et le classement. Le backend reste à **274/274** et le frontend à **350/350**.

Cette régression prouve la stabilité fonctionnelle locale de la tranche actuelle ; elle ne prouve pas encore que l'expérience atteint la direction de gamification maximale demandée, ni Safari/lecteur d'écran réel, ni une validation scientifique humaine. **VERDICT : PASS technique local, goal global actif, release ESCALATE.**

### Comparaison visuelle des quatre plaques microbiologiques — 13 octobre 2026

Les quatre références fournies ont été comparées aux images effectivement rendues par la mission `mic-03-s1`, et non seulement à leurs noms de fichier : la plaque MacConkey rose correspond à l'observation des colonies roses, la plaque au sang avec hémolyse correspond à la bêta-hémolyse, la croissance en cercles concentriques correspond au swarming de Proteus, et la pigmentation verte correspond à Pseudomonas. Les actifs locaux sont des carrés propres de 720×720, avec le même contenu de plaque que les références mais sans le bandeau de messagerie ni le nom de l'organisme incrusté ; cela conserve les pixels utiles à l'identification tout en évitant de donner la réponse dans l'image.

La correspondance est verrouillée par l'ordre serveur des observations, les quatre `alt` descriptifs et les tests navigateur qui exigent quatre images chargées, leur ratio, leur rendu `contain`, l'absence de débordement, l'inspection grand format et la conservation des associations. Aucun remappage de contenu scientifique n'est nécessaire dans cette passe. Cette comparaison confirme l'intégration visuelle de la mission microbiologique ; elle ne certifie pas une validation biomédicale humaine des identifications présomptives.

### Rework de lisibilité des plaques sur mobile — 13 octobre 2026

La comparaison de la capture à 320 px a confirmé un défaut d'échelle : les plaques étaient réduites à 96 px, ce qui rendait l'observation fine difficile malgré la fenêtre agrandie. Les vignettes passent à 136 px sur petit écran et 132 px sur les autres largeurs ; chaque carte conserve son texte, son sélecteur et son bouton d'inspection sans débordement. Le changement ne modifie ni le contenu, ni les associations, ni la taille intrinsèque 720×720 des actifs.

Les captures de comparaison concernées ont été renouvelées intentionnellement après inspection de la nouvelle vue. Vérification sans mise à jour : **8/8** scénarios multi-largeurs des quatre photos réussis à 320, 375, 390, 568, 667, 768, 844 et 1280 px ; `git diff --check` réussi. Build : JavaScript **399984/400000 octets**, CSS **119436/120000 octets**, aucun budget relevé. Cette tranche est PASS localement ; le goal global reste actif pour les scènes et mécaniques de gamification encore ouvertes.

La régression complète de l'intégration image après ce rework est également verte : **20/20** scénarios Chromium, incluant les huit largeurs, la porte Master, les états français/anglais, l'image indisponible, la reprise, la conservation des associations et la détection des doublons. Aucun retry ni scénario ignoré. Cette suite ne remplace pas la régression navigateur globale et ne constitue pas une validation Safari ou biomédicale.

### Rework de composition mobile — 13 octobre 2026

La capture à 320 px a ensuite révélé un compromis défavorable : l'image agrandie laissait trop peu de largeur au texte et provoquait des retours mot par mot. Sous 700 px, la carte microbiologique passe maintenant en composition verticale : plaque centrée en haut, observation en pleine largeur dessous, puis association dans sa propre ligne. La photo reste grande et le texte redevient lisible sans réduire l'image.

Après inspection de la capture 320 px, les références concernées ont été renouvelées intentionnellement. La suite image complète est verte : **20/20** scénarios Chromium, sans retry ni skip, incluant les quatre plaques, huit largeurs, FR/EN, pannes d'image, reprise, conservation des associations, doublons et porte Master. Build : JavaScript **399984/400000 octets**, CSS **119510/120000 octets**. Le goal global reste actif ; cette tranche améliore la lisibilité mais ne clôt pas la gamification avancée.

### Régression globale après la composition mobile — 13 octobre 2026

La suite navigateur complète a été rejouée après la composition verticale des cartes microbiologiques : **522/522 scénarios Chromium réussis en 8,8 minutes**, sans échec, retry ou scénario ignoré. Elle couvre les six moteurs, les missions complètes, FR/EN, les largeurs mobiles/tablettes/desktop, le clavier, l'accessibilité, les erreurs et reprises réseau, les portes, le coffre, les résultats, les badges, le classement et les validations d'autorité serveur.

Le backend a également été rejoué : **274/274 tests réussis en 16,2 secondes**, dont les règles de score, pénalités, expiration, déverrouillages et limites de sécurité. Le build reste conforme aux budgets : JS **399984/400000 octets**, CSS **119510/120000 octets**, 13 rasters sous 300000 octets. `git diff --check` passe. Cette preuve établit une stabilité technique locale après le dernier changement ; elle ne clôt pas les limites Safari/lecteur d'écran réel, validation biomédicale humaine et gamification avancée.

### Audit de variété des missions — 13 octobre 2026

Le contenu serveur a été relu mission par mission : 10 missions jouables réparties sur quatre laboratoires, avec six moteurs distincts (`choice`, `decision`, `image_identify`, `stepper`, `drag_order`, `matching`). Les parcours couvrent l'observation d'image, le raisonnement clinique, la décision pré-analytique, le classement d'étapes, l'association de plaques et les séquences multi-étapes ; les questions microbiologiques ne se réduisent donc pas à une seule interaction répétée. Les missions Master réutilisent les trois disciplines dans quatre étapes et disposent d'un barème séparé.

Le point encore ouvert n'est pas une absence de variété fonctionnelle : c'est la couche de mise en scène avancée demandée par l'utilisateur — scènes propres à chaque mission, interactions de zones/pixels plus riches, narration progressive et récompenses plus expressives. Elle doit être traitée comme une tranche dédiée, avec validation du contenu scientifique avant ajout, et ne doit pas être confondue avec un défaut de la version actuellement testée.

### Matrice d'audit de clôture technique — 13 octobre 2026

| Exigence vérifiée | Preuve actuelle | Statut |
| --- | --- | --- |
| Les salles sont visibles dès l'arrivée et les statistiques restent compactes | Assertions de géométrie dashboard, responsive et captures mobile | PASS local |
| FR/EN ne se mélange pas sur les écrans testés | Parcours français/anglais, états d'erreur et moteurs | PASS local |
| Chaque plaque microbiologique accompagne son observation | Quatre actifs 720×720, mapping serveur, captures 320–1280 | PASS local |
| Les images restent inspectables sans modifier la réponse | Fenêtre agrandie, focus, Échap, reprise et associations conservées | PASS local |
| Les six moteurs valident côté serveur | 522 scénarios Chromium + 274 tests backend | PASS local |
| Les résultats, fragments, badges et déverrouillages restent autoritaires | Tests d'autorité, coffre, résultats et scoring | PASS local |
| Le visuel est identique aux maquettes utilisateur | Captures comparatives locales seulement, pas de preuve d'identité pixel à pixel avec les JPG | NON PROUVÉ |
| Safari, lecteurs d'écran réels et appareils physiques | Aucun environnement réel de cette nature dans la campagne | NON PROUVÉ |
| Validation biomédicale des cas et images | Le contenu est explicitement illustratif et attend une validation humaine | NON PROUVÉ |
| Gamification avancée par scènes, zones, narration et récompenses | Fonctionnement actuel stable, mais cette couche n'est pas encore implémentée | À FAIRE |

Conclusion de l'audit : la version courante est techniquement PASS en local et prête pour une revue humaine ciblée, mais le goal global ne peut pas être déclaré complet tant que les trois lignes `NON PROUVÉ` et la ligne `À FAIRE` ne sont pas traitées ou explicitement acceptées par une décision de périmètre.

### Backlog priorisé et critères d'acceptation — 13 octobre 2026

1. **Scènes propres à chaque mission — priorité haute.** Ajouter un décor ou un cadrage distinct par mission seulement après validation de la provenance et du contenu. Acceptation : aucun texte d'interface incrusté dans l'actif, ratio conservé, quatre largeurs minimum, FR/EN, chargement/erreur, et comparaison visuelle inspectée.
2. **Observation guidée par zones — priorité haute.** Étendre le hotspot unique à des zones serveur explicites (repérage puis justification), sans reconnaissance automatique ni décision côté client. Acceptation : coordonnées normalisées, tolérance testée aux bords, clavier disponible, aucune soumission pendant l'exploration, réponse serveur inchangée.
3. **Boucle pédagogique — priorité haute.** Structurer chaque mission en observation, choix, explication et décision finale, avec réponse erronée rejouable sans perte d'état. Acceptation : test E2E du parcours complet, feedback non révélateur avant validation, pénalités et temps issus du serveur.
4. **Récompenses expressives — priorité moyenne.** Enrichir les fragments, badges, trophées et progression avec des états cohérents, sans célébration sur chargement, erreur ou tentative incomplète. Acceptation : résultat GET rechargé, score/ledger identiques, badges déverrouillés uniquement par l'état serveur.
5. **Validation externe — bloquant pour une release publique.** Rejouer la matrice sur Safari/WebKit, un lecteur d'écran réel et au moins un appareil physique ; faire relire les cas biomédicaux et la provenance/licence des images. Acceptation : rapport externe signé, pas seulement une capture Chromium locale.

Ces cinq items constituent le prochain plan d'exécution logique. Ils ne sont pas exécutés dans cette passe afin de ne pas inventer de contenu biomédical ni de signer une validation humaine inexistante.

### Assistant de laboratoire incarné — 13 octobre 2026

Le panneau d'aide reçoit maintenant un visuel robotique dédié, `lab-assistant-robot.webp`, généré avec un fond réellement transparent et intégré comme décoration CSS. Il est volontairement sans texte, sans logo et sans information scientifique : il renforce la présence du guide sans révéler la réponse ni devenir un contrôle supplémentaire. Le même visuel accompagne l'assistant en mobile et en colonne latérale desktop ; la carte reste positionnée en relatif et le robot ne peut pas intercepter les clics.

Validation : build configuré réussi avec **14 rasters** sous 300000 octets, dont le robot à **42006 octets** ; JS **399984/400000 octets**, lazy JS **103441/160000**, CSS **119903/120000**. La suite d'intégration image confirme la présence du décor via son `background-image` aux huit largeurs testées et reste verte à **20/20**. Les tests précédents restent la preuve du comportement métier : aucun changement de l'API, de la validation, du score ou de l'autorité serveur.

**VERDICT de tranche : PASS visuel local ciblé.** Le goal global reste actif : cette amélioration rend l'assistant plus incarné, mais ne remplace pas encore les scènes propres à chaque mission, les zones guidées et la validation externe déjà listées dans le backlog.

### Régression complète après l'assistant robot — 13 octobre 2026

Après correction du sélecteur de test desktop/mobile, la suite Chromium complète termine à **522/522**, en **8,2 minutes**, sans échec, retry ni skip. Elle couvre les parcours des six moteurs, les images et visualiseurs, FR/EN, les états d'erreur, les reprises, les portes, le coffre, les résultats, les badges, le classement, le responsive et l'accessibilité automatisée. Cette preuve confirme que l'enrichissement visuel de l'assistant n'a introduit aucune régression fonctionnelle.

Le robot reste une décoration CSS non interactive ; il ne modifie pas les réponses, le timer, les indices, le score, les fragments ou les déverrouillages. Le goal global demeure actif : l'expérience est stable localement, mais les scènes spécifiques à chaque mission, les zones guidées avancées, la validation Safari/appareil réel et la validation biomédicale humaine ne sont pas encore prouvées.

### Validation unitaires de l'état courant — 13 octobre 2026

Après la régression Chromium, les contrôles unitaires ont été rejoués sur le même état du dépôt : **350/350 tests frontend** et **274/274 tests backend**, sans échec, annulation ni test ignoré. Les vérifications de contrat API, de frontières réseau côté client, de typage des tests et les règles serveur de score, timer, indices, fragments, déverrouillages et sécurité passent également. `git diff --check` reste propre.

Le diagnostic final est donc précis : aucune faiblesse fonctionnelle reproductible n'est détectée dans la tranche actuelle ; les faiblesses restantes sont des exigences non encore réalisées ou non prouvables, notamment la mise en scène distincte de chaque mission, les interactions de zones/pixels multi-étapes, la validation externe des navigateurs/appareils et la relecture biomédicale humaine.

### Rework du visualiseur de ciblage — 13 octobre 2026

Le visualiseur des questions `point` avait encore un nom accessible générique (`Image`), différent du libellé visible et non traduit. Il expose désormais l'étiquette réelle de l'actif scientifique, comme les autres contrôles d'inspection. La sélection agrandie, la fermeture clavier, le retour de focus et l'absence de soumission pendant l'inspection sont conservés.

Validation : **2/2 tests ciblés** (clavier et inspection), **350/350 frontend**, build **399987/400000 octets**, et régression Chromium complète **522/522** en **8,1 minutes**, sans échec, retry ni skip. Cette correction reste strictement d'accessibilité et de présentation ; aucune règle de score ou de réponse serveur n'a changé. Le goal global reste actif pour la gamification avancée et les validations externes.

### Neutralité des contrôles d’inspection — 13 octobre 2026

Un défaut structurel a été corrigé dans le visualiseur de ciblage : ses contrôles n’étaient pas explicitement de type `button`, ce qui pouvait les faire interpréter comme des soumissions lorsqu’ils se trouvaient dans le formulaire de mission. Les contrôles d’ouverture, de fermeture et de sélection agrandie sont maintenant neutres ; l’image agrandie porte aussi le nom accessible de l’actif scientifique réel. L’inspection reste donc séparée de la validation de réponse et n’envoie aucune requête d’answer.

Validation ciblée : **8/8 scénarios Chromium** image/accessibilité réussis. Build : **399994/400000 octets** JS, **119903/120000 octets** CSS, lazy JS **103441/160000**, 14 rasters sous 300000 octets ; `git diff --check` réussi. Aucun changement backend, score, timer, indice, fragment ou déverrouillage.

**VERDICT de tranche : PASS technique local.** Le goal global reste actif : les scènes propres à chaque mission, les interactions multi-zones et la validation externe restent à traiter.

### Régression complète après neutralisation des contrôles — 13 octobre 2026

La suite Chromium complète de la version construite termine à **522/522 réussis en 8,2 minutes**, sans échec, retry ni scénario ignoré. Elle couvre les six moteurs, les validations erronées/correctes, la reprise après rechargement, les expirations, les indices, les changements FR/EN, les largeurs 320–1440 px, les images et leurs visualiseurs, les portes de laboratoire, le coffre, les résultats, les badges, le classement et les contrôles d’accessibilité automatisés.

Cette preuve confirme que la neutralité des boutons d’inspection n’a introduit aucune régression de parcours, de formulaire ou de progression. Elle ne prouve pas encore les scènes dédiées à chaque mission, les interactions avancées par zones/pixels, Safari/appareil réel, ni la validation biomédicale humaine.

### Ciblage clavier dans l’inspection agrandie — 13 octobre 2026

Le visualiseur des questions `point` reprend désormais exactement la même navigation directionnelle que l’image principale : flèches par pas de 5 %, Maj+flèches par pas de 10 %, bornes 0–100 %, repère visible et aucune requête de réponse pendant l’inspection. La logique est factorisée afin d’éviter que l’image normale et sa vue agrandie ne divergent.

Validation : **2/2 tests E2E ciblés**, dont le déplacement au clavier dans la grande image sans soumission, **350/350 tests frontend**, build **399985/400000 octets** JS, **119903/120000 octets** CSS, lazy JS **103441/160000**, rasters conformes et `git diff --check` réussi.

**VERDICT de tranche : PASS technique local.** Le goal global reste actif : il faut encore traiter les scènes propres aux missions, les interactions multi-zones réellement serveur et les validations externes.

### Régression complète après ciblage clavier agrandi — 13 octobre 2026

La suite Chromium complète, rejouée après l’ajout de la navigation par flèches dans le visualiseur `point`, termine à **522/522 réussis en 8,2 minutes**, sans échec, retry ni scénario ignoré. Les tests couvrent donc aussi la nouvelle interaction au milieu des parcours de langues, erreurs, reprises, résultats, responsive et progression.

**VERDICT : PASS technique local.** Cette preuve clôt la correction de ciblage, mais ne clôt pas le goal global de gamification maximale.

### Geste tactile du visualiseur agrandi — 13 octobre 2026

La surface d’inspection `point` reçoit `touch-action: manipulation` afin que le double-tap et le zoom navigateur ne concurrencent pas la sélection du repère sur téléphone. La zone garde son image, son ratio, ses coordonnées et son comportement clavier inchangés ; seule l’interprétation du geste tactile est stabilisée.

Validation : build **399985/400000 octets** JS, **119929/120000 octets** CSS, rasters conformes, test E2E d’inspection **1/1 réussi** et `git diff --check` réussi. Aucun changement backend ou métier.

**VERDICT de tranche : PASS technique local.** Le goal global reste actif pour les scènes dédiées, les interactions multi-zones et les validations externes.

### Inspection manuelle de composition — 13 octobre 2026

Inspection locale effectuée sur le centre de mission et une mission à largeur mobile. Les portes par discipline, l’attribution Sawssen Jemaiel, le sélecteur FR/EN, les états de progression, les fragments et la navigation fixe sont visibles sans débordement horizontal. Le héros de mission conserve son image, son étape, son titre et le panneau de question dans une composition lisible.

Écart confirmé par rapport aux références : la scène de trophée du bilan est commune et les dix missions n’ont pas encore chacune un décor narratif exclusif. L’interface est fonctionnelle et cohérente, mais une égalité visuelle pixel à pixel et une scène unique pour chaque mission ne sont pas prouvées. Ces écarts restent dans le backlog de fidélité/gamification et ne sont pas masqués par les tests fonctionnels.
## 13 octobre — scènes de mission dédiées par discipline

- Trois scènes d’enquête dédiées sont maintenant intégrées dans les héros de mission : `mission-hematology-investigation.webp`, `mission-microbiology-petri.webp` et `mission-biochemistry-acid-base.webp`. Les cartes de salles continuent d’utiliser leurs portes dédiées ; les états, compteurs, fragments et données scientifiques restent séparés.
- Les trois actifs sont sans texte gravé, organisme nommé, logo, filigrane ou contrôle d’interface. Ils font tous 1400×934 et restent sous 300 000 octets dans le build : 106 176, 136 554 et 111 774 octets.
- Preuves exécutées après intégration : frontend 350/350, build et contrôle de budget réussis, JS 399 994/400 000, lazy JS 103 441/160 000, CSS 119 929/120 000, et E2E image-integration **22/22** à 320/375/390/568×320/667×375/768/844×390/1280 px. Les trois scènes sont chargées en 1400×934, sans débordement.
- Limite restante : les dix missions n’ont pas encore chacune un décor narratif exclusif et la scène de trophée du bilan reste commune. L’égalité pixel par pixel avec les maquettes et la validation biomédicale humaine restent non prouvées.

### Régression complète finale après intégration des scènes — 13 octobre 2026

La suite Chromium complète termine à **524/524 réussis en 8,2 minutes**, sans échec, retry ni scénario ignoré. Elle inclut les deux nouveaux contrôles de scènes dédiées, les six moteurs, les parcours FR/EN, les erreurs et reprises, le responsive, les résultats, les portes, le coffre, les badges, le classement et l’accessibilité automatisée. La suite ciblée des portes confirme également **24/24** scénarios et snapshots mis à jour uniquement pour les trois héros de mission.

`git diff --check` est propre. Le dépôt reste volontairement non déployé et non poussé : cette validation porte sur le dossier local imbriqué `escape-lab/escape-lab`.

**VERDICT de tranche : PASS technique local.** Le goal global reste actif : il manque encore des scènes exclusives pour chaque mission, la reconnaissance réelle multi-zones/pixels côté serveur, la comparaison pixel-perfect avec toutes les maquettes, les essais Safari/appareils réels et la validation biomédicale humaine.

### Identité visuelle de chaque mission jouable — 13 octobre 2026

Le défaut le plus important restant dans le parcours visuel était la réutilisation d’un même décor pour les trois missions d’une discipline. Six scènes supplémentaires ont été produites et intégrées : prélèvement coagulé et frottis d’anémie en hématologie, cultures et coloration de Gram en microbiologie, analyse rénale et panneau hémolysé en biochimie. Les trois scènes précédentes restent affectées aux autres missions ; le Master conserve sa porte dédiée.

Les neuf missions standards ont maintenant une scène propre, chargée par l’identifiant serveur de la mission. Les six nouveaux fichiers publics sont redimensionnés en 1400×934 et font entre 88 984 et 162 290 octets. Les images n’embarquent aucun texte d’interface, numéro de résultat, nom d’organisme, logo ou filigrane.

Preuves après raccordement : **31/31 E2E image-integration**, **24/24 E2E laboratory-doors**, **350/350 tests frontend**, build validé avec **399 981/400 000 octets JS**, **119 929/120 000 CSS**, **103 441/160 000 lazy JS**, et `git diff --check` propre. Les preuves couvrent les déverrouillages précédents, les quatre largeurs de portes, les états verrouillés, les scènes, les dimensions natives 1400×934 et l’absence de débordement.

Le rendu est désormais plus narratif et plus gamifié, mais la limite déclarée demeure : les interactions de recherche par pixels sont encore des coordonnées/hotspots explicites, pas une reconnaissance automatique multi-zones validée par le serveur. Les assets publics courts `2.webp` à `7.webp` correspondent respectivement aux six scènes supplémentaires et sont maintenus sous contrôle de taille par vérification manuelle.

### Neutralité du visualiseur de ciblage — 13 octobre 2026

Le bouton de fermeture de la vue agrandie des questions `point` est maintenant explicitement neutre (`type="button"`), afin de ne jamais être interprété comme une validation de réponse. Le parcours conserve la réponse en mémoire et le navigateur rend le focus au contrôle d’inspection après fermeture par clic ou par Échap.

Validation après la correction : **10/10 scénarios Chromium** du parcours des six moteurs, **5/5 tests unitaires** du moteur image, vérifications de contrat et frontières client réussies, build **399 992/400 000 octets JS**, **119 929/120 000 octets CSS**, images conformes et `git diff --check` propre. Aucun backend, score, timer, indice, fragment ou déverrouillage n’a été modifié.

### Régression globale après unicité des scènes — 13 octobre 2026

La suite Chromium complète finale termine à **533/533 réussis en 9,6 minutes**, sans échec, retry ni scénario ignoré. Elle couvre les neuf nouvelles scènes, les six moteurs, les erreurs et reprises, l’autorité serveur, le bilingue, les largeurs 320–1440 px, le trophée, le coffre, les badges, le classement et les contrôles d’accessibilité automatisés. Le test ciblé du bilan reste à **21/21**.

### Scènes Master dédiées par étape — 13 octobre 2026

Le Master ne réutilise plus le même décor pour ses quatre étapes. Quatre scènes statiques cohérentes avec l’environnement scientifique sont maintenant servies par étape : dossier multi-disciplinaire, tableau de preuves, console de diagnostic et chambre de sortie. Elles sont rendues en 1400×934, sans texte d’interface gravé, et les quatre actifs `8.webp` à `11.webp` restent sous 300 000 octets.

Le trophée de résultat est également servi comme actif statique `12.webp`, sans modification visuelle, afin de maintenir le budget du bundle principal. Validation : **31/31 tests image** sans mise à jour après renouvellement contrôlé de seulement quatre captures Master, **21/21 tests de bilan**, build **399 978/400 000 octets JS**, **119 929/120 000 octets CSS**, et absence de débordement aux largeurs 320/390/768/1280. Les quatre étapes Master ont été parcourues réellement dans l’interface, avec réponses serveur et progression de mission.

Limite toujours ouverte : les interactions de ciblage multi-zones/pixels côté serveur ne sont pas encore activées ; les contenus biomédicaux doivent être validés avant d’ajouter plusieurs zones d’identification.

### Fallback de scène sécurisé — 13 octobre 2026

Le sélecteur de héros mission ne renvoie plus une mission inconnue vers la scène de l’étape Master 1. Le fallback utilise maintenant une porte Master statique dédiée (`13.webp`). Build : **399 992/400 000 octets JS** ; la régression image après ce correctif reste à **31/31**.

Le contrôle de budget a également été renforcé pour inclure les rasters servis directement depuis `web/public/`, qui étaient auparavant hors de l’inventaire Vite. La vérification couvre désormais **28 images**, toutes sous 300 000 octets.

**VERDICT de tranche : PASS technique local.** Le goal global reste actif uniquement pour les travaux non encore réalisés : reconnaissance multi-zones/pixels côté serveur, scène exclusive du Master par étape, comparaison pixel-perfect avec les six maquettes et essais Safari/appareils réels.

### Validation intégrale du parcours — 13 octobre 2026

Après l’intégration des scènes Master et du contrôle de budget des actifs publics, la validation complète a été rejouée sans mise à jour des snapshots : **559/559 scénarios Playwright réussis en 8,9 minutes**, sans échec, retry ni scénario ignoré. Le run couvre Chromium desktop, le profil tactile iPhone 13 sur Chromium, le bundle de production et le bundle volontairement construit sans API.

Les parcours validés incluent les six moteurs, les réponses erronées puis corrigées, les explications et `Continuer`, les indices et leur persistance, l’expiration, les rechargements, la récupération de session, les défaillances réseau, les déverrouillages, le Master étape par étape, le coffre, les badges, le classement, le français/anglais, les portes illustrées, les scènes uniques des neuf missions, les résultats et l’accessibilité automatisée. Les tests unitaires restent à **350/350 frontend** et **274/274 backend**.

Le contrôle de compilation et de budget reste validé : JavaScript principal sous la limite de 400 000 octets, CSS sous 120 000, lazy JavaScript sous 160 000 et **28 rasters publics/compilés sous 300 000 octets chacun**. `git diff --check` est propre. Le dossier local est validé, mais aucun commit, push ou déploiement n’a été effectué.

**VERDICT de l’objectif initial : PASS technique local.** Restent explicitement hors de cette première passe, et à traiter dans un objectif séparé : reconnaissance réelle multi-zones/pixels côté serveur, comparaison pixel-perfect avec les maquettes, essais Safari/appareils physiques et validation biomédicale humaine. Ces limites ne sont pas présentées comme déjà réalisées.

