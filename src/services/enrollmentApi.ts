const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const MOCK_MODE = import.meta.env.VITE_MOCK_API !== 'false';
const MAX_IMAGE_SIZE = 500_000; // 500KB upload cap
const MAX_LIVENESS_FRAMES = 5;

interface EnrollFacePayload {
  userId: string;
  image: string; // base64 data URL from canvas
  livenessFrames?: string[]; // background frames collected for liveness check
}

interface EnrollFaceResponse {
  success: boolean;
  message?: string;
  liveness_passed?: boolean;
  liveness_checked?: boolean;
  student_id?: number;
  external_id?: string;
}

export type EnrollmentApiErrorCode =
  | 'invalid_subject_id'
  | 'capture_too_large'
  | 'capture_invalid_format'
  | 'capture_quality_rejected'
  | 'liveness_failed'
  | 'auth_required'
  | 'validation_failed'
  | 'network_error'
  | 'server_error'
  | 'unknown_error';

export class EnrollmentApiError extends Error {
  code: EnrollmentApiErrorCode;
  retryable: boolean;
  shouldRecapture: boolean;
  backendMessage?: string;

  constructor(args: {
    message: string;
    code: EnrollmentApiErrorCode;
    retryable: boolean;
    shouldRecapture: boolean;
    backendMessage?: string;
  }) {
    super(args.message);
    this.name = 'EnrollmentApiError';
    this.code = args.code;
    this.retryable = args.retryable;
    this.shouldRecapture = args.shouldRecapture;
    this.backendMessage = args.backendMessage;
  }
}

export function isEnrollmentApiError(value: unknown): value is EnrollmentApiError {
  return value instanceof EnrollmentApiError;
}

export async function enrollFace(
  payload: EnrollFacePayload
): Promise<EnrollFaceResponse> {
  if (!payload.userId || payload.userId.trim().length < 3) {
    throw new EnrollmentApiError({
      message: 'Subject ID is required and must be at least 3 characters.',
      code: 'invalid_subject_id',
      retryable: false,
      shouldRecapture: false,
    });
  }

  const imageBlob = dataUrlToBlob(payload.image);

  if (imageBlob.size > MAX_IMAGE_SIZE) {
    throw new EnrollmentApiError({
      message: 'Captured image is too large. Please retake with lower resolution.',
      code: 'capture_too_large',
      retryable: true,
      shouldRecapture: true,
    });
  }

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 800));
    return { success: true, message: 'Mock enrollment successful', liveness_passed: true };
  }

  const formData = new FormData();
  // Send both aliases for backward-compatible backend contracts.
  formData.append('external_id', payload.userId.trim());
  formData.append('matric_number', payload.userId.trim());
  // Main capture is always the first file
  formData.append('files', imageBlob, 'capture.jpg');
  // Append liveness background frames so the backend can run motion-based liveness detection
  const livenessFrames = payload.livenessFrames?.slice(0, MAX_LIVENESS_FRAMES) ?? [];
  if (livenessFrames.length > 0) {
    livenessFrames.forEach((frame, i) => {
      try {
        formData.append('files', dataUrlToBlob(frame), `liveness_${i}.jpg`);
      } catch {
        // skip any malformed frame; liveness will use what's available
      }
    });
  }

  const tokenFromEnv = import.meta.env.VITE_API_TOKEN;
  const tokenFromStorage = window.localStorage.getItem('biometric_api_token');
  const bearerToken = tokenFromEnv || tokenFromStorage;
  const headers: HeadersInit = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {};

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/enroll`, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch {
    throw new EnrollmentApiError({
      message: 'Unable to reach the enrollment service. Check network connectivity and retry.',
      code: 'network_error',
      retryable: true,
      shouldRecapture: false,
    });
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const backendMessage =
      // FastAPI returns {detail: ...} for HTTPException; fall back to message or generic.
      body?.detail ?? body?.message ?? `Enrollment failed (HTTP ${response.status})`;
    throw mapBackendError(response.status, backendMessage);
  }

  const body = await response.json();
  return {
    success: body.success ?? body.status === 'success',
    message: body.message,
    liveness_passed: body.liveness_passed,
    liveness_checked: body.liveness_checked,
    student_id: body.student_id,
    external_id: body.external_id,
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',');
  if (!header || !base64Data || !header.startsWith('data:')) {
    throw new EnrollmentApiError({
      message: 'Captured image format is invalid. Please recapture and try again.',
      code: 'capture_invalid_format',
      retryable: true,
      shouldRecapture: true,
    });
  }

  const mimeMatch = header.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg';
  const bytes = atob(base64Data);
  const len = bytes.length;
  const out = new Uint8Array(len);

  for (let i = 0; i < len; i += 1) {
    out[i] = bytes.charCodeAt(i);
  }

  return new Blob([out], { type: mimeType });
}

function mapBackendError(status: number, backendMessage: string): EnrollmentApiError {
  const normalized = backendMessage.toLowerCase();

  if (status === 401 || status === 403) {
    return new EnrollmentApiError({
      message: 'Session authorization failed. Sign in again, then retry enrollment.',
      code: 'auth_required',
      retryable: false,
      shouldRecapture: false,
      backendMessage,
    });
  }

  if (normalized.includes('liveness check failed')) {
    return new EnrollmentApiError({
      message: 'Liveness validation failed. Ask the subject to blink or move slightly, then recapture.',
      code: 'liveness_failed',
      retryable: true,
      shouldRecapture: true,
      backendMessage,
    });
  }

  if (
    normalized.includes('low-quality image') ||
    normalized.includes('invalid or low-quality image') ||
    normalized.includes('uploaded file')
  ) {
    return new EnrollmentApiError({
      message: 'The backend rejected this capture due to image quality. Retake with better lighting and framing.',
      code: 'capture_quality_rejected',
      retryable: true,
      shouldRecapture: true,
      backendMessage,
    });
  }

  if (status === 413 || normalized.includes('too large')) {
    return new EnrollmentApiError({
      message: 'Captured image is too large for upload. Retake and try again.',
      code: 'capture_too_large',
      retryable: true,
      shouldRecapture: true,
      backendMessage,
    });
  }

  if (status >= 500) {
    return new EnrollmentApiError({
      message: 'Enrollment service error. Retry with the same capture in a moment.',
      code: 'server_error',
      retryable: true,
      shouldRecapture: false,
      backendMessage,
    });
  }

  if (status >= 400 && status < 500) {
    if (normalized.includes('identifier length') || normalized.includes('required')) {
      return new EnrollmentApiError({
        message: backendMessage,
        code: 'invalid_subject_id',
        retryable: false,
        shouldRecapture: false,
        backendMessage,
      });
    }
    return new EnrollmentApiError({
      message: backendMessage,
      code: 'validation_failed',
      retryable: true,
      shouldRecapture: false,
      backendMessage,
    });
  }

  return new EnrollmentApiError({
    message: backendMessage,
    code: 'unknown_error',
    retryable: true,
    shouldRecapture: false,
    backendMessage,
  });
}
