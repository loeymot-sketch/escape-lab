import { arr, nonNeg, nullable, pct, rec, str } from './guard';

/** Server-computed competency figures (a result, or one student). The interface only draws them. */
export type Competency = { name: string; pct: number; steps: number };
export type Competencies = { items: Competency[]; strongest: string | null; improvement: { name: string; advice: string } | null };

export function normalizeCompetencies(root: Record<string, unknown>, label: string): Competencies {
  return {
    items: arr(root.competencies, label, 'competencies').map((item, i) => {
      const c = rec(item, label, `competencies[${i}]`);
      return { name: str(c.name, label, 'competency.name'), pct: pct(c.pct, label, 'competency.pct'), steps: nonNeg(c.steps, label, 'competency.steps') };
    }),
    strongest: nullable(root.strongest, (v) => str(v, label, 'strongest')),
    improvement: nullable(root.improvement, (v) => {
      const row = rec(v, label, 'improvement');
      return { name: str(row.name, label, 'improvement.name'), advice: str(row.advice, label, 'improvement.advice') };
    }),
  };
}
