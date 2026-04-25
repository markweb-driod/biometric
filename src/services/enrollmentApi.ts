const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const MOCK_MODE = import.meta.env.VITE_MOCK_API !== 'false';
const MAX_IMAGE_SIZE = 500_000; // 500KB upload cap

interface EnrollFacePayload {
  userId: string;
  image: string; // base64 data URL from canvas
  livenessFrames?: string[]; // background frames collected for liveness check
}

interface EnrollFaceResponse {
  success: boolean;
  message?: string;
  liveness_passed?: boolean;
}

export async function enrollFace(
  payload: EnrollFacePayload
): Promise<EnrollFaceResponse> {
  const imageBlob = dataUrlToBlob(payload.image);

  if (imageBlob.size > MAX_IMAGE_SIZE) {
    throw new Error('Captured image is too large. Please retake with lower resolution.');
  }

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 800));
    return { success: true, message: 'Mock enrollment successful', liveness_passed: true };
  }

  const formData = new FormData();
  formData.append('external_id', payload.userId);
  // Main capture is always the first file
  formData.append('files', imageBlob, 'capture.jpg');
  // Append liveness background frames so the backend can run motion-based liveness detection
  if (payload.livenessFrames && payload.livenessFrames.length > 0) {
    payload.livenessFrames.forEach((frame, i) => {
      try {
        formData.append('files', dataUrlToBlob(frame), `liveness_${i}.jpg`);
      } catch {
        // skip any malformed frame; liveness will use what's available
      }
    });
  }

  const response = await fetch(`${API_BASE}/enroll`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      // FastAPI returns {detail: ...} for HTTPException; fall back to message or generic
      body?.detail ?? body?.message ?? `Enrollment failed (HTTP ${response.status})`
    );
  }

  return response.json();
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',');
  if (!header || !base64Data || !header.startsWith('data:')) {
    throw new Error('Captured image format is invalid. Please recapture and try again.');
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
