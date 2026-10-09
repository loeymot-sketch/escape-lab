import { describe, expect, it } from 'vitest';
import { normalizeContentMission, normalizeContentMissions, splitReviewer } from './content';

describe('content governance payloads', () => {
  it('accepts the server mission list and status transitions', () => {
    const list = normalizeContentMissions({ missions: [{ missionId: 'hem-01', title: 'Case', labSlug: 'hematology', status: 'draft' }] });
    expect(list[0]).toMatchObject({ missionId: 'hem-01', status: 'draft' });
    expect(normalizeContentMission({ missionId: 'hem-01', title: 'Case', labSlug: 'hematology', status: 'approved' }).status).toBe('approved');
  });

  it('keeps who last moved a mission and when, verbatim, and null when never moved (R9-C-06)', () => {
    const base = { missionId: 'hem-01', title: 'Case', labSlug: 'hematology', status: 'reviewed' };
    expect(normalizeContentMission({ ...base, reviewedBy: 'Dr. Claire Moreau (#7)', updatedAt: 1791453365153 })).toMatchObject({ reviewedBy: 'Dr. Claire Moreau (#7)', updatedAt: 1791453365153 });
    expect(normalizeContentMission({ ...base, reviewedBy: null, updatedAt: null })).toMatchObject({ reviewedBy: null, updatedAt: null });
    // The fields are optional in older replies, but a present field must be valid.
    expect(normalizeContentMission(base)).toMatchObject({ reviewedBy: null, updatedAt: null });
    expect(() => normalizeContentMission({ ...base, reviewedBy: 7 })).toThrow('reviewedBy');
    expect(() => normalizeContentMission({ ...base, updatedAt: 'yesterday' })).toThrow('updatedAt');
  });

  it('rejects an unknown editorial status', () => {
    expect(() => normalizeContentMission({ missionId: 'hem-01', title: 'Case', labSlug: 'hematology', status: 'published' })).toThrow('status');
  });
});

describe('reviewer label (R12-C-01)', () => {
  it('separates the display name from the server disambiguator, so the name can be isolated alone', () => {
    expect(splitReviewer('Prof Bidi\u202e (teacher #129)')).toEqual({ name: 'Prof Bidi\u202e', suffix: ' (teacher #129)' });
    expect(splitReviewer('Dr. Claire Moreau (#7)')).toEqual({ name: 'Dr. Claire Moreau', suffix: ' (#7)' });
    expect(splitReviewer('Dr. Claire Moreau')).toEqual({ name: 'Dr. Claire Moreau', suffix: '' });
  });
});
