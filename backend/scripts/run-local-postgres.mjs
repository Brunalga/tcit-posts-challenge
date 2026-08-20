// Boots a real Postgres cluster in userspace (no Docker, no root) using
// embedded-postgres, and keeps it running until this process is killed.
// Only meant for environments without Docker/system Postgres available —
// docker-compose.yml is still the source of truth for how this app actually
// deploys.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, '..', '.pgdata');
// Presence of PG_VERSION is Postgres's own marker for "this data directory
// already holds an initialized cluster" — reuse it across restarts instead
// of re-running initdb (which fails loudly on a non-empty directory).
const alreadyInitialised = existsSync(path.join(databaseDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  persistent: true,
});

async function main() {
  if (alreadyInitialised) {
    console.log(`[local-postgres] reusing existing cluster at ${databaseDir}`);
  } else {
    console.log(`[local-postgres] initializing cluster at ${databaseDir} ...`);
    await pg.initialise();
  }

  console.log('[local-postgres] starting server on port 5432 ...');
  await pg.start();

  console.log('[local-postgres] ensuring "tcit_posts" (dev) and "tcit_posts_test" (e2e) databases exist ...');
  for (const dbName of ['tcit_posts', 'tcit_posts_test']) {
    await pg.createDatabase(dbName).catch((err) => {
      if (!String(err).includes('already exists')) throw err;
    });
  }

  console.log('[local-postgres] ready: postgresql://postgres:postgres@localhost:5432/tcit_posts (+ tcit_posts_test)');

  const shutdown = async (signal) => {
    console.log(`[local-postgres] received ${signal}, stopping ...`);
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Keep the process (and therefore the child postgres process) alive.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('[local-postgres] failed to start:', err);
  process.exit(1);
});
