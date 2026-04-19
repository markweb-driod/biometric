const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
const MOCK_MODE = import.meta.env.VITE_MOCK_API !== 'false';
const MAX_IMAGE_SIZE = 500_000; // ~500KB base64 limit

interface EnrollFacePayload {
  userId: string;
  image: string; // base64 data URL
}

interface EnrollFaceResponse {
  success: boolean;
  message?: string;
}

export async function enrollFace(
  payload: EnrollFacePayload
): Promise<EnrollFaceResponse> {
  if (payload.image.length > MAX_IMAGE_SIZE) {
    throw new Error('Captured image is too large. Please retake with lower resolution.');
  }

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 800));
    return { success: true, message: 'Mock enrollment successful' };
  }

  const response = await fetch(`${API_BASE}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: payload.userId,
      image: payload.image,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.message ?? `Enrollment failed (HTTP ${response.status})`
    );
  }

  return response.json();
}
