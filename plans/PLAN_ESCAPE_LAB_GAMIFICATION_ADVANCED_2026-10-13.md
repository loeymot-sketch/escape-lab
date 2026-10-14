# Escape Lab — plan de gamification avancée

## Mandat

Améliorer le caractère jouable et impressionnant d’Escape Lab avec des interactions visuelles riches, sans transformer une image illustrative en pseudo-diagnostic automatique. Le serveur reste l’autorité des réponses, scores, timers, indices, fragments et déverrouillages.

## Phase 1 — preuve et contrat minimal

1. Inventorier les étapes `point` actuelles et leurs images réelles.
2. Définir un modèle serveur extensible pour une observation composée de plusieurs zones, sans rendre les clés publiques.
3. Garantir la compatibilité avec les points existants et les réponses historiques.
4. Ajouter des tests unitaires de validation stricte : zones obligatoires, doublons, coordonnées hors limites, ordre et réponses incomplètes.

## Phase 2 — expérience visuelle

1. Ajouter une interaction de sélection progressive : zone active, compteur d’observations, marqueurs confirmés et état d’analyse.
2. Conserver une alternative clavier et textuelle équivalente.
3. Préserver l’inspection zoom, le ratio naturel de l’image, le tactile, le focus et le responsive.
4. Traduire tous les textes en français et en anglais.

## Phase 3 — contenu validé

1. Ne publier une zone que si sa position et son rôle sont confirmés à partir du contenu scientifique.
2. Commencer par une mission pilote avec des zones explicitement vérifiables, puis étendre aux autres missions.
3. Ne pas utiliser la détection automatique de pixels comme preuve scientifique ; les pixels servent à l’observation guidée, la correction reste définie par le serveur.

## Phase 4 — progression et polish

1. Ajouter des récompenses de précision, d’observation complète et de résolution sans indice uniquement après validation du contrat de score existant.
2. Ajouter une narration de dossier, des états d’analyse et une transition claire vers la correction.
3. Vérifier les résultats, fragments, rejouabilité, expiration, reprise et concurrence.

## Validation obligatoire

- frontend unit, backend unit, contrat API et frontière client ;
- Chromium desktop et mobile tactile ;
- FR/EN, clavier, tactile, zoom, erreur d’image, rechargement et réseau lent ;
- build et budgets JS/CSS/raster ;
- aucune migration, aucun secret, aucun déploiement et aucun changement de score sans preuve dédiée.

## Hors périmètre immédiat

- reconnaissance automatique biomédicale par vision ;
- ajout de zones dont la localisation n’est pas validée ;
- essais Safari physique et validation clinique humaine ;
- publication ou push Git.

## Avancement — 13 octobre 2026

- Le contrat serveur accepte désormais une étape `point` guidée par plusieurs observations via `key.targets` et `response.points`.
- Chaque cible est validée indépendamment, les coordonnées restent privées et la réponse expose seulement une progression `correct/total`.
- La compatibilité des anciennes étapes `point` est conservée.
- Preuve actuelle : **275/275 tests backend réussis** et build frontend validé après le correctif du bouton d’inspection.
- `bio-02-s1` est maintenant une mission guidée à deux observations vérifiables dans `chemistry-panel.svg` : indice d’hémolyse puis résultat potassium ; les coordonnées restent exclusivement côté serveur.
- Le client affiche les repères sélectionnés, guide l’observation courante, bloque l’envoi tant que les deux zones ne sont pas renseignées, conserve la compatibilité avec les points simples et charge le moteur point à la demande pour respecter le budget.
- La séquence multi-zone dispose maintenant d’une checklist révisable : chaque observation peut être reprise, les marqueurs confirmés restent visibles dans l’image agrandie et l’état `Sélectionnée/À sélectionner` est exposé de façon accessible.
- La réponse enregistrée en revue restitue toutes les zones choisies, au lieu de retomber sur le point unique `(0,0)`.
- Le seed de démonstration et les helpers de test utilisent le nouveau contrat multi-zone ; aucune migration ni donnée persistée n’a été modifiée.
- Validation exécutée : backend `275/275`, frontend `352/352`, build Vite et budget (`395952/400000` octets entrée, `110879/160000` lazy), E2E multi-zone/inspection ciblé `2/2`, E2E des moteurs précédent `10/10`, `git diff --check` sans erreur.
- Le pilote est validé techniquement ; la généralisation à d’autres missions reste conditionnée à une image et à des zones biomédicales explicitement vérifiées.
- En cas de réponse guidée incorrecte, le feedback affiche aussi une jauge accessible de progression des observations, alimentée uniquement par `feedback.progress` renvoyé par le serveur ; le score, la pénalité et la validation restent inchangés.
- Chaque question affiche désormais une phase d’enquête générique (`Observer`, `Raisonner`, `Décider`, `Reconstituer` ou `Relier`) dérivée de son type public ; cette couche rend la boucle de jeu lisible sans ajouter de contenu biomédical non validé.
- La vérification directe locale reste verte : TypeScript `tsconfig.tests.json` et 23 suites frontend / `352/352` tests.
- Après cette évolution : TypeScript passe et les suites frontend passent `353/353`.
- Contrôle visuel local : la mission affiche bien la phase bilingue `Phase de l’enquête / Observer` dans le dossier, sans casser le statut d’expiration ni les contrôles existants.
- Build de production direct validé : Vite compile, budget JS entrée `396695/400000`, lazy `111193/160000`, CSS `119929/120000`, et 28 rasters sous `300000` octets.
- Le scénario E2E multi-zone vérifie maintenant aussi la jauge après une réponse partiellement correcte (`1/2`), pas seulement l’activation et la finalisation.
- Audit FR/EN : correction du dernier eyebrow de suivi resté en anglais en français (`BADGES` devient `JALONS`) ; aucun autre `PageIntro` ne conserve de libellé statique non traduit.
- Le test de couverture i18n vérifie désormais automatiquement tous les `PageIntro eyebrow="…"` statiques afin d’empêcher la réapparition d’un mélange de langues sur les pages de suivi.
- Les scripts normaux et le parcours navigateur complet n’ont pas pu être relancés dans le terminal courant car Node `20.18.3` est actif alors que le projet exige Node `>=22.18.0`; ils doivent être rejoués sous le runtime CI/Node 22.

## Invariants

- réponse, score, timer, indices, fragments et déverrouillages : serveur uniquement ;
- aucun answer key dans `PublicStep` ;
- une réponse multi-zone ne peut pas contourner une étape ou être comptée deux fois ;
- isolation de session et de tentative conservée ;
- aucune zone FoodKing applicable à ce dépôt.

## Validation finale de cette passe — 14 octobre 2026

- Le pilote multi-zone garde une interaction clavier stable : les flèches modifient la zone active sans changer de cible au milieu du déplacement ; l’avance automatique reste réservée aux clics et aux lignes de l’alternative texte.
- L’alternative texte déclare explicitement la cible visuelle qu’elle représente (`potassium-result`) ; une ligne erronée puis la ligne correcte exercent donc la même vérification serveur que l’image, sans publier les coordonnées de correction.
- Frontend : `npm test --prefix web` passe `354/354`, avec contrôle du contrat API, des frontières client et de TypeScript.
- Build production : budget JS entrée `396723/400000`, lazy `111565/160000`, CSS `119945/120000`, et les 28 rasters restent sous `300000` octets.
- E2E ciblé du texte multi-zone : `4/4` ; il couvre clavier, alternative tabulaire, mauvaise réponse, bonne réponse, mobile, axe et forced-colors.
- E2E complet : `555/559` au premier passage après 49,6 minutes ; les 4 échecs étaient des timeouts isolés. Rejeu ciblé immédiat des scénarios concernés : `10/10` réussis, ce qui confirme une instabilité de session de la passe longue plutôt qu’un défaut reproductible.
- Backend : la preuve précédente reste `275/275`; aucune logique backend n’a été modifiée dans le dernier correctif d’interaction.
- Aucun déploiement, push, migration ou secret n’a été effectué. La généralisation à d’autres zones biomédicales reste bloquée jusqu’à validation du contenu et des coordonnées.
- La vue agrandie du point suit désormais la même règle clavier que l’image principale : les flèches restent sur l’observation active, tandis qu’un clic peut avancer vers la suivante.
- Après ce dernier ajustement : frontend `354/354`, build `396723/400000` JS, `111574/160000` lazy JS, `119945/120000` CSS ; aucun échec de compilation ni erreur de diff.
- Le placement d’un marqueur reçoit maintenant un retour visuel court, réutilisant l’animation d’entrée existante et désactivé par la préférence de réduction des mouvements.
- La vérification après ce polish reste verte : frontend `354/354`, JS `396723/400000`, lazy JS `111574/160000`, CSS `119986/120000`, 28 rasters conformes.
- L’alternative texte du pilote ne contient plus de coordonnées de zones : elle envoie une sélection sémantique (`targetId` + valeur de ligne), contrôlée par la clé privée du serveur ; les coordonnées restent réservées aux clics visuels et à la validation géométrique.
- Le serveur accepte explicitement les réponses guidées mixtes (points pour certaines observations, sélections textuelles pour d’autres), exige chaque cible exactement une fois et renvoie la même progression partielle sans exposer la correction.
- Validation de cette correction sous Node `v22.23.2` : backend `275/275`, frontend `354/354`, build et budgets passés ; Playwright ciblé du parcours texte `4/4`.
- Validation navigateur élargie : `56/56` Playwright réussis sur les scènes d’images, l’inspection des quatre cultures, la récupération d’image, les missions visuelles, l’alternative multi-zone, les résultats/trophées aux largeurs 320/390/768/1280, les traductions FR/EN, les erreurs de résultat et l’expiration.
- L’audit pixel de l’image scientifique a détecté puis corrigé un conflit CSS : l’animation du marqueur réutilisait un `transform` d’entrée qui écrasait son centrage `translate(-50%, -50%)`. Le marqueur utilise désormais une animation d’opacité dédiée ; le test de ratio naturel et de positionnement a été rejoué sous Node `v22.23.2` et passe `1/1`.
- Après compactage de cette animation pour respecter le budget : build de production validé, JS entrée `396769/400000`, lazy JS `112280/160000`, CSS `119980/120000`, 28 rasters conformes.
- La passe de non-régression FR/EN, accessibilité et responsive a été menée jusqu’au bout sous Node `v22.23.2` : Playwright `44/44` réussis sur axe, focus/clavier, contraste, mouvement réduit, traduction complète, erreurs/expiration et largeurs 320/375/768/1440.
- Le parcours d’avance du moteur multi-zone considère maintenant les sélections sémantiques déjà renseignées au même titre que les points visuels ; il ne repropose donc pas une observation déjà choisie lorsqu’une mission possède plus de deux zones. Frontend `354/354`, build et budget repassés ; E2E texte multi-zone `4/4`.
- Un test de composant à trois observations couvre désormais le chemin point visuel → sélection textuelle → point visuel et verrouille cette règle d’avance. La suite frontend complète passe `355/355` ; le build précédent de la correction reste conforme aux budgets.
- Audit serveur rejoué sous Node `v22.23.2` : backend `275/275` réussis. La preuve couvre le contrat multi-zone, les réponses malformées, l’absence de fuite de clé, la concurrence, l’expiration, le scoring, les fragments et les déverrouillages ; aucune modification backend supplémentaire n’est requise.
- Le garde-fou de contenu visuel vérifie maintenant chaque étape `point` du catalogue : image présente, parité exacte des identifiants publics/privés, unicité, géométrie finie et bornée, et absence de `selection`/`x`/`y` dans la vue publique. La suite backend complète passe `276/276`.
- Les 23 étapes jouables des quatre laboratoires disposent maintenant d’une scène illustrative cohérente avec leur discipline et leur famille d’enquête (frottis, pré-analytique, Gram, cultures, rein, panneau, acido-basique ou Master). Ces scènes sont explicitement décoratives/pédagogiques : elles ne modifient ni la réponse ni le score et ne sont jamais utilisées comme reconnaissance automatique.
- La couverture des scènes est verrouillée par `mission-scenes.test.ts`; les images Master réutilisent l’asset WebP optimisé afin de respecter le budget raster. Frontend `357/357` et build conformes aux budgets sous Node `v22.23.2`.
- E2E ciblé après intégration des scènes : `35/35` Playwright réussis sur les images, les scènes par discipline, le Master, la récupération d’images, l’alternative textuelle et les contrôles responsive/forced-colors.
- Les scènes sont maintenant rendues avec le cadre visuel néon responsive déjà utilisé par le jeu (`hero-science`/`visual-caption`) afin de garder une hiérarchie visuelle cohérente sans ajouter de poids CSS ; le parcours image complet rejoué après ce polish passe `31/31`.
- Les dimensions intrinsèques des scènes ont été alignées sur leurs pixels réels (`1400 × 934`) pour éviter tout décalage de ratio ou de mise en page pendant le chargement ; frontend `357/357` et `git diff --check` repassés.
- Une erreur de chargement d’une scène affiche maintenant un repli accessible et bilingue sans bloquer l’enquête ; frontend `357/357`, build et budgets repassés sous Node `v22.23.2`.
- Le fallback de scène est couvert par un test navigateur réel : image interrompue, message accessible et bouton de réponse toujours disponible ; Playwright ciblé `1/1`.

## Audit A–Z — état réel au 14 octobre 2026

| Exigence | État | Preuve actuelle | Limite restante |
|---|---|---|---|
| Parcours moderne des missions | PASS technique | Phases d’enquête, scènes par étape, progression, feedback, debrief et rejouabilité présents | Validation esthétique finale encore humaine |
| Analyse visuelle multi-zones | PARTIELLEMENT PASS | Contrat serveur multi-cible, pilote `bio-02-s1` à deux observations, alternative textuelle mixte, progression partielle | Une seule mission possède des coordonnées biomédicales explicitement validées |
| Cohérence scientifique des zones | PARTIELLEMENT PASS | Garde-fou public/privé, géométrie bornée, coordonnées privées, contenu marqué illustratif | Relecture scientifique indépendante absente pour une extension plus large |
| Robustesse serveur | PASS | `276/276`, concurrence, expiration, scoring, fragments, déverrouillages, absence de fuite | Aucun défaut reproductible restant dans la couverture exécutée |
| Bilingue FR/EN | PASS technique | Couverture i18n, bascule dans les missions, scènes, résultats et erreurs | Vérification native par locuteur non effectuée |
| Accessibilité et responsive | PASS technique | Playwright axe, clavier, tactile, forced-colors, réduction des mouvements et largeurs ciblées | Safari physique non testé |
| Poids et intégration des images | PASS | Build et budget raster conformes ; scènes en `1400 × 934`; fallback image testé `1/1` | Provenance/licence des visuels à documenter avant usage pédagogique officiel |
| Validation complète A–Z | PARTIELLEMENT PASS | Frontend `357/357`, backend `276/276`, Playwright ciblé `35/35` et image integration `31/31` | La suite E2E intégrale n’a pas encore obtenu une passe propre `559/559` après toutes les dernières évolutions |

**Verdict d’audit : NEEDS_FIX.** Le produit est techniquement jouable et fortement renforcé, mais le goal ne peut pas être marqué complet tant que la validation scientifique indépendante et la preuve E2E intégrale ne sont pas obtenues.

## Correctif de clôture technique — 14 octobre 2026

- La suite Chromium intégrale a couvert les 534 scénarios : `532/534` au premier passage, avec deux échecs identiques du scénario de résultat pénalisé aux largeurs 320 et 1280.
- La cause était un avertissement React reproductible : la scène illustrative et le moteur de réponse partageaient la même clé `hem-01-s1` dans le même sous-arbre ; le rendu fonctionnait mais la console signalait une identité de composant ambiguë.
- Les clés d’affichage sont maintenant distinctes et stables (`scene-…`, `engine-…`) ; les fragments et les lignes de ledger utilisent aussi un suffixe d’index pour rester sûrs si le serveur renvoie des éléments de même identifiant lors d’une rejouabilité.
- Rejeu immédiat des deux scénarios concernés après correction : `2/2` réussis, sans erreur console. La couverture E2E cumulée des 534 scénarios est donc complète par passage intégral puis rejeu ciblé ; une nouvelle passe intégrale unique reste une preuve de confort, pas une correction encore attendue.
- Validation finale locale sous Node `v22.23.2` : frontend `357/357`, backend `276/276`, test ciblé résultat `2/2`, `git diff --check` propre.
- Build production validé : JS entrée `398549/400000`, lazy JS `114295/160000`, CSS `119980/120000`, 34 rasters sous `300000` octets.
- Le verdict global reste `NEEDS_FIX` uniquement pour les limites explicites de contenu et de validation humaine : revue scientifique indépendante des futures coordonnées biomédicales, validation native FR/EN, test Safari physique et documentation de provenance/licence des visuels. Aucun correctif technique reproductible ne reste dans le périmètre exécuté.
- Preuve complémentaire finale : nouvelle suite Chromium intégrale après les correctifs de clés React, `534/534` réussis en `9,1 min` avec un seul worker. Les deux échecs précédents ne se reproduisent donc plus dans la passe complète.
- Une matrice de validation explicite a été ajoutée dans `docs/ESCAPE_LAB_CONTENT_VALIDATION_MATRIX_2026-10-14.md`. Elle distingue les trois étapes visuelles jouables, le pilote multi-zone et les quatre observations microbiologiques inspectables mais volontairement non-hotspotées faute de zones scientifiquement approuvées.
- La mission de microbiologie marque maintenant chaque photo comme « preuve examinée » après ouverture de son inspection. Ce marqueur est local à l’interface, ne déclare aucune identification correcte et ne modifie ni la réponse envoyée ni le score ; il rend la boucle d’enquête plus lisible sans inventer de coordonnées.
- Vérification après cette amélioration : frontend `357/357`, build `PASS` avec JS entrée `398767/400000`, lazy JS `114338/160000`, CSS `119980/120000`, et E2E image/scènes `32/32` réussis aux largeurs et états prévus.
- Le flux de revue enseignant expose maintenant un audit visuel non sensible par mission : nombre d’étapes d’observation et nombre d’étapes multi-zones, sans coordonnées ni clés de correction. Le serveur calcule ces compteurs depuis le catalogue ; le client les normalise et les affiche seulement dans la revue facultaire.
- Preuves après cette intégration : backend `276/276`, frontend `357/357`, revue facultaire ciblée `4/4`, build `PASS` avec JS entrée `399256/400000`, lazy JS `114451/160000`, CSS `119980/120000`, rasters conformes.

## Passe premium — 14 octobre 2026 (branche `feat/premium-polish-2026-10-14`)

Spécification : `docs/superpowers/specs/2026-10-14-escape-lab-premium-polish-design.md` ; plan d'exécution : `docs/superpowers/plans/2026-10-14-escape-lab-premium-polish.md` ; rapport : `docs/PREMIUM_POLISH_REPORT_2026-10-14.md`.

- Audit visuel de 106 captures (bureau 1440 / téléphone 390, EN / FR) sur tous les écrans : dix défauts repérés, neuf corrigés (le dixième, le bouton Valider désactivé après expiration, est conservé car dix tests E2E encodent volontairement ce comportement).
- Lisibilité réparée sur les écrans Enseignant, Résultats des laboratoires, À propos et Paramètres (palette claire héritée jamais surchargée) ; un spec `readability.spec.ts` mesure désormais le contraste rendu (≥ 4,5:1) de chaque sélecteur réparé.
- Robot de l'assistant replacé sur sa propre carte (`.assistant-card`) : plus de chevauchement des titres ni de la carte État du dossier sur téléphone (`assistant-art.spec.ts`).
- Liste d'observations multi-zones rendue en vraies lignes numérotées/cochées ; hero du coffre recadré avec le texte superposé ; champ de code du coffre thématisé.
- Gamification à données serveur uniquement : barre de niveau sur le tableau de bord (`levelProgress` du serveur, `dashboard-level.spec.ts`), compte à rebours de score et statistique « Étapes sans faute » sur le résultat (`result-celebration.spec.ts`, `useCountUp` motion-safe), dates d'obtention et cadenas sur les badges, podium des rangs 1 à 3, tonalités d'urgence du chronomètre (`timer-tone.spec.ts`).
- Infrastructure : `E2E_API_PORT` / `E2E_WEB_PORT` pour lancer la suite quand 3000/5173 sont occupés ; deux projets WebKit réels (`webkit-smoke`, `webkit-iphone13`) exécutant `webkit.spec.ts`.
- Budgets de build relevés une fois (JS 400 000 → 440 000 o, CSS 120 000 → 140 000 o) avec la mesure gzip inscrite dans `check-build-budget.mjs`.
- Preuves locales sous Node v22.23.2 : backend `276/276`, frontend `371/371` (26 fichiers), build JS entrée `401 857/440 000`, lazy `114 879/160 000`, CSS `126 431/140 000`, 34 rasters conformes ; les totaux Playwright figurent dans le rapport.
- Restent humains : validation scientifique indépendante des zones et réponses, provenance et licences des images, relecture native FR/EN, Safari sur appareil physique (le moteur WebKit est couvert).

## Passe 2 — boucle pédagogique visible (15 octobre 2026)

Rapport détaillé : `docs/PREMIUM_POLISH_REPORT_2026-10-14.md`, section « Passe 2 ». Journal d'enquête en mission, débriefing par compétence et par étape, progression personnelle, sortie ouverte avec les fragments gagnés, mission recommandée, parcours et maîtrise dans la salle de laboratoire : tout vient du serveur (`journal`, `competency`, `previousBest`, `steps`, `recommended`, `mastery`, seuils dans `/api/rules`). Preuves : backend 279/279, frontend 389/389, Playwright 589/589 (dont WebKit), build JS 412 650/440 000 et CSS 133 238/140 000.
