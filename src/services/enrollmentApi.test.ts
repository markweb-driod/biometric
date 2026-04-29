import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enrollFace,
  isEnrollmentApiError,
  EnrollmentApiError,
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
  beforeEach(() => {
    // Real mode: disable mock so client validation fires before any fetch.
    vi.stubEnv('VITE_MOCK_API', 'false');
  });
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

describe('enrollFace — network / backend error mapping', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MOCK_API', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('throws network_error when fetch rejects', async () => {
    mockFetchNetworkFailure();
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('network_error');
    expect(err.retryable).toBe(true);
    expect(err.shouldRecapture).toBe(false);
  });

  it('throws liveness_failed for backend liveness rejection', async () => {
    mockFetchError(400, 'Liveness check failed. Ensure the subject is physically present and retake.');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('liveness_failed');
    expect(err.retryable).toBe(true);
    expect(err.shouldRecapture).toBe(true);
  });

  it('throws capture_quality_rejected for backend image quality rejection', async () => {
    mockFetchError(400, 'Invalid or low-quality image at index 0');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('capture_quality_rejected');
    expect(err.shouldRecapture).toBe(true);
  });

  it('throws auth_required for HTTP 401', async () => {
    mockFetchError(401, 'Not authenticated');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('auth_required');
    expect(err.retryable).toBe(false);
    expect(err.shouldRecapture).toBe(false);
  });

  it('throws auth_required for HTTP 403', async () => {
    mockFetchError(403, 'Forbidden');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('auth_required');
  });

  it('throws capture_too_large for HTTP 413', async () => {
    mockFetchError(413, 'Request entity too large');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('capture_too_large');
    expect(err.shouldRecapture).toBe(true);
  });

  it('throws server_error for HTTP 500', async () => {
    mockFetchError(500, 'Database or Engine error: unexpected');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('server_error');
    expect(err.retryable).toBe(true);
    expect(err.shouldRecapture).toBe(false);
  });

  it('throws invalid_subject_id for 400 identifier length message', async () => {
    mockFetchError(400, 'Identifier length must be between 3 and 64 characters');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('invalid_subject_id');
    expect(err.retryable).toBe(false);
  });

  it('throws validation_failed for generic 400', async () => {
    mockFetchError(400, 'Some unrecognised validation error');
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(isEnrollmentApiError(err)).toBe(true);
    expect(err.code).toBe('validation_failed');
    expect(err.retryable).toBe(true);
  });

  it('returns a success response on HTTP 200', async () => {
    mockFetchOk({
      success: true,
      message: 'Face enrollment completed for Alice Johnson',
      liveness_passed: true,
      liveness_checked: true,
      student_id: 1,
      external_id: 'stu-001',
    });
    const result = await enrollFace({ userId: 'stu-001', image: TINY_JPEG });
    expect(result.success).toBe(true);
    expect(result.liveness_passed).toBe(true);
    expect(result.student_id).toBe(1);
  });

  it('preserves the raw backend message in backendMessage field', async () => {
    const raw = 'Liveness check failed. Ensure the subject is physically present and retake.';
    mockFetchError(400, raw);
    const err = await enrollFace({ userId: 'stu-001', image: TINY_JPEG }).catch((e) => e);
    expect(err.backendMessage).toBe(raw);
  });
});
