const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Matches NestJS's default HttpException JSON shape (also what our
// AllExceptionsFilter normalizes Prisma errors into on the backend).
interface NestErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly error?: string;

  constructor(status: number, message: string, error?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

async function parseErrorBody(res: Response): Promise<{ message: string; error?: string }> {
  try {
    const body = (await res.json()) as NestErrorBody;
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    return { message: message || res.statusText || 'Request failed', error: body.error };
  } catch {
    return { message: res.statusText || 'Request failed' };
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const { message, error } = await parseErrorBody(res);
    throw new ApiError(res.status, message, error);
  }
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return handleResponse<T>(res);
}

// No Idempotency-Key needed here: a PATCH-by-id replace is already
// naturally idempotent, unlike POST create.
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

const RETRYABLE_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

function isRetryable(err: unknown): boolean {
  // Network failure (fetch throws a TypeError) or a transient server error —
  // never retry on 4xx, those are the caller's fault and won't change.
  if (err instanceof ApiError) return err.status >= 500;
  return err instanceof TypeError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POSTs a JSON body carrying the given Idempotency-Key. The *same* key is
 * reused across automatic retries — that's the entire point: if the first
 * attempt actually succeeded on the server but the response was lost to a
 * network blip, the retry replays the original result instead of creating a
 * duplicate resource.
 */
export async function apiPostIdempotent<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      return await handleResponse<T>(res);
    } catch (err) {
      lastErr = err;
      if (attempt === RETRYABLE_ATTEMPTS || !isRetryable(err)) throw err;
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  // Unreachable, but keeps TypeScript happy about the return type.
  throw lastErr;
}
