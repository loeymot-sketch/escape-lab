import { arr, nonNeg, nullable, oneOf, optional, rec, str } from './guard';

export type ContentStatus = 'draft' | 'reviewed' | 'approved';
/** `reviewedBy` is the server's own label for whoever last moved the mission (shown verbatim); `updatedAt` is epoch milliseconds. Both are null until a mission has been moved. */
export type ContentMission = { missionId: string; title: string; labSlug: string; status: ContentStatus; reviewedBy: string | null; updatedAt: number | null };

const C = 'content';
const STATUSES = ['draft', 'reviewed', 'approved'] as const;

export function normalizeContentMission(payload: unknown): ContentMission {
  const row = rec(payload, C);
  return {
    missionId: str(row.missionId, C, 'missionId'),
    title: str(row.title, C, 'title'),
    labSlug: str(row.labSlug, C, 'labSlug'),
    status: oneOf(row.status, STATUSES, C, 'status'),
    reviewedBy: optional(row.reviewedBy, (v) => nullable(v, (x) => str(x, C, 'reviewedBy'))) ?? null,
    updatedAt: optional(row.updatedAt, (v) => nullable(v, (x) => nonNeg(x, C, 'updatedAt'))) ?? null,
  };
}

export function normalizeContentMissions(payload: unknown): ContentMission[] {
  const root = rec(payload, C);
  return arr(root.missions, C, 'missions').map(normalizeContentMission);
}

/**
 * The server writes a reviewer as "Name (teacher #7)": the name is whatever the teacher typed, the bracketed part is the server own
 * disambiguator. They are split so the name can be isolated from the text around it (an unclosed bidi override in a name must not reach the id or the date).
 */
export function splitReviewer(label: string): { name: string; suffix: string } {
  const match = /^([\s\S]*?)(\s\((?:teacher )?#\d+\))$/.exec(label);
  return match ? { name: match[1]!, suffix: match[2]! } : { name: label, suffix: '' };
}
