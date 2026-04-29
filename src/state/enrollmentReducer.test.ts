import { describe, it, expect } from 'vitest';
import { enrollmentReducer, initialEnrollmentState } from './enrollmentReducer';
import type { EnrollmentState, EnrollmentAction } from './enrollmentReducer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fresh(): EnrollmentState {
  return initialEnrollmentState('STU-2024-001');
}

function dispatch(state: EnrollmentState, action: EnrollmentAction): EnrollmentState {
  return enrollmentReducer(state, action);
}

// Walk a state to the `captured` phase with a known imageData.
function toCaptured(imageData = 'data:image/jpeg;base64,abc123'): EnrollmentState {
  let s = fresh();
  s = dispatch(s, { type: 'CAMERA_PERMISSION_REQUESTED' });
  s = dispatch(s, { type: 'CAMERA_STREAMING' });
  s = dispatch(s, { type: 'FACE_CAPTURED', imageData });
  return s;
}

// Walk a state to `submitting`.
function toSubmitting(imageData = 'data:image/jpeg;base64,abc123'): EnrollmentState {
  let s = toCaptured(imageData);
  s = dispatch(s, { type: 'FACE_SUBMITTING' });
  return s;
}

// Walk a state to `error` with optional structured metadata.
function toError(opts?: {
  retryable?: boolean;
  shouldRecapture?: boolean;
  backendCode?: EnrollmentAction extends { type: 'FACE_SUBMIT_ERROR' } ? never : never;
}): EnrollmentState {
  let s = toSubmitting();
  s = dispatch(s, {
    type: 'FACE_SUBMIT_ERROR',
    error: 'Liveness check failed.',
    retryable: opts?.retryable ?? true,
    shouldRecapture: opts?.shouldRecapture ?? false,
    backendCode: 'liveness_failed',
  });
  return s;
}

// ── Initial state ─────────────────────────────────────────────────────────────

describe('initialEnrollmentState', () => {
  it('sets step to face-capture', () => {
    expect(fresh().step).toBe('face-capture');
  });

  it('sets faceCapture to idle', () => {
    expect(fresh().faceCapture.status).toBe('idle');
  });

  it('stores the provided userId', () => {
    expect(fresh().userId).toBe('STU-2024-001');
  });
});

// ── Camera permission transitions ─────────────────────────────────────────────

describe('camera permission flow', () => {
  it('transitions idle → requesting-permission', () => {
    const s = dispatch(fresh(), { type: 'CAMERA_PERMISSION_REQUESTED' });
    expect(s.faceCapture.status).toBe('requesting-permission');
  });

  it('transitions requesting-permission → streaming', () => {
    let s = dispatch(fresh(), { type: 'CAMERA_PERMISSION_REQUESTED' });
    s = dispatch(s, { type: 'CAMERA_STREAMING' });
    expect(s.faceCapture.status).toBe('streaming');
  });

  it('transitions to permission-denied with the error message', () => {
    let s = dispatch(fresh(), { type: 'CAMERA_PERMISSION_REQUESTED' });
    s = dispatch(s, {
      type: 'CAMERA_PERMISSION_DENIED',
      error: 'Camera permission was denied.',
    });
    expect(s.faceCapture.status).toBe('permission-denied');
    if (s.faceCapture.status === 'permission-denied') {
      expect(s.faceCapture.error).toBe('Camera permission was denied.');
    }
  });
});

// ── Capture & preview ─────────────────────────────────────────────────────────

describe('FACE_CAPTURED', () => {
  it('stores imageData and sets status to captured', () => {
    const imageData = 'data:image/jpeg;base64,XYZ';
    const s = toCaptured(imageData);
    expect(s.faceCapture.status).toBe('captured');
    if (s.faceCapture.status === 'captured') {
      expect(s.faceCapture.imageData).toBe(imageData);
    }
  });

  it('does not change the enrollment step', () => {
    expect(toCaptured().step).toBe('face-capture');
  });
});

// ── Submission lifecycle ──────────────────────────────────────────────────────

describe('FACE_SUBMITTING', () => {
  it('transitions captured → submitting, preserving imageData', () => {
    const imageData = 'data:image/jpeg;base64,PRESERVE_ME';
    const s = toSubmitting(imageData);
    expect(s.faceCapture.status).toBe('submitting');
    if (s.faceCapture.status === 'submitting') {
      expect(s.faceCapture.imageData).toBe(imageData);
    }
  });

  it('is idempotent when called from error state (retry path)', () => {
    let s = toError();
    s = dispatch(s, { type: 'FACE_SUBMITTING' });
    expect(s.faceCapture.status).toBe('submitting');
  });

  it('is a no-op from idle', () => {
    const s = dispatch(fresh(), { type: 'FACE_SUBMITTING' });
    expect(s.faceCapture.status).toBe('idle');
  });
});

describe('FACE_SUBMIT_SUCCESS', () => {
  it('transitions submitting → success', () => {
    let s = toSubmitting();
    s = dispatch(s, { type: 'FACE_SUBMIT_SUCCESS' });
    expect(s.faceCapture.status).toBe('success');
  });
});

// ── Error state and structured metadata ──────────────────────────────────────

describe('FACE_SUBMIT_ERROR', () => {
  it('transitions submitting → error with message', () => {
    const s = toError();
    expect(s.faceCapture.status).toBe('error');
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.error).toBe('Liveness check failed.');
    }
  });

  it('preserves imageData in error state', () => {
    const imageData = 'data:image/jpeg;base64,KEEP_THIS';
    let s = toSubmitting(imageData);
    s = dispatch(s, {
      type: 'FACE_SUBMIT_ERROR',
      error: 'Server error',
      retryable: true,
      shouldRecapture: false,
    });
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.imageData).toBe(imageData);
    }
  });

  it('stores backendCode in error state', () => {
    const s = toError();
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.backendCode).toBe('liveness_failed');
    }
  });

  it('stores retryable = true when supplied', () => {
    const s = toError({ retryable: true });
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.retryable).toBe(true);
    }
  });

  it('stores shouldRecapture = true for liveness failures', () => {
    let s = toSubmitting();
    s = dispatch(s, {
      type: 'FACE_SUBMIT_ERROR',
      error: 'Liveness check failed.',
      retryable: true,
      shouldRecapture: true,
      backendCode: 'liveness_failed',
    });
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.shouldRecapture).toBe(true);
    }
  });

  it('stores shouldRecapture = false for server errors', () => {
    let s = toSubmitting();
    s = dispatch(s, {
      type: 'FACE_SUBMIT_ERROR',
      error: 'Service unavailable.',
      retryable: true,
      shouldRecapture: false,
      backendCode: 'server_error',
    });
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.shouldRecapture).toBe(false);
    }
  });

  it('defaults retryable to true when not supplied', () => {
    let s = toSubmitting();
    s = dispatch(s, { type: 'FACE_SUBMIT_ERROR', error: 'Oops' });
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.retryable).toBe(true);
    }
  });

  it('defaults shouldRecapture to false when not supplied', () => {
    let s = toSubmitting();
    s = dispatch(s, { type: 'FACE_SUBMIT_ERROR', error: 'Oops' });
    if (s.faceCapture.status === 'error') {
      expect(s.faceCapture.shouldRecapture).toBe(false);
    }
  });

  it('is a no-op when not in submitting state', () => {
    const before = toCaptured();
    const after = dispatch(before, {
      type: 'FACE_SUBMIT_ERROR',
      error: 'Should not apply',
    });
    expect(after).toBe(before); // strict reference equality: same object returned
  });
});

// ── Retry submit (same capture, re-enqueue) ───────────────────────────────────

describe('FACE_RETRY_SUBMIT', () => {
  it('transitions error → captured, preserving imageData', () => {
    const imageData = 'data:image/jpeg;base64,RETRY_IMAGE';
    let s = toSubmitting(imageData);
    s = dispatch(s, {
      type: 'FACE_SUBMIT_ERROR',
      error: 'Network error.',
      retryable: true,
      shouldRecapture: false,
      backendCode: 'network_error',
    });
    s = dispatch(s, { type: 'FACE_RETRY_SUBMIT' });
    expect(s.faceCapture.status).toBe('captured');
    if (s.faceCapture.status === 'captured') {
      expect(s.faceCapture.imageData).toBe(imageData);
    }
  });

  it('is a no-op when not in error state', () => {
    const before = toCaptured();
    const after = dispatch(before, { type: 'FACE_RETRY_SUBMIT' });
    expect(after).toBe(before);
  });
});

// ── Recapture — resets to streaming without session loss ──────────────────────

describe('FACE_RECAPTURE', () => {
  it('returns to streaming state from captured', () => {
    let s = toCaptured();
    s = dispatch(s, { type: 'FACE_RECAPTURE' });
    expect(s.faceCapture.status).toBe('streaming');
  });

  it('returns to streaming state from error', () => {
    let s = toError();
    s = dispatch(s, { type: 'FACE_RECAPTURE' });
    expect(s.faceCapture.status).toBe('streaming');
  });

  it('preserves userId across recapture', () => {
    let s = toError();
    s = dispatch(s, { type: 'FACE_RECAPTURE' });
    expect(s.userId).toBe('STU-2024-001');
  });

  it('preserves enrollment step across recapture', () => {
    let s = toError();
    s = dispatch(s, { type: 'FACE_RECAPTURE' });
    expect(s.step).toBe('face-capture');
  });
});

// ── Step advance ──────────────────────────────────────────────────────────────

describe('FACE_ADVANCE', () => {
  it('advances face-capture → fingerprint after success', () => {
    let s = toSubmitting();
    s = dispatch(s, { type: 'FACE_SUBMIT_SUCCESS' });
    s = dispatch(s, { type: 'FACE_ADVANCE' });
    expect(s.step).toBe('fingerprint');
  });
});

describe('FINGERPRINT_DONE', () => {
  it('advances fingerprint → complete', () => {
    let s = toSubmitting();
    s = dispatch(s, { type: 'FACE_SUBMIT_SUCCESS' });
    s = dispatch(s, { type: 'FACE_ADVANCE' });
    s = dispatch(s, { type: 'FINGERPRINT_DONE' });
    expect(s.step).toBe('complete');
    expect(s.fingerprintDone).toBe(true);
  });
});

// ── RESET ─────────────────────────────────────────────────────────────────────

describe('RESET', () => {
  it('returns to initial state, preserving userId', () => {
    let s = toError();
    s = dispatch(s, { type: 'RESET' });
    expect(s.step).toBe('face-capture');
    expect(s.faceCapture.status).toBe('idle');
    expect(s.userId).toBe('STU-2024-001');
    expect(s.fingerprintDone).toBe(false);
  });
});
