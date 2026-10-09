// One file per area: `fr/<area>.ts` default-exports a Record<English text, French text>; `fr/<area>.nouns.ts` default-exports plural nouns.
// Merged here; a key registered twice with different texts is reported by the unit test (conflicts).
import { registerFr, registerNouns } from '../core';

const dictionaries = import.meta.glob<{ default: Record<string, string> }>(['./*.ts', '!./index.ts', '!./*.nouns.ts'], { eager: true });
for (const module of Object.values(dictionaries)) registerFr(module.default);
const nouns = import.meta.glob<{ default: Record<string, readonly [string, string]> }>('./*.nouns.ts', { eager: true });
for (const module of Object.values(nouns)) registerNouns(module.default);
