// One-off/dev utility: bulk-inserts fake posts directly via Prisma
// (createMany, batched) rather than through the HTTP API — thousands of
// individual POSTs would be slow and would trip the global rate limiter.
// Usage: pnpm run seed [count]   (reads DATABASE_URL from backend/.env — the
// dev database, tcit_posts, never the test one)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADJECTIVES = [
  'rápido',
  'lento',
  'grande',
  'pequeño',
  'nuevo',
  'viejo',
  'azul',
  'verde',
  'silencioso',
  'ruidoso',
  'antiguo',
  'moderno',
];
const NOUNS = ['gato', 'perro', 'auto', 'casa', 'río', 'monte', 'libro', 'cielo', 'jardín', 'puente', 'barco', 'tren'];
const VERBS = ['corre', 'salta', 'vuela', 'nada', 'duerme', 'canta', 'piensa', 'construye', 'explora', 'descansa'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Filter out stray "--" separators: invoking this through nested pnpm
// scripts (`pnpm seed -- 500` at the repo root -> backend's own "seed"
// script) can forward a literal "--" token alongside the real argument.
const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const TOTAL = Number(cliArgs[0] ?? 10000);
const BATCH_SIZE = 1000;

async function main() {
  if (!Number.isInteger(TOTAL) || TOTAL <= 0) {
    throw new Error(`Invalid count: "${cliArgs[0]}". Usage: pnpm run seed [count]`);
  }

  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('tcit_posts_test')) {
    // The e2e suite truncates this database between tests — seeding it
    // would just get wiped on the next `pnpm test:e2e` run.
    throw new Error(
      'DATABASE_URL points at tcit_posts_test (the e2e test database). Seed the dev database instead — check backend/.env.',
    );
  }


  console.log(`Seeding ${TOTAL} posts in batches of ${BATCH_SIZE}...`);
  const start = Date.now();

  for (let batchStart = 0; batchStart < TOTAL; batchStart += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, TOTAL - batchStart);
    const batch = Array.from({ length: size }, (_, i) => {
      const n = batchStart + i + 1;
      return {
        name: `${pick(ADJECTIVES)} ${pick(NOUNS)} #${n}`,
        description: `El ${pick(NOUNS)} ${pick(VERBS)} de forma ${pick(ADJECTIVES)}. (registro ${n})`,
      };
    });
    await prisma.post.createMany({ data: batch });
    process.stdout.write(`\r  inserted ${Math.min(batchStart + BATCH_SIZE, TOTAL)}/${TOTAL}`);
  }

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${seconds}s.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
