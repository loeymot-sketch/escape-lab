# Studio enseignant et salles des enseignants — rapport (2026-10-21)

> **Validation locale uniquement.** Aucune CI distante, aucune revue humaine indépendante. Le contenu des salles de démonstration est **fictif, rédigé pour la démonstration et non relu par un expert biomédical**. Voir `docs/KNOWN_LIMITATIONS.md`, section « Teacher Studio ».

## Demande

Avant l'ouverture des prochains laboratoires : donner aux enseignants un vrai espace pour **créer et modifier des salles**, **ajouter des questions**, **téléverser une image**, écrire des **choix et des réponses pièges**, placer **une zone à cliquer sur une photo avec une tolérance en pixels (par exemple 5 px)**, et **voir les résultats de tous les élèves** ; le tout présentable devant des enseignants.

## Décision d'architecture

Les dix missions intégrées forment un catalogue verrouillé et très testé (fragments, codes de sortie, badges, compétences, analyses). Plutôt que de le rendre modifiable (et de fragiliser chaque garantie existante), les salles des enseignants forment **un système parallèle**, avec les mêmes règles : **les réponses ne quittent jamais le serveur** avant la fin d'une tentative, la correction et le score sont calculés côté serveur. Une mission intégrée peut être **copiée en salle modifiable** ; l'original ne change pas. Spécification : `docs/superpowers/specs/2026-10-21-teacher-studio-design.md`.

## Ce qui a été construit

### Côté enseignant (« Studio enseignant »)
- **Liste des salles** : couverture, statut (brouillon, publiée, archivée), nombre de questions, score qualité, élèves touchés, moyenne ; créer, partir d'une mission existante, dupliquer, supprimer (confirmation intégrée).
- **Éditeur** : questions dans une colonne (réordonner, dupliquer, supprimer), sept formats :
  - **QCM** à une ou plusieurs bonnes réponses ; chaque option est *correcte*, *fausse* ou **piège**, avec sa propre explication ;
  - **vrai/faux** (affirmation piège possible) ;
  - **réponse courte** (accents, majuscules, ponctuation ignorés ; une faute de frappe pardonnée sur les mots de 5 lettres ou plus ; **réponses pièges** avec explication) ;
  - **réponse numérique** (tolérance, unité, **valeurs pièges** : mauvaise unité, conversion oubliée) ;
  - **clic sur l'image** : on **dessine des cercles ou des rectangles** sur la photo, on les déplace, on règle la **tolérance en pixels de l'image d'origine** (5 px par défaut, anneau en pointillés visible), on marque des **zones pièges** avec explication, on exige « une zone » ou « toutes les zones » ; l'outil **« Tester un clic »** affiche exactement la correction du serveur (« Accepté : 3 px du bord, tolérance 5 px », « Raté : 22 px de … », « Piège : … ») ;
  - **remettre dans l'ordre**, **associer par paires**.
- **Images** : téléversement (glisser-déposer, réduction automatique des grandes photos à 2400 px), « Mes images », **bibliothèque** des illustrations du jeu ; description obligatoire pour les étudiants qui ne voient pas l'image.
- **Réglages** : mode **escape game** (on recommence jusqu'à trouver, chaque question résolue révèle une partie du **code du coffre**) ou **examen** (une réponse par question, points partiels, correction à la fin, retour immédiat facultatif), durée limite, seuil de réussite, nombre de tentatives, mélange des questions et des options, affichage des réponses attendues dans le bilan, introduction et message de fin, **classes** concernées.
- **Contrôle qualité** (calculé par le serveur à chaque enregistrement, score sur 100) : piège sans explication, zones correcte et piège qui se chevauchent, zone trop petite pour un téléphone, description d'image trop courte, pas d'explication, pas d'indice, bonne réponse toujours à la même place, option correcte bien plus longue que les autres, etc. Les **erreurs bloquent la publication**.
- **Aperçu « comme un étudiant »** : corrigé par le serveur exactement comme une vraie tentative, rien n'est enregistré, zones et tolérance visibles pour l'enseignant.
- **Résultats** : score moyen et médian, part des étudiants reçus, temps médian, **part des réponses tombées dans un piège**, répartition des scores ; **question par question** : juste du premier coup, résolue au final, tombés dans un piège, options choisies (pièges en rouge), réponses tapées les plus fréquentes, **carte de chaleur de tous les clics** sur l'image ; tableau de **toutes les tentatives** (tri, filtre, **export CSV** protégé contre l'injection de formules) et **détail réponse par réponse** d'un étudiant.

### Côté étudiant (« Salles des enseignants »)
- Les salles publiées pour ses classes, avec son meilleur score, la reprise d'une tentative en cours, les tentatives restantes.
- Un lecteur : minuteur, progression, **fragments du coffre**, indices (−10 % sur la question), retours **« Piège ! »** avec l'explication écrite par l'enseignant, explication après la bonne réponse, saisie du code final, puis un **bilan** (réponses, réponse attendue si l'enseignant l'autorise, explication, clics sur l'image).
- **Alternative textuelle** pour chaque question « clic sur l'image » (libellés des zones mêlés à des leurres) et bouton **« Agrandir l'image »** pour viser précisément sur téléphone.

### Deuxième passe (même jour)
- **Laboratoires à venir** : la carte des laboratoires indique sur une carte « Bientôt disponible » (ex. Immunologie) les salles d'enseignants déjà ouvertes dans cette discipline, avec un lien direct ; le tableau de bord affiche un encart « De vos enseignants ».
- **Résultats par classe** : filtre de classe sur les résultats (`GET /api/studio/rooms/:id/results?classId=`), limité aux classes de l'enseignant.
- **Partage entre enseignants** : export d'une salle en fichier JSON et import depuis la liste ; les images envoyées par un autre enseignant ne voyagent pas et sont signalées.
- **Création de zone au clavier** : « Ajouter un cercle / un rectangle au centre », puis placement par les champs x / y / rayon, sans souris.

### Garanties techniques
- Les identifiants montrés à l'étudiant (options, éléments, zones, colonne de droite) sont des **jetons opaques par tentative** (dérivés d'un sel secret) : ils ne trahissent ni la bonne réponse ni les leurres.
- Chaque tentative garde **une copie de la salle au démarrage** : modifier une salle publiée ne change ni une tentative en cours ni un résultat passé. Les enregistrements concurrents sont refusés (`409 version_conflict`), jamais écrasés.
- Images : type et dimensions **lus dans les octets** (PNG, JPEG, WebP, GIF ; **SVG refusé**), 4 Mo maximum, quota par enseignant, servies avec une CSP `sandbox` et `nosniff`.
- En examen sans retour immédiat, ni la justesse, ni les points, ni le score courant ne sont envoyés avant la fin.
- Démonstration : trois salles publiées (immunologie, frottis piégé, examen de microbiologie) et **86 tentatives simulées** jouées par le vrai service ; « Reset guest session » les restaure.

## Audit adversarial (un agent IA relecteur, lecture seule, même équipe)

Onze constats, tous reproduits par le relecteur puis corrigés, chacun couvert par un test de non-régression (`be/test/studio.test.ts`, section « adversarial review ») :

| # | Gravité | Constat | Correctif |
|---|---|---|---|
| 1 | P0 | Un étudiant pouvait envoyer les identifiants internes (ex. `a`, `p1`) au lieu des jetons et être noté juste ; une association « identité » était toujours correcte. | Traduction stricte : toute valeur qui n'est pas un jeton de la tentative est refusée (400), sans compter d'erreur. |
| 2 | P1 | Avec « réponses attendues » désactivé, le bilan exposait encore la table des libellés (qui reconstruit la clé) et les explications. | Bilan étudiant sans identifiants ni table ; réponses décrites en mots par le serveur ; explication seulement pour les questions résolues. L'enseignant voit tout. |
| 3 | P1 | « Une zone suffit » avec plusieurs zones correctes : un clic n'était jamais accepté. | Un clic dans n'importe quelle zone correcte suffit. |
| 4 | P1 | Appariement des clics exponentiel (22,8 s pour 10 zones superposées : serveur bloqué). | Appariement biparti par chemins augmentants (12 zones : moins de 100 ms dans le test). |
| 5 | P2 | Les listes de 2 éléments étaient toujours inversées (ordre trahi). | Mélange non biaisé ; la règle « jamais l'ordre d'origine » ne s'applique qu'à partir de 3 éléments. |
| 6 | P2 | Une alternative textuelle à un seul libellé donnait la réponse. | Moins de 3 libellés : erreur bloquant la publication. |
| 7 | P2 | Une expiration était annulée par le rollback d'une réponse tardive ; « reprendre » renvoyait une tentative expirée. | Expiration écrite hors transaction ; nouvelle tentative au démarrage ; résultats et liste rafraîchissent les tentatives en retard. |
| 8 | P3 | En examen sans retour, l'en-tête affichait « null / 30 pts ». | Score masqué tant qu'il est caché (et plus de points renvoyés par réponse). |
| 9 | P3 | Une faute de frappe tolérée confondait methanol / ethanol, ilium / ileum. | Tolérance seulement à partir de 7 caractères et jamais sur la première lettre. |
| 10 | P3 | Un enregistrement pouvait effacer ce qui était tapé pendant la requête. | Le document n'est remplacé que s'il n'a pas changé entre-temps. |
| 11 | P3 | Une tentative restait jouable après dépublication ou retrait de la classe. | Salle revérifiée à chaque réponse, indice et code (`409 room_closed`). |

Deux défauts trouvés avant l'audit sont aussi corrigés et testés : un code de coffre faux était décompté puis annulé par le rollback (limite de 10 essais inopérante) ; en examen sans retour, le score courant et les points par réponse trahissaient la justesse.

## Vérification (locale)

Node 22.23.2, macOS. Commandes : `cd be && npm test && npm run typecheck && npm run openapi` ; `cd web && npm test && VITE_API_URL=/api npm run build` ; `cd web && CI=true npx playwright test` (ports déplacés par `E2E_API_PORT=3200 E2E_WEB_PORT=5273 E2E_PROD_PORT=4373 E2E_UNCONFIGURED_PORT=4374`).

| Contrôle | Résultat |
|---|---|
| Tests backend | **313/313** (dont 22 pour le Studio, filtre de classe inclus, et 1 pour la démonstration) |
| Typecheck backend | propre |
| Tests unitaires web (Vitest, couverture française, contrat d'API, frontières client) | **405/405** |
| Build de production et budget | entrée 421 258 / 440 000 o (plafond inchangé), JS différé élève 40 492 / 160 000, dictionnaire français 148 055 / 180 000, Studio 71 087 / 120 000, CSS d'entrée 136 119 / 140 000, CSS différé 36 252 / 60 000 |
| Playwright `e2e/studio.spec.ts` | 5/5, dont **zéro violation axe** sur la liste, l'éditeur, les résultats, la liste élève et le lecteur ; tableau de bord, carte, zone au clavier, filtre de classe, export puis import |
| Playwright complet (Chromium, iPhone 13 émulé, bundle de production, moteur WebKit) | **605/605** (10,0 min), dernière exécution après la deuxième passe. Une exécution antérieure avait eu une erreur SQLite ponctuelle « unable to open database file » lors d'une réinitialisation de démo (fichier de base dans un dossier temporaire) ; elle ne s'est pas reproduite. |

Captures de référence mises à jour après contrôle visuel des différences (seule la barre de navigation a changé : nouvelle entrée « Teacher rooms » / « Teacher Studio ») : `game-navigation` (menus 320, 390, fr-320, faculty-menu-320, rooms/vault/badges/leaderboard 1280) et `vault-art` (en-768, fr-768, fr-1280). Tests adaptés : nombre d'entrées de navigation (élève 9, enseignant 5), ordre clavier du menu mobile, bouton « Rooms » désormais cherché en correspondance exacte.
