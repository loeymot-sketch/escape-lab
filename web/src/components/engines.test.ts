import { describe, expect, it } from 'vitest';
import { initialAnswer, isAnswerReady, pointAsPercent } from './engines';
import { normalizeStep } from '../lib/attempt';
import { steps } from '../lib/fixtures';

describe('image-identify coordinate mapping', () => {
  it('keeps a scaled image coordinate stable as percentages', () => {
    expect(pointAsPercent(250, 150, { left: 50, top: 50, width: 400, height: 200 })).toEqual({ x: 50, y: 50 });
  });
  it('clamps touch points to the image bounds', () => {
    expect(pointAsPercent(-20, 500, { left: 0, top: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 100 });
  });
});

describe('answer readiness (presentation only: the server decides correctness)', () => {
  it('needs a point, a choice or a decision before Submit is offered', () => {
    expect(isAnswerReady(normalizeStep(steps.point), {})).toBe(false);
    expect(isAnswerReady(normalizeStep(steps.point), { x: 0, y: 0 })).toBe(true);
    expect(isAnswerReady(normalizeStep(steps.choice), {})).toBe(false);
    expect(isAnswerReady(normalizeStep(steps.choice), { choice: 'A' })).toBe(true);
    expect(isAnswerReady(normalizeStep(steps.decision), { decision: 'reject' })).toBe(true);
  });
  it('requires every guided observation before Submit is offered', () => {
    const step = normalizeStep({ ...steps.point, pointTargets: [{ id: 'index', label: 'Hemolysis index' }, { id: 'potassium', label: 'Potassium result' }] });
    expect(initialAnswer(step)).toEqual({ points: {} });
    expect(isAnswerReady(step, { points: { index: { x: 18, y: 18 } } })).toBe(false);
    expect(isAnswerReady(step, { points: { index: { x: 18, y: 18 }, potassium: { x: 55, y: 44 } } })).toBe(true);
  });
  it('treats the server order as a complete answer from the start and keeps it coherent', () => {
    const step = normalizeStep(steps.order);
    expect(initialAnswer(step)).toEqual({ order: ['x', 'y'] });
    expect(isAnswerReady(step, initialAnswer(step))).toBe(true);
    expect(isAnswerReady(step, { order: ['x'] })).toBe(false);
  });
  it('needs every left mapped to a distinct right before matching can be submitted', () => {
    const step = normalizeStep({ ...steps.match, left: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], right: [{ id: 'r1', label: 'R1' }, { id: 'r2', label: 'R2' }] });
    expect(isAnswerReady(step, {})).toBe(false);
    expect(isAnswerReady(step, { pairs: { a: 'r1' } })).toBe(false);
    expect(isAnswerReady(step, { pairs: { a: 'r1', b: '' } })).toBe(false);
    expect(isAnswerReady(step, { pairs: { a: 'r1', b: 'r1' } })).toBe(false);
    expect(isAnswerReady(step, { pairs: { a: 'r1', b: 'r2' } })).toBe(true);
  });
});
