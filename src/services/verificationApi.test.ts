import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  identifyFace,
  isVerificationApiError,
  verifyFace,
  VerificationApiError,
} from './verificationApi';

function makeTinyDataUrl(byteCount = 256): string {
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = i % 256;
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:image/jpeg;base64,${btoa(binary)}`;
}

const TINY_JPEG = makeTinyDataUrl();

function makeLargeDataUrl(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

describe('isVerificationApiError', () => {
  it('returns true for VerificationApiError instance', () => {
    const err = new VerificationApiError({
      message: 'x',
      code: 'unknown_error',
      retryable: true,
    });
    expect(isVerificationApiError(err)).toBe(true);
  });

  it('returns false for plain Error or non-error values', () => {
    expect(isVerificationApiError(new Error('plain'))).toBe(false);
    expect(isVerificationApiError(null)).toBe(false);
    expect(isVerificationApiError('str')).toBe(false);
  });
});

describe('verifyFace mock-mode path', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws subject_not_found for short identifier', async () => {
    const err = await verifyFace({ identifier: 'ab', image: TINY_JPEG }).catch((e) => e);
    expect(isVerificationApiError(err)).toBe(true);
    expect(err.code).toBe('subject_not_found');
    expect(err.retryable).toBe(false);
  });

  it('throws capture_too_large for oversized image', async () => {
    const err = await verifyFace({
      identifier: 'FT22ACMP0833',
      image: makeLargeDataUrl(510_000),
    }).catch((e) => e);

    expect(isVerificationApiError(err)).toBe(true);
    expect(err.code).toBe('capture_too_large');
    expect(err.retryable).toBe(true);
  });

  it('returns a successful 1:1 payload in mock mode', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.1);

    const res = await verifyFace({
      identifier: 'FT22ACMP0833',
      image: TINY_JPEG,
      livenessFrames: [TINY_JPEG, TINY_JPEG],
    });

    expect(res.mode).toBe('1:1');
    expect(res.liveness_passed).toBe(true);
    expect(typeof res.confidence).toBe('number');
    expect(res.matched).toBe(true);
  });
});

describe('identifyFace mock-mode path', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws capture_too_large for oversized image', async () => {
    const err = await identifyFace({ image: makeLargeDataUrl(510_000) }).catch((e) => e);

    expect(isVerificationApiError(err)).toBe(true);
    expect(err.code).toBe('capture_too_large');
  });

  it('returns a 1:N payload in mock mode', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.2);

    const res = await identifyFace({ image: TINY_JPEG, livenessFrames: [TINY_JPEG] });
    expect(res.mode).toBe('1:N');
    expect(res.liveness_passed).toBe(true);
    expect(typeof res.confidence).toBe('number');
  });
});
