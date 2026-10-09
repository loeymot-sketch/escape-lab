/**
 * Learner-facing wording for server enums. Presentation only: the server still decides what each step or mission is.
 * The constants hold English; show them with t(STEP_LABELS[kind]) at the render site (labelled functions below translate themselves).
 */
import type { PublicStep } from './attempt';
import { t } from '../i18n';

export const STEP_LABELS: Record<PublicStep['kind'], string> = {
  point: 'Spot the finding',
  decision: 'Make the call',
  order: 'Put in order',
  match: 'Match the pairs',
  choice: 'Reason it through',
};

/** Mission engines, as shown in the lab lobby. An unknown engine is shown generically, never as its internal id. */
export const ENGINE_LABELS: Record<string, string> = {
  image_identify: 'Spot the finding',
  decision: 'Make the call',
  drag_order: 'Put in order',
  matching: 'Match the pairs',
  choice: 'Reason it through',
  stepper: 'Work through the case',
};
/** Call while rendering: the result is in the display language. */
export const engineLabel = (engine: string): string => { const label = ENGINE_LABELS[engine]; return label !== undefined ? t(label) : t('Case challenge'); };

/** A, B, C... for the n-th option: a visual chip, never the server's option id. */
export const optionLetter = (index: number): string => String.fromCharCode(65 + (index % 26));

/** "draft" -> "Draft". */
export const sentenceCase = (word: string): string => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word);

/** Names of the laboratories as the faculty content table shows them (the student lab list is not available to faculty). */
const LAB_NAMES: Record<string, string> = {
  hematology: 'Hematology',
  microbiology: 'Microbiology',
  biochemistry: 'Clinical Biochemistry',
  master: 'Master Lab',
};
/** Call while rendering: the result is in the display language. */
export const labName = (slug: string): string => t(LAB_NAMES[slug] ?? sentenceCase(slug));

/** "3 of 5", "2 of 3 missions": the word between the figures is translated (a fixed word, so it can never act as a template for server text). */
export const outOf = (done: number | string, total: number | string): string => `${done} ${t('of')} ${total}`;

export { plural } from '../i18n/core';
