// Lab Assistant (BETA). Always optional: when no provider is configured, errors, times out or
// would leak the answer, the caller falls back to the faculty-written standard hint.
import { DEFAULT_DECISIONS } from './engines.ts';
import { hasBidiControl, skeleton, visibleText } from './names.ts';
import type { Option, Step } from './types.ts';

/** Longest assistant hint kept, in characters (code points, not UTF-16 units). Game enforces it for every provider; the Anthropic provider checks it too. */
export const MAX_ASSISTANT_HINT = 400;
/** True when the text is longer than MAX_ASSISTANT_HINT characters. The one place the limit is measured: an emoji or an astral Han character counts once. */
export const exceedsHintLimit = (text: string): boolean => [...text].length > MAX_ASSISTANT_HINT;

export interface HintRequest { step: Step; level: number; wrongSoFar: number }
export interface HintProvider {
  /** Returns hint text, or null to fall back to the standard hint. */
  hint(req: HintRequest): Promise<string | null>;
}

/** Texts that must never appear in an AI hint because they would give the answer away. */
export function forbiddenPhrases(step: Step): string[] {
  const k = step.key;
  if (k.kind === 'choice') {
    const o = step.data.options?.find((x) => x.id === k.answer);
    return o ? [o.label] : [];
  }
  if (k.kind === 'decision') {
    // Steps without their own options are shown and graded with the default decisions: guard those labels too.
    const o = (step.data.options ?? DEFAULT_DECISIONS).find((x) => x.id === k.answer);
    return o ? [o.label] : [];
  }
  return [];
}

/**
 * The text compared by the guard, on BOTH sides: NFKC, hidden characters (zero-width, soft hyphen, format, default-ignorable) removed, case folded,
 * accents dropped, Cyrillic / Greek look-alikes of Latin letters mapped, and then only letters, digits and marks kept (spaces of every kind, NBSP, line breaks and
 * punctuation are dropped). "Iron deficiency anemia" is "irondeficiencyanemia", whatever was put between its letters.
 */
const compared = (v: string): string => skeleton(v).replace(/[^\p{L}\p{N}\p{M}]+/gu, '');

/** True when the text has a letter, a digit or an emoji a person can see. Invisible characters (zero-width, fillers, the braille blank), marks and punctuation alone are no hint. */
export const hasSubstance = (text: string): boolean => /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(skeleton(text));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Options named by position (R14-A-03). The label guard knows what the correct option SAYS; a model (or a person) more often says WHICH ONE it is.
// The learner sees choice and decision options as a lettered list by position (A, B, C ... in web/src/lib/labels.ts optionLetter) and the provider is shown
// the same letters, so "Option C", "C is correct", "Go with C", "Answer: C", "(C)", "the third option" and "option 3" all name the correct option.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The options of a choice / decision step in the order and with the letters the learner sees; steps without their own decision options use the default decisions. */
export function presentedOptions(step: Step): Option[] {
  if (step.key.kind === 'choice') return step.data.options ?? [];
  if (step.key.kind === 'decision') return step.data.options ?? DEFAULT_DECISIONS;
  return [];
}
/** The letter the learner sees on the option at `index` (the same rule as the web client: A, B, C ...). */
export const optionLetter = (index: number): string => String.fromCharCode(65 + (index % 26));

const words = (s: string) => new Set(s.split(/\s+/));
/** Words (English and French, accents folded) that introduce a choice: "option C", "choose C", "go with C", "la réponse C". */
const CHOOSING = words('choose choosing chose pick picking select selecting take taking opt go going settle prefer recommend suggest favor favour choisir choisis choisissez choisit choisirais prends prenez prendre selectionne selectionnez selectionner opte optez');
/** Words that point at something without choosing it: "look at C", "consider C", "focus on C", "I would say C", "tick C", "hint: C". Only read when the letter ends its clause. */
const POINT = words('look looking consider considering focus focusing say saying think thinking tick mark circle check click tap press hint bet vote guess regarde regardez pense pensez considere considerez coche cochez clique cliquez dis dirais');
/** Words that may follow the letter and still end the clause: "look at C again". */
const TAIL = words('again first instead now too carefully closely once here');
const TRIGGER = new Set([...CHOOSING, ...words('option choice answer alternative response letter candidate selection statement proposition reponse choix lettre correct right best solution')]);
/** Words that may sit between a trigger and the letter: "go WITH C", "the right ONE IS C", "your best choice is C". */
const FILL = words('about toward towards into the a an is are was be been would will should must might may could can to with for on of at as it its that this these one number no nr n my our your his her their i we you me us definitely probably likely clearly really simply just then now here therefore so also still best correct right final only real true proper good better la le les l un une est serait sera devrait doit ce ca cela ceci je tu vous nous il elle');
/** Nouns a number or an ordinal can qualify: "option 3", "the third choice". */
const NOUN = words('option choice answer alternative response statement selection item proposition reponse choix possibility candidate suggestion entry lettre letter');
const NUM_FILL = words('the a an is be number no nr n numero num would should must will with for to it as your my est le la');
const PRONOUN = words('it that this which one ce ca cela ceci');
const MODAL = words('is was be would will must should might may has have to probably likely definitely clearly certainly surely really simply just est serait sera devrait doit etre');
const ADVERB = words('also clearly definitely probably certainly really indeed likely surely most just simply truly');
const LINK = words('is was would will must should seems looks appears remains fits works est serait semble reste convient');
const AFTER_FILL = words('be look seem appear the a an is clearly definitely really most more only your our also one very la le bien vraiment plus so quite probably certainly simply just truly by far much');
const VERDICT = words('correct right best answer true accurate valid appropriate solution ideal suitable proper winner choice option key correcte bonne juste vrai vraie exact exacte meilleur meilleure reponse');
const CONNECTIVE = words('option choice answer letter alternative response statement but and so because since while whereas that then also here now therefore thus hence as if so because mais et donc car');
// "option three". (French "un" is the article as well: not guarded.)
const EN_NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const FR_NUMBERS = ['', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
const ORDINALS: string[][] = [
  ['first', '1st', 'premier', 'premiere'], ['second', '2nd', 'deuxieme', 'seconde'], ['third', '3rd', 'troisieme'], ['fourth', '4th', 'quatrieme'], ['fifth', '5th', 'cinquieme'],
  ['sixth', '6th', 'sixieme'], ['seventh', '7th', 'septieme'], ['eighth', '8th', 'huitieme'], ['ninth', '9th', 'neuvieme'], ['tenth', '10th', 'dixieme'],
];
const LAST = ['last', 'final', 'dernier', 'derniere'];
/** Roman numerals by position ("Option III"). The first one, "I", is also the pronoun and is not guarded. */
const ROMAN = ['', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
/** Most code points of a text the guard analyses (R15-A-06). The callers reject anything over MAX_ASSISTANT_HINT first; a longer text is treated as a leak. */
const MAX_ANALYSED = 4000;
/** Sentence punctuation: a letter on the other side of it is not "the letter after the trigger". */
const SENTENCE_END = /[.!?;]/u;

interface Tok { low: string; upper: boolean; start: number; end: number }
/** Words and numbers of `text` (case kept in `upper`, accents / look-alikes folded in `low`). French elisions (c', l', d' ...) are not tokens of their own. */
function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\p{M}\p{N}])(?:[cldjnsmt]|qu)['’](?=\p{L})|[\p{L}\p{M}\p{N}]+(?:['’]\p{L}+)?/giu)) {
    if (/^(?:[cldjnsmt]|qu)['’]$/iu.test(m[0])) {
      // "C'est C": the elided "ce" is the pronoun in front of "est".
      if (/^c['’]$/iu.test(m[0])) out.push({ low: 'ce', upper: false, start: m.index!, end: m.index! + m[0].length });
      continue;
    }
    out.push({ low: skeleton(m[0]), upper: m[0] !== m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/**
 * "O p t i o n C", "OptionC", "C i s c o r r e c t": a run of spaced letters, or letters glued to the word before them, is split into the words of the
 * guard's own vocabulary (trigger, linking and verdict words, plus the option letter). Returns null unless the whole string is such words.
 */
const VOCAB = new Set([...TRIGGER, ...LINK, ...VERDICT, 'the', 'it', 'is']);
function segment(joined: string, singles: Set<string>): string | null {
  if (!/^[A-Za-z]{5,40}$/u.test(joined)) return null;
  const low = joined.toLowerCase();
  const n = low.length;
  const best: number[] = new Array(n + 1).fill(Infinity);
  const prev: number[] = new Array(n + 1).fill(-1);
  best[0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(0, i - 12); j < i; j++) {
      if (best[j]! === Infinity) continue;
      const w = low.slice(j, i);
      if ((w.length === 1 ? singles.has(w) : VOCAB.has(w)) && best[j]! + 1 < best[i]!) { best[i] = best[j]! + 1; prev[i] = j; }
    }
  }
  if (best[n]! === Infinity || best[n]! < 2) return null;
  const parts: string[] = [];
  for (let i = n; i > 0; i = prev[i]!) parts.unshift(joined.slice(prev[i]!, i));
  return parts.join(' ');
}

/** True when `text` names the option at `index` of `options` by its letter, number or position. */
function namesOptionByPosition(text: string, options: Option[], index: number): boolean {
  if (index < 0 || index >= options.length) return false;
  const letters = new Set([optionLetter(index).toLowerCase()]);
  const numbers = new Set([String(index + 1)]);
  if (ROMAN[index]) numbers.add(ROMAN[index]!);
  // Spaced letters ("O p t i o n C") and letters glued to a word ("OptionC") are put back into words first.
  const singles = new Set([...letters, 'a', 'i']);
  const t = visibleText(text)
    .replace(/(?<![\p{L}\p{M}\p{N}])\p{L}(?: \p{L}){3,}(?![\p{L}\p{M}\p{N}])/gu, (run) => segment(run.replace(/ /gu, ''), singles) ?? run)
    .replace(/(?<![\p{L}\p{M}\p{N}])[A-Za-z]{5,40}(?![\p{L}\p{M}\p{N}])/gu, (w) => segment(w, singles) ?? w);
  const toks = tokenize(t);
  const id = options[index]!.id;
  if (/^[\p{L}]$/u.test(id)) letters.add(skeleton(id)); else if (/^\p{N}+$/u.test(id)) numbers.add(skeleton(id));
  const ordinals = new Set(ORDINALS[index] ?? []);
  if (index === options.length - 1 && options.length > 1) for (const w of LAST) ordinals.add(w);
  const numberWords = new Set([EN_NUMBERS[index], FR_NUMBERS[index]].filter(Boolean) as string[]);

  const gap = (a: number, b: number) => t.slice(toks[a]!.end, toks[b]!.start);
  const low = (i: number) => toks[i]?.low ?? '';
  /** Index of the nearest token before `k` (at most `max` back) that is in `set`, passing only fillers and never crossing a sentence end; -1 when there is none. */
  const triggerBefore = (k: number, trig: Set<string>, fill: Set<string>, max: number): number => {
    for (let j = k - 1, n = 0; j >= 0 && n < max; j--, n++) {
      // "Option no. 3": the full stop belongs to the abbreviation.
      if (SENTENCE_END.test(gap(j, j + 1)) && !(['no', 'nr', 'n', 'num'].includes(low(j)) && /^\.\s*$/.test(gap(j, j + 1)))) return -1;
      if (trig.has(low(j))) return j;
      if (!fill.has(low(j))) return -1;
    }
    return -1;
  };
  // Whitespace is one space after visibleText, so a window of three characters around a token is all these tests need (and keeps the guard linear).
  const after = (k: number) => t.slice(toks[k]!.end, toks[k]!.end + 3);
  const clauseEnd = (k: number) => /^\s*(?:[.,;:!?)\]]|$)/u.test(after(k));
  /** The token ends its clause, possibly after one small adverb: "look at C.", "look at C again." */
  const clauseEndish = (k: number) => clauseEnd(k) || (k + 1 < toks.length && TAIL.has(low(k + 1)) && /^\s*$/u.test(gap(k, k + 1)) && clauseEnd(k + 1));
  const bracketed = (k: number) => /[(\[{]\s*$/u.test(t.slice(Math.max(0, toks[k]!.start - 3), toks[k]!.start)) && /^\s*[)\]}]/u.test(after(k));
  const compound = (k: number) => /^-\p{L}/u.test(after(k));
  /** The token starts the text or a sentence / clause ("C)", "C, definitely", "D."). */
  const startsClause = (k: number) => k === 0 || /[.!?;:\n]/u.test(gap(k - 1, k));
  /** A capital letter alone at the start of a clause, followed by a closing mark: "C.", "C)", "C: ...", "C, definitely"; not an abbreviation such as "C. difficile". */
  const bareLetter = (k: number) => {
    const rest = t.slice(toks[k]!.end, toks[k]!.end + 40);
    if (/^\s*[:)\]!?;]/u.test(rest) || /^\s*$/u.test(t.slice(toks[k]!.end))) return true;
    if (/^\s*\.(?!\s*\p{Ll})/u.test(rest)) return true;
    const adv = /^\s*,\s*(\p{L}+)/u.exec(rest);
    return !!adv && ADVERB.has(skeleton(adv[1]!));
  };
  /** "It is C", "That would be C", "C'est C": a pronoun, then only linking verbs, right before the token. */
  const pronounBefore = (k: number): boolean => {
    let j = k - 1;
    while (j >= 0 && k - j <= 6 && MODAL.has(low(j)) && !SENTENCE_END.test(gap(j, j + 1))) j--;
    return j < k - 1 && j >= 0 && PRONOUN.has(low(j)) && !SENTENCE_END.test(gap(j, j + 1));
  };
  /** "C is correct", "C would be the best fit", "C fits best": the token starts a clause and is followed by a linking verb and a verdict word. */
  const verdictAfter = (k: number): boolean => {
    if (k > 0 && !SENTENCE_END.test(gap(k - 1, k)) && !/[,:()"'—–-]/u.test(gap(k - 1, k)) && !CONNECTIVE.has(low(k - 1))) return false;
    let j = k + 1;
    while (j < toks.length && j < k + 8 && ADVERB.has(low(j))) j++;
    if (j >= toks.length || !LINK.has(low(j)) || SENTENCE_END.test(gap(j - 1, j))) return false;
    for (let n = 0, m = j + 1; m < toks.length && n <= 4; m++, n++) {
      if (SENTENCE_END.test(gap(m - 1, m))) return false;
      if (VERDICT.has(low(m))) return true;
      if (!AFTER_FILL.has(low(m))) return false;
    }
    return false;
  };

  for (let k = 0; k < toks.length; k++) {
    const w = toks[k]!.low;
    if (letters.has(w)) {
      if (compound(k)) continue;
      // "a" is also a word: only the capital counts, or a lower-case one right after option / choice / answer / letter that ends its clause ("Option a.").
      if (w === 'a' && !toks[k]!.upper && !(clauseEnd(k) && k > 0 && ['option', 'choice', 'answer', 'letter', 'choix', 'reponse', 'lettre'].includes(low(k - 1)))) continue;
      if (bracketed(k) || triggerBefore(k, TRIGGER, FILL, 4) >= 0 || verdictAfter(k)) return true;
      // The letter is all there is ("C", "**C**", "C)"), or it ends a clause after a pointing word ("Look at C", "Consider C", "I would say C", "Hint: C").
      if (toks.length === 1 || (clauseEndish(k) && triggerBefore(k, POINT, FILL, 4) >= 0)) return true;
      // A capital letter that opens a clause and is closed by a mark: "C.", "C)", "C: ...", "C, definitely".
      if (toks[k]!.upper && startsClause(k) && bareLetter(k)) return true;
      // "It is C", "That would be C", "C'est C".
      if (pronounBefore(k)) return true;
      if (k > 0 && ["it's", 'it’s', "that's", 'that’s'].includes(low(k - 1))) return true;
    }
    if (numbers.has(w)) {
      if (compound(k)) continue;
      if (bracketed(k) || triggerBefore(k, NOUN, NUM_FILL, 3) >= 0 || verdictAfter(k)) return true;
      // "3", "#3", "3)"; "Choose 3", "Go with 3", "Pick 3"; "It is 3"; "No. 3": the number ends its clause, so "choose 3 markers" and "it is 3 mg/dL" are not.
      if (toks.length === 1) return true;
      if (clauseEnd(k) && (triggerBefore(k, new Set([...CHOOSING, ...POINT]), FILL, 3) >= 0 || pronounBefore(k) || ['no', 'nr', 'num', 'numero'].includes(low(k - 1)))) return true;
    }
    if (numberWords.has(w) && triggerBefore(k, NOUN, new Set(['number', 'no', 'nr', 'n', 'numero']), 2) >= 0) return true;
    if (ordinals.has(w)) {
      // "the third option", "the 3rd one", "la troisième réponse".
      if (k + 1 < toks.length && NOUN.has(low(k + 1)) && !SENTENCE_END.test(gap(k, k + 1))) return true;
      if (k + 1 < toks.length && low(k + 1) === 'one' && !SENTENCE_END.test(gap(k, k + 1))) return true;
      // "Go with the third.", "Choose the second": a choosing verb, the ordinal ending its clause. ("Go with the first impression" is not.)
      if (clauseEnd(k) && triggerBefore(k, CHOOSING, FILL, 4) >= 0) return true;
    }
  }
  return false;
}

/**
 * R16-A-03, one cheap high-recall rule on top of the closed list above (which is NOT extended again): a standalone CAPITAL letter equal to the correct option's letter
 * ("Try C", "Stick with C.", "C seems plausible", "**C**") drops the hint. The cost of a false positive is only that the learner gets the faculty hint instead, so the
 * rule accepts some. Clinical vocabulary that really uses a single capital letter is taken out first (CLINICAL_LETTERS). Still a heuristic: lower-case letters,
 * numbers, ordinals and other languages' phrasings are covered by the list above only.
 */
const NOT_WORD = String.raw`(?<![\p{L}\p{M}\p{N}])`;
const LETTER_LIST = String.raw`(?:\s*(?:,|/|&|and|or|et|ou)\s*\p{Lu}(?![\p{L}\p{M}\p{N}]))*`;
const CLINICAL_LETTERS: RegExp[] = [
  // vitamin C, vitamins A, D and K; hepatitis A / B / C; protein C and S
  new RegExp(String.raw`${NOT_WORD}(?:[Vv]itamin(?:e|es|s)?|[Hh][eé]patit(?:is|e)s?|[Pp]rot[eé]in(?:e|es|s)?)\s+\p{Lu}(?![\p{L}\p{M}\p{N}])${LETTER_LIST}`, 'gu'),
  // C-reactive, B-cell, T-cell, D-dimer (also written "D dimer"): a letter hyphenated to a word
  new RegExp(String.raw`${NOT_WORD}\p{Lu}(?:-(?=\p{L})|\s+[Dd]imers?)`, 'gu'),
  // type C hepatitis
  new RegExp(String.raw`${NOT_WORD}\p{Lu}(?=\s+[Hh][eé]patit)`, 'gu'),
  // 37 °C
  /°\s?\p{Lu}(?![\p{L}\p{M}\p{N}])/gu,
  // type A / B / AB, group A / B (blood groups, streptococci)
  new RegExp(String.raw`${NOT_WORD}(?:[Tt]ypes?|[Gg]roups?|[Gg]roupe)\s+(?:AB|[AB])(?![\p{L}\p{M}\p{N}])${LETTER_LIST}`, 'gu'),
  // Factor V, Factor C
  new RegExp(String.raw`${NOT_WORD}(?:[Ff]actors?|[Ff]acteurs?)\s+\p{Lu}(?![\p{L}\p{M}\p{N}])`, 'gu'),
  // B cells, T cells, B and T lymphocytes, "B, T and NK cells"
  new RegExp(String.raw`${NOT_WORD}\p{Lu}(?![\p{L}\p{M}\p{N}])(?:\s*(?:,|and|et)\s*\p{Lu}{1,2}(?![\p{L}\p{M}\p{N}]))*\s+(?:[Cc]ells?|[Ll]ymphocytes?|[Cc]ellules?)(?![\p{L}\p{M}\p{N}])`, 'gu'),
  // abbreviated genus: C. difficile, E. coli
  new RegExp(String.raw`${NOT_WORD}\p{Lu}\.\s+(?=\p{Ll})`, 'gu'),
];
const LONE_CAPITAL = new RegExp(String.raw`${NOT_WORD}\p{Lu}(?![\p{L}\p{M}\p{N}])`, 'gu');
/** Squared / negative squared / circled negative Latin capitals (U+1F130..1F189) are drawn as capital letters and survive NFKC: map them to A-Z. */
const SQUARED = /[\u{1F130}-\u{1F149}\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}]/gu;
function namesOptionByCapital(text: string, index: number): boolean {
  if (index < 0 || index >= 26) return false;
  const letter = optionLetter(index);
  // The pronoun "I" is not an option letter (index 8, never reached by a real step).
  if (letter === 'I') return false;
  let t = visibleText(text).replace(SQUARED, (c) => String.fromCharCode(65 + c.codePointAt(0)! - (c.codePointAt(0)! >= 0x1F170 ? 0x1F170 : c.codePointAt(0)! >= 0x1F150 ? 0x1F150 : 0x1F130)));
  for (const re of CLINICAL_LETTERS) t = t.replace(re, ' ');
  for (const m of t.matchAll(LONE_CAPITAL)) {
    if (skeleton(m[0]).toUpperCase() !== letter) continue;
    // "A" is also the article ("A low MCV", "A patient", "A first look", "A likely cause"): it only counts when it is not followed by an ordinary lower-case word. After a linking verb it is the letter ("A seems plausible").
    // R17-A-02: adverbs and tail words (first, likely, most, clearly, just, also, now) are ordinary words after an article and no longer make it a letter.
    if (letter === 'A') {
      const next = /^\s+(\p{Ll}[\p{L}'’]*)/u.exec(t.slice(m.index! + 1, m.index! + 40));
      if (next && !LINK.has(skeleton(next[1]!))) continue;
    }
    return true;
  }
  return false;
}

/**
 * True when the text must not reach the learner: it contains bidirectional controls (an override could show a reversed label), the correct option's
 * label (compared through `compared`, so spacing, case, accents, zero-width characters and look-alike letters do not hide it), "the answer is ...", or it names the
 * correct option by the letter, number or position the learner sees ("Option C", "C is correct", "Go with C", "Answer: C", "(C)", "the third option", "option 3").
 * Semantics unchanged from earlier rounds: only the whole label counts (a hint that mentions a word of it is fine), and labels of at most three
 * letters are not guarded. A hint that talks about OTHER options, or says "option" alone, is fine. A last line of defence, not a guarantee (see docs/KNOWN_LIMITATIONS.md).
 */
export function leaksAnswer(text: string, step: Step): boolean {
  // Bounded work (R15-A-06): every caller rejects a text over MAX_ASSISTANT_HINT first, so a text this long never reaches the learner; if one gets here it cannot be verified.
  if (text.length > 2 * MAX_ANALYSED || [...text].length > MAX_ANALYSED) return true;
  if (hasBidiControl(text)) return true;
  const t = compared(text);
  if (forbiddenPhrases(step).some((p) => { const c = compared(p); return c.length > 3 && t.includes(c); })) return true;
  if (/\b(the )?(correct )?(answer|option|choice) is\b/.test(skeleton(text))) return true;
  const k = step.key;
  if (k.kind === 'choice' || k.kind === 'decision') {
    const options = presentedOptions(step);
    const index = options.findIndex((o) => o.id === k.answer);
    if (namesOptionByPosition(text, options, index) || namesOptionByCapital(text, index)) return true;
  }
  return false;
}

export class StandardOnlyProvider implements HintProvider {
  async hint(): Promise<string | null> { return null; }
}

export class AnthropicHintProvider implements HintProvider {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  constructor(apiKey: string, model: string, timeoutMs = 4000, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey; this.model = model; this.timeoutMs = timeoutMs; this.fetchImpl = fetchImpl;
  }

  async hint({ step, level, wrongSoFar }: HintRequest): Promise<string | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      // The options are listed with the letters the learner sees (by position), including the default decisions of a decision step without options of its own.
      const options = presentedOptions(step).map((o, i) => `${optionLetter(i)}. ${o.label}`).join('\n');
      const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 160,
          system: 'You are the Lab Assistant in a biomedical teaching game. Give one or two short pedagogical sentences that nudge the student towards the next reasoning step. Never state or imply the answer, never name the correct option, never give a letter. Use precise laboratory vocabulary and no exclamation marks.',
          messages: [{
            role: 'user',
            content: `Case: ${step.context ?? ''}\nQuestion: ${step.prompt}\n${options}\nHint level: ${level}. Wrong answers so far: ${wrongSoFar}.\nFaculty hint to build on: ${step.hints[level - 1] ?? step.hints[0] ?? ''}`,
          }],
        }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = j.content?.find((c) => c.type === 'text')?.text?.trim();
      if (!text || exceedsHintLimit(text) || !hasSubstance(text) || leaksAnswer(text, step)) return null;
      return text;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
