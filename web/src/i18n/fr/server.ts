/**
 * Texts SENT BY THE SERVER (be/src/*.ts, outside the mission/lab content of be/src/content.ts): error messages, lock reasons, score ledger,
 * badges, competency advice, rules, teacher attention reasons, content review. The server keeps sending English; the web app shows
 * `t(serverText)`. A key with {placeholders} is a TEMPLATE matched against the server text (see i18n/core.ts); values it captures
 * are translated too when they are known exact entries (mission titles, lab names, ...).
 * Texts produced by the optional Lab Assistant (be/src/assistant.ts) are free text and stay in English.
 */
const NB = ' '; // no-break space before ":" and "%" (French typography)

export default {
  // ---------------------------------------------------------------- HTTP and request errors
  'Authentication required.': 'Authentification requise.',
  'You do not have access to this resource.': 'Vous n’avez pas accès à cette ressource.',
  'This endpoint is for student accounts.': 'Cette ressource est réservée aux comptes étudiants.',
  'This endpoint is for teacher accounts.': 'Cette ressource est réservée aux comptes enseignants.',
  'Not found.': 'Introuvable.',
  'No such endpoint.': 'Cette adresse n’existe pas.',
  'Method not allowed.': 'Méthode non autorisée.',
  'Something went wrong.': 'Une erreur est survenue.',
  'The request is invalid.': 'La requête est invalide.',
  'Malformed request target.': 'Adresse de la requête mal formée.',
  'Malformed percent-encoding in the request path.': 'Codage en pourcentage mal formé dans l’adresse de la requête.',
  'Request body is not valid JSON.': 'Le corps de la requête n’est pas du JSON valide.',
  'Request body is too large.': 'Le corps de la requête est trop volumineux.',
  'Content-Type must be application/json.': 'Le Content-Type doit être application/json.',
  '{name} must be an integer': '{name} doit être un entier',
  'response must be an object': 'la réponse doit être un objet',
  'response.choice must be one of: {ids}': 'response.choice doit être l’une des valeurs suivantes : {ids}',
  'response.decision must be one of: {ids}': 'response.decision doit être l’une des valeurs suivantes : {ids}',
  'response.x and response.y must be numbers between 0 and 100': 'response.x et response.y doivent être des nombres compris entre 0 et 100',
  'response.order must list every item id exactly once': 'response.order doit lister chaque identifiant d’élément exactement une fois',
  'response.pairs must map every left id to a right id': 'response.pairs doit associer chaque identifiant de gauche à un identifiant de droite',
  'each right id may be used once': 'chaque identifiant de droite ne peut être utilisé qu’une fois',

  // ---------------------------------------------------------------- rate limits (the web app also cuts the sentence at "Try again")
  'Too many attempts. Try again shortly.': 'Trop de tentatives. Réessayez dans un instant.',
  'Too many attempts.': 'Trop de tentatives.',
  'Try again shortly.': 'Réessayez dans un instant.',
  'Too many incorrect codes. Wait before trying again.': 'Trop de codes incorrects. Patientez avant de réessayer.',
  'Too many incorrect codes.': 'Trop de codes incorrects.',
  'Wait before trying again.': 'Patientez avant de réessayer.',

  // ---------------------------------------------------------------- accounts, profile, demo
  'The password is too short.': 'Le mot de passe est trop court.',
  'The password needs more visible characters.': 'Le mot de passe doit contenir davantage de caractères visibles.',
  'Invalid teacher invite code.': 'Code d’invitation enseignant invalide.',
  'This email domain is reserved for the demo accounts.': 'Ce domaine d’e-mail est réservé aux comptes de démonstration.',
  'An account with this email already exists.': 'Un compte existe déjà avec cet e-mail.',
  'Incorrect email or password.': 'E-mail ou mot de passe incorrect.',
  'The name must contain at least one visible character.': 'Le nom doit contenir au moins un caractère visible.',
  'The name cannot contain bidirectional override, embedding or isolate control characters.': 'Le nom ne peut pas contenir de caractères de contrôle bidirectionnels (forçage, incorporation ou isolation).',
  'The name cannot contain a "(teacher #number)" pattern: it is reserved for review records.': `Le nom ne peut pas contenir le motif « (teacher #number) »${NB}: il est réservé aux enregistrements de relecture.`,
  'Another teacher account already uses this name, or one that reads the same (upper/lower case, accents, spaces, punctuation and look-alike letters are ignored). Choose another name.': 'Un autre compte enseignant utilise déjà ce nom, ou un nom qui se lit de la même façon (majuscules et minuscules, accents, espaces, ponctuation et lettres d’apparence identique sont ignorés). Choisissez un autre nom.',
  'Unknown user.': 'Utilisateur inconnu.',
  'Demo mode is not enabled on this server.': 'Le mode démonstration n’est pas activé sur ce serveur.',
  'Demo data has not been seeded. Run npm run seed:demo.': 'Les données de démonstration n’ont pas été créées. Exécutez npm run seed:demo.',
  'Only the demo account can be reset.': 'Seul le compte de démonstration peut être réinitialisé.',

  // ---------------------------------------------------------------- classes
  'A class name needs at least 2 visible characters.': 'Un nom de classe doit comporter au moins 2 caractères visibles.',
  'A teacher can own at most {n} classes.': 'Un enseignant peut posséder au plus {n} classes.',
  'You already have a class with this name. Choose another name.': 'Vous avez déjà une classe portant ce nom. Choisissez un autre nom.',
  'Could not allocate a join code.': 'Impossible d’attribuer un code pour rejoindre la classe.',
  'No class matches this code.': 'Aucune classe ne correspond à ce code.',
  'Unknown class.': 'Classe inconnue.',
  'This student is not in the class.': 'Cet étudiant ne fait pas partie de la classe.',

  // ---------------------------------------------------------------- labs, missions, vault
  'Unknown lab.': 'Laboratoire inconnu.',
  'Unknown mission.': 'Mission inconnue.',
  'Unknown attempt.': 'Tentative inconnue.',
  'No results for this lab.': 'Aucun résultat pour ce laboratoire.',
  'Results are available once you have escaped the lab.': 'Les résultats sont disponibles dès que vous avez quitté le laboratoire.',
  'Lab is locked.': 'Ce laboratoire est verrouillé.',
  'Clear 3 labs ({n} of 3 cleared)': 'Terminez 3 laboratoires ({n} sur 3 terminés)',
  'Complete mission {n} to unlock': 'Terminez la mission {n} pour la déverrouiller',
  'Complete mission {n} to unlock.': 'Terminez la mission {n} pour la déverrouiller.',
  'Unlock the {lab}': `Déverrouiller${NB}: {lab}`,
  'Find every code fragment before entering the code.': 'Trouvez tous les fragments de code avant de saisir le code.',
  'Incorrect code. Check your vault and try again.': 'Code incorrect. Vérifiez votre Coffre de codes et réessayez.',

  // ---------------------------------------------------------------- attempts, answers, hints
  'This attempt has exceeded its time limit.': 'Cette tentative a dépassé sa limite de temps.',
  'This attempt expired before it was completed.': 'Cette tentative a expiré avant d’être terminée.',
  'This attempt is already complete.': 'Cette tentative est déjà terminée.',
  'This is not the current step.': 'Ce n’est pas l’étape en cours.',
  'The step changed while the hint was being prepared.': 'L’étape a changé pendant la préparation de l’indice.',
  'Wait for the current hint request to finish.': 'Attendez la fin de la demande d’indice en cours.',
  'A hint request is already being prepared.': 'Une demande d’indice est déjà en cours de préparation.',
  'No more hints are available for this step.': 'Il n’y a plus d’indice disponible pour cette étape.',
  'The result is available once the mission is complete.': 'Le résultat est disponible une fois la mission terminée.',
  // Answer feedback is "Correct. <explanation>" / "Not quite. <recheck>"; the explanation and the recheck text are mission content (fr/content-*.ts).
  'Correct. {text}': 'Bonne réponse. {text}',
  'Not quite. {text}': 'Pas tout à fait. {text}',
  // Default decisions of the decision engine (be/src/engines.ts).
  'Accept and report': 'Accepter et rendre le résultat',
  'Reject and request a new sample': 'Rejeter et demander un nouvel échantillon',
  'Correct the interference and re-measure': 'Corriger l’interférence et refaire la mesure',

  // ---------------------------------------------------------------- score ledger
  'Base mission': 'Mission de base',
  'Mission completed': 'Mission terminée',
  'First attempt': 'Première tentative',
  'Every step solved first time': 'Toutes les étapes réussies du premier coup',
  'At least one step needed a second try': 'Au moins une étape a nécessité un deuxième essai',
  '{n} of {total} steps solved first time': '{n} sur {total} étapes réussies du premier coup',
  'Time bonus': 'Bonus de temps',
  'Finished in {time}': 'Terminé en {time}',
  'Total time {time}': 'Temps total {time}',
  'No hint used': 'Aucun indice utilisé',
  'No Lab Assistant hint': 'Aucun indice de l’Assistant de laboratoire',
  '{n} hint used': '{n} indice utilisé',
  '{n} hints used': '{n} indices utilisés',
  'Hint used': 'Indice utilisé',
  '{n} x -15 XP': '{n} × -15 XP',
  '{n} x -15 XP (capped: a mission never scores below 0)': '{n} × -15 XP (plafonné : une mission ne descend jamais sous 0)',
  'Wrong attempt': 'Mauvaise réponse',
  '{n} x -10 XP': '{n} × -10 XP',
  '{n} x -10 XP (capped: a mission never scores below 0)': '{n} × -10 XP (plafonné : une mission ne descend jamais sous 0)',
  // Lab results ledger (sums over the best attempts of a lab).
  '{n} mission completed': '{n} mission terminée',
  '{n} missions completed': '{n} missions terminées',
  'First-try points on {a} of {b} mission (best attempts)': 'Points de première tentative : {a} sur {b} mission (meilleures tentatives)',
  'First-try points on {a} of {b} missions (best attempts)': 'Points de première tentative : {a} sur {b} missions (meilleures tentatives)',
  '{a} of {b} mission without a hint': '{a} sur {b} mission sans indice',
  '{a} of {b} missions without a hint': '{a} sur {b} missions sans indice',

  // ---------------------------------------------------------------- dashboard
  'Next mission in an open lab.': 'Prochaine mission dans un laboratoire ouvert.',
  'Replay your lowest score.': 'Rejouez votre score le plus bas.',

  // ---------------------------------------------------------------- badges
  'Hematology Detective': 'Détective en hématologie',
  'Escape the Hematology Lab.': 'Sortez du laboratoire d’hématologie.',
  'Microbiology Investigator': 'Enquêteur en microbiologie',
  'Escape the Microbiology Lab.': 'Sortez du laboratoire de microbiologie.',
  'Biochemistry Analyst': 'Analyste en biochimie',
  'Escape the Clinical Biochemistry Lab.': 'Sortez du laboratoire de biochimie clinique.',
  'First Escape': 'Première évasion',
  'Open your first lab exit.': 'Ouvrez la sortie de votre premier laboratoire.',
  'Perfect Mission': 'Mission parfaite',
  'Complete a mission with no wrong answer.': 'Terminez une mission sans aucune mauvaise réponse.',
  'No Hint': 'Sans indice',
  'Complete a mission without using a hint.': 'Terminez une mission sans utiliser d’indice.',
  'Escape the Master Lab.': 'Sortez du Laboratoire Master.',

  // ---------------------------------------------------------------- competencies (names are step.competency in content.ts)
  'Hematology interpretation': 'Interprétation en hématologie',
  'Microbiology investigation': 'Enquête en microbiologie',
  'Clinical biochemistry': 'Biochimie clinique',
  'Pre-analytical quality': 'Qualité pré-analytique',
  'Clinical reasoning': 'Raisonnement clinique',
  'Hematology interpretation: revisit red cell indices and what each one says about the cause.': `Interprétation en hématologie${NB}: revoyez les indices érythrocytaires et ce que chacun révèle sur la cause.`,
  'Microbiology investigation: revisit Gram stain and colony morphology.': `Enquête en microbiologie${NB}: revoyez la coloration de Gram et la morphologie des colonies.`,
  'Clinical biochemistry: revisit reference ranges, interference and acid-base steps.': `Biochimie clinique${NB}: revoyez les valeurs de référence, les interférences et les étapes de l’équilibre acido-basique.`,
  'Pre-analytical quality: revisit specimen rejection criteria and common interferences.': `Qualité pré-analytique${NB}: revoyez les critères de rejet des échantillons et les interférences courantes.`,
  'Clinical reasoning: practice linking findings across disciplines.': `Raisonnement clinique${NB}: entraînez-vous à relier les constatations entre les disciplines.`,
  '{name}: review the related missions.': `{name}${NB}: revoyez les missions associées.`,

  // ---------------------------------------------------------------- teacher views
  'No activity for {n} days': 'Aucune activité depuis {n} jours',
  'Accuracy under 60%': `Précision inférieure à 60${NB}%`,
  'Sample clinical content is illustrative until faculty approve it.': 'Le contenu clinique d’exemple est illustratif tant que les enseignants ne l’ont pas approuvé.',
  'Content must be reviewed before it can be approved.': 'Le contenu doit être relu avant de pouvoir être approuvé.',
  'Content cannot move from reviewed to draft; the next step is approved.': `Le contenu ne peut pas passer de « relu » à « brouillon »${NB}; l’étape suivante est « approuvé ».`,
  'Content cannot move from approved to reviewed; the next step is draft.': `Le contenu ne peut pas passer de « approuvé » à « relu »${NB}; l’étape suivante est « brouillon ».`,
  '{name} (teacher #{id})': '{name} (enseignant n°{id})',
  '{name} (teacher #{id}) [demo reset]': '{name} (enseignant n°{id}) [réinitialisation de la démonstration]',

  // ---------------------------------------------------------------- rules endpoint
  'Penalties are applied only up to the points a mission has earned: a mission never scores below 0, and a ledger row marked "capped" says so.': 'Les pénalités ne s’appliquent que jusqu’à concurrence des points gagnés par une mission : une mission ne descend jamais sous 0, et une ligne du détail marquée « plafonné » l’indique.',
  'Full bonus up to 25% of the time limit, then linear down to 0 at the limit.': `Bonus complet jusqu’à 25${NB}% de la limite de temps, puis décroissance linéaire jusqu’à 0 à la limite.`,
  'Total XP is the sum of your best score per mission, so replays can improve but never farm XP.': 'L’XP total est la somme de votre meilleur score par mission : rejouer permet de s’améliorer, mais jamais d’accumuler de l’XP artificiellement.',
  'Level n starts at 250 x n x (n - 1) XP: 0, 500, 1500, 3000, 5000, 7500 and so on.': 'Le niveau n commence à 250 × n × (n - 1) XP : 0, 500, 1500, 3000, 5000, 7500, etc.',
  'Mission accuracy = steps solved / (steps solved + wrong answers), taken from your best attempt. Lab and overall accuracy are the mean of mission accuracies.': 'Précision d’une mission = étapes réussies / (étapes réussies + mauvaises réponses), d’après votre meilleure tentative. La précision d’un laboratoire et la précision globale sont la moyenne des précisions des missions.',
  'Labs completed counts the three standard labs (Hematology, Microbiology, Clinical Biochemistry) whose exit code you have entered, out of 3, on the dashboard, the profile, the leaderboard and the teacher views. The Master Lab is the capstone: it has its own Clinical Detective badge and is not counted in this figure.': 'Les laboratoires terminés comptent les trois laboratoires standard (hématologie, microbiologie, biochimie clinique) dont vous avez saisi le code de sortie, sur 3, dans le tableau de bord, le profil, le classement et les vues enseignant. Le Laboratoire Master est l’épreuve finale : il a son propre badge Détective clinique et n’est pas compté dans ce chiffre.',
  'Teacher view: a student needs attention after 7 days without activity while unfinished, or with accuracy under 60%.': `Vue enseignant : un étudiant nécessite une attention après 7 jours sans activité tant qu’il n’a pas terminé, ou avec une précision inférieure à 60${NB}%.`,
  "Teacher view: a mission's success is the class mean accuracy (best attempts). The server flags only the hardest mission (the lowest success), and only when it falls under 70%. The share of clean first tries is shown separately.": `Vue enseignant : la réussite d’une mission est la précision moyenne de la classe (meilleures tentatives). Le serveur ne signale que la mission la plus difficile (la réussite la plus basse), et seulement si elle passe sous 70${NB}%. La part des premiers essais sans erreur est affichée séparément.`,
} as Record<string, string>;
