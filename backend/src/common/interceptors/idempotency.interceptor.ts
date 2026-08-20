import { createHash } from 'node:crypto';
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { PrismaService } from '@db/prisma.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';
// Client generates this (crypto.randomUUID() in the frontend), so a UUID-ish
// shape is enough validation without being needlessly strict.
const KEY_PATTERN = /^[a-zA-Z0-9_-]{8,255}$/;

function fingerprintOf(req: Request): string {
  // Ties the key to *this* request's method/path/body so the same key can't
  // silently be replayed against a different payload.
  const payload = JSON.stringify({
    method: req.method,
    path: req.originalUrl,
    // req.body is untyped (any) on Express's Request by default; cast to
    // unknown since we only ever hash it, never read through it.
    body: (req.body as unknown) ?? null,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Stripe-style idempotent writes for the route it decorates, backed by the
 * `idempotency_keys` table.
 *
 * Flow for a request carrying `Idempotency-Key: <key>`:
 *   1. No prior (unexpired) record for `key`         -> reserve it as
 *      "processing" and let the handler run.
 *   2. Prior record with a *different* fingerprint    -> 409, the key is
 *      being reused for a different logical request.
 *   3. Prior record still "processing"                -> 409, a concurrent
 *      attempt with the same key is in flight.
 *   4. Prior record "completed"                        -> replay the stored
 *      response verbatim (no re-execution, no duplicate side effects).
 *
 * If the handler errors out, the reservation is released so the client's
 * retry (with the same key) isn't blocked behind a failed attempt.
 *
 * Scoped to the create-post route only (see @UseInterceptors in
 * PostsController), so the persisted status code is always 201.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly ttlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlHours = config.get<number>('IDEMPOTENCY_KEY_TTL_HOURS', 24);
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const rawKey = request.header(IDEMPOTENCY_HEADER);
    if (!rawKey) {
      throw new BadRequestException(
        `Missing required "${IDEMPOTENCY_HEADER}" header.`,
      );
    }
    if (!KEY_PATTERN.test(rawKey)) {
      throw new BadRequestException(
        `Invalid "${IDEMPOTENCY_HEADER}" header format.`,
      );
    }

    const requestFingerprint = fingerprintOf(request);
    const now = new Date();

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key: rawKey },
    });

    if (existing && existing.expiresAt > now) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new ConflictException(
          'This idempotency key was already used with a different request payload.',
        );
      }
      if (existing.status === 'processing') {
        throw new ConflictException(
          'A request with this idempotency key is already being processed.',
        );
      }

      response.setHeader('Idempotent-Replay', 'true');
      return of(existing.responseBody);
    }

    if (existing) {
      // Past its TTL (or an abandoned "processing" row from a crashed
      // request) — safe to reclaim and let this attempt start fresh.
      await this.prisma.idempotencyKey
        .delete({ where: { key: rawKey } })
        .catch(() => undefined);
    }

    const expiresAt = new Date(now.getTime() + this.ttlHours * 60 * 60 * 1000);

    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key: rawKey,
          requestFingerprint,
          status: 'processing',
          expiresAt,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Lost a race: another request reserved this exact key microseconds ago.
        throw new ConflictException(
          'A request with this idempotency key is already being processed.',
        );
      }
      throw err;
    }

    return next.handle().pipe(
      // Only reached on a genuine successful emission — errors go through
      // catchError below instead, so there's no need to re-check status here.
      tap((body) => {
        this.prisma.idempotencyKey
          .update({
            where: { key: rawKey },
            data: {
              status: 'completed',
              responseStatusCode: HttpStatus.CREATED,
              responseBody: body as Prisma.InputJsonValue,
            },
          })
          .catch((persistErr: unknown) =>
            this.logger.error(
              'Failed to persist idempotency record',
              persistErr,
            ),
          );
      }),
      catchError((err: unknown) => {
        this.prisma.idempotencyKey
          .delete({ where: { key: rawKey } })
          .catch(() => undefined);
        return throwError(() => err);
      }),
    );
  }
}
