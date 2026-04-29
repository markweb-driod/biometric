import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  enrollFace,
  isEnrollmentApiError,
  EnrollmentApiError,
  mapBackendError,
} from './enrollmentApi';

// Minimal valid JPEG data URL (1×1 pixel, ~300 bytes — well under size cap)
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC' +
  'AABAAEDASIA2gABAREA/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEA//EABsQAAMB' +
  'AQEBAAAAAAAAAAAAAAECAwQFBhH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBA' +
  'AAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmSlAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAB//Z';

// Builds a data URL whose base64 payload decodes to exactly `byteCount` bytes.
function makeLargeDataUrl(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

// ── helpers for mocking fetch ────────────────────────────────────────────────

function mockFetchOk(body: object): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    } as unknown as Response),
  );
}

function mockFetchError(status: number, detail: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ detail }),
    } as unknown as Response),
  );
}

function mockFetchNetworkFailure(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
}

// ── test suites ──────────────────────────────────────────────────────────────

describe('isEnrollmentApiError', () => {
  it('returns true for an EnrollmentApiError instance', () => {
    const err = new EnrollmentApiError({
      message: 'test',
      code: 'unknown_error',
      retryable: true,
      shouldRecapture: false,
    });
    expect(isEnrollmentApiError(err)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isEnrollmentApiError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isEnrollmentApiError(null)).toBe(false);
    expect(isEnrollmentApiError('string')).toBe(false);
    expect(isEnrollmentApiError(42)).toBe(false);
  });
});

describe('enrollFace — client-side validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('throws invalid_subject_id for empty userId', async () => {
    const err = await enrollFace({ userId: '', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('invalid_subject_id');
    expect(err.retryable).toBe(false);
    expect(err.shouldRecapture).toBe(false);
  });

  it('throws invalid_subject_id for userId shorter than 3 chars', async () => {
    const err = await enrollFace({ userId: 'ab', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('invalid_subject_id');
  });

  it('throws capture_invalid_format for a non-data-url image', async () => {
    const err = await enrollFace({ userId: 'stu-001', image: 'not-a-data-url' }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('capture_invalid_format');
    expect(err.shouldRecapture).toBe(true);
  });

  it('throws capture_too_large when the decoded image exceeds 500 KB', async () => {
    const bigUrl = makeLargeDataUrl(510_000);
    const err = await enrollFace({ userId: 'stu-001', image: bigUrl }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('capture_too_large');
    expect(err.shouldRecapture).toBe(true);
    expect(err.retryable).toBe(true);
  });
});

// ── mapBackendError — pure mapping logic, no fetch involved ──────────────────

describe('mapBackendError — error code mapping', () => {
  it('maps HTTP 401 → auth_required (not retryable, no recapture)', () => {
    const err = mapBackendError(401, 'Not authenticated');
    expect(err.code).toBe('auth_required');
    expect(err.retryable).toBe(false);
    expect(err.shouldRecapture).toBe(false);
  });

  it('maps HTTP 403 → auth_required', () => {
    const err = mapBackendError(403, 'Forbidden');
    expect(err.code).toBe('auth_required');
  });

  it('maps liveness detail → liveness_failed (retryable, requires recapture)', () => {
    const err = mapBackendError(
      400,
      'Liveness check failed. Ensure the subject is physically present and retake.',
    );
    expect(err.code).toBe('liveness_failed');
    expect(err.retryable).toBe(true);
    expect(err.shouldRecapture).toBe(true);
  });

  it('maps backend quality rejection detail → capture_quality_rejected', () => {
    const err = mapBackendError(400, 'Invalid or low-quality image at index 0');
    expect(err.code).toBe('capture_quality_rejected');
    expect(err.shouldRecapture).toBe(true);
  });

  it('maps HTTP 413 → capture_too_large', () => {
    const err = mapBackendError(413, 'Request entity too large');
    expect(err.code).toBe('capture_too_large');
    expect(err.shouldRecapture).toBe(true);
  });

  it('maps "too large" in message → capture_too_large', () => {
    const err = mapBackendError(400, 'Payload too large');
    expect(err.code).toBe('capture_too_large');
  });

  it('maps HTTP 500 → server_error (retryable, no recapture)', () => {
    const err = mapBackendError(500, 'Database or Engine error: unexpected');
    expect(err.code).toBe('server_error');
    expect(err.retryable).toBe(true);
    expect(err.shouldRecapture).toBe(false);
  });

  it('maps identifier length 400 → invalid_subject_id (not retryable)', () => {
    const err = mapBackendError(400, 'Identifier length must be between 3 and 64 characters');
    expect(err.code).toBe('invalid_subject_id');
    expect(err.retryable).toBe(false);
  });

  it('maps required field 400 → invalid_subject_id', () => {
    const err = mapBackendError(400, "Either 'matric_number' or 'external_id' is required");
    expect(err.code).toBe('invalid_subject_id');
  });

  it('maps generic 400 → validation_failed (retryable)', () => {
    const err = mapBackendError(400, 'Some unrecognised validation error');
    expect(err.code).toBe('validation_failed');
    expect(err.retryable).toBe(true);
  });

  it('maps unclassified error → unknown_error', () => {
    const err = mapBackendError(418, "I'm a teapot");
    expect(err.code).toBe('unknown_error');
    expect(err.retryable).toBe(true);
  });

  it('preserves raw backend message in backendMessage field', () => {
    const raw = 'Liveness check failed. Ensure the subject is physically present and retake.';
    const err = mapBackendError(400, raw);
    expect(err.backendMessage).toBe(raw);
  });

  it('returns an EnrollmentApiError instance for every mapping', () => {
    for (const [status, msg] of [
      [400, 'liveness check failed'],
      [401, 'not authenticated'],
      [403, 'forbidden'],
      [413, 'too large'],
      [500, 'internal'],
      [400, 'identifier length'],
      [400, 'generic error'],
    ] as [number, string][]) {
      expect(mapBackendError(status, msg)).toBeInstanceOf(EnrollmentApiError);
    }
  });
});
