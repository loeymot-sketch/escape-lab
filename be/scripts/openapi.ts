import { openApi } from '../src/openapi.ts';
import { buildRoutes } from '../src/routes.ts';
import { openDb } from '../src/db.ts';
import { Game } from '../src/game.ts';
import { RateLimiter } from '../src/http.ts';

const db = openDb(':memory:');
const routes = buildRoutes({ db, game: new Game(db), limiter: new RateLimiter(), secret: 'x', teacherInviteCode: '', now: Date.now });
console.log(JSON.stringify(openApi(routes), null, 2));
