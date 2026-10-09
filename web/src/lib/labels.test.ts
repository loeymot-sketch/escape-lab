import { describe, expect, it } from 'vitest';
import { engineLabel, labName, optionLetter, plural, sentenceCase, STEP_LABELS } from './labels';

describe('learner wording', () => {
  it('has a friendly label for every step kind and never the raw kind', () => {
    expect(Object.keys(STEP_LABELS).sort()).toEqual(['choice', 'decision', 'match', 'order', 'point']);
    for (const [kind, label] of Object.entries(STEP_LABELS)) expect(label.toLowerCase()).not.toBe(kind);
    expect(STEP_LABELS.point).toBe('Spot the finding');
    expect(STEP_LABELS.decision).toBe('Make the call');
    expect(STEP_LABELS.order).toBe('Put in order');
    expect(STEP_LABELS.match).toBe('Match the pairs');
    expect(STEP_LABELS.choice).toBe('Reason it through');
  });
  it('labels engines without jargon and falls back generically', () => {
    expect(engineLabel('stepper')).toBe('Work through the case');
    expect(engineLabel('image_identify')).toBe('Spot the finding');
    expect(engineLabel('something_new')).toBe('Case challenge');
  });
  it('letters options by position, not by server id', () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('capitalises statuses and names laboratories', () => {
    expect(sentenceCase('draft')).toBe('Draft');
    expect(labName('biochemistry')).toBe('Clinical Biochemistry');
    expect(labName('master')).toBe('Master Lab');
    expect(labName('immunology')).toBe('Immunology');
  });
  it('pluralises', () => {
    expect(plural(1, 'answer')).toBe('1 answer');
    expect(plural(0, 'answer')).toBe('0 answers');
    expect(plural(2, 'hint')).toBe('2 hints');
    expect(plural(1, 'mission')).toBe('1 mission');
    expect(plural(1, 'code fragment')).toBe('1 code fragment');
  });
});
