const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const MOCK_MODE = false;
const MAX_IMAGE_SIZE = 500_000;
const MAX_LIVENESS_FRAMES = 5;

export type VerificationMode = '1:1' | '1:N';

export interface VerificationResult {
  matched: boolean;
  confidence: number;
  mode: VerificationMode;
  liveness_passed: boolean;
  message: string;
  student_id?: number;
  full_name?: string;
  /** Populated for 1:N results when the backend returns subject details */
  subject?: {
    external_id: string;
    full_name: string;
  };
}

export interface VerifyPayload {
  identifier: string; // matric / external_id for 1:1
  image: string; // base64 data URL
  livenessFrames?: string[];
}

export interface IdentifyPayload {
  image: string;
  livenessFrames?: string[];
}

export type VerificationApiErrorCode =
  | 'not_enrolled'
  | 'subject_not_found'
  | 'no_face_detected'
  | 'liveness_failed'
  | 'capture_too_large'
  | 'auth_required'
  | 'network_error'
  | 'server_error'
  | 'unknown_error';

export class VerificationApiError extends Error {
  code: VerificationApiErrorCode;
  retryable: boolean;

  constructor(args: { message: string; code: VerificationApiErrorCode; retryable: boolean }) {
    super(args.message);
    this.name = 'VerificationApiError';
    this.code = args.code;
    this.retryable = args.retryable;
  }
}

export function isVerificationApiError(value: unknown): value is VerificationApiError {
  return value instanceof VerificationApiError;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  if (!header || !base64) throw new Error('Invalid data URL');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function getAuthHeaders(): HeadersInit {
  const tokenFromEnv = import.meta.env.VITE_API_TOKEN;
  const tokenFromStorage = window.localStorage.getItem('biometric_api_token');
  const bearerToken = tokenFromEnv || tokenFromStorage;
  return bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {};
}

async function handleApiError(response: Response): Promise<never> {
  let detail = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    detail = body?.detail ?? detail;
  } catch {
    // ignore JSON parse failure
  }

  if (response.status === 401 || response.status === 403) {
    throw new VerificationApiError({ message: 'Authentication required. Please log in again.', code: 'auth_required', retryable: false });
  }
  if (response.status === 400 && detail.toLowerCase().includes('not enrolled')) {
    throw new VerificationApiError({ message: 'Subject is not enrolled in the biometric system.', code: 'not_enrolled', retryable: false });
  }
  if (response.status === 404) {
    throw new VerificationApiError({ message: `Subject not found: ${detail}`, code: 'subject_not_found', retryable: false });
  }
  if (response.status === 400 && detail.toLowerCase().includes('liveness')) {
    throw new VerificationApiError({ message: detail, code: 'liveness_failed', retryable: true });
  }
  if (response.status === 400 && detail.toLowerCase().includes('face')) {
    throw new VerificationApiError({ message: detail, code: 'no_face_detected', retryable: true });
  }
  throw new VerificationApiError({ message: detail, code: 'server_error', retryable: true });
}

export async function verifyFace(payload: VerifyPayload): Promise<VerificationResult> {
  if (!payload.identifier || payload.identifier.trim().length < 3) {
    throw new VerificationApiError({ message: 'Subject ID must be at least 3 characters.', code: 'subject_not_found', retryable: false });
  }

  const imageBlob = dataUrlToBlob(payload.image);
  if (imageBlob.size > MAX_IMAGE_SIZE) {
    throw new VerificationApiError({ message: 'Image is too large. Please recapture.', code: 'capture_too_large', retryable: true });
  }

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 900));
    const matched = Math.random() > 0.3;
    return {
      matched,
      confidence: matched ? 0.91 + Math.random() * 0.08 : 0.2 + Math.random() * 0.3,
      mode: '1:1',
      liveness_passed: true,
      message: matched ? 'Match successful' : 'Match failed',
    };
  }

  const formData = new FormData();
  formData.append('file', imageBlob, 'capture.jpg');
  const livenessFrames = payload.livenessFrames?.slice(0, MAX_LIVENESS_FRAMES) ?? [];
  livenessFrames.forEach((frame, i) => {
    try { formData.append('extra_frames', dataUrlToBlob(frame), `liveness_${i}.jpg`); } catch { /* skip */ }
  });

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/verify/${encodeURIComponent(payload.identifier.trim())}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
  } catch {
    throw new VerificationApiError({ message: 'Network error. Check your connection.', code: 'network_error', retryable: true });
  }

  if (!response.ok) await handleApiError(response);
  return response.json() as Promise<VerificationResult>;
}

export async function identifyFace(payload: IdentifyPayload): Promise<VerificationResult> {
  const imageBlob = dataUrlToBlob(payload.image);
  if (imageBlob.size > MAX_IMAGE_SIZE) {
    throw new VerificationApiError({ message: 'Image is too large. Please recapture.', code: 'capture_too_large', retryable: true });
  }

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 1100));
    const matched = Math.random() > 0.4;
    return {
      matched,
      confidence: matched ? 0.85 + Math.random() * 0.12 : 0.15 + Math.random() * 0.3,
      mode: '1:N',
      liveness_passed: true,
      student_id: matched ? 1 : undefined,
      message: matched ? 'Identified' : 'Identity not confirmed',
    };
  }

  const formData = new FormData();
  formData.append('file', imageBlob, 'capture.jpg');
  const livenessFrames = payload.livenessFrames?.slice(0, MAX_LIVENESS_FRAMES) ?? [];
  livenessFrames.forEach((frame, i) => {
    try { formData.append('extra_frames', dataUrlToBlob(frame), `liveness_${i}.jpg`); } catch { /* skip */ }
  });

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/identify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
  } catch {
    throw new VerificationApiError({ message: 'Network error. Check your connection.', code: 'network_error', retryable: true });
  }

  if (!response.ok) await handleApiError(response);
  return response.json() as Promise<VerificationResult>;
}
