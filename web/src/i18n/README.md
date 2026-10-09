# Display language (English / French)

The server keeps sending English and stays the single authority (scores, timers, hints, fragments, unlocks). This folder only decides how a
text is **shown**. English is the source of truth: `t('English text')` returns the text unchanged in English, so English screens are
byte-identical to before; in French it looks the text up in `fr/*.ts`.

## Rules for code (every contributor, every agent)
1. `import { t, plural, formatInt, formatDateTime } from '../i18n'` (relative path). Wrap EVERY user-visible English text: JSX text, `aria-label`,
   `title`, `placeholder`, `alt`, document titles, error and status messages, labels held in constants (wrap at the **render site**, not in the constant).
2. English output must stay **byte-identical**: the unit and end-to-end tests assert English strings. Never reword English.
3. Variable parts use placeholders: `t('Level {level} · {xp} XP', { level, xp: formatInt(xp) })`. The French text must contain the same placeholders.
   Restructure JSX like `Level {a} · {b} XP` into one `t()` with placeholders, so French can reorder words.
4. A text received from the server is shown with `t(serverText)` (no vars). Texts with variable parts ("No activity for 10 days") are matched
   against templates registered as keys with `{placeholders}`: `'No activity for {n} days': "Aucune activité depuis {n} jours"`.
   Unknown text falls back to English (never empty).
5. Call `t()` only while rendering (component bodies, handlers, or functions called from render). **Never** in code that runs at fetch/normalise time
   or at module load: the language can change later and the screen would keep the old language. `useMemo`/`useCallback` that build texts must list `useLang()` in their dependencies.
6. Numbers and dates: `formatInt(n)` instead of `n.toLocaleString('en')`, `formatDateTime(date)` instead of `date.toLocaleString('en', ...)`.
   Plurals: `plural(n, 'mission')` (English singular as key) and register the French noun in `fr/<area>.nouns.ts`.
7. French texts go in `fr/<area>.ts` (default export `Record<English, French>`), one file per area, never edited by two people at once.
   Keys must equal the English literal passed to `t()` character for character. `coverage.test.ts` lists every missing or inconsistent key.
8. French may be 20 to 30 percent longer: never add fixed widths. Keep brand names (Escape Lab, LabEscape).

## French vocabulary (use these words everywhere)
learner "vous" (formal) · laboratory = laboratoire · mission = mission · investigation = enquête · hint = indice · Lab Assistant = Assistant de laboratoire
· Code Vault = Coffre de codes · code fragment = fragment de code · exit code = code de sortie · Master Lab = Laboratoire Master · Faculty (view) = Enseignant
· Content review = Relecture du contenu · guest = invité · Reset guest session = Réinitialiser la session invitée · Mission control = Centre de mission
· Lab map = Carte des laboratoires · Progress = Progression · Learning settings = Paramètres d'apprentissage · About & demo guide = À propos et guide de démonstration
· Submit answer = Valider la réponse · Retry = Réessayer · Dismiss = Fermer · Restart mission = Relancer la mission · Skip to main content = Aller au contenu principal
· score = score · XP = XP · wrong answer = mauvaise réponse · penalty = pénalité · bonus = bonus · replay = rejouer · draft = brouillon · reviewed = relu · approved = approuvé
· Demonstration data = Données de démonstration · Illustrative training image = Image d'entraînement illustrative · not for clinical use = ne doit pas servir à un usage clinique.
Biomedical terms: use the standard French term (frottis sanguin, schistocytes, numération, kaliémie, hémolyse, coloration de Gram, antibiogramme, gaz du sang, ...).
The French mission content is a machine-prepared translation that **no expert has reviewed**: the English text remains the reference.
