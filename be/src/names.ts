// Display-name identity. Teachers are attributed to content reviews by name (plus account id), so two teachers must not
// be able to hold names that read the same. Everything here is about the comparison key, never about what is stored or shown.

/**
 * Letters of Cyrillic and Greek that are drawn (almost) exactly like a Latin letter. Deliberately small and conservative:
 * it is applied to the comparison key only, so a real Cyrillic or Greek name still differs from every other real name
 * (every entry maps one letter to one Latin letter, so two different Cyrillic or Greek names never merge).
 *
 * ONE KEY PER NAME. A name has exactly one canonical key (nameKey), so "reads the same" is key equality, which is transitive by
 * construction. (Round 11 compared two keys and called names equal when ANY of them matched: "m" ~ "М" and "М" ~ "м" but "m" !~ "м",
 * which let a two-step rename chain create a twin.) The key is built in a fixed order:
 *   1. prepare: NFKC (after mapping the lunate sigma to c, see nfkc), the iota subscript dropped, whitespace, hidden characters, accents and stray marks removed;
 *   2. case folding FIRST (lower-casing that also folds ß/SS and final sigma);
 *   3. LOWER, the ONE look-alike table, which only knows lower-case letters: Cyrillic / Greek letters drawn like a Latin letter, and the
 *      Latin look-alikes of the Latin look-alike class (see LATIN_LOOKALIKES);
 *   4. punctuation and spaces are dropped.
 * Because case is folded before the table is applied and the table has no capitals, the key of a capital and of its lower-case form can never
 * differ in any script: the table cannot disagree with case. (Round 12 kept a CAPITAL and a LOWER table; eight Greek letters, Β Ε Ζ Η Μ Ν Τ Υ, were in
 * the first but not the second, so a Greek name could be re-registered by changing its case. A test now scans every cased Unicode character.)
 *
 * Choice for the Greek letters whose CAPITAL looks Latin but whose lower-case does not: the capital decides, and both cases land on the same
 * Latin letter: β -> b, ε -> e, ζ -> z, η -> h, μ -> m, ν -> n, τ -> t, υ -> y (as for Β Ε Ζ Η Μ Ν Τ Υ). Accepted, documented residual: lower-case
 * ν (drawn like v) and υ (drawn like u) no longer collide with a Latin v / u, only with the Latin letter their capital looks like.
 * Cyrillic н and һ (shha) both look like an h and share a target; no real name pair is affected in practice.
 */
const LOWER: Record<string, string> = {
  // Cyrillic. Lower-case letters drawn like a Latin letter (а с е о р х у і ј ѕ һ ԁ ԛ ԝ ӏ ё) and the lower-case forms of the capitals that are
  // (м к т н в: small capitals of M K T H B). Their capitals (А В Е К М Н О Р С Т Х У І Ј Ѕ Ԛ Ԝ Ӏ Ё) reach the same targets through case folding.
  а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', һ: 'h', ԁ: 'd', ԛ: 'q', ԝ: 'w', ӏ: 'i', ё: 'e',
  м: 'm', к: 'k', т: 't', н: 'h', в: 'b',
  // Greek (ϲ lunate sigma, ϳ yot; ϲ never reaches this table as such: NFKC would turn it into sigma, so nfkc() maps U+03F2 / U+03F9 to c first). The target is the Latin letter the CAPITAL looks like (Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ), see the note above.
  α: 'a', β: 'b', ε: 'e', ζ: 'z', η: 'h', ι: 'i', κ: 'k', μ: 'm', ν: 'n', ο: 'o', ρ: 'p', τ: 't', υ: 'y', χ: 'x', ϲ: 'c', ϳ: 'j',
  // Latin dotless i.
  ı: 'i',
};
/** The look-alike table, read-only (the self-consistency test checks that every entry fires through the whole pipeline). */
export const LOOKALIKES: Readonly<Record<string, string>> = LOWER;
/**
 * Latin characters that are drawn like another one: capital I, lower-case l, digit 1 and the vertical bar are one shape (I l 1 |), and so are
 * the letter O and the digit 0. They are folded to one representative each ("i" for the first class, because lower-casing already makes I = i,
 * and "o"). Because I = i by case folding and I ~ l by shape, the class has to contain i and l together: any scheme with one key per name and
 * case folding has the same consequence. Trade-off (documented in docs/KNOWN_LIMITATIONS.md): Ian ~ Lan, Lina ~ Iina, Ali ~ Ail, Olga ~ 0lga.
 */
const LATIN_LOOKALIKES: Record<string, string> = { l: 'i', '1': 'i', '|': 'i', ǀ: 'i', '0': 'o' };
const re = (t: Record<string, string>) => new RegExp(`[${Object.keys(t).map((k) => (k === '|' ? '\\|' : k)).join('')}]`, 'gu');
const LOWER_RE = re(LOWER);
const LATIN_LOOKALIKES_RE = re(LATIN_LOOKALIKES);

/** Format, control, default-ignorable (zero-width, soft hyphen, bidi marks and overrides, fillers), private-use, unassigned and lone-surrogate characters. */
const HIDDEN = /[\p{Cf}\p{Cc}\p{Co}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu;
/** Latin and Greek letters with any combining marks (a mark there only adds an accent: the letter is decomposed and the marks dropped). */
const LATIN_GREEK_MARKED = /[\p{Script=Latin}\p{Script=Greek}]\p{M}*/gu;
/** Marks that stayed after a Cyrillic letter (NFKC already composed the ones that form a letter: й, ў, ї): stress accents. */
const CYRILLIC_MARKS = /(\p{Script=Cyrillic})\p{M}+/gu;
/** Arabic harakat / Quranic marks and Hebrew niqqud / cantillation: vowel and pronunciation marks that are normally left out of a written name. */
const ARABIC_HEBREW_MARKS = /([\p{Script=Arabic}\p{Script=Hebrew}])\p{Mn}+/gu;
/** A combining mark that follows no letter (start of the name, a space, a digit, punctuation) has nothing to modify: it is only used to forge a different key. */
const STRAY_MARKS = /(^|[^\p{L}\p{M}])\p{M}+/gu;

/**
 * Code points whose NFKC result is NOT the letter the look-alike table expects (R15-A-01). The Greek lunate sigma, small U+03F2 and capital U+03F9, is
 * drawn exactly like a Latin c, but NFKC turns it into a final sigma / Sigma, so the table entry (ϲ -> c) would never fire. They are mapped to the Latin
 * letter BEFORE the first NFKC, in every key. (A scan of the whole table against NFKC / NFKD of its own entries found no other such code point.)
 */
const PRE_NFKC = /[\u03F2\u03F9]/gu;
// toWellFormed(): a lone surrogate is U+FFFD in the database (node:sqlite binds it that way), so every key is computed on the text as it is stored (R16-A-01).
const nfkc = (v: string) => v.toWellFormed().replace(PRE_NFKC, (c) => (c === '\u03F9' ? 'C' : 'c')).normalize('NFKC');

/**
 * Iota subscript (R14-A-01, R15-A-02). U+0345 COMBINING GREEK YPOGEGRAMMENI is the one combining mark that has a case mapping (its upper case is the LETTER
 * Ι), so a case fold turns a stray one into the letter i and it escapes the accent stripping; and NFKC composes it with α η ω into the letters ᾳ ῃ ῳ (and
 * ᾀ ... ᾯ, ῲ ...) whose upper case is ΑΙ. Both ways it would make a new letter out of a mark, so a Greek name plus one U+0345 would be a different key.
 * It is dropped ALWAYS, before any case fold: the mark, and the mark inside every precomposed iota-subscript letter (decomposed first). A subscript is an
 * accent like any other. Accepted loss: ᾀ is no longer the same name as ἈΙ (the sequence alpha + iota), nor ᾳ as ΑΙ.
 */
const YPOGEGRAMMENI = /\u0345/gu;
/** Greek Extended letters (U+1F80-U+1FFF) that carry an iota subscript decompose to base + marks + U+0345. */
const IOTA_SUBSCRIPT_LETTERS = /[\u1F80-\u1FAF\u1FB2-\u1FB4\u1FB7\u1FBC\u1FC2-\u1FC4\u1FC7\u1FCC\u1FF2-\u1FF4\u1FF7\u1FFC]/gu;
const dropYpogegrammeni = (s: string) => s.replace(IOTA_SUBSCRIPT_LETTERS, (c) => c.normalize('NFD')).replace(YPOGEGRAMMENI, '');

/**
 * Case folding that also folds ß/SS, the dotted capital I (lower case: i + a combining dot) (letters with iota subscript never get here: dropYpogegrammeni removed the subscript before).
 * The Greek final sigma is context dependent in JavaScript (Σ is lower-cased to ς only at the end of a word, and "end of a word" depends on the characters that are
 * removed later: a space, a zero-width or a filler character), so ς is folded to σ: the key never depends on spacing (R14-A-07).
 */
const foldCase = (s: string) => s.toLowerCase().toUpperCase().toLowerCase().replace(/ς/gu, 'σ');

/**
 * Name with the invisible and presentational differences removed and the case folded:
 * NFKC, case folding (BEFORE any mark is dropped, so a letter and its capital still decompose the same way), uniform whitespace, hidden characters removed,
 * accents of Latin and Greek letters dropped (a decomposition, so ü = u), stress marks on Cyrillic dropped, Arabic / Hebrew vowel marks and tatweel dropped,
 * marks that follow no letter dropped.
 * Cyrillic й and ї are letters of their own and stay (they are not accents on и and і); Cyrillic ё counts as е (see LOWER).
 * Marks of other scripts (Devanagari vowel signs, tone marks) carry meaning and stay.
 */
function prepare(v: string): string {
  return dropYpogegrammeni(foldCase(dropYpogegrammeni(nfkc(v))).normalize('NFKC')).replace(/[\s\p{Z}]+/gu, ' ').replace(HIDDEN, '')
    .replace(/ـ/gu, '')
    .replace(LATIN_GREEK_MARKED, (m) => m.normalize('NFD').replace(/\p{M}/gu, ''))
    .replace(CYRILLIC_MARKS, '$1')
    .replace(ARABIC_HEBREW_MARKS, '$1')
    .replace(STRAY_MARKS, '$1');
}

/** The text as a person reads it, case and accents untouched: NFKC, any whitespace as one space, hidden / zero-width / format characters removed. */
export function visibleText(v: string): string {
  return nfkc(v).replace(/[\s\p{Z}]+/gu, ' ').replace(HIDDEN, '');
}

/**
 * The skeleton of a text: invisible and presentational differences removed, case folded FIRST, then the Cyrillic / Greek look-alikes of Latin
 * letters mapped through the one lower-case table. Punctuation and digits are still there (the reviewer-suffix check and the AI-hint guard need them).
 */
export function skeleton(v: string): string {
  return prepare(v).replace(LOWER_RE, (c) => LOWER[c] ?? c);
}

const EMPTY_KEY = '\u0000';
function toKey(s: string): string {
  const key = s.replace(LATIN_LOOKALIKES_RE, (c) => LATIN_LOOKALIKES[c] ?? c).replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
  // A name made only of symbols still needs a key that tells different names apart.
  return key || s.replace(/\s+/gu, ' ').trim() || EMPTY_KEY;
}

/**
 * The canonical comparison key of a display name. Two names read the same to a person exactly when their keys are equal (see sameName), so
 * "same name" is an equivalence relation (reflexive, symmetric, transitive). Folds case, accents, any whitespace, zero-width / soft-hyphen / bidi /
 * format / private-use characters, compatibility forms (fullwidth, ligatures, math alphabets), punctuation and spacing ("Prof. Alpha", "Prof-Alpha",
 * "ProfAlpha"), Arabic / Hebrew vowel marks, marks that follow no letter, the Cyrillic / Greek look-alikes of Latin letters in both cases (tables
 * above) and the Latin look-alike classes I l 1 | and O 0.
 * Residual risk: confusables outside those small tables (other scripts such as Armenian or Cherokee, the IPA block, rn / m) are not folded.
 */
export function nameKey(v: string): string {
  return toKey(skeleton(v));
}
/** True when the two names read the same to a person (equal canonical keys). */
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}
/** True when the name has nothing a person can see: it only contains whitespace, hidden, private-use or stray combining characters. */
export function isBlankName(v: string): boolean {
  return nameKey(v) === EMPTY_KEY;
}

/**
 * The reviewer suffix appended to every review record is "(teacher #123)". It is imitated by "teacher" followed immediately by a number sign
 * (# or ♯, and № which is treated like # here) and something that reads as a number, with or without brackets: Unicode decimal digits and the letters
 * that look like digits (capital I / l / | for 1, O for 0: "#1O", "#l0", "#IO"). The run of digit-like characters has to end the word, so a
 * name such as "Teacher #Oliver" or "Teacher Smith" is not touched.
 */
const REVIEWER_SUFFIX = /teacher\s*[#\u266F]\s*[\p{Nd}oli|\u01C0]+(?![\p{L}\p{M}\p{N}])/u;
/** True when the name contains something that reads like the reviewer suffix "(teacher #123)" appended to every review record. */
export function imitatesReviewerSuffix(v: string): boolean {
  // NFKC turns "№" into "No": it is the numero sign, written the same way as "#" here.
  return REVIEWER_SUFFIX.test(skeleton(v.replace(/№/gu, '#')));
}

/** Explicit bidirectional formatting: embeddings and overrides (U+202A-U+202E), isolates (U+2066-U+2069) and the Arabic letter mark (U+061C). The plain marks LRM / RLM (U+200E, U+200F) are not included: Arabic and Hebrew names use them. */
const BIDI_CONTROLS = /[\u061C\u202A-\u202E\u2066-\u2069]/u;
export const hasBidiControl = (v: string): boolean => BIDI_CONTROLS.test(v);

/**
 * Canonical form of a class name for the "one teacher, one class name" rule: compatibility forms, spacing, invisible characters, case (ß/SS, final sigma)
 * and the Cyrillic / Greek look-alikes of Latin letters are ignored; punctuation, accents and digits are not.
 * Deliberately WEAKER than nameKey: nameKey also drops punctuation and merges I / l / 1 / | and O / 0, which would wrongly call "Section 1.2" and "Section 12",
 * "L1 Biology" and "LI Biology", or "Year 1" and "Year I" the same class.
 */
export function classNameKey(v: string): string {
  return foldCase(dropYpogegrammeni(nfkc(v)).replace(/[\s\p{Z}]+/gu, ' ').replace(HIDDEN, '').trim())
    .normalize('NFKC').replace(YPOGEGRAMMENI, '').replace(LOWER_RE, (c) => LOWER[c] ?? c);
}
