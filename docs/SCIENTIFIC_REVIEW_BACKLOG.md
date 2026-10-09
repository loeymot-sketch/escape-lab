# Escape Lab - Backlog de revue scientifique (contenu biomédical)

Date de rédaction : 2026-10-08 (complété le 2026-10-09 : B-01 à B-03, références de lignes de la section 4 mises à jour ; l'empreinte de `content.ts` ci-dessous est inchangée). Statut : **document de préparation, NON SIGNÉ, aucune validation.**
Destinataires : relecteurs biomédicaux (Université de Monastir / ESSTSM, HEPL) et référent pédagogique.

**Qui écrit ceci.** Ce backlog a été rédigé par un assistant d'IA (Claude) qui a relu `be/src/content.ts`, les tests, les documents de validation et les trois images. **Ce n'est pas une autorité clinique ni biomédicale.** Tout ce qui suit est une liste de points à vérifier, formulée avec prudence. Quand je n'ai pas de certitude, je le dis ("à confirmer"). Aucune référence bibliographique n'est citée ; quand une norme ou une recommandation est évoquée (CLSI, ISO 15189, ICSH, KDIGO...), c'est uniquement un document que les experts devraient consulter, sans que j'en rapporte le contenu.

Version relue (pour tracer ce qui a été examiné, empreintes SHA-256) :
- `be/src/content.ts` : `d4bd3b647676886062b914b9b50c50600dc39bba3e63984037f4849badd85a39`
- `web/src/assets/blood-smear-hero.webp` : `bcf771c36e5188b2fd3c3ef3008f5f2b09d3e0065ce6be2cec52eaf0b868f0c3`
- `web/src/assets/chemistry-panel.svg` : `65d4f92e9777ff9a4c8323f72039ed3e6049993b9f27642545beffbfd01f96b6`
- `web/src/assets/labescape-investigation-hero.webp` : `cedafde8f82d18d3f3ce0810e742a53f5d586b75567065adae7c3137bf41a0f8` (image d'ambiance, non utilisée dans une mission)

Aucune copie de contrôle de version (pas de dépôt Git dans ce dossier) : les relecteurs doivent figer et noter ces empreintes avant de relire (voir section 5).

---

## 1. Périmètre et statut

### 1.1 Ce qui est vérifié techniquement (hors sujet pour la validation biomédicale)
- Cohérence structurelle du catalogue (`be/test/content.test.ts`) : 4 labs jouables, 3 missions par lab standard, ids uniques, la clé choisie fait partie des options, les points d'image sont dans l'image, un ordre et des appariements sont complets, la répartition A/B/C/D des bonnes réponses n'est pas déséquilibrée (test `content.test.ts:51-56`).
- Le serveur garde les clés et explications cachées avant la réponse ; le scoring, les chronos et les pénalités sont côté serveur.
- Les tests automatisés (backend, frontend, navigateur) sont verts selon `docs/FINAL_VALIDATION_REPORT.md`. Je n'ai pas rejoué ces tests.
- Le test `content.test.ts:67-85` vérifie que les coordonnées des deux points correspondent bien aux repères mesurés (en pixels) sur les deux images. Il vérifie la cohérence géométrique, pas la justesse scientifique de ce qui est désigné.

### 1.2 Ce qui n'est PAS validé biomédicalement (liste explicite)
1. L'exactitude de chaque valeur, unité, intervalle de référence et drapeau (L, H, LL, HH).
2. La justesse de chaque clé de réponse et l'absence de réponse alternative défendable.
3. L'exactitude et l'exhaustivité de chaque explication, indice (hint) et texte "recheck" (message affiché après une mauvaise réponse).
4. La conformité des étapes opératoires (coloration de Gram, gestion d'un prélèvement non conforme, résultat critique) aux pratiques des laboratoires tunisiens et belges.
5. Les trois images (voir 1.3) et la position des zones cliquables.
6. Les explications et indices générés par l'assistant IA optionnel (variables `LAB_ASSISTANT_*`) : s'il est activé, du texte non relu par un expert peut être livré à l'étudiant ; la protection anti-fuite des réponses est "un dernier rempart, pas une garantie" (`docs/KNOWN_LIMITATIONS.md:31`). Revue du contenu = hints rédigés par la faculté uniquement, assistant désactivé.
7. L'adéquation pédagogique (difficulté, niveau des étudiants visés, barème) : jamais testée avec des étudiants.
8. Le statut `draft / reviewed / approved` dans l'application ne vaut pas validation : il n'est pas lié au contenu (`docs/KNOWN_LIMITATIONS.md:10`, modifier `content.ts` ne le réinitialise pas) et un seul enseignant peut tout approuver (`:9`).
9. Le contenu est uniquement en anglais ; `language: 'fr'` existe mais sans contenu français (`docs/KNOWN_LIMITATIONS.md:43`).

### 1.3 Les images : œuvres illustratives, jamais une référence clinique
- `blood-smear-hero.webp` (frottis, 1672x941) : image d'illustration pour la mission hem-01.
- `chemistry-panel.svg` (bilan, 1600x900) : vignette dessinée en SVG, qui porte elle-même la mention "ILLUSTRATIVE TRAINING IMAGE - NOT A REAL REPORT" (`chemistry-panel.svg:6`). Les valeurs sont inventées.
- `labescape-investigation-hero.webp` : scène d'ambiance (microscope, tubes, boîtes de Pétri, écran). Elle n'est pas un support de mission ; son aspect évoque une image de synthèse.
- **Ces images ne doivent jamais être présentées, utilisées ou diffusées comme référence morphologique, diagnostique ou clinique.** Le texte à l'écran dit déjà "not a real specimen, not a validated image and not for clinical use" (`web/src/components/engines.tsx:128`) ; voir toutefois C-07 sur l'origine réelle de l'image du frottis, que le dépôt ne documente pas.

---

## 2. Revue mission par mission

Légende : `fichier:ligne`. Le fichier `be/src/content.ts` est abrégé **c:** (ex. `c:44`). Aucun "objectif d'apprentissage" n'est codé explicitement : je donne l'objectif **déduit** du titre, de la compétence (`competency`) et de l'énoncé. Les options A-D sont affichées dans l'ordre écrit (pas de mélange côté serveur : `be/src/engines.ts:89`).

| Mission | Titre / moteur | Compétence codée | Bonne réponse codée |
|---|---|---|---|
| hem-01 | Blood Smear Code / image_identify | Hematology interpretation | clic sur le schistocyte, point (73.6 %, 46.8 %), rayon 6 (c:43) |
| hem-02 | Fix the Sample / decision | Pre-analytical quality | S1 reject, S2 repeat, S3 accept (c:55, 67, 79) |
| hem-03 | Anemia Detective / stepper | Hematology, Clinical reasoning | A (microcytique), C (carence en fer), D (chercher une perte sanguine) (c:93, 103, 112) |
| mic-01 | Microbe Detective / stepper | Microbiology investigation | B (cocci Gram+ en amas), D (Staphylococcus), C (S. aureus) (c:126, 136, 146) |
| mic-02 | Gram Stain Challenge / drag_order | Microbiology investigation | fixation, cristal violet, lugol, décolorant, safranine (c:163) |
| mic-03 | Petri Dish Mystery / matching | Microbiology investigation | MacConkey rose = E. coli ; hémolyse bêta + cocci en chaînettes = S. pyogenes ; envahissant = Proteus ; vert + odeur = Pseudomonas (c:186) |
| bio-01 | Organ Rescue Mission / stepper | Clinical biochemistry | D (rein), C (potassium 6,1), A (refaire K sur échantillon non hémolysé) (c:200, 210, 219) |
| bio-02 | Lab Value Hacker / image_identify | Clinical biochemistry | clic sur le potassium, point (55 %, 43.9 %), rayon 5.5 (c:232) |
| bio-03 | Acid-Base Emergency / stepper | Clinical biochemistry | B (acidose métabolique), C (trou anionique élevé, 18), A (compensation appropriée, formule de Winter) (c:245, 255, 264) |
| master-01 | Clinical Detective / stepper (4 étapes) | Hematology, Microbiology, Biochemistry, Clinical reasoning | A (microcytose), C (S. gallolyticus), B (ferritine interprétable), "alert" (c:279, 289, 299, 313) |

Points transversaux à trancher d'abord (valables pour plusieurs missions) :
- **T-1 Jeu de valeurs de référence** : lequel est visé ? Les intervalles du code (Hb 12.0-15.5 g/dL femme, 13.5-17.5 homme, VGM 80-100 fL, plaquettes 150-400, ferritine 15-150 femme / 30-400 homme, créatinine 0.7-1.3 mg/dL...) ressemblent à des intervalles de manuels souvent employés ; je ne sais pas à quelle population ni méthode ils correspondent. Les laboratoires tunisiens et belges ont leurs propres intervalles (accréditation ISO 15189 : intervalles propres au laboratoire, à consulter). Quel est le laboratoire de référence du projet ?
- **T-2 Unités** : mélange d'unités conventionnelles (mg/dL, µg/dL, BUN) et SI (mmol/L, µmol/L) selon les missions (voir C-03). Quelle convention enseigner en Tunisie et en Belgique ? Mon impression (à confirmer) : les pratiques diffèrent selon les laboratoires et les pays (g/L, mg/dL ou mmol/L pour la glycémie ; urée plutôt que BUN en pays francophones).
- **T-3 Langue** : anglais, orthographe américaine ("hematology", "anemia"), points décimaux (les laboratoires francophones écrivent souvent la virgule), "×10⁹/L" (fréquemment "G/L" en français), "BUN" (terme anglo-saxon ; en France/Belgique/Tunisie on parle plutôt d'urée).
- **T-4 Périmètre professionnel** : plusieurs étapes demandent "what should the report recommend" (c:110, c:306). Qu'est-ce qu'un étudiant biologiste/technologue biomédical est autorisé à recommander, en Tunisie et en Belgique ?

### hem-01 - Reconnaître un schistocyte sur un frottis
Objectif déduit : identifier un fragment érythrocytaire. Clé : point (c:43). Image `smear-schistocyte-01`.
- Texte : context "Peripheral blood smear, 100x oil. Hemolytic anemia work-up, post-mechanical valve." (c:39) ; prompt "Click the schistocyte (fragmented red cell)." (c:40) ; légende "Stylised blood smear (illustrative)" (c:41).
- Explication (c:44) : "irregular red cell fragments with sharp edges and no central pallor". Incomplet ou trop simple ? Définition morphologique des schistocytes (formes triangulaires, en casque, kératocytes, microsphérocytes dans certains contextes) et rôle du pourcentage de schistocytes : à comparer aux recommandations de l'ICSH, à consulter. Un seul schistocyte isolé n'est pas un diagnostic : le contexte "hemolytic anemia work-up" laisse-t-il croire le contraire ?
- Indices (c:46) : "Ignore the round cells with central pallor." et "The cell you want is smaller than its neighbours and has pointed corners." Sur l'image, à l'œil, le fragment (environ 140x115 px) n'est pas nettement plus petit que ses voisines (environ 130-190 px) ; "smaller" est vrai au sens de la surface, peu au sens du diamètre. Par ailleurs plusieurs cellules du champ sont ovales plutôt que rondes avec une pâleur centrale. À confirmer par un morphologiste.
- Image : rendu très net à droite, flou progressif à gauche (profondeur de champ photographique, peu typique d'un frottis à 100x) ; hématies de taille homogène, anneaux concentriques plutôt qu'une pâleur centrale. Impression d'image de synthèse ou d'une photographie très retouchée ; origine non documentée (C-07). Deux cellules pâles/plissées (environ x=1150,y=810 et x=1380,y=690 en pixels de l'image) pourraient être prises pour des fragments ou des "ghost cells" : un second candidat défendable ?
- Zone cliquable : centre bien placé sur le fragment (vérifié en regardant l'image : 1230,440). La tolérance est une ellipse (C-17).
- Contexte : "post-mechanical valve" = cause classique de fragmentation ; vérifier le vocabulaire (valve mécanique, hémolyse intravasculaire).
- Sécurité : aucune pratique dangereuse enseignée à ma lecture.

### hem-02 - Corriger ou rejeter un échantillon (pré-analytique)
Objectif déduit : décider accepter / rejeter / corriger l'interférence et refaire la mesure. Trois échantillons, trois réponses différentes. Libellés des choix (be/src/engines.ts:12-14) : "Accept and report" ; "Reject and request a new sample" ; "Correct the interference and re-measure".
- **S1 (c:52-58)** : EDTA avec caillot, plaquettes 38 ×10⁹/L, réf "150-400", flag LL ; clé reject. Points : (a) seuil de "critique" LL pour 38 : dépend du laboratoire ; (b) l'explication (c:56) ne mentionne que les plaquettes alors qu'un caillot invalide aussi les autres paramètres (GB, Hb...) ; (c) la parenthèse "a smear check for platelet clumps also helps explain a falsely low count" mélange deux problèmes distincts (caillot vs agrégats plaquettaires dus à l'EDTA, dont la conduite est un nouveau prélèvement sur un autre anticoagulant) : risque de confusion ; (d) l'indice "Inspect the tube before reading the number." (c:58) est correct comme réflexe mais donne presque la réponse.
- **S2 (c:62-70)** : plasma lipémique, Hb 8.1 g/dL (flag L, réf 12.0-15.5), MCHC 41 g/dL (flag H, réf 32-36) ; clé repeat. Points : (a) la lipémie surestime l'Hb et la CCMH : plausible, mais la mesure "visible" est une Hb basse alors que l'explication parle d'Hb "faussement augmentée" (l'étudiant peut s'en étonner) ; (b) "replace the plasma with saline and repeat" (c:68) : technique de remplacement du plasma. Applicable à l'automate/méthode du laboratoire ? Dans certains laboratoires la conduite par défaut est de recontrôler selon la procédure du fabricant, ou de redemander un prélèvement (cause : alimentation parentérale, non-jeûne) : **"reject" est-il défendable aussi ?** (c) "The specimen itself is sound" : à nuancer ? (d) indice "A physiologically impossible MCHC..." (c:70) : confirmer que 41 g/dL est bien hors limite physiologique ; (e) le libellé "Correct the interference" contient déjà le mot que cette étape devrait faire trouver.
- **S3 (c:74-82)** : échantillon propre, Hb 13.2, VGM 89, pas de flag, remplissage adéquat, delta check cohérent ; clé accept. Points : la phrase "no flags, adequate fill, delta check consistent" donne tous les éléments ; l'indice "Not every sample needs rescuing." (c:82) souffle la réponse. D'autres contrôles qualité (identité, étiquetage, délai) ne sont pas évoqués : acceptable ?
- Hypothèses pré-analytiques à valider : adulte, EDTA K2/K3, délai court, température ambiante. Non précisés.
- Contexte : intervalles "female reference ranges shown" (c:52, 62, 74) : seule l'Hb est sexe-dépendante.

### hem-03 - Anémie : classer, interpréter le fer, recommander
Objectif déduit : classer par VGM, reconnaître une carence en fer, chercher la cause.
- **S1 (c:89-96)** : femme de 34 ans, Hb 8.9 (L), VGM 72 fL (L, réf 80-100) ; clé A (microcytaire). Cohérent. Points : bornes du VGM selon labo (80-96/98/100) ; indice "Size classification uses one index only." (c:96) est correct.
- **S2 (c:100-106)** : ferritine 9 ng/mL (réf 15-150, L), TIBC 450 µg/dL (réf 250-400, H), RDW 17.8 % (réf 11.5-14.5, H) ; clé C (carence en fer). Points : (a) l'énoncé "Iron studies are back" mais il n'y a ni fer sérique ni coefficient de saturation de la transferrine, et le RDW n'est pas un examen du fer ; (b) TIBC : borne haute 400 µg/dL ici ; d'autres laboratoires emploient des bornes plus larges (jusqu'à environ 450), auquel cas 450 serait en limite haute et non "H" : à confirmer ; unité µg/dL (conventionnelle) vs µmol/L (SI) ; (c) trait thalassémique (distracteur B) : cliniquement plausible chez une patiente microcytaire, notamment en contexte maghrébin (les hémoglobinopathies y sont, à ma connaissance, fréquentes : à confirmer) ; ici la ferritine à 9 l'exclut mais sans RBC ni indice de Mentzer, ce qui n'est pas enseigné ; (d) ferritine : le seuil de carence varie selon les recommandations ; (e) l'indice 1 (c:106) paraphrase presque le texte.
- **S3 (c:110-115)** : "What should the report recommend next?", clé D "Evaluate for a source of chronic blood loss". Points : (a) périmètre professionnel (T-4) ; (b) l'explication (c:113) place d'emblée "menstrual or gastrointestinal" pour une femme de 34 ans : les causes à explorer en premier chez une femme non ménopausée (pertes menstruelles, apports, malabsorption, grossesses, etc.) et les indications d'exploration digestive sont à valider ; (c) la clé est de loin l'option la plus longue (43 caractères contre 22-30) : indice "de forme".

### mic-01 - Enchaîner Gram, catalase, coagulase
- **S1 (c:123-129)** : frottis de plaie, "purple spherical cells in clusters" ; clé B. Cohérent. À noter : "purple" (en pratique violet-bleu), "wound swab" sans mention de cellules inflammatoires.
- **S2 (c:133-139)** : catalase positive ; options Streptococcus, Enterococcus, Clostridium, Staphylococcus ; clé D. Points : (a) l'explication (c:137) dit streptocoques et entérocoques catalase-négatifs : en pratique certains entérocoques donnent une pseudocatalase faible ; nuance utile ? (b) Micrococcus est aussi catalase-positif (il apparaît en S3) ; (c) l'option Clostridium (bacille, anaérobie) est écartée trop facilement ; (d) l'indice (c:139) répète l'énoncé ; (e) technique non enseignée : éviter de prélever de la gélose au sang (faux positif) ; à voir si le projet veut le mentionner.
- **S3 (c:143-149)** : coagulase en tube positive ; clé C (S. aureus). Points : "Name the organism" : résultat présomptif ; d'autres staphylocoques coagulase-positifs existent (espèces animales, et S. lugdunensis qui peut être positive en lame/négative en tube : à confirmer) ; temps de lecture (4 h, puis 24 h) non précisé ; en routine, latex, MALDI-TOF ou PCR sont utilisés dans beaucoup de laboratoires (adéquation Tunisie/Belgique). L'indice (c:149) réduit à un choix parmi 4 : OK.

### mic-02 - Ordre de la coloration de Gram
Objectif déduit : séquence de la coloration. Clé (c:163) : Heat-fix, Crystal violet, Iodine, Decolorize, Safranin. Les 5 libellés (c:156-162).
- L'ordre lui-même est le classique. Points à valider : (a) étape "Heat-fix" vs fixation au méthanol (certains laboratoires) ; (b) l'étape "préparer et sécher le frottis" est hors liste, et le texte précise que séchage et rinçages sont omis (c:155) ; (c) "Each reagent is rinsed off before the next" (c:164) : exact pour tous les protocoles (par exemple entre cristal violet et lugol) ? À comparer avec la procédure locale ; (d) **aucune durée n'est donnée** (temps de contact des colorants, du décolorant) : volontaire ? Le temps de décoloration est une source d'erreur classique de lecture ; (e) "Decolorize with alcohol or acetone" : le décolorant utilisé localement (alcool, acétone, ou mélange) ; (f) contre-colorant : safranine ici, fuchsine dans d'autres laboratoires ; (g) sécurité : la flamme (fixation à la chaleur) n'est pas évoquée ; (h) l'indice "The mordant follows the primary stain directly." (c:166) donne deux positions ; le retour "x of 5 in place" (partiel, documenté `docs/KNOWN_LIMITATIONS.md:7`) permet de résoudre par tâtonnement.

### mic-03 - Appariement observation / organisme (présomptif)
Gauche : MacConkey rose ; hémolyse bêta + cocci en chaînettes ; envahissement sur gélose au sang ; pigment vert + odeur sucrée/fruitée (c:174-177). Droite : Proteus mirabilis, E. coli, P. aeruginosa, S. pyogenes (c:180-183).
- Réponse unique parmi les 4 organismes proposés, MAIS : "Pink colonies on MacConkey agar" (c:174) conviendrait à d'autres Enterobacterales lactose+ (Klebsiella, Enterobacter...) ; la clé n'est univoque que parce que la liste de droite est limitée. Le texte parle de "presumptive identification" (c:171, 187) : bien.
- "Clear zone of beta-hemolysis ... Gram-positive cocci in chains" : d'autres streptocoques bêta-hémolytiques (groupes B, C, G) correspondent aussi ; l'explication cite Lancefield (c:187) : OK.
- **Sécurité (C-05)** : "sweet, fruity odor" (c:177) et "characteristic odor" (c:187) valorisent l'identification par l'odeur. Sentir des boîtes de culture est déconseillé en biosécurité ; le descripteur est historique. À reformuler ou à signaler comme à ne pas pratiquer.
- Terminologie : "non-fermenter" (c:189) : bien dire "non-fermentant (bacille à Gram négatif non fermentant)" ; pyocyanine (bleu) et pyoverdine (jaune-vert) : l'explication (c:187) ne cite que la pyocyanine.
- Autres colonies "swarming" sur la gélose au sang : pas uniquement Proteus (à nuancer).

### bio-01 - Insuffisance rénale, urgence kaliémie
- **S1 (c:196-203)** : homme de 67 ans, oligurie post-opératoire ; créatinine 4.2 mg/dL (réf 0.7-1.3), BUN 62 mg/dL (réf 7-20) ; clé D (rein). Points : (a) unités conventionnelles et "BUN" (T-2, C-03) ; (b) méthode de dosage de la créatinine (Jaffé ou enzymatique) non précisée ; (c) l'énoncé "Which organ is most likely failing?" avec "reduced glomerular filtration" : la cause pré-rénale, rénale ou post-rénale n'est pas discutée (rapport urée/créatinine) : acceptable pour un niveau débutant ; (d) l'indice (c:203) donne la réponse.
- **S2 (c:207-213)** : K 6.1 mmol/L (réf 3.5-5.1, flag HH), Na 138 ; clé C (potassium). Points : (a) seuil "critique" à 6.1 : dépend du laboratoire ; (b) l'explication (c:211) : "notified at once and confirmed urgently (repeat sample and ECG)" : l'ECG n'est pas un acte du laboratoire ; (c) le recheck (c:212) "can stop the heart" : formulation dramatique mais ce n'est pas faux.
- **S3 (c:217-222)** : "Before calling it, which action best rules out pseudohyperkalemia?" ; clé A (refaire le K sur un échantillon non hémolysé). **C-01 : l'ordre des actions est ambigu** (voir section 3). L'indice "Check the hemolysis index first." (c:222) renvoie à une donnée absente de bio-01 (C-02). Autres causes de pseudo-hyperkaliémie (poing serré, thrombocytose/leucocytose, délai/stockage au froid, contamination par EDTA) : non évoquées, à signaler ? "Add a glucose measurement" et "Wait until tomorrow" sont des distracteurs évidemment faibles ; "Wait until tomorrow" est une conduite manifestement dangereuse mais bien écartée.

### bio-02 - Repérer le résultat faussé par l'hémolyse (image)
Clé (c:232) : potassium. Image `chemistry-panel.svg`. context : "Hemolysis index 3+ (illustrative scale)... Apart from the one discordant result, the panel is consistent with the patient." (c:228).
- L'image montre K 6.4 mmol/L (flag H), Na 139, Cl 103, HCO3 24, urée 5.1, créatinine 78 µmol/L, glucose 5.4, Ca 2.35 (`chemistry-panel.svg:20-61`). Unités SI, alors que bio-01 est en mg/dL (C-03) ; K flag "H" ici contre "HH" pour 6.1 en bio-01 ; HCO3 réf 22-29 ici contre 22-26 en bio-03 (C-04).
- Le potassium est la seule valeur en rouge, en gras, avec une ligne surlignée (`:24-31`) : l'indice visuel suffit à répondre sans raisonnement sur l'hémolyse (C-19). "consistent with the patient" (c:228) : aucun patient n'est décrit.
- Explication (c:233) : "Hemolysis releases potassium (and LDH and AST)" : LDH et AST ne figurent pas dans le panel ; l'hémolyse influence aussi d'autres analytes (phosphate, magnésium, certaines méthodes de créatinine) : une autre valeur du panel pourrait-elle être jugée influencée ? (aucune ne l'est visiblement).
- "Hemolysis index 3+ (illustrative scale)" : les indices d'interférence dépendent de l'automate ; accepter "3+" ?
- Zone cliquable : centre correct (880,395 ; vérifié sur le SVG). Voir C-17 sur la forme de la tolérance.

### bio-03 - Équilibre acido-basique
- **S1 (c:241-248)** : pH 7.28 (réf 7.35-7.45), HCO3 14 mmol/L (réf 22-26), PaCO2 30 mmHg (réf 35-45) ; clé B. Points : (a) la cohérence de ces trois valeurs est bonne : pH recalculé par l'équation de Henderson-Hasselbalch environ 7.29 (mon calcul, à vérifier) ; (b) "HCO3" calculé, intervalle artériel (22-26) différent de l'intervalle sérique du panel (22-29) ; (c) mmHg (vs kPa selon pays) ; (d) l'indice "Acidemia plus low bicarbonate." (c:248) donne la réponse.
- **S2 (c:252-258)** : trou anionique = 140 - 108 - 14 = 18 ; clé C ("High anion gap (about 18)"). **Voir C-08 (section 3)** : l'option A dit "Normal anion gap (about 12)" tandis que l'explication dit "above the usual upper limit of about 12" (c:253 vs c:256) ; seuil dépendant de la méthode et du laboratoire (l'énoncé le reconnaît), et pas de correction par l'albumine. Selon l'intervalle utilisé, 18 est nettement élevé ou limite. Le chlorure est 108 (H) et le trou modérément élevé ; un profil mixte (trou élevé et acidose hyperchlorémique) est-il suggéré ? (impression de ma part, à confirmer par un expert). L'indice (c:258) répète la formule déjà donnée dans l'énoncé (c:252).
- **S3 (c:262-267)** : formule de Winter 1.5 x HCO3 + 8 +/- 2 = 29 (27-31) ; PaCO2 mesuré 30 ; clé A. Cohérent. Mon calcul : 1.5 x 14 + 8 = 29. La valeur mesurée est dans la fourchette ; l'indice (c:267) donne le résultat intermédiaire.
- Le cas ne précise pas le contexte clinique (lactate, cétones, diarrhée...). L'étape de causes (trou élevé) n'est pas demandée : OK pour le niveau visé ?

### master-01 - Cas intégré (4 étapes, un patient)
Contexte : homme de 58 ans, fatigue, perte de poids, fièvre (c:275).
- **S1 (c:276-282)** : Hb 8.2 (réf 13.5-17.5), VGM 70, GB 13.4 ×10⁹/L (réf 4.0-11.0) ; clé A (microcytaire). Cohérent. Distracteur C "Normocytic anemia with thrombocytopenia" (c:277) cite des plaquettes qui ne sont pas fournies. L'explication "leukocytosis fits the fever" (c:280) : lecture simpliste (bactériémie, inflammation).
- **S2 (c:286-292)** : hémocultures, cocci Gram+ en chaînettes, catalase -, bile-esculine +, pas de croissance en NaCl 6.5 % ; clé C "Streptococcus gallolyticus (bovis group)". Points : (a) ces tests séparent le groupe D non entérocoque (S. bovis/SBSEC) des entérocoques, mais ne permettent pas, à eux seuls, d'établir l'espèce S. gallolyticus ; la clé est au niveau espèce (C-06) ; (b) nomenclature S. bovis / S. gallolyticus subsp. gallolyticus : à valider ; (c) d'autres cocci catalase négatifs, bile-esculine variable, existent (Lactococcus, Leuconostoc...) ; (d) l'indice "Enterococci tolerate 6.5% NaCl." (c:292) élimine l'option A et laisse peu de choix.
- **S3 (c:296-302)** : ferritine 8 ng/mL (réf 30-400, L), CRP 48 mg/L (réf <5, H) ; clé B. Les options A/B/C/D sont ordonnées de façon à ce que B soit la plus longue (110 caractères contre 54-64). Points (C-09) : (a) "inflammation can only raise ferritin" (c:297) et l'indice "Inflammation pushes ferritin up, never down." (c:302) sont des affirmations absolues ; une ferritine basse malgré une CRP élevée garde bien une forte valeur d'orientation pour une carence martiale, mais "only" et "never" sont à nuancer ; (b) l'option A ("unreliable in either direction") est volontairement fausse mais proche d'une position prudente : un expert la jugerait-il acceptable ? (c) seuils de ferritine en cas d'inflammation (souvent plus élevés que 30) : à valider ; (d) CRP : réf <5 mg/L, méthode.
- **S4 (c:306-316)** : décision parmi 3 phrases ; clé "alert" : "Alert the clinician: iron deficiency with Streptococcus gallolyticus bacteremia needs a gastrointestinal work-up and exclusion of endocarditis" (c:311). Points : (a) les deux autres options sont peu plausibles ("discharge ... on oral iron alone", "Reject the blood cultures as contaminated", c:309-310) et la clé reprend la synthèse complète : la réponse est donnée par sa forme ; (b) l'explication (c:314) : "strongly associated with colonic neoplasia" est vrai surtout pour S. gallolyticus subsp. gallolyticus (à confirmer) et ne devrait pas conclure sur un patient : le laboratoire "alerte" et signale, il ne décide pas du bilan ; (c) une hémoculture positive est en général un résultat critique à communiquer : le texte devrait peut-être le dire explicitement ; (d) T-4 sur le périmètre.

---

## 3. Constats de cohérence interne (vérifiables mécaniquement)

Méthode : relecture ligne à ligne, comparaison valeur / intervalle / drapeau (toutes les valeurs numériques affichées ont été comparées à leur intervalle, à la main ; aucune incohérence de direction de drapeau n'a été trouvée), recalculs manuels (anion gap, Winter, Henderson-Hasselbalch), mesure des coordonnées sur les images. Sévérités : **Blocker** = à corriger avant tout usage pédagogique si l'expert confirme ; **Should fix** ; **Nice to have**. Quand j'ai un doute, c'est écrit.

Contrôles réussis (aucun problème trouvé) : les drapeaux L/H/LL/HH sont cohérents avec les valeurs et les intervalles affichés dans toutes les étapes ; trou anionique 140-108-14 = 18 ; Winter 1.5x14+8 = 29 (27-31) ; coordonnées des deux points = centre des deux repères (73.6 % = 1230/1672 ; 46.8 % = 440/941 ; 55 % = 880/1600 ; 43.9 % = 395/900) ; chaque clé de choix figure bien parmi les options de son étape ; dans mic-03, chaque observation n'a qu'un appariement défendable parmi les 4 organismes proposés (sous réserve de la remarque sur les entérobactéries lactose-positives, section 2).

### Blocker (à confirmer par les experts) - 1
- **C-01 - Ordre ambigu "avertir" / "confirmer" pour un potassium critique** (formulé « contradictoire » dans la première version de ce backlog ; « ambigu » est plus exact, voir B-03). `c:211` (bio-01-s2) : "is notified at once and confirmed urgently". `c:217` : "Before calling it, which action best rules out pseudohyperkalemia?". `c:220` : "confirm on a clean sample while the clinician is notified". Selon la lecture, on avertit d'abord, ou on confirme d'abord ("calling it" = rendre/communiquer le résultat ?), ou les deux en même temps. C'est la conduite d'un résultat critique, sujet de sécurité patient : un étudiant peut en retenir une règle erronée. Incertitude : la bonne conduite dépend de la procédure du laboratoire (hémolyse connue ou non, résultat critique à communiquer avec commentaire). À faire arbitrer et à reformuler. De plus "calling it" est une expression idiomatique difficile pour des étudiants non anglophones.

### Should fix - 12
- **C-02 - Indice renvoyant à une donnée absente.** `c:222` : "Check the hemolysis index first." Aucune valeur d'indice d'hémolyse n'est affichée dans bio-01 (valeurs `c:199`, `c:209`) ; l'indice n'apparaît que dans l'image de bio-02. Vérifié.
- **C-03 - Mélange d'unités et de terminologie entre missions.** bio-01 : mg/dL et "BUN" (`c:199`) ; bio-02 : mmol/L et µmol/L, "Urea" (`chemistry-panel.svg:43-51`) ; TIBC en µg/dL (`c:102`) ; bio-03 en mmol/L et mmHg. Pas d'erreur de calcul, mais l'étudiant passe de BUN 62 mg/dL à urée 5.1 mmol/L sans conversion ; à décider (T-2). Conversion BUN-urée non enseignée.
- **C-04 - Incohérences entre image et texte.** Potassium 6.4 flaggé "H" (`chemistry-panel.svg:31`) alors que 6.1 est "HH" en bio-01 (`c:209`) ; bicarbonate réf 22-29 (`chemistry-panel.svg:41`) contre 22-26 (`c:244`) : défendable (sérique vs artériel), mais non expliqué ; même intervalle K 3.5-5.1 partout (cohérent).
- **C-05 - Odeur des cultures comme critère d'identification (sécurité).** `c:177` "Green pigment with a sweet, fruity odor" ; `c:187` "characteristic odor". Risque : normaliser l'olfaction des boîtes de culture. Un spécialiste de biosécurité pourrait en faire un blocker.
- **C-06 - Identification de l'espèce sur des tests insuffisants.** `c:286-290` : bile-esculine +, NaCl 6.5 % - et "Gram+ en chaînettes, catalase -" désignent le groupe, pas l'espèce S. gallolyticus ; la clé et l'étape suivante (`c:311`, `c:314`) enchaînent sur une association clinique spécifique d'une sous-espèce (à confirmer).
- **C-07 - Origine et statut de l'image du frottis non documentés.** Le dépôt ne contient ni source ni licence des images (recherche des mots "provenance", "licence", "credit" : rien). `web/src/components/engines.tsx:128` affirme "not a real specimen" ; l'image a un aspect photographique. Si c'est en réalité une photographie (ou une image sous licence), l'affirmation est inexacte et la licence est inconnue. Les concurrents possibles (cellules pâles en bas) et l'indice "smaller than its neighbours" (`c:46`) sont à valider.
- **C-08 - Trou anionique : 12 est à la fois "normal" et "limite supérieure".** `c:253` ("Normal anion gap (about 12)") et `c:256` ("above the usual upper limit of about 12"). Incohérence de présentation ; l'intervalle de référence du trou anionique n'est pas affiché alors que ceux de Na et Cl le sont.
- **C-09 - Formulations absolues sur la ferritine.** `c:297` ("can only raise"), `c:302` ("never down"). Voir master-01 S3.
- **C-10 - "Iron studies" incomplètes et TIBC limite.** `c:100`, `c:102` (voir hem-03 S2).
- **C-11 - Recommandations cliniques attribuées au rapport de laboratoire.** `c:110`, `c:113`, `c:306`, `c:311` (T-4) ; explication de `c:113` à valider pour une patiente de 34 ans.
- **C-12 - `docs/KNOWN_LIMITATIONS.md` (ancienne ligne 20, corrigée depuis) affirmait que les constats d'une revue de cohérence automatisée sont listés dans `docs/FINAL_VALIDATION_REPORT.md`.** Aucune liste de constats de contenu n'y figure (recherche par mots-clés : MCHC, ferritine, trou anionique, Winter, schistocyte, "ambig"... sans résultat ; confirmé au tour 20). Risque : des relecteurs croiraient qu'une revue de contenu existe déjà. **Corrigé le 2026-10-09** : `KNOWN_LIMITATIONS.md` renvoie maintenant à ce backlog, qui est un document de préparation rédigé par un assistant IA, non une revue.
- **B-01 - bio-01 (insuffisance rénale oligurique, K 6.1) : « confirmer sur échantillon propre » peut modéliser un retard de communication d'un résultat critique.** `c:196` (« reduced urine output after surgery »), `c:199` (créatinine 4.2, BUN 62), `c:209` (K 6.1, HH), `c:217-222`. Dans une insuffisance rénale aiguë avérée, un K à 6.1 est probablement réel ; aucune donnée d'hémolyse n'est fournie dans bio-01 (voir C-02). Enseigner « refaire le K sur échantillon non hémolysé » comme LA bonne action, sans l'étape de contexte clinique (ECG, communication immédiate, traitement non retardé), peut faire apprendre à différer la communication d'une valeur critique. Complète C-01 (qui porte sur l'ordre avertir/confirmer) par l'argument de probabilité pré-test. Statut : **plausible**, dépend de la procédure locale de valeurs critiques. À soumettre au biochimiste (question 1 de la section 6) : communiquer immédiatement ET confirmer ? Ajouter un indice d'hémolyse explicite ou un élément ECG/clinique à bio-01 ? (Aucun changement de contenu n'a été fait dans l'application.)

### Nice to have - 12
- **C-13** Seuils critiques LL/HH non justifiés : plaquettes 38 en LL (`c:54`), K 6.1 en HH (`c:209`).
- **C-14** `c:56` : parenthèse caillot vs agrégats plaquettaires (voir hem-02 S1).
- **C-15** Libellés de décision identiques pour les 3 échantillons ; "Correct the interference" (`be/src/engines.ts:14`) est présent aussi pour un échantillon qui n'a pas d'interférence, et vocabulaire qui oriente S2.
- **C-16** Commentaire de test `be/test/content.test.ts:70` parle de "blood-smear-hero.png" alors que l'asset est un `.webp` (`web/src/lib/assets.ts:16`).
- **C-17** Géométrie des zones cliquables : le rayon est en pourcentage de chaque axe (distance calculée en pourcentages, `be/src/engines.ts:40`), donc une ellipse en pixels. hem-01 (r=6) : environ +/-100 px sur 1672, +/-56 px sur 941 ; bio-02 (r=5.5) : +/-88 px sur 1600, +/-49.5 px sur 900, alors qu'une ligne du tableau fait 70 px de haut ; un clic jusqu'à environ 14 px dans la ligne Sodium ou Chlorure est donc accepté ; en hem-01, le bord gauche de la cellule ronde voisine en bas à droite pourrait tomber dans la zone (estimation visuelle, à vérifier). Leniency mineure.
- **C-18** Les options correctes sont les plus longues dans 5 étapes sur 15 (`c:111`, `c:125`, `c:218`, `c:287`, `c:297`), de loin pour `c:111`/`c:297` ; master-s4 idem (`c:311`).
- **C-19** bio-02 : ligne rouge surlignée et gras sur la bonne valeur (`chemistry-panel.svg:24-31`), "consistent with the patient" sans patient (`c:228`).
- **C-20** Indices qui paraphrasent l'énoncé ou livrent un résultat intermédiaire : `c:139`, `c:258`, `c:267`, `c:248`, `c:203`, `c:166`, `c:292` ; ils coûtent 15 XP chacun.
- **C-21** Format et langue : anglais seulement, orthographe US, "×10⁹/L", point décimal, "BUN" (T-3).
- **C-22** master-s1 : distracteur C parle de thrombocytopénie sans donner les plaquettes (`c:277`) ; competency "Clinical biochemistry" attribuée à la ferritine/CRP (`c:295`) alors que ces dosages relèvent selon les laboratoires de la biochimie ou de l'immunochimie.

- **B-02** hem-02-s2 (`c:62-70`) : l'Hb affichée de 8.1 g/dL est la valeur **faussée par la lipémie** (faussement augmentée selon l'explication, `c:68`) ; l'Hb vraie est donc inférieure à une valeur déjà basse. Conséquence de sécurité patient (anémie sévère masquée par l'interférence) que l'explication ne dit pas ; elle affirme au contraire « The specimen itself is sound ». Complète hem-02 S2 (a), qui ne relevait que la surprise « Hb basse décrite comme faussement augmentée ». Statut : **plausible**, mineur. À soumettre à l'hématologue : reformuler, et préciser que la mesure doit être refaite avant tout usage clinique de 8.1.
- **B-03** Qualification de C-01 : l'explication de s2 dit « notified at once and confirmed urgently » (les deux), s3 dit « confirm on a clean sample while the clinician is notified » (les deux, en parallèle) ; seule la formule « Before calling it » (`c:217`) suggère « confirmer d'abord ». C'est une **ambiguïté d'ordre**, pas une contradiction franche : le libellé de C-01 a été corrigé en conséquence. Le statut « 1 bloquant provisoire » reste acceptable et à faire arbitrer par les experts.

**Total : 1 blocker (provisoire), 12 should fix, 12 nice to have (25 constats : C-01 à C-22 plus B-01, B-02, B-03).** B-01 à B-03 viennent du tour 20 (2026-10-09), sont marqués « plausibles » et n'ont pas été arbitrés par un expert.

---

## 4. Points pour l'enseignant (pédagogie)

- **Difficulté** : niveau globalement introductif. Plusieurs étapes se résolvent par élimination ou par la forme de la réponse (section C-18, C-19, C-20) sans mobiliser le raisonnement visé. Les étapes les plus riches : hem-02 (décision pré-analytique), bio-03 (calculs) et master-01.
- **Une réponse par échantillon (hem-02)** : les trois échantillons exigent trois actions différentes (reject / repeat / accept). Après un premier choix, l'élimination devient facile : à varier (par exemple deux échantillons à rejeter, un à accepter).
- **Retour d'information** : après une erreur, l'étudiant voit uniquement le "recheck" (`be/src/game.ts:413`), identique quelle que soit la mauvaise réponse choisie : pas de correction de l'idée fausse précise. L'explication complète n'est montrée qu'après la bonne réponse (`be/src/game.ts:427`). Un étudiant qui trouve par tâtonnement lit l'explication sans avoir réfléchi.
- **Barème (`be/src/scoring.ts:4-5`, `content.ts:25-26`)** : -10 par mauvaise réponse, -15 par indice, bonus "sans indice" 20, bonus "première tentative" 30 (tout ou rien en mode standard), bonus de temps jusqu'à 30 sur 180 points maximum (570 pour le Master). Conséquences à discuter : (a) un indice coûte plus qu'une erreur : on est incité à deviner plutôt qu'à demander de l'aide, ce qui est discutable pour des notions de sécurité ; (b) une seule erreur sur une des trois étapes de hem-02 ou bio-03 fait perdre 30 points de plus ; (c) le chrono récompense la vitesse sur des décisions où la prudence doit primer (échantillon, résultat critique) ; (d) moteurs "order" et "match" : le retour "x sur 5 bien placés" permet une résolution rapide (`docs/KNOWN_LIMITATIONS.md:7`) ; (e) le moteur "point" n'a pas de retour de distance et se force par essais successifs.
- **Indices** : certains donnent presque la réponse (`c:203`, `c:248`, `c:302`), d'autres répètent l'énoncé (`c:139`, `c:258`). Un indice utile oriente la méthode sans nommer l'option.
- **Récompenses injustes possibles** : une bonne réponse pour une mauvaise raison (devinette) ; une réponse défendable en pratique mais non codée (hem-02-S2 "reject", hem-03-S3 explorer d'abord les causes gynécologiques, mic-03 pour les autres Enterobacterales lactose-positifs) est pénalisée.
- **Alignement avec les objectifs** : aucun objectif d'apprentissage n'est écrit dans le code. Les compétences sont 5 étiquettes (`c:28-32`). Proposer des objectifs explicites par mission, validés par les enseignants, avant de juger l'alignement.
- **Adaptation locale** : les labs "Coming soon" (immunologie, parasitologie, banque de sang, biologie moléculaire, cytologie, histologie, qualité) ne sont pas jouables ; la parasitologie et l'hématologie des hémoglobinopathies pourraient être pertinentes en Tunisie (à confirmer par les enseignants).

---

## 5. Procédure de revue proposée

### 5.1 Ordre proposé
0. **Figer la version** : noter les empreintes SHA-256 (ci-dessus), la date, qui lit quoi ; geler `content.ts` pendant la revue ; ne rien corriger sans trace.
1. **Décisions globales (T-1 à T-4)** : jeu d'intervalles de référence, unités (SI ou conventionnelles), langue/terminologie, périmètre professionnel des recommandations.
2. **Sécurité d'abord** : C-01 (résultat critique), C-05 (odeur), hem-02 (rejet d'échantillon), bio-01/bio-02 (hémolyse), mic-02 (Gram, flamme).
3. **Microbiologie** : mic-01, mic-02, mic-03, master-S2 (un microbiologiste).
4. **Hématologie** : hem-01 à hem-03, master-S1/S3 (un hématologue/biologiste).
5. **Biochimie** : bio-01 à bio-03 (un biochimiste).
6. **Images** : un morphologiste confirme (ou non) la zone du schistocyte, la présence de candidats concurrents ; décision sur la provenance/licence ; remplacer par des images approuvées si besoin (recalibrer les coordonnées dans `be/src/content.ts` : `c:43` et `c:232`).
7. **Master Lab** : cohérence interdisciplinaire (relecture croisée).
8. **Relecture croisée Tunisie / Belgique** : chaque discipline relue par au moins une personne de chaque pays si possible ; consigner les divergences de pratique (elles peuvent justifier des variantes plutôt qu'une correction).

### 5.2 Preuves attendues des relecteurs
- Procédures locales (SOP) : coloration de Gram, rejet d'échantillons, communication des résultats critiques, interférences (hémolyse/lipémie/ictère selon la notice de l'automate).
- Tableaux d'intervalles de référence des laboratoires concernés (sexe, âge, méthode).
- Les références (manuels, recommandations de sociétés savantes, CLSI, ISO 15189, ICSH...) que les experts jugent pertinentes : à citer par eux.
- **Capture de ce que voit l'étudiant** : jouer chaque mission (mode invité de démonstration) ; le texte relu doit être celui de l'écran, pas seulement `content.ts`.
- Pour les images : identité du schistocyte (annotation), décision sur les alternatives.

### 5.3 Fiche de signature (format de `docs/CONTENT_VALIDATION_CHECKLIST_2026-10-05.md` repris, une ligne par mission)

Pour chaque mission (hem-01, hem-02, hem-03, mic-01, mic-02, mic-03, bio-01, bio-02, bio-03, master-01) :

- Exactitude des données et unités : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Exactitude des corrigés et explications : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Validité des rechecks et hints : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE
- Images finales et coordonnées : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE (hem-01, bio-02)
- Sécurité (pratiques enseignées) : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE *(champ ajouté par ce backlog)*
- Adéquation Tunisie / Belgique (unités, protocoles) : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE *(champ ajouté)*
- Blockers :
- Version relue (SHA-256 de `content.ts`) :
- Reviewer / spécialité / pays / date / signature :

Validation globale G6 : ☐ PASS ☐ NEEDS_FIX ☐ ESCALATE (réservée au relecteur désigné ; ce document ne ferme pas G6).

### 5.4 Pilote proposé (PROPOSITION, aucun résultat)
Ceci est un plan à discuter, pas un résultat. À soumettre aux instances éthiques et de protection des données des deux établissements (consentement, anonymisation) avant tout pilote ; je ne connais pas les règles locales.
- **Public** : petite cohorte volontaire à Monastir et à l'HEPL (par exemple 10 à 20 étudiants par site) ; analyse descriptive seulement (pas de puissance statistique).
- **Pré-test** (avant usage) : 10 à 15 questions hors jeu sur les objectifs des missions, rédigées et validées par les experts, afin de mesurer le niveau de départ.
- **Usage** : une séance encadrée d'environ 60 minutes (hématologie, microbiologie, biochimie, puis Master si le temps le permet), avec un observateur qui note blocages, indices demandés, incompréhensions de vocabulaire.
- **Post-test** : forme parallèle du pré-test (autres questions, mêmes objectifs), immédiat ; éventuellement différé de 2 à 4 semaines.
- **Utilisabilité** : questionnaire court (par exemple l'échelle SUS, ou des questions maison), plus 3 questions ouvertes (clarté, langue, utilité) ; comparer l'avis des deux sites.
- **Données utiles** : erreurs les plus fréquentes par étape (le serveur les enregistre), usage des indices, temps par mission, retours sur les libellés.
- **Critères d'arrêt** : toute erreur de contenu découverte pendant le pilote est traitée par les experts avant de poursuivre.

---

## 6. Questions pour les experts (par priorité)

1. **Résultat critique (C-01)** : pour un potassium à 6.1 mmol/L avec suspicion d'hémolyse, que doit faire le technologue : communiquer tout de suite, ou confirmer d'abord ? Que dit la procédure locale ?
2. **Jeu de références (T-1)** : quels intervalles (Hb, VGM, plaquettes, ferritine, TIBC, créatinine, urée, trou anionique, HCO3...) utiliser, et pour quelle population/méthode ? Un seul jeu pour la Tunisie et la Belgique est-il acceptable, ou faut-il deux variantes ?
3. **Unités (T-2, C-03)** : SI ou conventionnelles ? Faut-il remplacer "BUN" par "urée" ? Les valeurs doivent-elles être converties de façon cohérente d'une mission à l'autre ?
4. **hem-02-S2** : la lipémie sur une numération sanguine : "repeat" (remplacement du plasma) est-elle la conduite attendue, ou "reject / nouveau prélèvement" est-il aussi défendable ?
5. **Images (C-07 et section 1.3)** : le frottis hem-01 est-il utilisable tel quel (morphologie, concurrents possibles, "smaller" dans l'indice) ? Quelle est l'origine réelle de l'image et sa licence ? Faut-il la remplacer par une image approuvée ?
6. **mic-03 et l'odeur (C-05)** : garder, reformuler ou retirer le critère "odeur" ?
7. **master-S2 (C-06)** : la clé "S. gallolyticus" est-elle justifiable au niveau espèce avec ces tests, ou faut-il viser "groupe S. bovis" ? L'association avec une néoplasie colique est-elle correctement formulée ?
8. **Trou anionique (C-08)** : quelle valeur de référence enseigner ? 18 est-il "élevé" pour vos méthodes ? Souhaitez-vous la correction par l'albumine ?
9. **Gram (mic-02)** : l'ordre et les libellés (fixation à la chaleur, décolorant, contre-colorant) correspondent-ils à vos procédures ? Faut-il ajouter des durées ?
10. **hem-03** : l'ensemble "iron studies" (ferritine, TIBC, RDW) est-il acceptable, ou faut-il ajouter fer sérique et saturation ? La recommandation d'explorer une perte sanguine est-elle bien formulée pour une femme de 34 ans ? Faut-il inclure les hémoglobinopathies dans le contexte maghrébin ?
11. **Ferritine et inflammation (C-09)** : les formulations "can only raise" et "never down" sont-elles acceptables ?
12. **Périmètre (T-4)** : un rapport de laboratoire étudiant peut-il "recommander" un bilan ou "alerter" le clinicien ? Quelle formulation est conforme à votre exercice ?
13. **Seuils critiques (C-13)** : plaquettes 38 en LL et K 6.1 en HH sont-ils cohérents avec vos listes de valeurs critiques ?
14. **Catalase et coagulase (mic-01)** : faut-il nuancer (pseudocatalase des entérocoques, autres staphylocoques coagulase-positifs, temps de lecture de la coagulase en tube, méthodes de routine : latex, MALDI-TOF) ?
15. **Cohérence pédagogique** : le niveau (débutant/avancé), les indices et le barème sont-ils adaptés à vos étudiants ? Quels objectifs d'apprentissage valider mission par mission ?
