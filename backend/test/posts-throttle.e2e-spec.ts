import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@db/prisma.service';

// Isolated in its own file/app instance on purpose: the throttler's request
// counts are in-memory per app instance, and the main posts.e2e-spec.ts file
// already fires ~11 create requests across its own tests against its own
// shared app — mixing that into this file would make the count depend on
// test order and execution speed instead of on the actual limit.
describe('POST /api/posts throttling', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany();
    await prisma.post.deleteMany();
    await app.close();
  });

  it('rejects create requests past the per-route limit (20/min) with 429, well below the global 120/min default', async () => {
    // @Throttle({ default: { limit: 20, ttl: 60_000 } }) on PostsController#create.
    const LIMIT = 20;
    const statuses: number[] = [];

    for (let i = 0; i < LIMIT + 3; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', randomUUID())
        .send({ name: `Throttle test ${i}`, description: 'x' });
      statuses.push(res.status);
    }

    const created = statuses.filter((status) => status === 201).length;
    const throttled = statuses.filter((status) => status === 429).length;

    expect(created).toBe(LIMIT);
    expect(throttled).toBe(3);
    // The limit trips only after the allowance is used up, not before.
    expect(statuses.slice(0, LIMIT).every((status) => status === 201)).toBe(
      true,
    );
    expect(statuses.slice(LIMIT).every((status) => status === 429)).toBe(true);
  }, 15000);
});
