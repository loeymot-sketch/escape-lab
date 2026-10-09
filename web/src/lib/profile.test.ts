import { describe, expect, it } from 'vitest';
import { normalizeProfileSettings } from './profile';

describe('profile contract normalization', () => {
  it('accepts explicit boolean settings, including false', () => {
    expect(normalizeProfileSettings({ settings: { sound: true, reduceMotion: false, notifications: false } })).toEqual({ sound: true, reduceMotion: false, notifications: false });
  });

  it('rejects incomplete settings instead of inventing defaults', () => {
    expect(() => normalizeProfileSettings({ settings: { sound: true } })).toThrow(/reduceMotion/);
  });
});
