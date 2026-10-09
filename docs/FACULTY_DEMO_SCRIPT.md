# Escape Lab – Script de démonstration pour le corps enseignant et le comité Erasmus+

Rédigé le 2026-10-09. Sources : guide intégré à l'application (page « About & demo guide »), `docs/KNOWN_LIMITATIONS.md`, `docs/SCIENTIFIC_REVIEW_BACKLOG.md`, rapports de parcours des rounds 16 et 17.

## 1. Titre, objectif, durée

**Escape Lab – A Serious Game for Biomedical Laboratory Training.**
Objectif : montrer un environnement virtuel sûr où l'étudiant raisonne, décide, se trompe, reçoit un retour, réessaie et progresse AVANT la pratique réelle au laboratoire.
Message : « La formation biomédicale d'abord. La technologie sert l'apprentissage. »
Escape Lab ne remplace ni les enseignants, ni les stages, ni la pratique réelle, ni les experts biomédicaux.

- **Version courte : 5 minutes.** **Version complète : 7 minutes.**
- Public : professeurs ESSTSM / Université de Monastir, comité de sélection Erasmus+, académiques de la HEPL, formateurs en laboratoire biomédical.
- Les durées sont des estimations (budget de la page + clics mesurés). Aucune répétition chronométrée par un humain n'a été faite : répétez deux fois avant.

## 2. Avant la démo (préparation, 5 minutes avant)

### 2.1 Lancer l'API et le frontend (Node 22.18 ou plus)

**Étape 0, dans CHAQUE terminal, avant toute autre commande :** `node -v` doit afficher **v22.18 ou plus** (le dépôt contient `.nvmrc` : `nvm use 22`, ou `export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH`). Le shell par défaut de la machine de preuves est Node 18. **Les scripts `npm start` et `npm run seed:demo` n'ont aucun contrôle de version préalable** (seuls les contrôles préalables `pretest`, `pretypecheck`, `prebuild` et `pretest:e2e` en ont un) : sur Node 18 ils échouent avec un message brut du type `node: bad option: --disable-warning=ExperimentalWarning`, sans le message explicatif. Si vous voyez `bad option`, c'est la version de Node, pas l'application.

Terminal 1 (API) :

```bash
cd be
npm install
cp .env.example .env
DB_PATH=./data/demo.db npm run seed:demo
DEMO_MODE=1 DB_PATH=./data/demo.db npm start
```

Terminal 2 (frontend) :

```bash
cd web
npm install
npm run dev
```

Ouvrez l'adresse affichée par `npm run dev` (par défaut `http://localhost:5173`, qui correspond au `CORS_ORIGIN` de `.env.example` ; si vous ouvrez le frontend sur `http://127.0.0.1:5173`, changez `CORS_ORIGIN` en conséquence). L'application s'ouvre directement en « invité étudiant » (aucun compte).

**`localhost` ou `127.0.0.1` ?** Le mode démo de l'API n'écoute que sur `127.0.0.1` (IPv4), alors que le frontend vise par défaut `http://localhost:3000/api` : sur une machine où `localhost` se résout d'abord en `::1`, le navigateur doit retomber sur IPv4 (Chrome le fait, mais ce n'est pas garanti partout). Pour éliminer ce risque, lancez le frontend avec `VITE_API_URL=http://127.0.0.1:3000/api npm run dev` et utilisez `127.0.0.1` dans les commandes `curl` de la section 2.2.

### 2.2 Réinitialiser les données de démonstration

- **Étudiant** : dans le menu latéral, cliquez « Reset guest session », puis « Confirm reset » (sur téléphone : « Guest options »). Rouvrez ensuite « About & demo guide ».
- **Faculty / Content review** : aucun bouton dans l'interface. Utilisez l'API (`jq` est requis, sinon copiez le champ `token` à la main) :

```bash
API=http://127.0.0.1:3000/api
T=$(curl -s -X POST $API/auth/demo -H 'content-type: application/json' -d '{"role":"teacher"}' | jq -r .token)
curl -s -X POST $API/demo/reset -H "authorization: Bearer $T"
```

Équivalent étudiant par l'API : même commande avec `{"role":"student"}`. Autre solution : supprimer `be/data/demo.db`, puis relancer `seed:demo`.
La réinitialisation étudiant ne remet PAS Content review à zéro. Faites les deux.

### 2.3 Vérifier l'état canonique

- Étudiant : **Alex Martin, niveau 6, 8 240 XP**, 5 missions sur 9 terminées, **Hématologie terminée** (3 sur 3, sortie débloquée), Microbiologie 2 sur 3, aucune mission en cours.
- Faculty > Content review : **les 10 missions sont en « Draft »** (9 missions des laboratoires standard + la mission du Master Lab ; les analyses de classe et « 5 missions sur 9 » ne comptent que les 9 standard).
- Si, pendant une répétition, vous avez changé le statut d'une mission (Approve, puis Return to draft), la ligne affiche ensuite **« Now draft · <date> »** au lieu de « No review recorded yet » : toutes les missions restent « Draft », mais l'écran diffère de la capture 09, et la réinitialisation enseignant (curl ci-dessus) ne l'efface pas. Pour retrouver un écran strictement neuf, supprimez `be/data/demo.db`, relancez `seed:demo` puis l'API.

### 2.4 À ne pas faire pendant la démo

- **Ne cliquez pas « Mark reviewed »** et ne changez aucun statut. L'état persiste et contredirait ce que vous dites sur la validation.
- Ne laissez pas deux personnes utiliser l'application en même temps : tous les invités partagent le même étudiant (Alex Martin).
- Ne dites pas que « tout est déjà débloqué » : pour Alex Martin, le **Master Lab est verrouillé** (« Clear 3 labs (1 of 3 cleared) », vérifié sur `GET /api/labs` après un `seed:demo` neuf, tour 34, C-007). Vous pouvez montrer ce verrouillage : c'est une règle appliquée par le serveur.
- **Données de classe et horloge (tour 34, C-002, constat de l'auditeur C, non rejoué à l'identique)** : les chiffres de la classe générée dépendent de la date du jour, car `seed:demo` écrit les dates une seule fois. Quelques jours plus tard, davantage d'étudiants apparaissent « à surveiller », et Alex lui-même peut afficher « No activity for N days ». **Le jour de la démonstration, supprimez `be/data/demo.db`, relancez `seed:demo`, puis l'API**, plutôt que de réutiliser une base ancienne.

- **Les missions ont un compte à rebours serveur** (Blood Smear Code 04:00, Fix the Sample 06:00 ; tour 35, B35-008). Il continue pendant que vous parlez, **et après « Exit mission »** (le laboratoire propose alors « Resume »). Une mission laissée seule se termine par « Time is up » à la fin de son temps (4 minutes pour Blood Smear Code, 6 pour Fix the Sample). Parlez avant de lancer la mission, pas pendant.
- **Rejouer une mission peut changer les chiffres affichés** (tour 35, C35-006 / B35-014) : rejouer Blood Smear Code correctement bat le meilleur score d'Alex et affiche « New personal best » ; le total passe de 8 240 XP à quelques XP de plus (les auditeurs ont mesuré +10 et +12 selon la vitesse), et la ligne « You » du classement suit. L'état « 8 240 XP » de la section 2.3 est donc celui d'**avant** l'étape 3. Après une répétition, refaites le « Reset guest session » de la section 2.2.
- **Répétez Fix the Sample avant la démo** pour connaître la bonne option : le script ne la donne pas (constat B35-008) ; relevez-la à la répétition, ne la devinez pas devant le comité.
- **Limite de connexions de démonstration** (tour 35, C35-007) : `POST /api/auth/demo` est limité à 60 appels par 10 minutes et par adresse IP (`be/src/routes.ts`). Chaque **nouvel onglet** ou **changement d'invité** en consomme un ; un simple rechargement de la page n'en consomme pas (la session reste dans l'onglet ; mesuré au tour 36, C36-005). Au-delà, l'application affiche « Demo laboratory unavailable » avec « Too many attempts » ; attendez la fin de la fenêtre.

- **Ne maintenez jamais la touche Entrée enfoncée** sur « Submit answer » ni dans le champ du Code Vault (tour 39, B39-001/002) : la répétition automatique renvoie la même réponse. Dans le coffre, 5 essais faux verrouillent la saisie 10 minutes, même pour le bon code (une attente de 10 minutes ou « Reset guest session », qui efface la progression, est la seule issue) ; sur Submit, chaque répétition ajoute une pénalité.
- **Accessibilité : ce qui est vrai à ce jour (tours 35 et 36).** Lab Value Hacker propose maintenant une « Text version of this image » (un vrai tableau des valeurs et un bouton « Select » par ligne, utilisables au clavier ; la même vérification serveur s'applique). **Blood Smear Code n'en a pas** : identifier un schistocyte sur un frottis est une tâche visuelle, et une description écrite doit être rédigée par des experts biomédicaux, l'équipe technique ne l'a donc pas inventée. Un étudiant qui ne voit pas l'image ne peut donc pas passer cette mission seul. Aucun test avec un lecteur d'écran réel n'a été fait. Dites-le dès l'ouverture (section 6), sans attendre la question ; ne présentez pas l'application comme « accessible ».

### 2.5 Plan B

- Réseau ou API en panne : l'application affiche une erreur visible. Sur un écran déjà ouvert, le bouton s'appelle **Retry** ; **au chargement initial** (page vierge), le bouton s'appelle **« Reopen the laboratory »** (constat du tour 35, B35-009 ; `web/src/pages/shell.tsx`). Relancez l'API (commande `DEMO_MODE=1 ... npm start` ci-dessus), puis cliquez le bouton affiché ; après le redémarrage, l'application peut ouvrir une nouvelle session sur le tableau de bord plutôt que de reprendre l'écran en cours.
- Données abîmées : supprimez `be/data/demo.db`, relancez `seed:demo` et l'API.
- Dernier recours : présentez les captures du portfolio (section 5), déjà produites dans `docs/demo-screenshots/`.

### 2.6 Matériel

- Ordinateur, fenêtre **1440 x 900**, zoom du navigateur à 100 %. Le comportement à fort grossissement a été vérifié par émulation de fenêtre réduite (720 x 450 pour 200 %, 360 x 225 pour 400 %), sans défilement horizontal ; ce n'est pas un vrai zoom de navigateur.
- Un **téléphone ou une fenêtre de 375 px** pour la dernière image (étape 8 du guide).
- Onglet unique, notifications coupées, seconde fenêtre prête avec le terminal de l'API.

## 3. Script minute par minute – version 5 minutes

Ouvrez « About & demo guide » en invité étudiant. Après chaque mission ou changement d'invité, rouvrez cette page depuis le menu : l'application ne la garde pas.
Dites d'abord l'ouverture de la section 6. **Lue en entier avec la première ligne elle fait environ 70 à 80 secondes, pas 30** (mesure du tour 39 sur le nombre de mots) : pour tenir les 5 minutes, dites-en une version abrégée de trois phrases (prototype local, contenu non validé par des experts, pas de test avec un lecteur d'écran et Blood Smear Code sans alternative non visuelle) et laissez la section 6 sous les yeux du comité, ou rallongez la durée de 30 à 40 secondes.

| Temps | Écran / action | Ce que vous dites | Ce que le comité doit retenir |
|---|---|---|---|
| 0:00 – 0:30 | **1. Concept.** Page About, blocs « Escape Lab is / is not ». | « Escape Lab est un lieu virtuel sûr où l'étudiant raisonne, décide et se trompe avant la pratique réelle. Il ne remplace ni les enseignants, ni les stages, ni les experts. » | La technologie sert l'apprentissage. Les limites sont dites d'emblée. |
| — (7 min) | **2. Choisir une investigation.** Carte des labos. | *Omis en 5 minutes.* | Les labos sont organisés par discipline. |
| 0:30 – 1:30 | **3. Une mission.** Bouton « Open the Hematology lab », rejouer **Blood Smear Code**, cliquer le schistocyte, « Submit answer ». Blood Smear Code n'a qu'une étape : l'écran de résultat apparaît tout de suite ; « Return to mission control » ramène au tableau de bord, pas au laboratoire (rouvrir ensuite le laboratoire d'hématologie par « Lab map » dans le menu pour l'étape 4). | « Voici une mission d'hématologie : repérer sur un frottis le fragment de globule rouge. L'image est illustrative, ce n'est pas une référence clinique. » | Tâche biomédicale concrète. Image illustrative. |
| 1:30 – 2:00 | **4. Flux de décision.** Même labo, rejouer **Fix the Sample** (décision pré-analytique). | « Ici, l'étudiant décide : accepter, rejeter ou corriger un échantillon. C'est une décision de laboratoire, pas une question à choix pour le plaisir. » | Le jeu enseigne un raisonnement, pas seulement un résultat. |
| 2:00 – 3:00 | **5. Retour immédiat.** Demandez un indice (**-15 XP**, et le **premier** indice fait aussi perdre le bonus « sans indice » : +20 XP en mission standard, +60 au Master Lab ; le coût réel apparaît dans le tableau du résultat, tour 39, B39-003). Répondez faux volontairement (**-10 XP**). Lisez le message. Réessayez avec la bonne réponse. **Arrêtez-vous après ce réessai.** | « Je me trompe exprès. Le message ne donne pas la réponse, il oriente. L'indice coûte des XP. Le serveur, pas le navigateur, calcule le score et le temps. » | Erreur permise, retour sans révéler la clé, réessai. Le serveur est l'arbitre. |
| 3:00 – 3:30 | **6. Progression.** « Open the Progress vault ». | « Les fragments de code gagnés ouvrent le Code Vault, donc la sortie du labo. Ici Hématologie est déjà terminée. La ludification sert l'apprentissage. » | Récompense au service de la progression. |
| 3:30 – 4:30 | **7. Tableau de bord enseignant.** Bouton « Faculty guest ». Class intelligence, ligne du roster (détail étudiant), Content review. | **Dites à voix haute : « Ces étudiants et ces résultats sont des données de démonstration générées. »** Puis : « L'enseignant voit où la classe bloque. Content review : toutes les missions sont en Draft, c'est-à-dire non relues. » | Outil de pilotage pour l'enseignant. Données **générées**, aucune preuve d'usage ni d'efficacité. |
| 4:30 – 5:00 | **8. Qualité et feuille de route.** « Go to quality », « Go to roadmap ». | « Vérifié techniquement, en local seulement. Contenu biomédical non validé par des experts. La feuille de route est une proposition, pas un accord. » | Honnêteté sur le statut. Prochaine étape : revue d'experts. |

Durées : ce tableau est un budget de 5 minutes. Le guide intégré à l'application donne, pour la version complète, 30 + 30 + 60 + 60 + 60 + 45 + 75 + 30 = 390 s sans les déplacements (« environ 7 minutes avec navigation »). Le tableau raccourcit donc l'étape 4 (30 s au lieu de 60), l'étape 6 (30 s au lieu de 45) et l'étape 7 (60 s au lieu de 75) et saute l'étape 2. Ce sont des estimations non chronométrées par un humain.

Gestes de sécurité : ne cliquez pas « Mark reviewed ». Pour la ligne 5, arrêtez-vous après le réessai : l'écran de résultat n'est pas montré en 5 minutes, donc annoncez-le à l'oral. Quitter une mission en cours avec « Exit mission » fonctionne sans blocage (vérifié aux tours 35 et 36) ; le laboratoire propose alors « Resume » et le compte à rebours continue (voir la section 2.4) ; la réinitialisation étudiant efface l'essai laissé ouvert.

### 3.1 Variante 7 minutes : ce qu'il faut ajouter

- **+30 s, étape 2** : ouvrez la carte des labos. Montrez trois disciplines jouables, le Master Lab et les labos « Coming soon ».
- **+30 s, étape 5** : terminez Fix the Sample et montrez l'écran de résultat (« Server-calculated », « Official timer »). Dites : « Le score et le temps viennent du serveur, pas du navigateur. »
- **+30 s, étape 7** : ouvrez le détail d'un étudiant, puis Content review. Expliquez : « Approved dans l'outil ne vaut pas validation scientifique. »
- **+15 s, étape 3** : montrez le point de l'image et l'étiquette « illustrative ».
- Total estimé : environ 6 min 45 s avec les déplacements (le rapport du round 17 donne « 6:45-7:15 », et 7:45 sur téléphone) ; le guide intégré additionne 390 s hors déplacements et affiche « environ 7 minutes ». Ces trois chiffres sont des estimations non chronométrées par un humain, volontairement du même ordre. Gardez 15 s de marge.

### 3.2 Ce qu'il faut couper pour 5 minutes

Selon les rapports de parcours : sautez la carte des labos (étape 2), et arrêtez Fix the Sample après le réessai (donc pas d'écran de résultat). Ne coupez jamais la phrase sur les données générées ni l'étape 8.

## 4. Questions probables du comité et réponses honnêtes

1. **Les contenus sont-ils validés ?** Non. Questions, réponses, valeurs, unités, indices et images n'ont pas été relus par des experts biomédicaux. Un backlog de revue existe (25 constats, dont 1 bloquant provisoire), rédigé par un assistant IA : ce n'est pas une autorité biomédicale. Le statut « Approved » dans l'outil n'est pas une validation.
2. **Peut-on l'utiliser avec des étudiants ?** Pas encore. Il faut d'abord la revue d'experts, puis un pilote avec accord éthique et protection des données.
3. **Qui a testé ?** Des tests automatisés (serveur et interface) et des audits adversariaux menés par des agents IA de l'équipe, en local. Il n'y a pas d'intégration continue distante, ni de revue humaine externe de la sécurité ou de l'accessibilité. Safari/WebKit n'est pas testé.
4. **Et les images ?** Illustratives, jamais une référence clinique ou diagnostique. Leur provenance et leur licence ne sont pas documentées : à faire avant tout usage pédagogique.
5. **Données personnelles ?** Mode invité, aucun compte, aucune inscription. La démo n'utilise aucune donnée d'apprenant réel : l'étudiant Alex Martin et la classe de 38 sont des données de démonstration générées. Tous les invités partagent le même étudiant de démonstration.
6. **Remplace-t-il les travaux pratiques ?** Non. Il prépare la pratique réelle ; il ne la remplace pas, pas plus que les stages ou les enseignants.
7. **Quelle langue ?** Interface et contenu en anglais. Il n'existe pas de version française.
8. **Normes et unités locales (Tunisie, Belgique) ?** À adapter par les experts. Aujourd'hui les intervalles de référence sont génériques, les unités sont mélangées (mg/dL et mmol/L) et le vocabulaire est anglo-saxon (« BUN »). Le choix du jeu de références et des unités reste à décider.
9. **Efficacité pédagogique ?** Non évaluée. Un pilote pré-test / post-test est proposé (petite cohorte volontaire par site, analyse descriptive). Il n'est pas réalisé et exige l'accord des instances éthiques.
10. **Prochaines étapes ?** Cinq phases proposées, aucune faite : (A) revue par des experts, (B) validation par des enseignants, (C) petit pilote étudiant, (D) utilisabilité et engagement, (E) amélioration et transfert. Les rôles des institutions (Monastir, HEPL) sont une proposition à confirmer par elles. Si une question sort de ces documents : « à décider ».

## 5. Portfolio Erasmus : 10 captures

Elles sont fournies dans `docs/demo-screenshots/` avec exactement ces noms. Toutes en invité de démonstration, après réinitialisation (section 2.2).

**Tailles.** Toutes les captures de bureau ont une largeur de 1440 px, mais **pas la même hauteur** : fenêtre de 900 px pour 03 et 05, 960 px pour 04, hauteur ajustée au contenu pour 01 (1440 x 1224), 02 (1440 x 1717), 06 (1440 x 1007), 07 (1440 x 1382), 08 (1440 x 1865) et 09 (1440 x 1178) ; la 10 est en 375 x 812. Les fichiers PNG font le double (échelle 2). La source unique des légendes et du format est `docs/demo-screenshots/README.md` ; les légendes ci-dessous en sont des formes courtes (celles du README sont plus complètes, p. ex. la mention « Prototype local ; capture illustrative »).

1. **`01-about-student-1440.png`** – About, invité étudiant, 1440 x 1224. Montre : principe, « is / is not ».
   Légende : « Page de présentation : un environnement sûr pour s'entraîner avant la pratique réelle. Il ne remplace ni enseignants, ni stages, ni experts. »
2. **`02-lab-map-1440.png`** – Carte des labos, 1440 x 1717 (page entière). Montre : disciplines, Master Lab, labos « Coming soon ».
   Légende : « Les laboratoires sont organisés par discipline. Seuls trois laboratoires et le Master Lab sont jouables dans ce prototype. »
3. **`03-mission-blood-smear-code-1440.png`** – Mission en cours, Blood Smear Code, 1440 x 900. Montre : image du frottis et consigne.
   Légende : « Mission d'hématologie. L'image est illustrative : elle n'est pas une référence clinique et sa provenance reste à documenter. »
4. **`04-fix-the-sample-error-feedback-1440.png`** – Fix the Sample après une mauvaise réponse, 1440 x 960. Montre : « Not quite... », pénalité -10 XP, indice possible.
   Légende : « Décision pré-analytique. Une erreur est permise : le retour oriente sans donner la réponse, puis l'étudiant réessaie. »
5. **`05-mission-result-1440.png`** – Résultat de mission, 1440 x 900. Montre : score, « Server-calculated », « Official timer ».
   Légende : « Le score et le temps sont calculés par le serveur. Il s'agit de données de démonstration, pas de résultats d'étudiants réels. »
6. **`06-progress-code-vault-1440.png`** – Progression et Code Vault, 1440 x 1007 (sans le classement). Montre : fragments, sortie du labo.
   Légende : « Les fragments de code et le Code Vault récompensent la progression. La ludification sert l'apprentissage. »
7. **`07-faculty-class-intelligence-1440.png`** – Faculty, Class intelligence, 1440 x 1382, avec la mention « Demonstration data » visible.
   Légende : « Tableau de bord enseignant. Les étudiants, la classe et les résultats sont des données de démonstration générées, pas des apprenants réels. »
8. **`08-faculty-student-detail-1440.png`** – Détail d'un étudiant (ligne du roster), 1440 x 1865 (page entière). Montre : historique, indices, précision.
   Légende : « Détail d'un étudiant fictif : l'enseignant voit ses tentatives. Données générées. »
9. **`09-faculty-content-review-draft-1440.png`** – Content review, 1440 x 1178 (page entière). Montre : 10 missions en « Draft ».
   Légende : « Suivi de relecture du contenu : toutes les missions sont en Draft. Le contenu biomédical n'est pas validé par des experts. »
10. **`10-about-quality-roadmap-375.png`** – About, vue téléphone 375 px, sections qualité et feuille de route visibles.
    Légende : « Vérifié techniquement en local seulement. Contenu non validé biomédicalement. Feuille de route : propositions, pas des accords. »

## 6. Limites à annoncer en ouverture

- Prototype académique : ni dispositif médical, ni outil de diagnostic, ni référence clinique.
- Contenu biomédical non validé par des experts ; images illustratives, provenance à documenter.
- Données de démonstration générées (étudiants, classe, résultats) : aucun apprenant réel, aucune efficacité pédagogique démontrée.
- Vérification technique en local seulement : tests automatisés et audits adversariaux par des agents IA de l'équipe ; ni intégration continue distante, ni revue humaine externe.
- Accessibilité : **pas de test avec un lecteur d'écran réel** ; la mission Blood Smear Code n'a **pas d'alternative non visuelle** (point ouvert « S-1 » du rapport de validation : une description écrite doit venir d'experts, une évaluation alternative ou une dispense relève des enseignants). Le dire à l'ouverture plutôt que d'attendre la question ; ne pas qualifier l'application d'« accessible ».
- Interface et contenu en anglais ; feuille de route = propositions, pas des accords entre institutions.

**Statut : « Prototype académique démonstrable, vérifié techniquement en local. Version de production et validité scientifique : non atteintes (escalade). »**
