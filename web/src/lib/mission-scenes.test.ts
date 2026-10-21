import { describe, expect, it } from 'vitest';
import { missionScene } from './mission-scenes';

describe('mission scene coverage', () => {
  it('provides an illustrative scene for every playable step family', () => {
    const steps = [
      'hem-01-s1', 'hem-02-s1', 'hem-02-s2', 'hem-02-s3', 'hem-03-s1', 'hem-03-s2', 'hem-03-s3',
      'mic-01-s1', 'mic-01-s2', 'mic-01-s3', 'mic-02-s1', 'mic-03-s1',
      'bio-01-s1', 'bio-01-s2', 'bio-01-s3', 'bio-02-s1', 'bio-03-s1', 'bio-03-s2', 'bio-03-s3',
      'master-s1', 'master-s2', 'master-s3', 'master-s4',
    ];
    for (const id of steps) {
      expect(missionScene(id), id).toMatchObject({ src: expect.any(String), alt: expect.any(String), label: expect.any(String) });
    }
  });

  it('does not fabricate a scene for an unknown step', () => {
    expect(missionScene('future-99-s1')).toBeUndefined();
  });
});
