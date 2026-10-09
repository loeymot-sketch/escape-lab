// Test-side knowledge of the authored cases (used to PREPARE learner state through the public API and to
// choose answers in the UI). The application itself never sees these keys.
import { MISSION_BY_ID, MISSIONS, exitCode, missionsOf } from '../../../be/src/content.ts';

export { MISSION_BY_ID, MISSIONS, exitCode, missionsOf };

type Key = { kind: string; [k: string]: unknown };
export const keyOf = (missionId: string, stepIndex = 0) => MISSION_BY_ID.get(missionId)!.steps[stepIndex]!.key as Key;

export function correctResponse(key: Key): unknown {
  switch (key.kind) {
    case 'choice': return { choice: key.answer };
    case 'decision': return { decision: key.answer };
    case 'point': return { x: key.x, y: key.y };
    case 'order': return { order: key.order };
    case 'match': return { pairs: key.pairs };
    default: throw new Error(`unknown key ${key.kind}`);
  }
}
