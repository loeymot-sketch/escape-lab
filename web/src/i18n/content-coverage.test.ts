import { describe, expect, it } from 'vitest';
import * as content from '../../../be/src/content.ts';
import { frEntries } from './core';
import './fr';

// Every learner-facing text of the mission content (be/src/content.ts) must have a French text, so that editing or adding an English text
// without its translation is noticed. The English text stays the reference: nothing here changes the content.
const SECRET_OR_TECHNICAL = /(?:^|\.)(?:id|slug|kind|key|answer|asset|competency|labSlug|engine|difficulty|discipline|firstTryMode|sourceId)(?:\.|\[|$)/;
const strings = new Map<string, string>();
(function walk(value: unknown, path: string) {
  if (typeof value === 'string') { if (!strings.has(value)) strings.set(value, path); return; }
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
})({ LABS: content.LABS, MISSIONS: content.MISSIONS, MASTER_SCORING: content.MASTER_SCORING }, 'content');

/** Texts that are the same in French on purpose: species names, analyte abbreviations, units, bare option values. */
const SAME_IN_FRENCH = /^(?:[^A-Za-zÀ-ÿ]*|(?:[A-Z][a-z]+ [a-z]+(?: [a-z]+)?)|[A-Z0-9][A-Za-z0-9₂₃ ]{0,10}|(?:Streptococcus|Enterococcus|Staphylococcus|Clostridium|Micrococcus|BUN|WBC|CRP|HCO3|PaCO2|MCV|MCHC|TIBC|RDW|Potassium|Sodium|mmol\/L|mmHg|Catalase|Coagulase \(tube\)|(?:BUN|Potassium|Sodium) [\d.]+ (?:mg\/dL|mmol\/L)))$/;

describe('French mission content', () => {
  it('has a French text for every learner-facing content string', () => {
    const missing = [...strings].filter(([text, path]) => !SECRET_OR_TECHNICAL.test(path) && /[A-Za-z]{3}/.test(text) && !/^[a-z0-9_-]+$/.test(text) && !frEntries().has(text) && !SAME_IN_FRENCH.test(text)).map(([text, path]) => `${path}  ${JSON.stringify(text.slice(0, 90))}`);
    expect(missing, `${missing.length} content strings have no French text`).toEqual([]);
  });
  it('keeps every number, unit and reference range of the English in the French text', () => {
    const digits = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).join(' ');
    const drift = [...strings].filter(([text]) => frEntries().has(text) && digits(text) !== digits(frEntries().get(text)!)).map(([text]) => JSON.stringify(text.slice(0, 80)));
    expect(drift).toEqual([]);
  });
});
