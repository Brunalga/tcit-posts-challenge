import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@db/prisma.service';

describe('Posts (e2e)', () => {
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

  beforeEach(async () => {
    await prisma.idempotencyKey.deleteMany();
    await prisma.post.deleteMany();
  });

  describe('GET /api/posts', () => {
    it('returns an empty list when no posts exist', async () => {
      const res = await request(app.getHttpServer()).get('/api/posts');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all posts, camelCase, newest first', async () => {
      await prisma.post.create({ data: { name: 'First', description: 'One' } });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await prisma.post.create({
        data: { name: 'Second', description: 'Two' },
      });

      const res = await request(app.getHttpServer()).get('/api/posts');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ name: 'Second', description: 'Two' });
      expect(res.body[0]).toHaveProperty('createdAt');
      expect(res.body[0]).toHaveProperty('updatedAt');
    });
  });

  describe('POST /api/posts', () => {
    it('rejects requests without an Idempotency-Key header', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/posts')
        .send({ name: 'A', description: 'B' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid payloads with a validation error', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', randomUUID())
        .send({ name: '', description: 'B' });
      expect(res.status).toBe(400);
    });

    it('rejects a whitespace-only name (server-side trim, not just the frontend)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', randomUUID())
        .send({ name: '    ', description: 'B' });
      expect(res.status).toBe(400);
    });

    it('trims surrounding whitespace before storing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', randomUUID())
        .send({ name: '  Padded  ', description: '  Also padded  ' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Padded',
        description: 'Also padded',
      });
    });

    it('creates and returns the post', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Hello', description: 'World' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Hello', description: 'World' });
      expect(res.body.id).toBeTruthy();

      const stored = await prisma.post.findUnique({
        where: { id: res.body.id },
      });
      expect(stored).not.toBeNull();
    });

    it('replays the original response when the same key + payload is retried', async () => {
      const key = randomUUID();
      const payload = { name: 'Retry me', description: 'network blip' };

      const first = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', key)
        .send(payload);
      const second = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', key)
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.headers['idempotent-replay']).toBe('true');

      const count = await prisma.post.count({ where: { name: 'Retry me' } });
      expect(count).toBe(1);
    });

    it('rejects reusing a key with a different payload', async () => {
      const key = randomUUID();
      await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', key)
        .send({ name: 'A', description: 'B' });

      const res = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Idempotency-Key', key)
        .send({ name: 'Different', description: 'Payload' });

      expect(res.status).toBe(409);
    });

    it('only ever creates one row when the same key is fired concurrently', async () => {
      const key = randomUUID();
      const payload = { name: 'Concurrent', description: 'double submit' };

      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/posts')
          .set('Idempotency-Key', key)
          .send(payload),
        request(app.getHttpServer())
          .post('/api/posts')
          .set('Idempotency-Key', key)
          .send(payload),
      ]);

      expect(
        [a.status, b.status].every(
          (status) => status === 201 || status === 409,
        ),
      ).toBe(true);
      expect([a.status, b.status]).toContain(201);

      const count = await prisma.post.count({ where: { name: 'Concurrent' } });
      expect(count).toBe(1);
    });
  });

  describe('PATCH /api/posts/:id', () => {
    it('updates and returns the post', async () => {
      const created = await prisma.post.create({
        data: { name: 'Before', description: 'Old' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/posts/${created.id}`)
        .send({ name: 'After', description: 'New' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.id,
        name: 'After',
        description: 'New',
      });

      const stored = await prisma.post.findUnique({
        where: { id: created.id },
      });
      expect(stored).toMatchObject({ name: 'After', description: 'New' });
    });

    it('returns 404 for a non-existent id', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/posts/${randomUUID()}`)
        .send({ name: 'A', description: 'B' });
      expect(res.status).toBe(404);
    });

    it('rejects invalid payloads with a validation error', async () => {
      const created = await prisma.post.create({
        data: { name: 'Before', description: 'Old' },
      });
      const res = await request(app.getHttpServer())
        .patch(`/api/posts/${created.id}`)
        .send({ name: '', description: 'New' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    it('deletes and returns the post', async () => {
      const created = await prisma.post.create({
        data: { name: 'Bye', description: 'Gone soon' },
      });

      const res = await request(app.getHttpServer()).delete(
        `/api/posts/${created.id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: created.id, name: 'Bye' });

      const stored = await prisma.post.findUnique({
        where: { id: created.id },
      });
      expect(stored).toBeNull();
    });

    it('returns 404 for a non-existent id', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/api/posts/${randomUUID()}`,
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed id', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/api/posts/not-a-uuid',
      );
      expect(res.status).toBe(400);
    });
  });
});
