import { configFromEnv, createApp, listenHost, listenPort, listenUrl } from './app.ts';
import type { AddressInfo } from 'node:net';

function fatal(message: string): never {
  console.error(`Escape Lab API cannot start: ${message}`);
  process.exit(1);
}

/** One line for the operator: Node errors carry the cause in `message`; a code such as EACCES or ENOTDIR is added when the message does not already say it. */
function dbReason(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return code && !msg.includes(code) && /^[A-Z]+$/.test(code) ? `${msg} (${code})` : msg;
}

let cfg: ReturnType<typeof configFromEnv>;
let host: string | undefined;
let port: number;
let app: ReturnType<typeof createApp>;
try {
  cfg = configFromEnv();
  host = listenHost(cfg);
  port = listenPort();
} catch (e) { fatal(e instanceof Error ? e.message : String(e)); }
// A DB_PATH that is a directory, not an SQLite file, not writable or written by a newer build is a start-up problem to report in one line
// (like HOST, PORT and the secrets above), not a stack trace.
try { app = createApp(cfg); } catch (e) { fatal(`cannot use the database at ${cfg.dbPath}: ${dbReason(e)}`); }
// Without a listener an 'error' (port in use, unknown host, no permission) is an unhandled event with a stack trace: say what is wrong instead.
const onError = (e: NodeJS.ErrnoException) => {
  const why = e.code === 'EADDRINUSE' ? 'the port is already in use (EADDRINUSE)' : e.code === 'EACCES' ? 'permission denied (EACCES)' : e.code === 'ENOTFOUND' ? 'the host name cannot be resolved (ENOTFOUND)' : e.message;
  console.error(`Cannot listen on ${host ?? '0.0.0.0'}:${port}: ${why}`);
  try { app.db.close(); } catch { /* nothing to do */ }
  process.exit(1);
};
app.server.once('error', onError);
app.server.listen(port, host, () => {
  app.server.off('error', onError);
  console.log(`Escape Lab API listening on ${listenUrl(host, (app.server.address() as AddressInfo).port)} (docs: /api/openapi.json)`);
});

const stop = () => { app.close().then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
