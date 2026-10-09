#!/usr/bin/env python3
"""Usage: python3 docs/tools/build_bilan.py docs/BILAN_FINAL.html
Builds docs/BILAN_FINAL.html: one self-contained page, French by default, FR/EN switch, every technical word explained.
Markup in the text: [[key]] or [[key|shown text]] becomes a button that opens the plain-language definition of `key`."""
import html, re, sys

OUT = sys.argv[1]

# ----------------------------------------------------------------------------------------------- definitions
TERMS = {
 'fr': {
  'instantane': ("instantané", "Une empreinte unique (suite de caractères) calculée sur tous les fichiers du code et des tests. Si un seul fichier change, l'empreinte change. Elle remplace un numéro de version, car il n'y a pas de Git ici."),
  'empreinte': ("empreinte", "Suite de caractères calculée à partir du contenu d'un fichier. Deux fichiers identiques donnent la même empreinte ; au moindre changement, elle est différente."),
  'p0': ("P0", "Défaut gravissime : perte de données, faille de sécurité, application inutilisable."),
  'p1': ("P1", "Défaut bloquant : score ou progression faux, mission cassée, fonction essentielle inaccessible, serveur figé."),
  'p2': ("P2 / P3", "Défauts moins graves (gêne, finition, formulation). Ils ne bloquent pas la démonstration, sauf s'ils la perturbent."),
  's1': ("S-1", "Le nom donné au seul P1 qui reste ouvert : la mission Blood Smear Code n'a pas de voie utilisable sans la vue."),
  'backend': ("backend (serveur)", "La partie invisible de l'application. Elle calcule le score, le temps, les indices et les déblocages : c'est elle qui fait autorité."),
  'frontend': ("frontend (interface)", "La partie affichée dans le navigateur. Elle ne fait qu'afficher ce que le serveur décide."),
  'typecheck': ("vérification des types", "Contrôle automatique que le code est cohérent avant même de l'exécuter (« typecheck » en anglais)."),
  'vitest': ("Vitest", "Outil de tests automatiques pour l'interface (frontend)."),
  'playwright': ("Playwright", "Outil qui pilote un vrai navigateur comme le ferait une personne : clics, clavier, téléphone simulé."),
  'e2e': ("de bout en bout (e2e)", "Un test qui parcourt l'application entière, de l'écran au serveur, comme un utilisateur."),
  'bundle': ("paquet de production (bundle)", "L'ensemble des fichiers réellement envoyés au navigateur. On fixe une limite de poids pour que le site reste rapide."),
  'jscss': ("JS / CSS", "Les deux grands types de fichiers du site : JS = le programme, CSS = la mise en forme."),
  'npmaudit': ("npm audit", "Contrôle des failles de sécurité déjà connues dans les bibliothèques logicielles utilisées."),
  'openapi': ("OpenAPI", "Le document qui décrit officiellement toutes les demandes que le serveur accepte. « Inchangé » veut dire que le serveur n'a pas changé de contrat."),
  'api': ("API", "La façon dont le navigateur parle au serveur."),
  'ci': ("CI distante (intégration continue)", "Exécution automatique des tests sur une machine distante. Il n'y en a aucune ici : tout a été vérifié sur un seul ordinateur."),
  'quadratique': ("quadratique", "Un calcul dont la durée explose : elle est multipliée par 4 quand les données doublent. Avec beaucoup de données, un seul compte pouvait figer le serveur pour tout le monde."),
  'mutation': ("test par mutation", "On casse volontairement le code pour vérifier qu'un test le détecte. Si le test reste vert, il ne sert à rien."),
  'lecteur': ("lecteur d'écran", "Logiciel qui lit l'écran à voix haute pour les personnes aveugles ou malvoyantes."),
  'alternative': ("alternative textuelle", "Un texte qui donne la même information qu'une image, pour que tout le monde y accède."),
  'debit': ("limiteur de débit", "Un plafond du nombre de demandes autorisées, pour éviter les abus."),
  'ipv6': ("IPv6", "Format moderne d'adresse Internet. Un seul ordinateur peut en utiliser un très grand nombre, ce qui permet de contourner un plafond par adresse."),
  'vault': ("Code Vault (coffre)", "Écran où l'on saisit le code de sortie d'un laboratoire, une fois ses fragments trouvés."),
  'fragments': ("fragments", "Morceaux du code de sortie gagnés en réussissant les missions."),
  'masterlab': ("Master Lab", "Le laboratoire final, débloqué quand trois laboratoires sont terminés."),
  'faculty': ("Faculty", "La vue enseignant de l'application."),
  'review': ("Content review", "Écran de suivi de la relecture du contenu. Toutes les missions y sont en « Draft » (brouillon) : le contenu n'est pas relu par des experts."),
  'seed': ("base neuve (seed:demo)", "Commande qui remplit une base de données avec des données de démonstration générées (38 étudiants fictifs)."),
  'agents': ("agents IA", "Programmes d'intelligence artificielle qui ont joué le rôle d'auditeurs. Ils appartiennent à la même équipe : ce n'est pas une revue humaine ni externe."),
  'tour': ("tour d'audit", "Une passe de contrôle par trois auditeurs indépendants : le serveur, le parcours étudiant dans un vrai navigateur, l'enseignant et les documents."),
  'escalate': ("ESCALATE", "Statut « à remonter » : tant que les revues humaines (sécurité, accessibilité, biomédical) ne sont pas faites, la mise en production reste interdite."),
  'demoready': ("DEMO-READY ACADEMIC MVP", "Formule officielle : prototype académique prêt à être montré. Cela ne dit rien de sa validité scientifique."),
  'ports': ("ports 3000 et 5173", "Les « portes » du serveur et du site de test sur votre ordinateur. Playwright a besoin de ces deux ports et ne peut donc pas tourner pendant que vous testez."),
  'node': ("Node 22", "La version du moteur qui exécute le serveur."),
  'xp': ("XP", "Points d'expérience du jeu."),
  'schistocyte': ("schistocyte", "Fragment de globule rouge, à repérer sur le frottis de la mission."),
  'api_limits': ("plafond de connexions", "Une limite du nombre de visiteurs en même temps. Elle n'existe pas encore : à prévoir avant toute mise en ligne publique."),
 },
 'en': {
  'instantane': ("snapshot", "A unique fingerprint (a string of characters) computed over all code and test files. If a single file changes, the fingerprint changes. It stands in for a version number because there is no Git here."),
  'empreinte': ("fingerprint", "A string of characters computed from a file's content. Identical files give the same fingerprint; any change gives a different one."),
  'p0': ("P0", "Critical defect: data loss, security hole, unusable application."),
  'p1': ("P1", "Blocking defect: wrong score or progression, broken mission, essential feature inaccessible, frozen server."),
  'p2': ("P2 / P3", "Less serious defects (annoyance, polish, wording). They do not block the demonstration unless they disturb it."),
  's1': ("S-1", "The name given to the one P1 that remains open: the Blood Smear Code mission has no path usable without sight."),
  'backend': ("backend (server)", "The invisible part of the application. It computes score, time, hints and unlocks: it is the authority."),
  'frontend': ("frontend (interface)", "The part shown in the browser. It only displays what the server decides."),
  'typecheck': ("typecheck", "An automatic check that the code is consistent before it is even run."),
  'vitest': ("Vitest", "An automatic test tool for the interface (frontend)."),
  'playwright': ("Playwright", "A tool that drives a real browser the way a person would: clicks, keyboard, simulated phone."),
  'e2e': ("end-to-end (e2e)", "A test that walks through the whole application, from screen to server, like a user."),
  'bundle': ("production bundle", "The set of files actually sent to the browser. A size limit keeps the site fast."),
  'jscss': ("JS / CSS", "The two main kinds of site files: JS = the program, CSS = the styling."),
  'npmaudit': ("npm audit", "A check for already-known security flaws in the software libraries in use."),
  'openapi': ("OpenAPI", "The document that officially describes every request the server accepts. \"Unchanged\" means the server's contract did not change."),
  'api': ("API", "The way the browser talks to the server."),
  'ci': ("remote CI (continuous integration)", "Automatic execution of the tests on a remote machine. There is none here: everything was checked on one computer."),
  'quadratique': ("quadratic", "A computation whose duration explodes: it is multiplied by 4 when the data doubles. With a lot of data, a single account could freeze the server for everyone."),
  'mutation': ("mutation test", "The code is deliberately broken to check that a test notices. If the test stays green, it is useless."),
  'lecteur': ("screen reader", "Software that reads the screen aloud for blind or low-vision people."),
  'alternative': ("text alternative", "A text that gives the same information as an image, so everyone can access it."),
  'debit': ("rate limiter", "A cap on the number of allowed requests, to prevent abuse."),
  'ipv6': ("IPv6", "The modern Internet address format. One computer can use a huge number of them, which defeats a per-address cap."),
  'vault': ("Code Vault", "The screen where a laboratory's exit code is entered once its fragments are found."),
  'fragments': ("fragments", "Pieces of the exit code earned by succeeding at missions."),
  'masterlab': ("Master Lab", "The final laboratory, unlocked when three laboratories are completed."),
  'faculty': ("Faculty", "The teacher view of the application."),
  'review': ("Content review", "The screen that tracks the review of the content. Every mission is \"Draft\" there: the content has not been reviewed by experts."),
  'seed': ("fresh database (seed:demo)", "A command that fills a database with generated demonstration data (38 fictitious students)."),
  'agents': ("AI agents", "Artificial-intelligence programs that played the role of auditors. They belong to the same team: this is not a human or external review."),
  'tour': ("audit round", "One pass of checks by three independent auditors: the server, the student journey in a real browser, the teacher view and the documents."),
  'escalate': ("ESCALATE", "Status meaning \"must be escalated\": until human reviews (security, accessibility, biomedical) are done, going to production is not allowed."),
  'demoready': ("DEMO-READY ACADEMIC MVP", "The official wording: an academic prototype ready to be shown. It says nothing about scientific validity."),
  'ports': ("ports 3000 and 5173", "The \"doors\" of the server and of the test site on your computer. Playwright needs both and cannot run while you are testing."),
  'node': ("Node 22", "The version of the engine that runs the server."),
  'xp': ("XP", "The game's experience points."),
  'schistocyte': ("schistocyte", "A fragment of a red blood cell, to be spotted on the mission's smear."),
  'api_limits': ("connection cap", "A limit on the number of simultaneous visitors. It does not exist yet: to add before any public exposure."),
 },
}

# ----------------------------------------------------------------------------------------------- content
FR = {
 'lang': 'fr',
 'h1': "Escape Lab — Bilan final de validation",
 'sub': "Prototype académique de laboratoire virtuel biomédical · 9 octobre 2026 · validation locale uniquement",
 'verdict_label': "Verdict",
 'verdict': "[[demoready|DEMO-READY ACADEMIC MVP]] — TECHNICALLY VERIFIED LOCALLY",
 'verdict_fr': "En français : prototype académique prêt à être montré, vérifié techniquement sur un seul ordinateur, avec <strong>un point d'accessibilité encore ouvert ([[s1]])</strong> qui attend votre décision.",
 'badges': ["Vérifié techniquement : OUI (en local)", "Validé biomédicalement : NON", "Prêt pour la production : NON ([[escalate]])"],
 'note': "Cliquez sur un mot souligné pour voir son explication. Le glossaire complet est en bas de page.",
 'sections': [
  ('glance', "En un coup d'œil", """
<ul>
<li><strong>Ce qui est vérifié :</strong> le fonctionnement technique (serveur, interface, parcours dans un vrai navigateur, sécurité des bibliothèques), par des contrôles que le superviseur a relancés lui-même.</li>
<li><strong>Ce qui ne l'est pas :</strong> le contenu biomédical (questions, réponses, explications, indices, valeurs, images). Aucun expert ne l'a relu. Les images sont illustratives, pas des références cliniques.</li>
<li><strong>Qui a contrôlé :</strong> des [[agents|agents IA]] de la même équipe, en plusieurs [[tour|tours d'audit]]. Ce n'est <strong>ni une revue humaine, ni une revue externe</strong>, et il n'y a aucune [[ci|CI distante]].</li>
<li><strong>Ce qui reste à décider :</strong> le point [[s1]] (voir la section 4).</li>
</ul>"""),
  ('metrics', "1. Résultats des contrôles", """
<p>Relancés par le superviseur avec [[node]] (version 22.23.2). Les journaux sont archivés dans <code>.ci-artifacts/</code>.</p>
<table>
<thead><tr><th>Contrôle</th><th>Résultat</th><th>Ce que cela veut dire</th></tr></thead>
<tbody>
<tr><td>Tests du [[backend]]</td><td><strong>270 sur 270</strong></td><td>Tous les tests automatiques du serveur réussissent.</td></tr>
<tr><td>[[typecheck|Vérification des types]]</td><td><strong>propre</strong></td><td>Aucune incohérence détectée dans le code du serveur.</td></tr>
<tr><td>Tests du [[frontend]] ([[vitest|Vitest]])</td><td><strong>328 sur 328</strong></td><td>Tous les tests de l'interface réussissent (18 fichiers).</td></tr>
<tr><td>Tests [[e2e]] ([[playwright|Playwright]])</td><td><strong>415 sur 415, deux fois de suite</strong></td><td>Parcours complets dans un vrai navigateur, sur ordinateur, sur iPhone 13 simulé et sur le [[bundle|paquet de production]].</td></tr>
<tr><td>[[npmaudit|npm audit]]</td><td><strong>0 faille</strong></td><td>Aucune faille connue dans les bibliothèques (serveur et interface).</td></tr>
<tr><td>[[openapi|OpenAPI]]</td><td><strong>inchangé</strong></td><td>Le contrat du serveur n'a pas bougé après régénération.</td></tr>
<tr><td>Poids du [[bundle|paquet]] ([[jscss|JS / CSS]])</td><td><strong>JS 362 040 / 400 000 octets<br>CSS 67 448 / 120 000 octets</strong></td><td>Sous les limites fixées.</td></tr>
<tr><td>[[instantane|Instantané]] final</td><td><code>54dd91f6…dde2</code> (143 fichiers)</td><td>Identifiant reproductible du code vérifié : <code>sh .ci-artifacts/local-2026-10-09-verify-r34/snapshot-id.sh</code>.</td></tr>
</tbody></table>
<p class="warn"><strong>Réserve importante.</strong> Les tests [[playwright|Playwright]] (415 sur 415) ont été exécutés sur l'[[instantane|instantané]] <code>96233cf7…c81d</code>, pas sur l'instantané final : le code du produit et les tests e2e sont identiques, seul un fichier de test du serveur diffère. Je n'ai pas pu les relancer, car les [[ports]] sont occupés par le site que vous testez. À relancer une fois le site arrêté : <code>cd web &amp;&amp; CI=true npm run test:e2e</code>.</p>"""),
  ('fixed', "2. Défauts corrigés", """
<p>Pour chacun, le test a été écrit <strong>avant</strong> la correction et il échouait avant, réussit après.</p>
<ul>
<li><strong>[[p1|P1]] — un seul compte pouvait figer tout le serveur.</strong> Une requête [[quadratique]] dans le calcul des compétences. Mesure : 1 256 ms → 10 ms pour 2 000 tentatives.</li>
<li><strong>[[p1|P1]] — même défaut dans les statistiques enseignant.</strong> 1,1 s → 8 ms pour 8 000 tentatives.</li>
<li><strong>[[p1|P1]] — la mission Lab Value Hacker n'avait aucune [[alternative|alternative textuelle]].</strong> Elle a maintenant un vrai tableau de valeurs et des boutons « Select » utilisables au clavier. Le serveur décide toujours de la réponse.</li>
<li><strong>Un test qui ne testait rien.</strong> Un test d'égalité de résultats ne distinguait pas deux variantes du code ; prouvé par un [[mutation|test par mutation]], puis remplacé par un vrai test.</li>
<li><strong>Documents.</strong> Plusieurs affirmations trop fortes ou périmées ont été corrigées, dont une que j'avais écrite moi-même.</li>
</ul>"""),
  ('p01', "3. Défauts graves : P0 et P1", """
<table>
<thead><tr><th>Niveau</th><th>Nombre</th><th>Détail</th></tr></thead>
<tbody>
<tr><td>[[p0|P0]]</td><td><strong>0</strong></td><td>Aucun.</td></tr>
<tr><td>[[p1|P1]] hors [[s1]]</td><td><strong>0</strong></td><td>Aux tours 38 et 39, deux tours consécutifs, sur le même code produit.</td></tr>
<tr><td>[[s1]]</td><td><strong>1 ouvert</strong></td><td>Voir la section 4.</td></tr>
</tbody></table>"""),
  ('s1', "4. Le point ouvert S-1 : une décision vous revient", """
<p><strong>La mission Blood Smear Code n'a pas de voie utilisable sans la vue.</strong> Il s'agit de repérer un [[schistocyte]] sur une image. Elle est la première de l'Hématologie : un étudiant qui ne voit pas l'image ne peut pas continuer dans ce laboratoire ni atteindre le [[masterlab|Master Lab]].</p>
<ul>
<li>Deux auditeurs indépendants l'ont classé [[p1|P1]].</li>
<li><strong>L'ingénierie ne peut pas le fermer seule.</strong> Une description écrite de l'image doit être rédigée par des experts biomédicaux (elle n'a donc pas été inventée). Il faut une évaluation alternative, une dispense accordée par l'enseignant, ou une requalification explicite de votre part.</li>
<li>Aucun test avec un vrai [[lecteur|lecteur d'écran]] n'a été fait.</li>
</ul>
<p><strong>Critère appliqué.</strong> Vous avez répondu « tout as supervisor » ; j'ai donc appliqué le critère de travail « [[p0|P0]] = 0 et [[p1|P1]] = 0 <em>hors S-1</em>, deux tours consécutifs ». Il est atteint (tours 38 et 39). Il <strong>ne remplace pas votre décision</strong> : à la lettre, la règle « les P0 et P1 bloquent la convergence » <strong>n'est pas satisfaite</strong>.</p>"""),
  ('minor', "5. Défauts mineurs restants ([[p2|P2 et P3]])", """
<p>Dernier tour : 7 P2 et 17 P3. La liste complète est dans <code>docs/KNOWN_LIMITATIONS.md</code>. Ceux qui touchent la démonstration :</p>
<ul>
<li>L'explication de la dernière étape réussie n'est pas affichée sur l'écran de résultat.</li>
<li>Le prix affiché d'un indice (15 [[xp|XP]]) oublie que le premier indice fait aussi perdre le bonus « sans indice » (+20 XP).</li>
<li>Maintenir la touche Entrée dans le [[vault|Code Vault]] verrouille le coffre pendant 10 minutes.</li>
<li>La page « About » de l'application n'annonce pas [[s1]].</li>
<li>Les données de classe vieillissent avec l'horloge : réinitialisez avant de présenter.</li>
</ul>
<p>Hors démonstration (à traiter avant toute mise en ligne publique) : les [[debit|limiteurs de débit]] se contournent en [[ipv6|IPv6]], et il n'y a ni [[api_limits|plafond de connexions]] ni plafond de taille de classe.</p>"""),
  ('experts', "6. À faire relire par des humains", """
<ul>
<li><strong>Contenu biomédical :</strong> <code>docs/SCIENTIFIC_REVIEW_BACKLOG.md</code> (25 constats, dont 1 bloquant provisoire). Ce document a été préparé par une IA et n'est pas signé : ce n'est pas une revue.</li>
<li>Provenance et licence des images.</li>
<li>Revue d'accessibilité avec un vrai [[lecteur|lecteur d'écran]] (jamais faite).</li>
<li>Revue de sécurité par une personne.</li>
<li>Une [[ci|CI distante]] reproductible (il faudrait d'abord un dépôt Git distant).</li>
<li>Un pilote avec de vrais étudiants : accord éthique, protection des données, test avant/après.</li>
</ul>"""),
  ('script', "7. Démonstration en 5 minutes", """
<p>Détails et pièges : <code>docs/FACULTY_DEMO_SCRIPT.md</code>. <strong>Avant :</strong> [[seed|base neuve]], puis le bouton « Reset guest session ».</p>
<ol class="steps">
<li><span class="time">0:00 – 0:30</span> <strong>Le concept.</strong> Page « About &amp; demo guide ». Dites en trois phrases : prototype local ; contenu non validé par des experts ; pas de test avec un lecteur d'écran et Blood Smear Code sans alternative non visuelle.</li>
<li><span class="time">0:30 – 1:30</span> <strong>Une mission.</strong> « Open the Hematology lab », puis Blood Smear Code : cliquez le [[schistocyte]], « Submit answer ». L'image est illustrative, pas une référence clinique.</li>
<li><span class="time">1:30 – 2:00</span> <strong>Une décision.</strong> Fix the Sample : accepter, rejeter ou corriger un échantillon. Connaissez la bonne option avant la démo.</li>
<li><span class="time">2:00 – 3:00</span> <strong>Le retour immédiat.</strong> Demandez un indice (−15 [[xp|XP]], et le bonus « sans indice » est perdu). Répondez faux exprès (−10 XP), lisez le message, réessayez. Le serveur calcule le score et le temps. Arrêtez-vous après le réessai.</li>
<li><span class="time">3:00 – 3:30</span> <strong>La progression.</strong> « Open the Progress vault » : les [[fragments]] et le [[vault|Code Vault]]. Ne maintenez pas la touche Entrée.</li>
<li><span class="time">3:30 – 4:30</span> <strong>L'enseignant.</strong> « Faculty guest » ([[faculty|vue enseignant]]). Dites à voix haute : « Ces étudiants et ces résultats sont des données de démonstration générées. » Montrez Class intelligence, le détail d'un étudiant, puis [[review|Content review]]. Ne cliquez pas « Mark reviewed ».</li>
<li><span class="time">4:30 – 5:00</span> <strong>La qualité et la feuille de route.</strong> « Go to quality », « Go to roadmap » : vérifié techniquement en local seulement ; contenu non validé ; la feuille de route est une proposition, pas un accord.</li>
</ol>
<p class="warn"><strong>Chronomètres.</strong> Blood Smear Code : 4 minutes ; Fix the Sample : 6 minutes. Ils continuent même après « Exit mission ».</p>"""),
  ('shots', "8. Captures recommandées pour le portfolio Erasmus", """
<p>Les 10 images de <code>docs/demo-screenshots/</code> (légendes françaises et anglaises dans son <code>README.md</code>).</p>
<ol>
<li>La page « About » : le concept et les limites.</li>
<li>La carte des laboratoires.</li>
<li>La mission Blood Smear Code.</li>
<li>Fix the Sample : le retour après une erreur volontaire.</li>
<li>L'écran de résultat (score « calculé par le serveur »).</li>
<li>La progression et le [[vault|Code Vault]].</li>
<li>[[faculty|Faculty]] : Class intelligence.</li>
<li>Le détail d'un étudiant fictif.</li>
<li>[[review|Content review]] : tout en « Draft ».</li>
<li>La page « About » sur téléphone : qualité et feuille de route.</li>
</ol>
<p>Facultatif, pas encore pris : la section « Text version of this image » de Lab Value Hacker (accessibilité).</p>"""),
  ('next', "9. Prochaines actions", """
<ol>
<li><strong>Trancher [[s1]].</strong></li>
<li>Arrêter votre site local (les [[ports]] 3000 et 5173), puis relancer les tests Playwright finaux.</li>
<li>Faire relire le contenu biomédical par des experts.</li>
</ol>"""),
 ],
 'glossary': "Glossaire",
 'footer': "Source de vérité : <code>docs/FINAL_VALIDATION_REPORT.md</code> (section en haut du fichier). Ce document est figé sur l'[[instantane|instantané]] <code>54dd91f62beef5aa9f7d519534986d762b8783b6d9d786af6a0e3429a5cfdde2</code> ; les chiffres changent à la moindre correction du code. Il n'a pas été relu par un tour d'audit. <strong>Validation locale uniquement.</strong>",
 'open': "Fermer l'explication", 'show': "Afficher l'explication de",
}

EN = {
 'lang': 'en',
 'h1': "Escape Lab — Final validation summary",
 'sub': "Academic biomedical virtual-laboratory prototype · 9 October 2026 · local validation only",
 'verdict_label': "Verdict",
 'verdict': "[[demoready|DEMO-READY ACADEMIC MVP]] — TECHNICALLY VERIFIED LOCALLY",
 'verdict_fr': "In plain words: an academic prototype ready to be shown, technically verified on a single computer, with <strong>one accessibility item still open ([[s1]])</strong> that awaits your decision.",
 'badges': ["Technically verified: YES (locally)", "Biomedically validated: NO", "Production ready: NO ([[escalate]])"],
 'note': "Click an underlined word to see its explanation. The full glossary is at the bottom of the page.",
 'sections': [
  ('glance', "At a glance", """
<ul>
<li><strong>What is verified:</strong> the technical behaviour (server, interface, journeys in a real browser, security of the libraries), through checks the supervisor re-ran personally.</li>
<li><strong>What is not:</strong> the biomedical content (questions, answers, explanations, hints, values, images). No expert has reviewed it. The images are illustrative, not clinical references.</li>
<li><strong>Who checked:</strong> [[agents|AI agents]] of the same team, over several [[tour|audit rounds]]. This is <strong>neither a human nor an external review</strong>, and there is no [[ci|remote CI]].</li>
<li><strong>What remains to be decided:</strong> item [[s1]] (see section 4).</li>
</ul>"""),
  ('metrics', "1. Results of the checks", """
<p>Re-run by the supervisor with [[node]] (version 22.23.2). Logs are archived in <code>.ci-artifacts/</code>.</p>
<table>
<thead><tr><th>Check</th><th>Result</th><th>What it means</th></tr></thead>
<tbody>
<tr><td>[[backend]] tests</td><td><strong>270 of 270</strong></td><td>Every automatic server test passes.</td></tr>
<tr><td>[[typecheck]]</td><td><strong>clean</strong></td><td>No inconsistency found in the server code.</td></tr>
<tr><td>[[frontend]] tests ([[vitest|Vitest]])</td><td><strong>328 of 328</strong></td><td>Every interface test passes (18 files).</td></tr>
<tr><td>[[e2e]] tests ([[playwright|Playwright]])</td><td><strong>415 of 415, twice in a row</strong></td><td>Full journeys in a real browser: desktop, simulated iPhone 13, and the [[bundle|production bundle]].</td></tr>
<tr><td>[[npmaudit|npm audit]]</td><td><strong>0 flaws</strong></td><td>No known flaw in the libraries (server and interface).</td></tr>
<tr><td>[[openapi|OpenAPI]]</td><td><strong>unchanged</strong></td><td>The server's contract did not move after regeneration.</td></tr>
<tr><td>[[bundle|Bundle]] size ([[jscss|JS / CSS]])</td><td><strong>JS 362,040 / 400,000 bytes<br>CSS 67,448 / 120,000 bytes</strong></td><td>Under the set limits.</td></tr>
<tr><td>Final [[instantane|snapshot]]</td><td><code>54dd91f6…dde2</code> (143 files)</td><td>Reproducible identifier of the verified code: <code>sh .ci-artifacts/local-2026-10-09-verify-r34/snapshot-id.sh</code>.</td></tr>
</tbody></table>
<p class="warn"><strong>Important caveat.</strong> The [[playwright|Playwright]] tests (415 of 415) ran on [[instantane|snapshot]] <code>96233cf7…c81d</code>, not on the final snapshot: the product code and the e2e tests are identical, only one server test file differs. I could not re-run them because the [[ports]] are in use by the site you are testing. Re-run once the site is stopped: <code>cd web &amp;&amp; CI=true npm run test:e2e</code>.</p>"""),
  ('fixed', "2. Defects fixed", """
<p>For each one, the test was written <strong>before</strong> the fix: it failed before and passes after.</p>
<ul>
<li><strong>[[p1|P1]] — one account could freeze the whole server.</strong> A [[quadratique|quadratic]] query in the skills computation. Measured: 1,256 ms → 10 ms for 2,000 attempts.</li>
<li><strong>[[p1|P1]] — the same defect in the teacher statistics.</strong> 1.1 s → 8 ms for 8,000 attempts.</li>
<li><strong>[[p1|P1]] — the Lab Value Hacker mission had no [[alternative|text alternative]].</strong> It now has a real table of values and keyboard-operable "Select" buttons. The server still decides the answer.</li>
<li><strong>A test that tested nothing.</strong> A result-equality test could not tell two variants of the code apart; proved with a [[mutation|mutation test]], then replaced by a real test.</li>
<li><strong>Documents.</strong> Several overstated or stale statements were corrected, including one I had written myself.</li>
</ul>"""),
  ('p01', "3. Serious defects: P0 and P1", """
<table>
<thead><tr><th>Level</th><th>Count</th><th>Detail</th></tr></thead>
<tbody>
<tr><td>[[p0|P0]]</td><td><strong>0</strong></td><td>None.</td></tr>
<tr><td>[[p1|P1]] excluding [[s1]]</td><td><strong>0</strong></td><td>In rounds 38 and 39, two consecutive rounds, on the same product code.</td></tr>
<tr><td>[[s1]]</td><td><strong>1 open</strong></td><td>See section 4.</td></tr>
</tbody></table>"""),
  ('s1', "4. The open item S-1: a decision is yours", """
<p><strong>The Blood Smear Code mission has no path usable without sight.</strong> The task is to spot a [[schistocyte]] on an image. It is the first mission of Hematology: a student who cannot see the image cannot continue in that laboratory nor reach the [[masterlab|Master Lab]].</p>
<ul>
<li>Two independent auditors rated it [[p1|P1]].</li>
<li><strong>Engineering cannot close it alone.</strong> A written description of the image must be authored by biomedical experts (so it was not invented). It needs an alternative assessment, a teacher-granted exemption, or an explicit re-rating by you.</li>
<li>No test with a real [[lecteur|screen reader]] has been done.</li>
</ul>
<p><strong>Criterion applied.</strong> You answered "tout as supervisor"; I therefore applied the working criterion "[[p0|P0]] = 0 and [[p1|P1]] = 0 <em>excluding S-1</em>, two consecutive rounds". It is met (rounds 38 and 39). It <strong>does not replace your decision</strong>: read literally, the rule "P0 and P1 block convergence" <strong>is not satisfied</strong>.</p>"""),
  ('minor', "5. Remaining minor defects ([[p2|P2 and P3]])", """
<p>Last round: 7 P2 and 17 P3. The full list is in <code>docs/KNOWN_LIMITATIONS.md</code>. Those that touch the demonstration:</p>
<ul>
<li>The explanation of the last correct step is not shown on the result screen.</li>
<li>The displayed hint price (15 [[xp|XP]]) forgets that the first hint also forfeits the "no hint" bonus (+20 XP).</li>
<li>Holding the Enter key in the [[vault|Code Vault]] locks the vault for 10 minutes.</li>
<li>The application's "About" page does not announce [[s1]].</li>
<li>The class data ages with the clock: reset before presenting.</li>
</ul>
<p>Outside the demonstration (to address before any public exposure): the [[debit|rate limiters]] can be bypassed over [[ipv6|IPv6]], and there is neither a [[api_limits|connection cap]] nor a class-size cap.</p>"""),
  ('experts', "6. To be reviewed by humans", """
<ul>
<li><strong>Biomedical content:</strong> <code>docs/SCIENTIFIC_REVIEW_BACKLOG.md</code> (25 findings, 1 provisional blocker). This document was prepared by an AI and is unsigned: it is not a review.</li>
<li>Image provenance and licence.</li>
<li>Accessibility review with a real [[lecteur|screen reader]] (never done).</li>
<li>Security review by a person.</li>
<li>A reproducible [[ci|remote CI]] (a remote Git repository would be needed first).</li>
<li>A pilot with real students: ethics approval, data protection, pre/post test.</li>
</ul>"""),
  ('script', "7. 5-minute demonstration", """
<p>Details and pitfalls: <code>docs/FACULTY_DEMO_SCRIPT.md</code>. <strong>Before:</strong> a [[seed|fresh database]], then the "Reset guest session" button.</p>
<ol class="steps">
<li><span class="time">0:00 – 0:30</span> <strong>The concept.</strong> "About &amp; demo guide" page. Say in three sentences: local prototype; content not validated by experts; no screen-reader test and Blood Smear Code without a non-visual alternative.</li>
<li><span class="time">0:30 – 1:30</span> <strong>One mission.</strong> "Open the Hematology lab", then Blood Smear Code: click the [[schistocyte]], "Submit answer". The image is illustrative, not a clinical reference.</li>
<li><span class="time">1:30 – 2:00</span> <strong>A decision.</strong> Fix the Sample: accept, reject or correct a specimen. Know the right option before the demo.</li>
<li><span class="time">2:00 – 3:00</span> <strong>Immediate feedback.</strong> Ask for a hint (−15 [[xp|XP]], and the "no hint" bonus is lost). Answer wrongly on purpose (−10 XP), read the message, retry. The server computes score and time. Stop after the retry.</li>
<li><span class="time">3:00 – 3:30</span> <strong>Progress.</strong> "Open the Progress vault": the [[fragments]] and the [[vault|Code Vault]]. Do not hold the Enter key.</li>
<li><span class="time">3:30 – 4:30</span> <strong>The teacher.</strong> "Faculty guest" ([[faculty|teacher view]]). Say out loud: "These students and results are generated demonstration data." Show Class intelligence, one student's detail, then [[review|Content review]]. Do not click "Mark reviewed".</li>
<li><span class="time">4:30 – 5:00</span> <strong>Quality and roadmap.</strong> "Go to quality", "Go to roadmap": technically verified locally only; content not validated; the roadmap is a proposal, not an agreement.</li>
</ol>
<p class="warn"><strong>Timers.</strong> Blood Smear Code: 4 minutes; Fix the Sample: 6 minutes. They keep running even after "Exit mission".</p>"""),
  ('shots', "8. Recommended screenshots for the Erasmus portfolio", """
<p>The 10 images in <code>docs/demo-screenshots/</code> (French and English captions in its <code>README.md</code>).</p>
<ol>
<li>The "About" page: concept and limits.</li>
<li>The laboratory map.</li>
<li>The Blood Smear Code mission.</li>
<li>Fix the Sample: feedback after a deliberate error.</li>
<li>The result screen (score "calculated by the server").</li>
<li>Progress and the [[vault|Code Vault]].</li>
<li>[[faculty|Faculty]]: Class intelligence.</li>
<li>A fictitious student's detail.</li>
<li>[[review|Content review]]: everything "Draft".</li>
<li>The "About" page on a phone: quality and roadmap.</li>
</ol>
<p>Optional, not yet taken: the "Text version of this image" section of Lab Value Hacker (accessibility).</p>"""),
  ('next', "9. Next actions", """
<ol>
<li><strong>Decide [[s1]].</strong></li>
<li>Stop your local site (the [[ports]] 3000 and 5173), then re-run the final Playwright tests.</li>
<li>Have the biomedical content reviewed by experts.</li>
</ol>"""),
 ],
 'glossary': "Glossary",
 'footer': "Source of truth: <code>docs/FINAL_VALIDATION_REPORT.md</code> (top section). This document is frozen on [[instantane|snapshot]] <code>54dd91f62beef5aa9f7d519534986d762b8783b6d9d786af6a0e3429a5cfdde2</code>; the numbers change with any code fix. It was not covered by an audit round. <strong>Local validation only.</strong>",
 'open': "Close the explanation", 'show': "Show the explanation of",
}

# ----------------------------------------------------------------------------------------------- rendering
counter = {'n': 0}
used = {'fr': [], 'en': []}

def term(lang, key, shown=None):
    if key not in TERMS[lang]:
        raise SystemExit(f"unknown term {key} in {lang}")
    label, definition = TERMS[lang][key]
    counter['n'] += 1
    did = f"d-{lang}-{counter['n']}"
    if key not in used[lang]:
        used[lang].append(key)
    text = shown if shown is not None else label
    return (f'<button type="button" class="t" aria-expanded="false" aria-controls="{did}">{text}</button>'
            f'<span class="def" id="{did}" hidden>{html.escape(definition)}</span>')

pat = re.compile(r'\[\[([a-z0-9_]+)(?:\|([^\]]*))?\]\]')
def render(lang, s):
    return pat.sub(lambda m: term(lang, m.group(1), m.group(2)), s)

def block(c):
    lang = c['lang']
    parts = []
    parts.append(f'<h1>{html.escape(c["h1"])}</h1>')
    parts.append(f'<p class="sub">{html.escape(c["sub"])}</p>')
    parts.append(f'<section class="verdict" aria-label="{html.escape(c["verdict_label"])}"><p class="vlabel">{html.escape(c["verdict_label"])}</p>'
                 f'<p class="vmain">{render(lang, c["verdict"])}</p><p>{render(lang, c["verdict_fr"])}</p>'
                 f'<ul class="badges">' + ''.join(f'<li>{render(lang, b)}</li>' for b in c['badges']) + '</ul></section>')
    parts.append(f'<p class="hint">{html.escape(c["note"])}</p>')
    for sid, title, body in c['sections']:
        parts.append(f'<section id="{lang}-{sid}"><h2>{render(lang, title)}</h2>{render(lang, body)}</section>')
    # footer first so its terms are collected before the glossary
    footer = render(lang, c['footer'])
    gl = ''.join(f'<dt>{html.escape(TERMS[lang][k][0])}</dt><dd>{html.escape(TERMS[lang][k][1])}</dd>' for k in sorted(used[lang], key=lambda k: TERMS[lang][k][0].lower()))
    parts.append(f'<section id="{lang}-glossary"><h2>{html.escape(c["glossary"])}</h2><dl>{gl}</dl></section>')
    parts.append(f'<footer><p>{footer}</p></footer>')
    return '\n'.join(parts)

fr_html = block(FR)
en_html = block(EN)

page = f'''<!doctype html>
<html lang="fr" data-lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Escape Lab — Bilan final</title>
<style>
:root{{--bg:#f6f4ee;--panel:#ffffff;--ink:#16282b;--muted:#4a5f63;--line:#cfdad7;--accent:#0f3a3d;--accent-ink:#ffffff;--warn-bg:#fff4dc;--warn-line:#c99a2e;--bad-bg:#fbe9e7;--ok-bg:#e4f2ec;--def-bg:#e8f1ff;--def-line:#6a8fcf}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#10191c;--panel:#172326;--ink:#e8eeee;--muted:#a9bbbd;--line:#2c3f43;--accent:#7fd1c1;--accent-ink:#0b1417;--warn-bg:#2f2813;--warn-line:#b58a2a;--bad-bg:#33201e;--ok-bg:#16302a;--def-bg:#1b2b44;--def-line:#6f93d0}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
.bar{{position:sticky;top:0;z-index:5;background:var(--panel);border-bottom:1px solid var(--line)}}
.bar-in{{max-width:900px;margin:0 auto;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}}
.brand{{font-weight:800;letter-spacing:.04em}}
.switch{{display:inline-flex;border:2px solid var(--accent);border-radius:999px;overflow:hidden}}
.switch button{{font:inherit;font-weight:700;min-width:64px;min-height:44px;padding:0 16px;border:0;background:transparent;color:var(--accent);cursor:pointer}}
.switch button[aria-pressed="true"]{{background:var(--accent);color:var(--accent-ink)}}
.switch button:focus-visible,.t:focus-visible{{outline:3px solid var(--def-line);outline-offset:2px}}
main{{max-width:900px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:clamp(1.6rem,4.5vw,2.3rem);line-height:1.2;margin:8px 0}}
h2{{font-size:1.3rem;margin:0 0 10px;line-height:1.3}}
.sub{{color:var(--muted);margin:0 0 20px}}
section{{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 18px 14px;margin:0 0 16px}}
.verdict{{background:var(--ok-bg);border-width:2px}}
.vlabel{{margin:0;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}}
.vmain{{margin:2px 0 8px;font-size:1.15rem;font-weight:800;overflow-wrap:anywhere}}
.badges{{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}}
.badges li{{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:4px 12px;font-weight:600;font-size:.92rem}}
.hint{{color:var(--muted);font-size:.92rem;margin:0 0 14px}}
table{{width:100%;border-collapse:collapse;font-size:.95rem;margin:8px 0 12px}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}}
th{{font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}}
@media (max-width:640px){{table,thead,tbody,tr,th,td{{display:block}}thead{{position:absolute;left:-9999px}}tr{{border:1px solid var(--line);border-radius:8px;margin:0 0 10px;padding:4px 0}}td{{border:0;padding:4px 12px}}td:first-child{{font-weight:700}}}}
code{{font:.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:rgba(127,127,127,.15);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}}
.warn{{background:var(--warn-bg);border-left:5px solid var(--warn-line);padding:10px 14px;border-radius:6px}}
.t{{font:inherit;color:inherit;background:none;border:0;padding:0 1px;border-bottom:2px dotted var(--def-line);cursor:help;text-align:inherit}}
.t[aria-expanded="true"]{{background:var(--def-bg)}}
.def{{display:block;margin:6px 0 8px;padding:8px 12px;background:var(--def-bg);border-left:4px solid var(--def-line);border-radius:6px;font-size:.92rem;font-weight:400}}
.def[hidden]{{display:none}}
.steps{{padding-left:1.2em}}
.steps li{{margin:0 0 8px}}
.time{{display:inline-block;min-width:92px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums}}
dl{{margin:0}}dt{{font-weight:800;margin-top:10px}}dd{{margin:2px 0 0;color:var(--muted)}}
footer{{color:var(--muted);font-size:.9rem;padding:4px 2px}}
[lang="fr"][data-block],[lang="en"][data-block]{{display:block}}
[data-block][hidden]{{display:none}}
@media print{{.bar{{display:none}}.def{{display:block!important}}[data-block][hidden]{{display:none}}section{{break-inside:avoid}}}}
</style>
</head>
<body>
<header class="bar"><div class="bar-in">
  <span class="brand">ESCAPE LAB</span>
  <div class="switch" role="group" aria-label="Langue / Language">
    <button type="button" id="b-fr" aria-pressed="true" lang="fr">Français</button>
    <button type="button" id="b-en" aria-pressed="false" lang="en">English</button>
  </div>
</div></header>
<main>
<div data-block lang="fr" id="fr">
{fr_html}
</div>
<div data-block lang="en" id="en" hidden>
{en_html}
</div>
</main>
<script>
(function(){{
  var root=document.documentElement, blocks={{fr:document.getElementById('fr'),en:document.getElementById('en')}}, btn={{fr:document.getElementById('b-fr'),en:document.getElementById('b-en')}};
  function set(l){{
    if(l!=='fr'&&l!=='en')l='fr';
    root.lang=l;root.setAttribute('data-lang',l);
    Object.keys(blocks).forEach(function(k){{blocks[k].hidden=(k!==l);btn[k].setAttribute('aria-pressed',k===l?'true':'false');}});
    document.title=l==='fr'?'Escape Lab — Bilan final':'Escape Lab — Final summary';
    try{{localStorage.setItem('escape-lab-lang',l);}}catch(e){{}}
  }}
  var start='fr';
  try{{var q=new URLSearchParams(location.search).get('lang');var s=localStorage.getItem('escape-lab-lang');start=q||s||'fr';}}catch(e){{}}
  set(start);
  btn.fr.addEventListener('click',function(){{set('fr');}});
  btn.en.addEventListener('click',function(){{set('en');}});
  document.addEventListener('click',function(e){{
    var t=e.target.closest&&e.target.closest('button.t'); if(!t)return;
    var d=document.getElementById(t.getAttribute('aria-controls')); if(!d)return;
    var open=t.getAttribute('aria-expanded')==='true';
    t.setAttribute('aria-expanded',open?'false':'true'); d.hidden=open;
  }});
}})();
</script>
</body>
</html>
'''
open(OUT, 'w', encoding='utf-8').write(page)
print('written', OUT, len(page), 'bytes; terms used fr/en:', len(used['fr']), len(used['en']))
